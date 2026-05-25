#!/usr/bin/env python3
import json
import sys

BASE_RULES = (
    "- Before retracting a stated position, quote the new claim verbatim in your reply and verify it with reasoning or evidence — neither source, repetition, nor mere doubt is evidence.\n"
    "- Assume your reasoning has gaps; find them all.\n"
    "- Write simple, robust code with minimal failure surface. Make multi-step ops idempotent and resume-safe. Fix root causes, not workarounds.\n"
    "- Never assume. Verify if you can; ask if you can't.\n"
    "- Return only densest readable output. Nothing else.\n\n"
)


def main() -> int:
    sys.stdin.read()
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": BASE_RULES,
            }
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
