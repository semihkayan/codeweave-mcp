import type { AppContext, WorkspaceServices, NoiseFilterMetadata } from "../types/interfaces.js";

type ResolvedWorkspace = { ws: WorkspaceServices; wsPath: string };

export function checkReady(ctx: AppContext): ReturnType<typeof errorResponse> | null {
  if (!ctx.ready) {
    return errorResponse("NOT_READY", "Index is still initializing. Please try again in a few seconds.");
  }
  return null;
}

// Safely resolve workspace — returns MCP error response instead of throwing
export function resolveWorkspaceOrError(
  ctx: AppContext,
  workspace?: string
): { ws: WorkspaceServices } | { error: ReturnType<typeof errorResponse> } {
  const notReady = checkReady(ctx);
  if (notReady) return { error: notReady };

  try {
    const ws = ctx.resolveWorkspace(workspace);
    return { ws };
  } catch (err: any) {
    if (err?.error === "WORKSPACE_REQUIRED" || err?.error === "WORKSPACE_NOT_FOUND") {
      return { error: errorResponse(err.error, err.message, undefined, { workspaces: err.workspaces }) };
    }
    return { error: errorResponse("UNKNOWN_ERROR", String(err)) };
  }
}

/**
 * Resolve one or all workspaces. When workspace is omitted, returns ALL workspaces
 * instead of erroring — enables transparent multi-workspace tool access.
 */
export function resolveWorkspaces(
  ctx: AppContext,
  workspace?: string
): { workspaces: ResolvedWorkspace[] } | { error: ReturnType<typeof errorResponse> } {
  const notReady = checkReady(ctx);
  if (notReady) return { error: notReady };

  if (workspace) {
    try {
      const ws = ctx.resolveWorkspace(workspace);
      return { workspaces: [{ ws, wsPath: workspace }] };
    } catch (err: any) {
      if (err?.error === "WORKSPACE_NOT_FOUND") {
        return { error: errorResponse(err.error, err.message, undefined, { workspaces: err.workspaces }) };
      }
      return { error: errorResponse("UNKNOWN_ERROR", String(err)) };
    }
  }

  // No workspace specified — return all (works for single and multi)
  const workspaces = ctx.workspacePaths.map(wsPath => ({
    ws: ctx.resolveWorkspace(wsPath),
    wsPath,
  }));
  return { workspaces };
}

export function textResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function isNoisyCall(target: string, noise: NoiseFilterMetadata): boolean {
  if (noise.noiseTargets.has(target)) return true;
  if (noise.noisePatterns.some(p => p.test(target))) return true;
  const method = target.split(".").pop();
  if (method && target.includes(".") && noise.builtinMethods.has(method)) return true;
  return false;
}

function errorResponse(code: string, message: string, suggestion?: string, details?: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(Object.assign({ error: code, message, suggestion }, details ? { details } : {})) }],
    isError: true,
  };
}
