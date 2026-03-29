import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse, errorResponse } from "./tool-utils.js";

export async function handleRecentChanges(
  args: { workspace?: string; since?: string; scope?: string },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;
  const since = args.since || "HEAD~5";

  if (!(await ctx.git.isGitRepo(ws.projectRoot))) {
    return errorResponse("PARSE_ERROR", "Not a git repository.");
  }

  const changedFiles = await ctx.git.getChangedFiles(ws.projectRoot, since);
  const commits = await ctx.git.getRecentCommits(ws.projectRoot, since);

  // Map changed files to function-level changes
  const functionChanges: Array<{
    function: string; file: string; module: string; change_type: string;
  }> = [];

  for (const change of changedFiles) {
    // Scope filter
    if (args.scope && !change.filePath.startsWith(args.scope)) continue;

    const records = ws.index.getByFile(change.filePath);
    if (records.length > 0) {
      for (const rec of records) {
        functionChanges.push({
          function: rec.name,
          file: rec.filePath,
          module: rec.module,
          change_type: change.changeType,
        });
      }
    } else {
      functionChanges.push({
        function: "(file-level)",
        file: change.filePath,
        module: "",
        change_type: change.changeType,
      });
    }
  }

  return textResponse({
    since,
    total_changed_files: changedFiles.length,
    total_changed_functions: functionChanges.filter(f => f.function !== "(file-level)").length,
    commits: commits.map(c => ({
      hash: c.hash,
      message: c.message,
      date: c.date,
      author: c.author,
    })),
    changes: functionChanges,
  });
}
