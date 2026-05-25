#!/usr/bin/env python3
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _lib import delete_state, session_state_path, validate_session_id

PLAN_RULES = (
    "## Important Plan Rules\n\n"
    "- The plan file must be in English\n"
    "- Don't assume — verify or ask\n"
    "- Seek simplicity, SOLID, minimal failure surface, idempotent & resume-safe steps and performance. Flag over-engineering and unjustified abstractions.\n"
    "- **Shared library** — for context-free code another caller could plausibly need:\n"
    "  1. Fits existing → use it.\n"
    "  2. Same responsibility, missing case → extend (keep backward compatibility if clean; otherwise migrate callers).\n"
    "  3. Nothing fits → add minimally, following project conventions for placement.\n\n"
    "  One caller justifies placement; abstraction requires two.\n"
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        sid = validate_session_id(payload.get("session_id"))
        delete_state(session_state_path(sid))
    except Exception:
        pass
    json.dump(
        {"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": PLAN_RULES}},
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
