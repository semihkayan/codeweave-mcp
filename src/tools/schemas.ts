import { z } from "zod";

// workspace: required when multiple workspaces, optional when single
const workspace = z.string().optional().describe(
  "Workspace path (e.g. 'backend', 'mobile'). Required when multiple workspaces detected."
);

export const SemanticSearchSchema = z.object({
  query: z.string().min(1).describe("Natural language search query"),
  workspace,
  scope: z.string().optional().describe("Directory filter within workspace"),
  top_k: z.number().int().min(1).max(100).default(10),
  tags_filter: z.array(z.string()).optional().describe("AND logic — all tags must match"),
  side_effects_filter: z.array(z.string()).optional().describe("OR logic"),
});

export const ModuleSummarySchema = z.object({
  module: z.string().min(1).describe("Module path: 'domain/order'"),
  workspace,
  file: z.string().optional().describe("Focus on single file"),
  detail: z.enum(["auto", "full", "compact", "files_only"]).default("auto"),
});

export const FunctionSourceSchema = z.object({
  function: z.string().min(1).describe("Function name: 'processOrder'"),
  workspace,
  module: z.string().optional().describe("Disambiguates when ambiguous"),
  context_lines: z.number().int().min(0).max(50).default(0),
});

export const DependenciesSchema = z.object({
  function: z.string().min(1),
  workspace,
  module: z.string().optional(),
});

export const CallersSchema = z.object({
  function: z.string().min(1),
  workspace,
  module: z.string().optional(),
});

export const DependencyGraphSchema = z.object({
  function: z.string().min(1),
  workspace,
  module: z.string().optional(),
  direction: z.enum(["downstream", "upstream", "both"]).default("downstream"),
  max_depth: z.number().int().min(1).max(10).default(5),
});

export const ImpactAnalysisSchema = z.object({
  function: z.string().min(1),
  workspace,
  module: z.string().optional(),
  change_type: z.enum(["signature", "behavior", "removal"]).default("behavior"),
});

export const TagSearchSchema = z.object({
  tags: z.array(z.string()).min(1),
  workspace,
  match_mode: z.enum(["any", "all"]).default("any"),
});

export const FileStructureSchema = z.object({
  workspace,
  depth: z.number().int().min(1).max(10).default(2),
  path: z.string().default("."),
  include_stats: z.boolean().default(true),
});

export const RecentChangesSchema = z.object({
  workspace,
  since: z.string().default("HEAD~5"),
  scope: z.string().optional(),
});

export const StaleDocstringsSchema = z.object({
  workspace,
  scope: z.string().optional(),
  check_type: z.enum(["all", "deps", "tags", "missing"]).default("all"),
});

export const ReindexSchema = z.object({
  workspace,
  files: z.array(z.string()).optional(),
  force: z.boolean().default(false),
});

export const IndexStatusSchema = z.object({
  workspace: z.string().optional(),
});
