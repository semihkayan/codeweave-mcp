import type { ILanguageParser } from "../types/interfaces.js";
import type { Config } from "../types/interfaces.js";
import { TreeSitterParser } from "./tree-sitter-parser.js";
import { logger } from "../utils/logger.js";
import { pythonConfig } from "./python.js";
import { typescriptConfig, tsxConfig } from "./typescript.js";
import { javascriptConfig } from "./javascript.js";
import { goConfig } from "./go.js";
import { rustConfig } from "./rust.js";
import { javaConfig } from "./java.js";
import { csharpConfig } from "./csharp.js";

const PARSER_CONFIGS: Record<string, () => import("./tree-sitter-parser.js").TreeSitterLanguageConfig> = {
  python: () => pythonConfig,
  typescript: () => typescriptConfig,
  javascript: () => javascriptConfig,
  go: () => goConfig,
  rust: () => rustConfig,
  java: () => javaConfig,
  csharp: () => csharpConfig,
};

export function createTreeSitterParsers(parserConfig: Config["parser"]): ILanguageParser[] {
  const parsers: ILanguageParser[] = [];

  for (const lang of Object.keys(parserConfig.languages)) {
    const configFactory = PARSER_CONFIGS[lang];
    if (configFactory) {
      try {
        parsers.push(new TreeSitterParser(configFactory()));
      } catch (err) {
        logger.warn({ lang, err }, `Failed to initialize parser for ${lang}`);
      }
    }

    // TSX uses a separate grammar from TS — register automatically when typescript is enabled
    if (lang === "typescript") {
      try {
        parsers.push(new TreeSitterParser(tsxConfig));
      } catch (err) {
        logger.warn({ lang: "tsx", err }, "Failed to initialize TSX parser");
      }
    }
  }

  return parsers;
}
