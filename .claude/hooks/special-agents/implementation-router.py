#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json, re
from _lib import (
    BlockError, Stage, resolve_plan,
    load_state, write_state_atomic, session_state_path,
    validate_session_id, utc_now_iso,
)

# === CONFIG ===
TOOL_NAME = "ExitPlanMode"

PLAN_TITLE_REGEX = re.compile(r'^#\s+(.+?)\s*$', re.MULTILINE)

ROUTING_BANDS = [
    (1, 6, "sonnet_subagent"),
    (7, 10, "opus_lead"),
]

ROUTING_BODIES = {
    "sonnet_subagent": (
        "Spawn implementer:\n\n"
        'Agent(\n'
        '  subagent_type: "junior-plan-implementer",\n'
        '  model: "sonnet",\n'
        '  description: {description},\n'
        '  prompt: "Implement the plan at this path: {plan_path}\\n\\n"\n'
        ')\n\n'
        "If it returns with a blocker, take initiative to resolve it; resume the implementer via SendMessage using its agentId; inform it of the resolution.\n\n"
        "After implementer returns, review the implementation critically: what would you have done differently?\n"
        "If you have any findings, don't ask for permission; resume the implementer via SendMessage using its agentId; pass concise fix instructions.\n"
        "After implementation, report final state with max 200 words.\n\n"
        "Exception: If the implementation is less than 15 lines of code, do it yourself."
    ),
    "opus_lead": (
        "Start implementation.\n\n"
        "After implementation, report final state with max 200 words."
    ),
}

STDERR_MESSAGES = {
    "invalid_json":      "Invalid JSON payload: {error}",
    "ambiguity_missing": "Ambiguity score not in session state. The plan-review-gate must run clarity_check and persist the score before this hook fires.",
    "no_band":           "No routing band for ambiguity={ambiguity}",
    "state_skipped":     "implementation-router: state skipped ({error})",
}
# === END CONFIG ===


def _plan_title(text: str, plan_path: str) -> str:
    m = PLAN_TITLE_REGEX.search(text)
    if m:
        return m.group(1)
    return os.path.splitext(os.path.basename(plan_path))[0]


def _resolve_band(ambiguity: int) -> str | None:
    for low, high, key in ROUTING_BANDS:
        if low <= ambiguity <= high:
            return key
    return None


def _routing_directive(ambiguity: int, plan_text: str, abs_plan_path: str) -> str | None:
    band_key = _resolve_band(ambiguity)
    if band_key is None:
        return None
    title = _plan_title(plan_text, abs_plan_path)
    return ROUTING_BODIES[band_key].format(
        description=json.dumps(title),
        plan_path=abs_plan_path,
    )


def _log(key: str, **fmt: object) -> None:
    template = STDERR_MESSAGES.get(key, f"<unknown stderr key: {key}>")
    print(template.format(**fmt), file=sys.stderr)


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        _log("invalid_json", error=e)
        sys.exit(0)

    if payload.get("tool_name") != TOOL_NAME:
        sys.exit(0)

    try:
        sid = validate_session_id(payload.get("session_id"))
    except BlockError as e:
        _log("state_skipped", error=e)
        sys.exit(0)

    plan_text, abs_plan_path, err = resolve_plan(payload, sid)
    if err:
        print(f"implementation-router: plan unavailable ({err})", file=sys.stderr)
        sys.exit(0)

    path = session_state_path(sid)
    state = load_state(path) or {"created_at": utc_now_iso()}
    ambiguity = state.get("ambiguity")
    if not isinstance(ambiguity, int):
        _log("ambiguity_missing")
        sys.exit(0)

    directive = _routing_directive(ambiguity, plan_text, abs_plan_path)
    if directive is None:
        _log("no_band", ambiguity=ambiguity)
        sys.exit(0)

    state["stage"] = Stage.IMPLEMENTATION
    state["impl"] = {"started_at": utc_now_iso()}
    write_state_atomic(path, state)

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": directive,
        }
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
