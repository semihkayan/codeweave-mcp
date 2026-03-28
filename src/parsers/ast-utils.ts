// Shared tree-sitter AST utilities — used by all language parsers
export type SyntaxNode = any; // tree-sitter native module has no TS types

export function walkNodes(node: SyntaxNode, types: string[]): SyntaxNode[] {
  const results: SyntaxNode[] = [];
  if (types.includes(node.type)) results.push(node);
  for (let i = 0; i < node.childCount; i++) {
    results.push(...walkNodes(node.children[i], types));
  }
  return results;
}

export function findParent(node: SyntaxNode, type: string): SyntaxNode | null {
  let current = node.parent;
  while (current) {
    if (current.type === type) return current;
    current = current.parent;
  }
  return null;
}
