import { z } from "zod";

const workspace = z.string().optional().describe(
  "Workspace path (e.g. 'backend', 'mobile'). Optional — omit to search all workspaces."
);

export const SemanticSearchSchema = z.object({
  query: z.string().min(1).describe("Natural language description of what you're looking for (e.g., 'payment processing', 'user authentication middleware', 'how orders are validated')"),
  workspace,
  scope: z.string().optional().describe("Limit search to a specific directory path (e.g., 'payments', 'domain/order'). Source root prefixes are automatically stripped. Dot notation supported (e.g., 'com.example.service'). Omit to search entire codebase."),
  top_k: z.number().int().min(1).max(100).default(10).describe("Number of results to return (1-100, default 10)"),
  tags_filter: z.array(z.string()).optional().describe("Only return functions with ALL of these @tags (AND logic). Tags come from docstring annotations."),
  side_effects_filter: z.array(z.string()).optional().describe("Only return functions with ANY of these side effects (OR logic). Values: database_read, database_write, external_api_call, modifies_state, sends_notification, file_io"),
});

export const ReindexSchema = z.object({
  workspace,
  files: z.array(z.string()).optional().describe("Specific files to reindex (e.g., ['src/payments/processor.ts']). Omit for full scan."),
  force: z.boolean().default(false).describe("Force full rebuild of index, embeddings, and graphs (default: false). Use if index seems corrupt."),
});

export const IndexStatusSchema = z.object({
  workspace: z.string().optional().describe("Workspace to check. Omit to see all workspaces."),
});
