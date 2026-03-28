import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse } from "./tool-utils.js";

export async function handleSemanticSearch(
  args: {
    query: string; workspace?: string; scope?: string;
    top_k?: number; tags_filter?: string[]; side_effects_filter?: string[];
  },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;

  const topK = args.top_k ?? 10;

  const results = await ws.search.search(
    { text: args.query },
    {
      topK,
      scope: args.scope,
      tagsFilter: args.tags_filter,
      sideEffectsFilter: args.side_effects_filter,
    }
  );

  // Enrich with line numbers from AST index
  const enriched = results.map(r => {
    const record = ws.index.getById(r.id);
    return {
      function: r.name,
      file: r.filePath,
      module: r.module,
      signature: r.signature,
      summary: r.summary,
      tags: r.tags,
      score: Math.round(r.score * 1000) / 1000,
      line_start: record?.lineStart,
      line_end: record?.lineEnd,
    };
  });

  // Determine search mode
  const stats = ws.index.getStats();
  const embeddingAvailable = ctx.embeddingAvailable;
  const vectorCount = await ws.vectorDb.countRows();

  let searchMode: string;
  if (embeddingAvailable && vectorCount > 0) searchMode = "hybrid";
  else if (vectorCount > 0) searchMode = "vector_only"; // Vectors exist but Ollama down now
  else searchMode = "degraded";

  const response: Record<string, unknown> = {
    results: enriched,
    total_indexed: stats.functions + stats.classes,
    search_mode: searchMode,
  };

  if (!embeddingAvailable) {
    response.warning = "Ollama unavailable. Run: ollama serve && ollama pull " + ctx.config.embedding.model;
  }
  if (vectorCount === 0) {
    response.warning = (response.warning || "") + " No vectors indexed. Run reindex with Ollama running.";
  }

  return textResponse(response);
}
