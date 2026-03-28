import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const WORKSPACE_MANIFESTS = [
  "package.json",
  "tsconfig.json",
  "build.gradle",
  "build.gradle.kts",
  "pom.xml",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
];

// Glob-like manifests
const WORKSPACE_MANIFEST_EXTENSIONS = [".csproj", ".sln"];

export async function detectWorkspaces(
  rootPath: string,
  configOverride?: string[]
): Promise<string[]> {
  // Manual override from config
  if (configOverride && configOverride.length > 0) return configOverride;

  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return ["."];
  }

  const workspaces: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const dirPath = path.join(rootPath, entry.name);
    let dirFiles;
    try {
      dirFiles = await readdir(dirPath);
    } catch {
      continue;
    }

    const hasManifest =
      WORKSPACE_MANIFESTS.some(m => dirFiles.includes(m)) ||
      WORKSPACE_MANIFEST_EXTENSIONS.some(ext => dirFiles.some(f => f.endsWith(ext)));

    if (hasManifest) workspaces.push(entry.name);
  }

  // No sub-workspaces found → treat root as single workspace
  if (workspaces.length === 0) return ["."];

  return workspaces;
}
