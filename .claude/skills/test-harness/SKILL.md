---
name: test-harness
description: >
  Test codeweave-mcp tools against any project using TestHarness.
  Use this whenever verifying tool behavior, testing a code change, or running
  custom assertions — e.g. "test the harness", "run tests against X project",
  "does semantic_search work correctly".
---

# codeweave-mcp Test Harness

`TestHarness` in `src/test-harness.ts`. Write a temp `.ts` file and run with `npx tsx <file>` from the project root.

## Modes

```typescript
import { TestHarness } from "./src/test-harness.js";

const h = await TestHarness.setup("/absolute/path/to/project");

// All built-in tests (~64 tests, all 8 tools)
await h.testAll();

// Single tool
await h.test("semantic_search");

// Custom assertions
await h.run([
  {
    tool: "semantic_search",
    args: { query: "user authentication", top_k: 5 },
    label: "search: auth",
    assert: d => d?.results?.length > 0 || "no results",
  },
]);

// Manual call — returns parsed JSON
const data = await h.call("get_index_status", { workspace: "wordbox-api" });

await h.close(); // always close
```

## Tool names

`semantic_search` · `get_module_summary` · `get_function_source` · `get_dependencies` · `get_impact_analysis` · `get_stale_docstrings` · `reindex` · `get_index_status`

## assert

Receives parsed JSON response. Return `true` = pass, string = fail reason.

## Multi-workspace

Pass `workspace` as the short name (not full path): `{ workspace: "wordbox-api" }`

## Notes

- `setup()` loads from cache — fast after first run.
- `testAll()` includes a force-full reindex at the end — slow on large projects.
