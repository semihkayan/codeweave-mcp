import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, resolveFunctionOrError, textResponse } from "./tool-utils.js";

export async function handleCallers(
  args: { function: string; workspace?: string; module?: string },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;

  const fn = resolveFunctionOrError(ws, args.function, args.module);
  if ("error" in fn) return fn.error;
  const record = fn.record;
  const entry = ws.callGraph.getEntry(record.id);

  const calledBy = (entry?.calledBy || []).map(c => {
    const callerRecord = ws.index.getById(c.caller);
    return {
      caller: c.callerName,
      file: c.file,
      module: callerRecord?.module || "",
      line: c.line,
      context: callerRecord?.signature || "",
    };
  });

  return textResponse({
    function: record.name,
    file: record.filePath,
    called_by: calledBy,
    total_callers: calledBy.length,
    caveat: "Static analysis only. Dynamic dispatch, callbacks, and inherited methods are not captured.",
  });
}
