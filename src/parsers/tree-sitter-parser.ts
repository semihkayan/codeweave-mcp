import { createRequire } from "node:module";
import type { ILanguageParser } from "../types/interfaces.js";
import type { RawFunctionInfo, RawCallInfo, RawImportInfo, RawTypeRelationship } from "../types/index.js";

const require = createRequire(import.meta.url);

// tree-sitter types (native module, no TS types)
type SyntaxNode = any;
type Tree = any;
type Parser = any;

export interface TreeSitterLanguageConfig {
  grammar: any;
  extensions: string[];
  extractFunctions(rootNode: SyntaxNode, filePath: string): RawFunctionInfo[];
  extractCalls(rootNode: SyntaxNode, lineStart: number, lineEnd: number): RawCallInfo[];
  extractImports(rootNode: SyntaxNode, filePath: string): RawImportInfo[];
  extractDocstring(node: SyntaxNode): string | null;
  extractTypeRelationships(rootNode: SyntaxNode, filePath: string): RawTypeRelationship[];
}

export class TreeSitterParser implements ILanguageParser {
  readonly extensions: string[];
  private parser: Parser;

  constructor(private config: TreeSitterLanguageConfig) {
    this.extensions = config.extensions;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ParserClass = require("tree-sitter");
    this.parser = new ParserClass();
    this.parser.setLanguage(config.grammar);
  }

  canParse(filePath: string): boolean {
    return this.extensions.some(ext => filePath.endsWith(ext));
  }

  private parse(source: string): Tree {
    return this.parser.parse(source);
  }

  parseFunctions(source: string, filePath: string): RawFunctionInfo[] {
    const tree = this.parse(source);
    return this.config.extractFunctions(tree.rootNode, filePath);
  }

  parseCalls(source: string, lineStart: number, lineEnd: number): RawCallInfo[] {
    const tree = this.parse(source);
    return this.config.extractCalls(tree.rootNode, lineStart, lineEnd);
  }

  parseImports(source: string, filePath: string): RawImportInfo[] {
    const tree = this.parse(source);
    return this.config.extractImports(tree.rootNode, filePath);
  }

  parseTypeRelationships(source: string, filePath: string): RawTypeRelationship[] {
    const tree = this.parse(source);
    return this.config.extractTypeRelationships(tree.rootNode, filePath);
  }
}
