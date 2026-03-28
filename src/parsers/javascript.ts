import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { typescriptConfig } from "./typescript.js";
import type { TreeSitterLanguageConfig } from "./tree-sitter-parser.js";

// JS parser reuses TS extraction logic — AST structure is the same minus types
export const javascriptConfig: TreeSitterLanguageConfig = {
  ...typescriptConfig,
  grammar: require("tree-sitter-javascript"),
  extensions: [".js", ".jsx"],
};
