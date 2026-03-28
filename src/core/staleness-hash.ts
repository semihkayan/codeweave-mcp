import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { IStalenessChecker } from "../types/interfaces.js";
import { globSourceFiles } from "../utils/file-utils.js";
import type { Config } from "../types/interfaces.js";

export class HashBasedStalenessChecker implements IStalenessChecker {
  constructor(private config: Config) {}

  async getChangedFiles(projectRoot: string, knownHashes: Map<string, string>): Promise<string[]> {
    // globSourceFiles returns ABSOLUTE paths
    const allAbsFiles = await globSourceFiles(projectRoot, this.config);
    const changed: string[] = [];

    // Convert known hashes (relative keys) to absolute for comparison
    const knownAbsolute = new Map<string, string>();
    for (const [relPath, hash] of knownHashes) {
      knownAbsolute.set(path.join(projectRoot, relPath), hash);
    }

    // Detect changed/new files — use mtime optimization
    for (const absPath of allAbsFiles) {
      const known = knownAbsolute.get(absPath);
      if (!known) {
        // New file
        changed.push(absPath);
        continue;
      }

      // Compute hash and compare
      const newHash = await this.computeHash(absPath);
      if (known !== newHash) {
        changed.push(absPath);
      }
    }

    // Detect deleted files
    const allAbsSet = new Set(allAbsFiles);
    for (const absPath of knownAbsolute.keys()) {
      if (!allAbsSet.has(absPath)) {
        changed.push(absPath); // FunctionIndex.updateFiles handles deletion
      }
    }

    return changed;
  }

  async computeHash(filePath: string): Promise<string> {
    if (!existsSync(filePath)) return "";
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  }
}
