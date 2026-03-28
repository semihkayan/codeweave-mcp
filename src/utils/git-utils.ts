import { simpleGit, type SimpleGit, type DiffResult } from "simple-git";
import path from "node:path";

export interface GitChangedFunction {
  filePath: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
}

export async function getChangedFiles(
  projectRoot: string,
  since: string = "HEAD~5"
): Promise<GitChangedFunction[]> {
  const git: SimpleGit = simpleGit(projectRoot);

  try {
    const diff = await git.diffSummary([since]);
    return diff.files.map(f => ({
      filePath: f.file,
      changeType: f.binary ? "modified" :
                  (f as any).status === "A" ? "added" :
                  (f as any).status === "D" ? "deleted" :
                  (f as any).status === "R" ? "renamed" : "modified",
    }));
  } catch {
    // Not a git repo or git not available
    return [];
  }
}

export async function getRecentCommits(
  projectRoot: string,
  since: string = "HEAD~5"
): Promise<Array<{ hash: string; message: string; date: string; author: string; files: string[] }>> {
  const git: SimpleGit = simpleGit(projectRoot);

  try {
    const log = await git.log({ from: since, to: "HEAD", "--stat": null });
    return log.all.map(entry => ({
      hash: entry.hash.slice(0, 8),
      message: entry.message,
      date: entry.date,
      author: entry.author_name,
      files: (entry as any).diff?.files?.map((f: any) => f.file) || [],
    }));
  } catch {
    return [];
  }
}

export async function isGitRepo(projectRoot: string): Promise<boolean> {
  const git: SimpleGit = simpleGit(projectRoot);
  try {
    await git.status();
    return true;
  } catch {
    return false;
  }
}
