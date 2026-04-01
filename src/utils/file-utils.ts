import { readFile as fsReadFile, readdir, stat as fsStat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import ignore from "ignore";
import type { Config } from "../types/interfaces.js";

export { existsSync };

export async function readFile(filePath: string, encoding: BufferEncoding = "utf-8"): Promise<string> {
  return fsReadFile(filePath, { encoding });
}

export async function readFileBuffer(filePath: string): Promise<Buffer> {
  return fsReadFile(filePath);
}

export async function globSourceFiles(projectRoot: string, config: Config): Promise<string[]> {
  const allExtensions = Object.values(config.parser.languages).flat();
  const pattern = `**/*{${allExtensions.join(",")}}`;

  const ig = ignore.default().add(config.parser.ignore);

  const files = await glob(pattern, {
    cwd: projectRoot,
    absolute: false,
    nodir: true,
    dot: false,
  });

  const filtered = files.filter(f => !ig.ignores(f));

  // File size check
  const maxBytes = (config.indexing?.maxFileSizeKb || 500) * 1024;
  const valid: string[] = [];
  for (const f of filtered) {
    const fullPath = path.join(projectRoot, f);
    try {
      const stats = await fsStat(fullPath);
      if (stats.size <= maxBytes) valid.push(fullPath);
    } catch {
      // File disappeared — skip
    }
  }
  return valid;
}

// Generic source root prefixes (language-specific roots come from LanguageConventions)
const GENERIC_SOURCE_ROOTS = [
  "src/",
  "lib/",
  "app/",
];

// Compute module path from file path
export function computeModule(filePath: string, projectRoot: string, sourceRoot?: string, languageSourceRoots?: readonly string[]): string {
  let relative = projectRoot ? path.relative(projectRoot, filePath) : filePath;
  // Normalize to forward slashes for consistent matching
  relative = relative.replace(/\\/g, "/");

  // Strip explicit sourceRoot if configured
  if (sourceRoot && relative.startsWith(sourceRoot + "/")) {
    relative = relative.slice(sourceRoot.length + 1);
  } else if (!sourceRoot) {
    // Auto-detect: strip source root prefixes (language-specific first, then generic)
    const allRoots = [...(languageSourceRoots || []), ...GENERIC_SOURCE_ROOTS];
    for (const prefix of allRoots) {
      if (relative.startsWith(prefix)) {
        relative = relative.slice(prefix.length);
        break;
      }
    }
  }

  // Module = directory path (without filename)
  const dir = path.dirname(relative);
  return dir === "." ? "" : dir.replace(/\\/g, "/");
}

/**
 * Generate candidate module paths from user input by normalizing and stripping source root prefixes.
 * Mirrors the stripping done by computeModule() during indexing — converts user's filesystem-style
 * path back to the stored module format.
 *
 * Returns candidates ordered: original first, most-stripped last.
 */
export function normalizeModuleQuery(
  query: string,
  configSourceRoot: string | undefined,
  languageSourceRoots: readonly string[],
): string[] {
  const candidates: string[] = [];

  // Step 0: normalize slashes, trim trailing slash
  let q = query.replace(/\\/g, "/").replace(/\/+$/, "");
  candidates.push(q);

  // Step 1: dot-to-slash — only when input has dots and no slashes (namespace notation)
  if (q.includes(".") && !q.includes("/")) {
    candidates.push(q.replace(/\./g, "/"));
  }

  // Step 2: strip language source root prefixes from each candidate so far
  const expanded: string[] = [];
  for (const c of candidates) {
    for (const root of languageSourceRoots) {
      const normalized = root.endsWith("/") ? root : root + "/";
      if (c.startsWith(normalized)) {
        expanded.push(c.slice(normalized.length));
      }
    }
  }

  // Step 3: strip partial language roots — when configSourceRoot already stripped its prefix
  // e.g., languageRoot="src/main/java/", configSourceRoot="src" → remainder="main/java/"
  if (configSourceRoot) {
    const cfgPrefix = configSourceRoot + "/";
    for (const c of candidates) {
      for (const root of languageSourceRoots) {
        const normalized = root.endsWith("/") ? root : root + "/";
        if (normalized.startsWith(cfgPrefix)) {
          const remainder = normalized.slice(cfgPrefix.length);
          if (remainder && c.startsWith(remainder)) {
            expanded.push(c.slice(remainder.length));
          }
        }
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set([...candidates, ...expanded])];
}

// Detect language from file extension
export function detectLanguage(filePath: string, languages: Record<string, string[]>): string | null {
  for (const [lang, exts] of Object.entries(languages)) {
    if (exts.some(ext => filePath.endsWith(ext))) return lang;
  }
  return null;
}
