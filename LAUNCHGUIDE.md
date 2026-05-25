# CodeWeave

## Tagline
Save tokens while coding — your AI agent gets structured code context, not file dumps.

## Description
CodeWeave is an MCP server that gives AI agents structured code intelligence instead of dumping entire files into context. Your agent queries local indexes — hybrid semantic search backed by AST and call/type graph indexes — and gets back only what it needs. The result: less token waste, more relevant context, better coding decisions.

It supports 7 languages (Python, TypeScript, JavaScript, Go, Rust, Java, C#) with a 6-stage hybrid search pipeline combining vector embeddings, full-text search, and structural density scoring. Everything runs locally with zero external dependencies beyond Ollama for embeddings. Monorepo and git worktree support included. A file watcher keeps indexes current as code changes — no manual reindexing needed.

ATTENTION: Run "npx @codeweave/mcp" in your project directory. The setup wizard will handle everything for you. At first, it may take some time.

INFO: Exhaustively tested on large Java, C#, JavaScript, TypeScript, React codebases. Contributions and feedback are welcome.

## Category
Developer Tools

## Use Cases
Relevant Context, Token Efficiency, Codebase Indexing

## Features
- 6-stage hybrid semantic search — vector embeddings + BM25 full-text search + structural density reranking
- AST-based function indexing — tree-sitter extracts every function, class, method, and interface
- Call & type graph indexing — powers density-aware ranking and exposes statistics via get_index_status
- 7 language support — Python, TypeScript, JavaScript, Go, Rust, Java, C#
- Monorepo & git worktree support — isolated indexes per workspace with automatic detection
- Live file watching — auto-reindexes on code changes, no manual intervention
- Zero-config setup — single npx command installs everything including Ollama and embedding model
- Graceful degradation — search falls back to keyword-only if Ollama unavailable

## Getting Started
- "Find all functions that handle user authentication"
- Tool: semantic_search — Find functions by meaning, not just name. Hybrid vector + keyword search.
- Tool: reindex — Manually refresh the index (usually unnecessary — file watcher auto-updates).
- Tool: get_index_status — Check index health: file counts, embedding progress, language breakdown.

## Tags
code-intelligence, semantic-search, ast, call-graph, type-graph, tree-sitter, embeddings, code-understanding, refactoring, monorepo, mcp, lancedb, ollama, code-navigation

## Documentation URL
https://github.com/semihkayan/codeweave-mcp