import { readdir } from "node:fs/promises";
import path from "node:path";
import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, textResponse } from "./tool-utils.js";

interface DirEntry {
  name: string;
  type: "file" | "directory";
  functions?: number;
  classes?: number;
  children?: DirEntry[];
}

const ALWAYS_IGNORE = new Set(["node_modules", "__pycache__", "dist", "build", ".git", ".code-context"]);

export async function handleFileStructure(
  args: { workspace?: string; depth?: number; path?: string; include_stats?: boolean },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;
  const maxDepth = args.depth ?? 2;
  const basePath = args.path && args.path !== "." ? path.join(ws.projectRoot, args.path) : ws.projectRoot;
  const includeStats = args.include_stats ?? true;

  const tree = await buildTree(basePath, ws.projectRoot, maxDepth, 0, includeStats ? ws.index : null);

  return textResponse({
    root: args.path || ".",
    depth: maxDepth,
    tree,
  });
}

async function buildTree(
  dirPath: string,
  projectRoot: string,
  maxDepth: number,
  currentDepth: number,
  index: import("../types/interfaces.js").IFunctionIndexReader | null,
): Promise<DirEntry[]> {
  if (currentDepth >= maxDepth) return [];

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const result: DirEntry[] = [];

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    if (entry.name.startsWith(".") || ALWAYS_IGNORE.has(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, projectRoot, maxDepth, currentDepth + 1, index);
      const dir: DirEntry = { name: entry.name, type: "directory" };
      if (children.length > 0) dir.children = children;

      if (index) {
        const relPath = path.relative(projectRoot, fullPath);
        const records = index.getByModule(relPath);
        if (records.length > 0) {
          dir.functions = records.filter(r => r.kind !== "class").length;
          dir.classes = records.filter(r => r.kind === "class").length;
        }
      }

      result.push(dir);
    } else {
      const file: DirEntry = { name: entry.name, type: "file" };
      if (index) {
        const relPath = path.relative(projectRoot, fullPath);
        const records = index.getByFile(relPath);
        if (records.length > 0) {
          file.functions = records.filter(r => r.kind !== "class").length;
          file.classes = records.filter(r => r.kind === "class").length;
        }
      }
      result.push(file);
    }
  }

  return result;
}
