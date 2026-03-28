import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse, errorResponse } from "./tool-utils.js";

export async function handleModuleSummary(
  args: { module: string; workspace?: string; file?: string; detail?: string },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;
  const records = ws.index.getByModule(args.module);

  if (records.length === 0) {
    // Suggest similar modules
    const allModules = ws.index.getAllModules();
    const suggestions = allModules
      .filter(m => m.includes(args.module) || args.module.includes(m))
      .slice(0, 5);

    return errorResponse("MODULE_NOT_FOUND",
      `Module '${args.module}' not found.`,
      suggestions.length > 0 ? `Did you mean: ${suggestions.join(", ")}?` : undefined
    );
  }

  // Filter by file if specified
  const filtered = args.file
    ? records.filter(r => r.filePath.endsWith(args.file!))
    : records;

  // Progressive disclosure
  const detail = args.detail || "auto";
  const threshold = ctx.config.moduleSummary;
  let mode: string;

  if (detail === "auto") {
    if (filtered.length <= threshold.compactThreshold) mode = "full";
    else if (filtered.length <= threshold.filesOnlyThreshold) mode = "compact";
    else mode = "files_only";
  } else {
    mode = detail;
  }

  let result: unknown;

  if (mode === "files_only") {
    // Group by file, show file-level stats
    const fileMap = new Map<string, number>();
    for (const r of filtered) {
      fileMap.set(r.filePath, (fileMap.get(r.filePath) || 0) + 1);
    }
    result = {
      module: args.module,
      mode: "files_only",
      total_items: filtered.length,
      files: Array.from(fileMap.entries()).map(([file, count]) => ({ file, functions: count })),
    };
  } else if (mode === "compact") {
    result = {
      module: args.module,
      mode: "compact",
      total_items: filtered.length,
      items: filtered.map(r => ({
        name: r.name,
        kind: r.kind,
        signature: r.signature,
        file: r.filePath,
      })),
    };
  } else {
    // full
    result = {
      module: args.module,
      mode: "full",
      total_items: filtered.length,
      items: filtered.map(r => ({
        name: r.name,
        kind: r.kind,
        signature: r.signature,
        file: r.filePath,
        line_start: r.lineStart,
        line_end: r.lineEnd,
        summary: r.docstring?.summary || null,
        tags: r.docstring?.tags || [],
        visibility: r.visibility,
        is_async: r.isAsync,
      })),
    };
  }

  return textResponse(result);
}

// textResponse and errorResponse imported from tool-utils
