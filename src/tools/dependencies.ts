import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, resolveFunctionOrError, textResponse, errorResponse } from "./tool-utils.js";

export async function handleDependencies(
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
  const docDeps = record.docstring?.deps || [];

  // Categorize calls
  const confirmed: any[] = [];
  const astOnly: any[] = [];
  const unresolvedCalls: any[] = [];
  const docstringOnly: string[] = [];

  if (entry) {
    const resolvedTargets = new Set<string>();

    for (const call of entry.calls) {
      if (call.resolvedId) {
        const targetRecord = ws.index.getById(call.resolvedId);
        const targetName = call.target;
        resolvedTargets.add(targetName);

        // Check if also in @deps
        const inDocDeps = docDeps.some(d => targetName.includes(d) || d.includes(targetName));

        if (inDocDeps) {
          confirmed.push({
            target: targetName,
            file: targetRecord?.filePath || call.resolvedFile,
            line: call.line,
            source: "confirmed",
          });
        } else {
          astOnly.push({
            target: targetName,
            file: targetRecord?.filePath || call.resolvedFile,
            line: call.line,
            resolved: true,
            note: "Found in AST but not in @deps",
          });
        }
      } else {
        unresolvedCalls.push({
          target: call.target,
          line: call.line,
          note: "Could not resolve. May be dynamic dispatch or external call.",
        });
      }
    }

    // @deps not found in AST
    for (const dep of docDeps) {
      const foundInAst = entry.calls.some(c => c.target.includes(dep) || dep.includes(c.target));
      if (!foundInAst) docstringOnly.push(dep);
    }
  }

  return textResponse({
    function: record.name,
    file: record.filePath,
    calls: confirmed,
    ast_only: astOnly,
    docstring_only: docstringOnly,
    unresolved: unresolvedCalls,
    caveat: "Static analysis only. Dynamic dispatch, callbacks, and inherited methods are not captured.",
  });
}
