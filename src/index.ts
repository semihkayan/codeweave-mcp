#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { createServices, initializeWorkspaces, backgroundEmbed, seedCacheFromMainRepo } from "./services.js";
import { logger } from "./utils/logger.js";

// Schemas
import {
  SemanticSearchSchema,
  IndexStatusSchema,
  ReindexSchema,
} from "./tools/schemas.js";

// Handlers
import { handleIndexStatus } from "./tools/index-status.js";
import { handleSemanticSearch } from "./tools/semantic-search.js";
import { handleReindex } from "./tools/reindex.js";

async function main() {
  // Global error handlers — prevent unhandled errors from killing the server process.
  // "Not connected" is always worse than a degraded server.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, "Unhandled rejection (server staying alive)");
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, "Uncaught exception (server staying alive)");
  });

  const services = await createServices();
  logger.info({ projectRoot: services.config.projectRoot }, "Code Intelligence MCP Server starting");

  // MCP Server — connect FIRST so Claude Code doesn't timeout
  const server = new McpServer({ name: "code-intelligence", version: "0.1.0" });
  const ctx = services;

  server.registerTool("semantic_search", {
    description: "Search the codebase by meaning. Works across all workspaces automatically in monorepos.\n\nCRITICAL: Use this INSTEAD OF grep or rg when looking for code by concept, feature, or bug area. Unlike text search, this finds functions even when you don't know exact names, spellings, or which files to look in. Use as the FIRST STEP for any code exploration task. Results include workspace, signature, body size, summary, and file location to help you decide what to read next.",
    inputSchema: SemanticSearchSchema.shape,
  }, (args) => handleSemanticSearch(args as any, ctx));

  server.registerTool("reindex", {
    description: "Manually update the code index. Usually not needed — the server auto-reindexes on file changes. Use after bulk operations or if index seems stale.",
    inputSchema: ReindexSchema.shape,
  }, (args) => handleReindex(args as any, ctx));

  server.registerTool("get_index_status", {
    description: "Check index health: how many files/functions are indexed, embedding status, call graph stats, docstring coverage, and language breakdown.\n\nCRITICAL: Call this FIRST at the start of a session to verify the index is ready and discover available workspaces. Once confirmed, prefer semantic_search over grep/rg for concept-based code search.",
    inputSchema: IndexStatusSchema.shape,
  }, (args) => handleIndexStatus(args as any, ctx));

  // PID lock file — prevents codeweave-init --force from running while server is active
  const lockPath = path.join(services.config.projectRoot, ".code-context", "server.pid");
  mkdirSync(path.dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, `${process.pid}\n${Date.now()}`);
  const removeLock = () => { try { unlinkSync(lockPath); } catch { /* already gone */ } };

  // Graceful shutdown with timeout
  const shutdown = () => {
    removeLock();
    const forceExit = setTimeout(() => process.exit(1), 10000);
    services.shutdown().then(() => { clearTimeout(forceExit); process.exit(0); });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("exit", removeLock);

  // Prevent stdout write errors (client pipe closed) from becoming uncaught exceptions.
  // StdioServerTransport.send() writes to stdout — if the client dies, the write emits 'error'.
  process.stdout.on('error', () => { /* pipe closed by MCP client */ });

  // In a worktree with no cache, seed from main repo for fast warm start
  await seedCacheFromMainRepo(services.config.projectRoot);

  // Initialize workspaces BEFORE connect — agent never sees NOT_READY.
  let embedPlans: Awaited<ReturnType<typeof initializeWorkspaces>>;
  try {
    embedPlans = await initializeWorkspaces(services);
  } catch (err) {
    logger.error({ err }, "Initialization failed — server alive, tools return NOT_READY");
    embedPlans = new Map();
  }

  // Connect transport — index + graphs loaded, tools ready.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");

  // Start file watcher — auto-reindex on file changes
  try {
    services.watcher.start();
  } catch (err) {
    logger.error({ err }, "FileWatcher failed to start");
  }
  logger.info("Initialization complete.");

  // Background: check Ollama, embed if needed (does not block tools)
  backgroundEmbed(services, embedPlans).catch(err => {
    logger.error({ err }, "Background embedding failed");
  });
}

main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
