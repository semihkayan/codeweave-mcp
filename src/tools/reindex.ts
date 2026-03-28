import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse, errorResponse } from "./tool-utils.js";
import { reembedFunctions } from "../core/reembed.js";
import { logger } from "../utils/logger.js";

export async function handleReindex(
  args: { workspace?: string; files?: string[]; force?: boolean },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;

  const startTime = Date.now();

  if (args.force) {
    // Full rebuild
    logger.info("Reindex: full rebuild requested");
    await ws.indexWriter.buildFull(ws.projectRoot);
  } else if (args.files && args.files.length > 0) {
    // Specific files
    const changedIds = await ws.indexWriter.updateFiles(args.files);
    logger.info({ files: args.files.length, functions: changedIds.length }, "Reindex: specific files");
  } else {
    // Incremental — check for stale files
    const changedIds = await ws.indexWriter.refreshStale(ws.projectRoot);
    logger.info({ functions: changedIds.length }, "Reindex: incremental stale check");
  }

  // Re-embed if Ollama available
  let embeddedCount = 0;
  if (ctx.embeddingAvailable || await ctx.embedding.isAvailable()) {
    const allIds = ws.index.getAllFilePaths().flatMap(fp => ws.index.getFileRecordIds(fp));

    if (args.force) {
      // Re-embed everything
      await reembedFunctions(allIds, ws.index, ctx.embedding, ws.vectorDb, ctx.config);
      embeddedCount = allIds.length;
    } else {
      // Only embed functions not yet in vector DB
      const vectorCount = await ws.vectorDb.countRows();
      if (vectorCount < allIds.length) {
        await reembedFunctions(allIds, ws.index, ctx.embedding, ws.vectorDb, ctx.config);
        embeddedCount = allIds.length;
      }
    }
  }

  // Rebuild call graph + type graph
  await ws.callGraphWriter.build(ws.index, ws.projectRoot);
  await ws.typeGraphWriter.build(ws.index, ctx.parsers, ws.projectRoot);

  // Save
  await ws.indexWriter.saveToDisk();

  const stats = ws.index.getStats();
  const elapsed = Date.now() - startTime;

  return textResponse({
    status: "ok",
    mode: args.force ? "full_rebuild" : args.files ? "specific_files" : "incremental",
    ast_index: stats,
    embedded: embeddedCount,
    vector_store_rows: await ws.vectorDb.countRows(),
    elapsed_ms: elapsed,
  });
}
