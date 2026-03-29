import { simpleGit, type SimpleGit } from "simple-git";
import path from "node:path";
import type { IGitService } from "../types/interfaces.js";

export interface GitChangedFunction {
  filePath: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
}

export class GitService implements IGitService {
  async getChangedFiles(projectRoot: string, since?: string) {
    return getChangedFiles(projectRoot, since);
  }
  async getRecentCommits(projectRoot: string, since?: string) {
    return getRecentCommits(projectRoot, since);
  }
  async isGitRepo(projectRoot: string) {
    return isGitRepo(projectRoot);
  }
}

export async function getChangedFiles(
  projectRoot: string,
  since: string = "HEAD~5"
): Promise<GitChangedFunction[]> {
  const git: SimpleGit = simpleGit(projectRoot);

  try {
    // diffSummary doesn't expose per-file status (A/D/R/M).
    // Use raw diff --name-status to get actual change types.
    const raw = await git.diff(["--name-status", since]);
    if (!raw.trim()) return [];

    return raw.trim().split("\n").map(line => {
      const parts = line.split("\t");
      const status = parts[0]?.[0]; // First char: A, D, M, R, C, etc.
      const filePath = parts.length >= 3 ? parts[2] : parts[1] || ""; // Renamed: old\tnew
      return {
        filePath,
        changeType: status === "A" ? "added" as const :
                    status === "D" ? "deleted" as const :
                    status === "R" ? "renamed" as const : "modified" as const,
      };
    }).filter(f => f.filePath);
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
