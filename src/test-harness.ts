import path from "node:path";
import { performance } from "node:perf_hooks";
import { createServices, initializeWorkspaces } from "./services.js";
import type { AppContext } from "./types/interfaces.js";

import { handleSemanticSearch } from "./tools/semantic-search.js";
import { handleReindex } from "./tools/reindex.js";
import { handleIndexStatus } from "./tools/index-status.js";

// === Types ===

export interface TestCase {
  tool: string;
  args?: Record<string, unknown>;
  label?: string;
  assert?: (data: any) => true | string;
}

export interface TestResult {
  label: string;
  tool: string;
  status: "pass" | "fail" | "data";
  elapsedMs: number;
  tokens: number;
  data: any;
  error?: string;
  detail: string;
}

export interface SuiteReport {
  project: string;
  results: TestResult[];
  passed: number;
  failed: number;
  dataOnly: number;
  totalMs: number;
}

// === Handler Registry ===

const HANDLERS: Record<string, (args: any, ctx: AppContext) => Promise<any>> = {
  semantic_search: handleSemanticSearch,
  reindex: handleReindex,
  get_index_status: handleIndexStatus,
};

// === TestHarness ===

export class TestHarness {
  readonly ctx: AppContext;
  private _discovery: DiscoveryState | undefined;
  private constructor(ctx: AppContext) { this.ctx = ctx; }

  static async setup(projectPath: string): Promise<TestHarness> {
    const absPath = path.resolve(projectPath);
    const start = performance.now();
    console.log(`Setting up: ${absPath}`);

    const ctx = await createServices(absPath);
    await initializeWorkspaces(ctx);
    ctx.embeddingAvailable = await ctx.embedding.isAvailable();

    for (const wsPath of ctx.workspacePaths) {
      const ws = ctx.resolveWorkspace(wsPath);
      const stats = ws.index.getStats();
      const vectors = await ws.vectorDb.countRows();
      console.log(`  ${wsPath}: ${stats.files} files, ${stats.functions} functions, ${vectors} vectors`);
    }
    console.log(`  Embeddings: ${ctx.embeddingAvailable ? "available" : "unavailable"}`);
    console.log(`Ready (${((performance.now() - start) / 1000).toFixed(1)}s)\n`);

    return new TestHarness(ctx);
  }

  // --- Mod 1: Built-in tests ---

  async testAll(): Promise<SuiteReport> {
    const discovery = await this.discover();
    const cases: TestCase[] = [
      ...buildIndexStatusTests(this.ctx, discovery),
      ...buildSemanticSearchTests(this.ctx, discovery),
      ...buildReindexTests(this.ctx, discovery),
    ];
    return this.run(cases);
  }

  async test(tool: string): Promise<SuiteReport> {
    const discovery = await this.discover();
    const builders: Record<string, () => TestCase[]> = {
      get_index_status: () => buildIndexStatusTests(this.ctx, discovery),
      semantic_search: () => buildSemanticSearchTests(this.ctx, discovery),
      reindex: () => buildReindexTests(this.ctx, discovery),
    };
    const builder = builders[tool];
    if (!builder) throw new Error(`Unknown tool: ${tool}. Available: ${Object.keys(builders).join(", ")}`);
    return this.run(builder());
  }

  // --- Mod 2: Agent-defined cases ---

  async run(cases: TestCase[]): Promise<SuiteReport> {
    const suiteStart = performance.now();
    const results: TestResult[] = [];

    for (const c of cases) {
      const label = c.label ?? autoLabel(c);
      try {
        const { data, isError, tokens, elapsedMs } = await this.callRaw(c.tool, c.args);
        const detail = summarize(c.tool, data);

        if (!c.assert) {
          results.push({ label, tool: c.tool, status: "data", elapsedMs, tokens, data, detail });
        } else {
          const verdict = c.assert(data);
          if (verdict === true) {
            results.push({ label, tool: c.tool, status: "pass", elapsedMs, tokens, data, detail });
          } else {
            const error = typeof verdict === "string" ? verdict : "assertion failed";
            results.push({ label, tool: c.tool, status: "fail", elapsedMs, tokens, data, error, detail });
          }
        }
      } catch (err) {
        results.push({
          label, tool: c.tool, status: "fail", elapsedMs: 0, tokens: 0, data: null,
          error: err instanceof Error ? err.message : String(err),
          detail: classifyError(err),
        });
      }
    }

    const report = buildReport(this.ctx.config.projectRoot, results, performance.now() - suiteStart);
    printReport(report);
    return report;
  }

  // --- Mod 3: Manual calls ---

  async call(tool: string, args?: Record<string, unknown>): Promise<any> {
    const handler = HANDLERS[tool];
    if (!handler) throw new Error(`Unknown tool: ${tool}`);
    const result = await handler(args ?? {}, this.ctx);
    const data = JSON.parse(result?.content?.[0]?.text ?? "null");
    if (result?.isError) data._isError = true;
    return data;
  }

  async callRaw(tool: string, args?: Record<string, unknown>): Promise<{
    data: any; isError: boolean; tokens: number; elapsedMs: number;
  }> {
    const handler = HANDLERS[tool];
    if (!handler) throw new Error(`Unknown tool: ${tool}`);
    const start = performance.now();
    const result = await handler(args ?? {}, this.ctx);
    const text = result?.content?.[0]?.text ?? "";
    return {
      data: JSON.parse(text || "null"),
      isError: result?.isError ?? false,
      tokens: Math.ceil(text.length / 4),
      elapsedMs: Math.round(performance.now() - start),
    };
  }

  // --- Internals ---

  async close(): Promise<void> {
    await this.ctx.shutdown();
    for (const wsPath of this.ctx.workspacePaths) {
      const ws = this.ctx.resolveWorkspace(wsPath);
      ws.indexWriter.clear();
      ws.callGraphWriter.clear();
      ws.typeGraphWriter.clear();
    }
  }

  // --- Discovery: single-pass, ambiguity-safe, multi-workspace ---

  private async discover(): Promise<DiscoveryState> {
    if (this._discovery) return this._discovery;
    const workspaces = this.ctx.workspacePaths;
    const wsPath = workspaces[0];
    const ws = this.ctx.resolveWorkspace(wsPath);

    let module: string | undefined;
    let functionName: string | undefined;
    let filePath: string | undefined;

    outer: for (const fp of ws.index.getAllFilePaths()) {
      for (const id of ws.index.getFileRecordIds(fp)) {
        const rec = ws.index.getById(id);
        if (!rec) continue;

        // Skip classes, interfaces, and tests — builders need a callable function name
        if (rec.kind === "class" || rec.kind === "interface" || rec.structuralHints?.isTest) continue;
        if (!rec.name) continue;

        // Prefer unique names to avoid AMBIGUOUS_FUNCTION; fall back to first non-empty.
        const matches = ws.index.findByName(rec.name);
        if (matches.length === 1) {
          functionName = rec.name;
          filePath = rec.filePath;
          module = rec.module;
          break outer;
        }
        if (!functionName) {
          functionName = rec.name;
          filePath = rec.filePath;
          module = rec.module;
        }
      }
    }

    const gaps: string[] = [];
    if (!functionName) gaps.push("functionName");
    if (!module) gaps.push("module");
    if (!filePath) gaps.push("filePath");

    if (gaps.length > 0) {
      console.log(`  Discovery gaps (tests will be skipped): ${gaps.join(", ")}`);
    }

    this._discovery = {
      workspaces, workspace: wsPath,
      module, functionName, filePath,
      isMulti: this.ctx.isMultiWorkspace,
      gaps,
    };
    return this._discovery;
  }
}

// === Discovery State ===

interface DiscoveryState {
  workspaces: string[];
  workspace: string;
  module?: string;
  functionName?: string;
  filePath?: string;
  isMulti: boolean;
  gaps: string[];
}

// === Helpers ===

function classifyError(err: unknown): string {
  if (err instanceof SyntaxError) return "parse_error";
  if (err instanceof TypeError) return "type_error";
  if (err instanceof RangeError) return "range_error";
  if (err != null && typeof err === "object" && "issues" in err) return "validation_error";
  return "runtime_error";
}

function invalidWsTest(tool: string, ds: DiscoveryState, extraArgs?: Record<string, unknown>): TestCase[] {
  if (!ds.isMulti) return [];
  return [{
    tool, args: { ...extraArgs, workspace: "___invalid___" },
    label: `${tool.replace("get_", "")}: invalid ws`,
    assert: d => d?.error === "WORKSPACE_NOT_FOUND" || `expected WORKSPACE_NOT_FOUND, got ${d?.error}`,
  }];
}

// === Built-in Test Suites ===

function buildIndexStatusTests(ctx: AppContext, ds: DiscoveryState): TestCase[] {
  const cases: TestCase[] = [];

  if (ctx.isMultiWorkspace) {
    cases.push(
      { tool: "get_index_status", label: "status: multi-ws overview",
        assert: d => (d?.workspaces?.length >= 2) || `expected >=2 workspaces, got ${d?.workspaces?.length}` },
      { tool: "get_index_status", label: "status: each ws has ast_index",
        assert: d => {
          for (const w of d?.workspaces ?? []) {
            if (!(w.ast_index?.files > 0)) return `ws ${w.workspace}: files=${w.ast_index?.files}`;
          }
          return true;
        } },
      { tool: "get_index_status", args: { workspace: ds.workspace }, label: "status: single ws valid",
        assert: d => (d?.ast_index?.files > 0 && d?.ast_index?.functions > 0) || `files=${d?.ast_index?.files} fns=${d?.ast_index?.functions}` },
      { tool: "get_index_status", args: { workspace: ds.workspace }, label: "status: single ws fields",
        assert: d => (d?.languages !== undefined && d?.call_graph !== undefined && d?.type_graph !== undefined) || "missing expected fields" },
    );
  } else {
    cases.push(
      { tool: "get_index_status", label: "status: valid",
        assert: d => (d?.ast_index?.files > 0 && d?.ast_index?.functions > 0) || `files=${d?.ast_index?.files} fns=${d?.ast_index?.functions}` },
      { tool: "get_index_status", label: "status: has fields",
        assert: d => (d?.languages !== undefined && d?.call_graph !== undefined && d?.type_graph !== undefined) || "missing expected fields" },
    );
  }

  cases.push(...invalidWsTest("get_index_status", ds));
  return cases;
}


function buildSemanticSearchTests(ctx: AppContext, ds: DiscoveryState): TestCase[] {
  const cases: TestCase[] = [
    // Edge cases
    { tool: "semantic_search", args: { query: "a" },
      label: "search: short query",
      assert: d => (d?.search_mode === "skipped" || d?.results?.length === 0 || d?.error) ? true : "short query not handled" },
    { tool: "semantic_search", args: { query: "xyznonexistent_zzz_999", top_k: 5 },
      label: "search: gibberish → graceful empty",
      assert: d => (Array.isArray(d?.results) && !d?.error) || `unexpected: error=${d?.error}` },
    ...invalidWsTest("semantic_search", ds, { query: "test" }),
  ];

  if (ds.functionName) {
    cases.push(
      { tool: "semantic_search", args: { query: ds.functionName, top_k: 5 },
        label: `search: by name "${ds.functionName.slice(0, 20)}"`,
        assert: d => (d?.results?.length > 0) || "no results" },
      { tool: "semantic_search", args: { query: ds.functionName, top_k: 3 },
        label: "search: top_k=3 respected",
        assert: d => (d?.results?.length ?? 0) <= 3 || `got ${d?.results?.length} results` },
      // search_mode field
      { tool: "semantic_search", args: { query: ds.functionName, top_k: 5 },
        label: "search: search_mode present",
        assert: d => ["hybrid", "vector_only", "degraded", "skipped"].includes(d?.search_mode) || `search_mode=${d?.search_mode}` },
      // Result field completeness
      { tool: "semantic_search", args: { query: ds.functionName, top_k: 5 },
        label: "search: result fields complete",
        assert: d => {
          const required = ["function", "file", "module", "score", "line_start", "line_end"];
          for (const r of d?.results ?? []) {
            const missing = required.filter(f => r[f] === undefined);
            if (missing.length > 0) return `missing: ${missing.join(",")} in ${r.function}`;
          }
          return true;
        } },
      // Scores descending
      { tool: "semantic_search", args: { query: ds.functionName, top_k: 10 },
        label: "search: scores descending",
        assert: d => {
          const scores = d?.results?.map((r: any) => r.score) ?? [];
          for (let i = 1; i < scores.length; i++) {
            if (scores[i] > scores[i - 1] + 0.001) return `score[${i - 1}]=${scores[i - 1]} < score[${i}]=${scores[i]}`;
          }
          return true;
        } },
    );

    // Scope filter
    if (ds.module) {
      cases.push(
        { tool: "semantic_search", args: { query: ds.functionName, scope: ds.module, top_k: 5 },
          label: "search: scope filter",
          assert: d => {
            for (const r of d?.results ?? []) {
              if (!r.module?.includes(ds.module!)) return `result ${r.function} in module ${r.module}, expected scope ${ds.module}`;
            }
            return true;
          } },
      );
    }

    if (ctx.isMultiWorkspace) {
      cases.push(
        { tool: "semantic_search", args: { query: ds.functionName, top_k: 5 },
          label: "search: ws field present",
          assert: d => d?.results?.every((r: any) => r.workspace != null) || "missing workspace field" },
      );
    }
  }

  return cases;
}

function buildReindexTests(ctx: AppContext, ds: DiscoveryState): TestCase[] {
  const cases: TestCase[] = [
    { tool: "reindex", args: { workspace: ds.workspace },
      label: "reindex: incremental",
      assert: d => d?.status === "ok" || `status=${d?.status}` },
    ...invalidWsTest("reindex", ds),
  ];

  if (ds.filePath) {
    cases.push(
      { tool: "reindex", args: { workspace: ds.workspace, files: [ds.filePath] },
        label: "reindex: single file",
        assert: d => d?.status === "ok" || `status=${d?.status}` },
    );
  }

  // Skip force full reindex if the index is already populated — setup() already
  // built/loaded it. Avoids expensive re-embedding (~2min for large projects).
  const ws = ctx.resolveWorkspace(ds.workspace);
  if (ws.index.getStats().functions === 0) {
    cases.push(
      { tool: "reindex", args: { workspace: ds.workspace, force: true },
        label: "reindex: force full",
        assert: d => (d?.status === "ok" && d?.mode?.startsWith("full")) || `status=${d?.status} mode=${d?.mode}` },
    );
  }

  return cases;
}

// === Output ===

function autoLabel(c: TestCase): string {
  const firstVal = c.args ? Object.values(c.args)[0] : "";
  const valStr = typeof firstVal === "string" ? firstVal.slice(0, 30) : String(firstVal ?? "");
  return `${c.tool} ${valStr}`.trim();
}

function summarize(tool: string, data: any): string {
  if (!data) return "null response";
  if (data.error) return String(data.error);
  switch (tool) {
    case "semantic_search": {
      const n = data.results?.length ?? 0;
      const top = data.results?.[0];
      return `${n} results${top ? `, top: ${top.function} (${top.score?.toFixed(2)})` : ""}`;
    }
    case "get_index_status":
      return `${data.ast_index?.files ?? data.workspaces?.length ?? 0} files, ${data.ast_index?.functions ?? "?"} functions`;
    case "reindex":
      return `${data.mode ?? "?"}, ${data.changedFunctions ?? data.ast_index?.functions ?? 0} changed`;
    default:
      return JSON.stringify(data).slice(0, 80);
  }
}

function buildReport(project: string, results: TestResult[], totalMs: number): SuiteReport {
  return {
    project,
    results,
    passed: results.filter(r => r.status === "pass").length,
    failed: results.filter(r => r.status === "fail").length,
    dataOnly: results.filter(r => r.status === "data").length,
    totalMs: Math.round(totalMs),
  };
}

function printReport(report: SuiteReport): void {
  for (const r of report.results) {
    const tag = r.status.toUpperCase().padEnd(4);
    const time = r.elapsedMs > 0 ? `${r.elapsedMs}ms` : "";
    const tokens = r.tokens > 0 ? `${r.tokens} tokens` : "";
    const meta = [time, tokens].filter(Boolean).join(" | ");

    console.log(`${tag}  ${r.label}`);

    if (r.status === "pass") {
      console.log(`      ${meta} | ${r.detail}`);
    } else if (r.status === "fail") {
      console.log(`      ${meta}`);
      console.log(`      assert: ${r.error}`);
      if (r.data != null) {
        console.log(`      data: ${JSON.stringify(r.data).slice(0, 200)}`);
      }
    } else if (r.status === "data") {
      console.log(`      ${meta} | ${r.detail}`);
      if (r.data != null) {
        console.log(`      data: ${JSON.stringify(r.data).slice(0, 200)}`);
      }
    }
    console.log();
  }

  console.log("═".repeat(50));
  const parts = [`${report.passed} passed`, `${report.failed} failed`];
  if (report.dataOnly > 0) parts.push(`${report.dataOnly} data-only`);
  parts.push(`${(report.totalMs / 1000).toFixed(1)}s`);
  console.log(`  ${parts.join(" | ")}`);
  console.log("═".repeat(50));
}
