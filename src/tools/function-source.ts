import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, resolveFunctionOrError, textResponse, errorResponse } from "./tool-utils.js";

export async function handleFunctionSource(
  args: { function: string; workspace?: string; module?: string; context_lines?: number },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;

  const fn = resolveFunctionOrError(ws, args.function, args.module);
  if ("error" in fn) return fn.error;
  const record = fn.record;
  const contextLines = args.context_lines || 0;

  try {
    const result = await ws.source.getFunctionSource(record.id, contextLines);
    return textResponse({
      function: record.name,
      file: record.filePath,
      language: record.language,
      line_start: result.lineStart,
      line_end: result.lineEnd,
      source: result.source,
      context_before: result.contextBefore || undefined,
      context_after: result.contextAfter || undefined,
    });
  } catch (err) {
    return errorResponse("PARSE_ERROR", `Failed to read source: ${err}`);
  }
}

// textResponse and errorResponse imported from tool-utils
