import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, resolveFunctionOrError, textResponse } from "./tool-utils.js";

export async function handleDependencyGraph(
  args: { function: string; workspace?: string; module?: string; direction?: string; max_depth?: number },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;

  const fn = resolveFunctionOrError(ws, args.function, args.module);
  if ("error" in fn) return fn.error;
  const record = fn.record;
  const direction = (args.direction || "downstream") as "downstream" | "upstream";
  const maxDepth = args.max_depth ?? 5;

  // Handle "both" direction
  if (args.direction === "both") {
    const down = ws.callGraph.getTransitive(record.id, "downstream", maxDepth);
    const up = ws.callGraph.getTransitive(record.id, "upstream", maxDepth);

    const allNodes = [...down.nodes, ...up.nodes];
    const allEdges = buildEdges(record.id, down.nodes, up.nodes, ws);

    return textResponse({
      root: record.name,
      direction: "both",
      nodes: allNodes.map(n => {
        const r = ws.index.getById(n.id);
        return { id: n.id, name: r?.name || n.id, depth: n.depth, direction: down.nodes.includes(n) ? "downstream" : "upstream" };
      }),
      edges: allEdges,
      cycles: [...down.cycles, ...up.cycles],
      max_depth_reached: allNodes.some(n => n.depth >= maxDepth),
      caveat: "Static analysis only. Dynamic dispatch and callbacks not captured.",
    });
  }

  const result = ws.callGraph.getTransitive(record.id, direction, maxDepth);

  // Build edges from traversal
  const edges: Array<{ from: string; to: string }> = [];
  for (const node of result.nodes) {
    const entry = ws.callGraph.getEntry(node.id);
    if (!entry) continue;

    if (direction === "downstream") {
      for (const call of entry.calls) {
        if (call.resolvedId && result.nodes.some(n => n.id === call.resolvedId)) {
          edges.push({ from: node.id, to: call.resolvedId });
        }
      }
    } else {
      for (const caller of entry.calledBy) {
        if (result.nodes.some(n => n.id === caller.caller)) {
          edges.push({ from: caller.caller, to: node.id });
        }
      }
    }
  }
  // Add root edges
  const rootEntry = ws.callGraph.getEntry(record.id);
  if (rootEntry && direction === "downstream") {
    for (const call of rootEntry.calls) {
      if (call.resolvedId) edges.push({ from: record.id, to: call.resolvedId });
    }
  }

  return textResponse({
    root: record.name,
    direction,
    nodes: result.nodes.map(n => {
      const r = ws.index.getById(n.id);
      return { id: n.id, name: r?.name || n.id, depth: n.depth };
    }),
    edges,
    cycles: result.cycles,
    max_depth_reached: result.nodes.some(n => n.depth >= maxDepth),
    caveat: "Static analysis only. Dynamic dispatch and callbacks not captured.",
  });
}

function buildEdges(
  rootId: string,
  downNodes: Array<{ id: string; depth: number }>,
  upNodes: Array<{ id: string; depth: number }>,
  ws: import("../types/interfaces.js").WorkspaceServices
) {
  const edges: Array<{ from: string; to: string }> = [];
  const allNodeIds = new Set([rootId, ...downNodes.map(n => n.id), ...upNodes.map(n => n.id)]);

  for (const nodeId of allNodeIds) {
    const entry = ws.callGraph.getEntry(nodeId);
    if (!entry) continue;
    for (const call of entry.calls) {
      if (call.resolvedId && allNodeIds.has(call.resolvedId)) {
        edges.push({ from: nodeId, to: call.resolvedId });
      }
    }
  }
  return edges;
}
