import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse } from "./tool-utils.js";

export async function handleIndexStatus(
  args: { workspace?: string },
  ctx: AppContext
) {
  if (args.workspace || !ctx.isMultiWorkspace) {
    const resolved = resolveWorkspaceOrError(ctx, args.workspace);
    if ("error" in resolved) return resolved.error;
    const ws = resolved.ws;
    const stats = ws.index.getStats();

    const vectorRows = await ws.vectorDb.countRows();
    const cgStats = ws.callGraph.getStats();

    return textResponse({
      status: stats.files > 0 ? "healthy" : "empty",
      workspace: args.workspace || ".",
      ast_index: stats,
      vector_store: { rows: vectorRows, model: ctx.config.embedding.model },
      call_graph: cgStats,
      type_graph: ws.typeGraph.getStats(),
      embedding_available: ctx.embeddingAvailable,
      docstring_coverage: ws.index.getDocstringCoverage(),
      languages: ws.index.getLanguageStats(),
    });
  }

  // Multi-workspace: show all
  const workspaceStatuses = [];
  for (const wsPath of ctx.workspacePaths) {
    const ws = ctx.resolveWorkspace(wsPath);
    const stats = ws.index.getStats();
    workspaceStatuses.push({
      workspace: wsPath,
      status: stats.files > 0 ? "healthy" : "empty",
      ast_index: stats,
      docstring_coverage: ws.index.getDocstringCoverage(),
      languages: ws.index.getLanguageStats(),
    });
  }

  return textResponse({
    status: "healthy",
    workspaces: workspaceStatuses,
    embedding_available: ctx.embeddingAvailable,
    model: ctx.config.embedding.model,
  });
}
