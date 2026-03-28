import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError } from "./tool-utils.js";

export async function handleTagSearch(
  args: { tags: string[]; workspace?: string; match_mode?: string },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;
  const matchMode = (args.match_mode || "any") as "all" | "any";
  const results = ws.index.getByTags(args.tags, matchMode);

  if (results.length === 0) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        tags: args.tags,
        match_mode: matchMode,
        results: [],
        total: 0,
        note: "No tags found. Tags are populated from @tags annotations in docstrings.",
      }, null, 2) }],
    };
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      tags: args.tags,
      match_mode: matchMode,
      total: results.length,
      results: results.map(r => ({
        name: r.name,
        file: r.filePath,
        module: r.module,
        kind: r.kind,
        signature: r.signature,
        tags: r.docstring?.tags || [],
      })),
    }, null, 2) }],
  };
}
