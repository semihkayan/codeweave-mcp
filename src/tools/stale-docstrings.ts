import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse } from "./tool-utils.js";

export async function handleStaleDocstrings(
  args: { workspace?: string; scope?: string; check_type?: string },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;
  const checkType = args.check_type || "all";

  const issues: Array<{
    function: string; file: string; line: number; issue: string; severity: string;
  }> = [];

  for (const filePath of ws.index.getAllFilePaths()) {
    if (args.scope && !filePath.startsWith(args.scope)) continue;

    for (const id of ws.index.getFileRecordIds(filePath)) {
      const record = ws.index.getById(id);
      if (!record || record.kind === "class") continue;

      // Check: missing docstring entirely
      if ((checkType === "all" || checkType === "missing") && !record.docstring) {
        issues.push({
          function: record.name,
          file: record.filePath,
          line: record.lineStart,
          issue: "missing_docstring",
          severity: "info",
        });
        continue; // No point checking other fields if no docstring
      }

      if (!record.docstring) continue;

      // Check: missing @deps
      if (checkType === "all" || checkType === "deps") {
        // Get AST calls for this function
        const callEntry = ws.callGraph.getEntry(record.id);
        const astCalls = callEntry?.calls.filter(c => c.resolvedId) || [];

        if (astCalls.length > 0 && record.docstring.deps.length === 0) {
          issues.push({
            function: record.name,
            file: record.filePath,
            line: record.lineStart,
            issue: "missing_deps",
            severity: "warning",
          });
        }

        // Check: @deps that don't match AST
        for (const dep of record.docstring.deps) {
          const matchesAst = astCalls.some(c =>
            c.target.includes(dep) || dep.includes(c.target.split(".").pop()!)
          );
          if (!matchesAst) {
            issues.push({
              function: record.name,
              file: record.filePath,
              line: record.lineStart,
              issue: `stale_dep: @deps mentions "${dep}" but not found in AST calls`,
              severity: "warning",
            });
          }
        }
      }

      // Check: missing @tags
      if ((checkType === "all" || checkType === "tags") && record.docstring.tags.length === 0) {
        issues.push({
          function: record.name,
          file: record.filePath,
          line: record.lineStart,
          issue: "missing_tags",
          severity: "info",
        });
      }
    }
  }

  return textResponse({
    total_issues: issues.length,
    by_severity: {
      warning: issues.filter(i => i.severity === "warning").length,
      info: issues.filter(i => i.severity === "info").length,
    },
    issues,
  });
}
