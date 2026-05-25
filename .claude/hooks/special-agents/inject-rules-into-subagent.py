#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path

LIGHT_MODEL_RE = re.compile(r"^(sonnet|haiku|claude-sonnet|claude-haiku)", re.IGNORECASE)
FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)

RULES_HEAVY = (
    "- Assume your reasoning has gaps; find them all.\n"
    "- Write simple, robust code with minimal failure surface. Make multi-step ops idempotent and resume-safe. Fix root causes, not workarounds.\n"
    "- Never assume. Verify.\n"
    "- Use English no matter what.\n"
    "- Return only densest readable output. Nothing else.\n"
    "- If you encounter a blocker, escalate it.\n\n"
    "---\n\n"
)

RULES_LIGHT = (
    "- Write simple, robust code with minimal failure surface. Make multi-step ops idempotent and resume-safe. Fix root causes, not workarounds.\n"
    "- Never assume. Verify.\n"
    "- Use English no matter what.\n"
    "- Return only densest readable output. Nothing else.\n"
    "- If you encounter a blocker, escalate it.\n\n"
    "---\n\n"
)


def _yaml_scalar(frontmatter: str, key: str) -> str | None:
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*:\s*(.+?)\s*$", re.MULTILINE)
    m = pattern.search(frontmatter)
    if not m:
        return None
    value = m.group(1).strip().strip("\"'")
    return value or None


def _agent_search_dirs() -> list[Path]:
    dirs: list[Path] = []
    project = os.environ.get("CLAUDE_PROJECT_DIR")
    if project:
        dirs.append(Path(project) / ".claude" / "agents")
    dirs.append(Path.home() / ".claude" / "agents")
    return dirs


def find_declared_model(subagent_type: str) -> str | None:
    if not subagent_type:
        return None
    for directory in _agent_search_dirs():
        if not directory.is_dir():
            continue
        for path in directory.glob("*.md"):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            fm_match = FRONTMATTER_RE.match(text)
            if not fm_match:
                continue
            frontmatter = fm_match.group(1)
            if _yaml_scalar(frontmatter, "name") != subagent_type:
                continue
            return _yaml_scalar(frontmatter, "model")
    return None


def select_rules(tool_input: dict) -> str:
    model = tool_input.get("model") or find_declared_model(tool_input.get("subagent_type", ""))
    if model and LIGHT_MODEL_RE.match(model):
        return RULES_LIGHT
    return RULES_HEAVY


def main() -> int:
    data = json.load(sys.stdin)
    tool_input = data.get("tool_input") or {}
    new_input = dict(tool_input)
    new_input["prompt"] = select_rules(tool_input) + tool_input.get("prompt", "")

    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "updatedInput": new_input,
            }
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
