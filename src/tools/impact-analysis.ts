import type { AppContext } from "../types/interfaces.js";
import { resolveWorkspaceOrError, resolveFunctionOrError, textResponse } from "./tool-utils.js";

export async function handleImpactAnalysis(
  args: { function: string; workspace?: string; module?: string; change_type?: string },
  ctx: AppContext
) {
  const resolved = resolveWorkspaceOrError(ctx, args.workspace);
  if ("error" in resolved) return resolved.error;
  const ws = resolved.ws;

  const fn = resolveFunctionOrError(ws, args.function, args.module);
  if ("error" in fn) return fn.error;
  const record = fn.record;
  const changeType = (args.change_type || "behavior") as "signature" | "behavior" | "removal";

  // Call graph impact
  const upstream = ws.callGraph.getTransitive(record.id, "upstream", 5);
  const callImpact = upstream.nodes.map(n => {
    const r = ws.index.getById(n.id);
    let risk: "high" | "medium" | "low";
    if (n.depth === 1 && (changeType === "signature" || changeType === "removal")) risk = "high";
    else if (n.depth === 1) risk = "medium";
    else if (n.depth === 2) risk = "medium";
    else risk = "low";

    return {
      function: r?.name || n.id,
      file: r?.filePath || "",
      module: r?.module || "",
      depth: n.depth,
      risk,
    };
  });

  // Type graph impact
  const typeImpact: any[] = [];

  // Check if this function belongs to a class/interface with type relationships
  if (record.typeRelationships) {
    // If this class implements an interface and the interface changes
    for (const impl of record.typeRelationships.implements) {
      const implementors = ws.typeGraph.getImplementors(impl);
      if (implementors.length > 0) {
        typeImpact.push({
          type: impl,
          relationship: "implements",
          affected: implementors.map(id => ws.index.getById(id)?.name || id),
          risk: changeType === "signature" ? "high" : "medium",
        });
      }
    }
  }

  // Check if this is a class — who implements/extends it?
  if (record.kind === "class") {
    const className = record.name.split(".").pop()!;

    const implementors = ws.typeGraph.getImplementors(className);
    if (implementors.length > 0) {
      typeImpact.push({
        type: className,
        relationship: "implementors",
        affected: implementors.map(id => ws.index.getById(id)?.name || id),
        risk: changeType === "signature" ? "high" : "medium",
      });
    }

    const extenders = ws.typeGraph.getExtenders(className);
    if (extenders.length > 0) {
      typeImpact.push({
        type: className,
        relationship: "extenders",
        affected: extenders.map(id => ws.index.getById(id)?.name || id),
        risk: changeType === "signature" ? "high" : "medium",
      });
    }

    const usages = ws.typeGraph.getUsages(className);
    if (usages.length > 0) {
      typeImpact.push({
        type: className,
        relationship: "usedBy",
        affected: usages.map(id => ws.index.getById(id)?.name || id),
        risk: "medium",
      });
    }
  }

  return textResponse({
    function: record.name,
    file: record.filePath,
    change_type: changeType,
    call_impact: callImpact,
    type_impact: typeImpact,
    total_affected: callImpact.length + typeImpact.reduce((sum, t) => sum + t.affected.length, 0),
    caveat: "Static analysis only. Dynamic dispatch, callbacks, and runtime type changes not captured.",
  });
}
