import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse } from "./tool-utils.js";

export async function handleReindex(
  args: { workspace?: string; files?: string[]; force?: boolean },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;
  const wsPath = args.workspace || ".";

  let result;
  if (args.force) {
    result = await ctx.reindex.reindexFull(ws, wsPath);
  } else if (args.files && args.files.length > 0) {
    result = await ctx.reindex.reindexFiles(ws, wsPath, args.files);
  } else {
    result = await ctx.reindex.reindexIncremental(ws, wsPath);
  }

  const stats = ws.index.getStats();

  return textResponse({
    status: "ok",
    mode: result.mode,
    ast_index: stats,
    embedded: result.embedded,
    vector_store_rows: await ws.vectorDb.countRows(),
    elapsed_ms: result.elapsedMs,
  });
}
