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

    // Deduplicate nodes by ID, track direction
    const downIds = new Set(down.nodes.map(n => n.id));
    const upIds = new Set(up.nodes.map(n => n.id));
    const nodeMap = new Map<string, { id: string; depth: number; direction: string }>();
    for (const n of down.nodes) {
      nodeMap.set(n.id, { id: n.id, depth: n.depth, direction: upIds.has(n.id) ? "both" : "downstream" });
    }
    for (const n of up.nodes) {
      if (!nodeMap.has(n.id)) {
        nodeMap.set(n.id, { id: n.id, depth: n.depth, direction: "upstream" });
      }
    }
    const dedupedNodes = Array.from(nodeMap.values());
    const allEdges = buildEdges(record.id, down.nodes, up.nodes, ws);

    return textResponse({
      root: record.name,
      direction: "both",
      nodes: dedupedNodes.map(n => {
        const r = ws.index.getById(n.id);
        return { id: n.id, name: r?.name || n.id, depth: n.depth, direction: n.direction };
      }),
      edges: allEdges,
      cycles: [...down.cycles, ...up.cycles],
      max_depth_reached: dedupedNodes.some(n => n.depth >= maxDepth),
      caveat: "Static analysis only. Dynamic dispatch and callbacks not captured.",
    });
  }

  const result = ws.callGraph.getTransitive(record.id, direction, maxDepth);

  // Build edges from traversal (include root node)
  const allNodeIds = new Set([record.id, ...result.nodes.map(n => n.id)]);
  const edges: Array<{ from: string; to: string }> = [];

  for (const nodeId of allNodeIds) {
    const entry = ws.callGraph.getEntry(nodeId);
    if (!entry) continue;

    if (direction === "downstream") {
      for (const call of entry.calls) {
        if (call.resolvedId && allNodeIds.has(call.resolvedId)) {
          edges.push({ from: nodeId, to: call.resolvedId });
        }
      }
    } else {
      for (const caller of entry.calledBy) {
        if (allNodeIds.has(caller.caller)) {
          edges.push({ from: caller.caller, to: nodeId });
        }
      }
    }
  }

  // Include root node (depth 0) so edges don't have dangling references
  const allNodes = [
    { id: record.id, name: record.name, depth: 0 },
    ...result.nodes.map(n => {
      const r = ws.index.getById(n.id);
      return { id: n.id, name: r?.name || n.id, depth: n.depth };
    }),
  ];

  return textResponse({
    root: record.name,
    direction,
    nodes: allNodes,
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
