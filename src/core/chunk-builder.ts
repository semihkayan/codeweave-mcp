import type { FunctionRecord } from "../types/index.js";
import { truncateToTokens } from "../utils/token-estimator.js";

export interface ChunkConfig {
  expandCamelCase: boolean;
  maxChunkTokens?: number;
}

export function buildChunk(record: FunctionRecord, config: ChunkConfig): string {
  const parts: string[] = [];

  parts.push(`Function: ${record.name}`);
  parts.push(`File: ${record.filePath}`);
  parts.push(`Signature: ${record.signature}`);

  if (record.docstring) {
    parts.push(`Description: ${record.docstring.raw}`);
    if (record.docstring.tags.length > 0)
      parts.push(`Tags: ${record.docstring.tags.join(", ")}`);
    if (record.docstring.deps.length > 0)
      parts.push(`Dependencies: ${record.docstring.deps.join(", ")}`);
    if (record.docstring.sideEffects.length > 0)
      parts.push(`Side effects: ${record.docstring.sideEffects.join(", ")}`);
  } else {
    // Docstring-free enrichment: extract from signature
    const paramInfo = extractParamInfo(record.signature);
    if (paramInfo) parts.push(`Parameters: ${paramInfo}`);
    const returnInfo = extractReturnType(record.signature);
    if (returnInfo) parts.push(`Returns: ${returnInfo}`);
  }

  // Expand identifiers ONLY in the function name and signature lines, not metadata
  if (config.expandCamelCase) {
    parts[0] = expandIdentifiers(parts[0]); // Function: name
    if (parts.length > 2) parts[2] = expandIdentifiers(parts[2]); // Signature
  }

  let chunk = parts.join("\n");
  if (config.maxChunkTokens && config.maxChunkTokens > 0) chunk = truncateToTokens(chunk, config.maxChunkTokens);

  return chunk;
}

function extractParamInfo(signature: string): string | null {
  // Find the outermost parentheses (handles nested generics like Map<string, number>)
  const openIdx = signature.indexOf("(");
  if (openIdx === -1) return null;
  let depth = 0;
  for (let i = openIdx; i < signature.length; i++) {
    if (signature[i] === "(") depth++;
    else if (signature[i] === ")") {
      depth--;
      if (depth === 0) {
        const params = signature.slice(openIdx + 1, i).trim();
        return params || null;
      }
    }
  }
  return null;
}

function extractReturnType(signature: string): string | null {
  // Python: "name(params) -> Type"
  const pyMatch = signature.match(/\)\s*->\s*(.+)$/);
  if (pyMatch) return pyMatch[1].trim();
  // TS: "name(params): Type"
  const tsMatch = signature.match(/\)\s*:\s*(.+)$/);
  if (tsMatch) return tsMatch[1].trim();
  return null;
}

export function expandIdentifiers(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")       // camelCase → camel Case
    .replace(/_/g, " ");                          // snake_case → snake case
}
