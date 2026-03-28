import type { ISourceExtractor, IFunctionIndexReader } from "../types/interfaces.js";
import { readFile } from "../utils/file-utils.js";
import path from "node:path";

export class SourceExtractor implements ISourceExtractor {
  constructor(
    private index: IFunctionIndexReader,
    private projectRoot: string,
  ) {}

  async getFunctionSource(id: string, contextLines: number = 0): Promise<{
    source: string;
    lineStart: number;
    lineEnd: number;
    contextBefore?: string;
    contextAfter?: string;
  }> {
    const record = this.index.getById(id);
    if (!record) throw new Error(`Function not found: ${id}`);

    const fullPath = path.join(this.projectRoot, record.filePath);
    const content = await readFile(fullPath);
    const lines = content.split("\n");

    const source = lines.slice(record.lineStart - 1, record.lineEnd).join("\n");

    const contextBefore = contextLines > 0
      ? lines.slice(Math.max(0, record.lineStart - 1 - contextLines), record.lineStart - 1).join("\n")
      : undefined;

    const contextAfter = contextLines > 0
      ? lines.slice(record.lineEnd, record.lineEnd + contextLines).join("\n")
      : undefined;

    return {
      source,
      lineStart: record.lineStart,
      lineEnd: record.lineEnd,
      contextBefore: contextBefore || undefined,
      contextAfter: contextAfter || undefined,
    };
  }
}
