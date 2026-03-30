---
name: test-semantic-search
description: |
  A/B test for code understanding quality. Gives the same tasks to two agents: one with MCP tools, one with only grep/read/glob. Compares how well each traces code flows and how many tokens it costs. Use after changes to search, chunk builder, density scorer, or parsers. Invoke: /test-semantic-search <project-path>
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Agent, AskUserQuestion
---

# Semantic Search A/B Test

Two real agents solve the same code understanding tasks. One has MCP tools, the other has only grep/read/glob. You compare their accuracy and token cost.

## When NOT to use this skill

- To check if a tool works → use `get_index_status` directly
- To measure latency/speed → this measures accuracy and token cost only
- If the project isn't indexed → run `graph-init` first

## Procedure

### Step 1: Identify target project

The user provides a project path as argument. If no argument, ask with AskUserQuestion.

Verify the project is indexed:
```bash
ls <project-path>/.code-context/ast-cache/
```
If not indexed, run `graph-init`.

### Step 2: Explore the project

Understand the project's domain, structure, languages, and key concepts. Use the Explore agent to map modules, key entities, and flows. This knowledge is needed to design realistic tasks and verify expected chains.

### Step 3: Design 15 test tasks

Create 15 realistic tasks — 3 per category. Each task is something a real developer would ask an AI agent to investigate.

**Categories (3 per category):**
- **Bug investigation**: "X isn't working, find where and why" — entry point → root cause
- **Feature planning**: "I need to add X, where does it fit?" — understand existing code to plan new work
- **Flow tracing**: "How does X work end-to-end?" — follow a complete flow across layers
- **Impact analysis**: "I'm changing X, what breaks?" — reverse dependency tracing
- **Discovery**: "Where is the code that handles X?" — broad search, vague starting point

**Each task:**
```javascript
{
  id: "BUG-1",
  cat: "bugfix",
  task: "User's streak isn't resetting when they miss a day",  // natural language only
  expectedChain: [
    { fn: "RecordDailyActivityService.record", file: "partial/path/match" },
    { fn: "UserStreak.recordActivity", file: "partial/path/match" },
    { fn: "UserStreak.resetStreak", file: "partial/path/match" },
  ],
  ws: "workspace-name",
}
```

**Rules:**
- `expectedChain` must be verified by reading the actual codebase
- Chain: 3-6 steps
- Task descriptions: natural language only, never mention function/class names
- `task` field is what both agents receive — nothing else

### Step 4: Run both agents per task

For each task, spawn two agents **in parallel**. Both receive only the task description. They decide freely how to investigate.

**Agent A (MCP) prompt:**
```
Codebase: {projectPath}

Task: {task.task}

This is a research task — do NOT edit or create any files.
Investigate the codebase and find the key functions and files involved.

Respond with ONLY this JSON:
{
  "summary": "1-2 sentence description of what you found",
  "functions": ["Class.method", ...],
  "files": ["path/to/file", ...],
  "token_estimate": <number>
}
```

**Agent B (grep/read/glob) prompt:**
```
Codebase: {projectPath}
Do NOT use any MCP tools.

Task: {task.task}

This is a research task — do NOT edit or create any files.
Investigate the codebase and find the key functions and files involved.

Respond with ONLY this JSON:
{
  "summary": "1-2 sentence description of what you found",
  "functions": ["Class.method", ...],
  "files": ["path/to/file", ...],
  "token_estimate": <number>
}
```

### Step 5: Collect and compare

Parse each agent's JSON response. Match against `expectedChain`:
```
For each step in expectedChain:
  found = agent's functions or files contain step.fn or step.file (substring match)
chainCoverage = stepsFound / expectedChain.length
```

If an agent's response isn't valid JSON, try to extract function/file names from the text. Flag as "malformed response" in results.

### Step 6: Print results

```
                          MCP Agent         Grep Agent
Overall chain coverage:   X% (N tasks)      X% (N tasks)
Avg tokens/task:          ~N                ~N
MCP wins: N    Grep wins: N    Ties: N

By category:
  Bug investigation (N):  MCP X%   Grep X%   tokens: ~N vs ~N
  Feature planning (N):   MCP X%   Grep X%   tokens: ~N vs ~N
  Flow tracing (N):       MCP X%   Grep X%   tokens: ~N vs ~N
  Impact analysis (N):    MCP X%   Grep X%   tokens: ~N vs ~N
  Discovery (N):          MCP X%   Grep X%   tokens: ~N vs ~N
```

### Step 7: Analyze

Analyze the results and represent them.

### Step 8: Clean up

Delete test artifacts.

## Technical notes

- Spawn Agent A and Agent B **in parallel** for each task to save time.
- Agent A inherits the MCP connection from the parent session.
- Agent B is told not to use MCP tools. If it uses them anyway, flag the task as invalid.
- Token estimates are approximate (self-reported). This is realistic — real agents don't have exact counters.
- 15 tasks × 2 agents = 30 agent spawns. Inform the user before starting — this takes several minutes.
