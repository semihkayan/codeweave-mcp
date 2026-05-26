#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hashlib
import json
from _lib import (
    TTL_SECONDS, STATE_DIR, SESSION_STATE_PREFIX,
    AMBIGUITY_MIN, AMBIGUITY_MAX, AMBIGUITY_REGEX,
    Stage, BlockError,
    resolve_plan, write_state_atomic, write_plan_atomic,
    sweep_stale_states, load_state,
    session_state_path, validate_session_id, parse_ambiguity, utc_now_iso,
)

# === CONFIG ===
TOOL_NAME = "ExitPlanMode"
PLAN_REVIEW_COUNTER_CAP = 7

PLAN_ERR = {
    "plan_unavailable": (
        "ExitPlanMode tool_input has neither a `plan` body nor a `planFilePath`, "
        "and no fallback plan file exists for this session. Cannot proceed."
    ),
}

SELF_REVIEW_BODY = (
    "## 1. Review The Plan\n\n"
    "Assume the plan has gaps; find them all.\n\n"
    "- **Alternatives**: Compare against viable options. Confirm the chosen approach is the strongest.\n"
    "- **Completeness**: Hunt for errors, gaps, missed edge cases, weak assumptions, hidden dependencies, unhandled failures.\n"
    "- **Quality**: Simplicity, SOLID, minimal failure surface, idempotent & resume-safe steps, performance. Flag over-engineering and unjustified abstractions.\n"
    "- **Shared library** — for context-free code another caller could plausibly need:\n"
    "  1. Fits existing → use it.\n"
    "  2. Same responsibility, missing case → extend (keep backward compatibility if clean; otherwise migrate callers).\n"
    "  3. Nothing fits → add minimally, following project conventions for placement.\n\n"
    "  One caller justifies placement; abstraction requires two.\n"
    "- **Clarity**: The plan must be implementable by a junior developer.\n\n"
    "## 2. Output\n\n"
    "Edit the plan to fix every one of them. Then output only the most important fixes as concise 1-sentence bullets.\n"
    "Then call `ExitPlanMode` again.\n\n"
    "Ultrathink."
)

CLARITY_BODY = (
    "Plan review complete. Run plan-clarity check before approval.\n\n"
    "Spawn a Sonnet reviewer with this exact Agent call (only pass the plan path, not the content):\n\n"
    "  Agent(\n"
    '    subagent_type: "plan-clarity-reviewer",\n'
    '    model: "sonnet",\n'
    '    description: "Plan clarity check",\n'
    "    prompt: Plan file: {plan_path}\n"
    "  )\n\n"
    "Then, read the reviewer's report. Resolve each unclear item by editing the plan. "
    "Copy the ambiguity score verbatim from the report — do not adjust it based on the fixes you made. Append it to the plan file as an HTML comment on its own line:\n\n"
    "<!-- ambiguity: <1-10> -->\n\n"
    "Then call ExitPlanMode again."
)

AMBIGUITY_MISSING_PROMPT = (
    "Ambiguity score not found. Take it from the clarity reviewer's report and append it to the plan file as an HTML comment:\n\n"
    "<!-- ambiguity: <1-10> -->\n\n"
    "Then call ExitPlanMode again."
)

AMBIGUITY_INVALID_PROMPT = (
    "Ambiguity score in the plan is out of range (found: {found}). "
    "Valid range is an integer from 1 to 10. Fix the score in the `<!-- ambiguity: N -->` comment and call ExitPlanMode again."
)

# === END CONFIG ===


def _emit_deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, ensure_ascii=False))


def _plan_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _check_ambiguity(plan_text: str) -> tuple[str | None, int | None]:
    val = parse_ambiguity(plan_text)
    if val is None:
        return AMBIGUITY_MISSING_PROMPT, None
    if not (AMBIGUITY_MIN <= val <= AMBIGUITY_MAX):
        return AMBIGUITY_INVALID_PROMPT.format(found=val), None
    return None, val


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        if payload.get("tool_name") != TOOL_NAME:
            sys.exit(0)
        sid = validate_session_id(payload.get("session_id"))
        sweep_stale_states(STATE_DIR, SESSION_STATE_PREFIX, TTL_SECONDS)
        plan_text, plan_path, err = resolve_plan(payload, sid)
        if err:
            _emit_deny(PLAN_ERR.get(err, f"Unknown plan resolution error: {err}"))
            return
        if not os.path.isfile(plan_path):
            write_plan_atomic(plan_path, plan_text)

        path = session_state_path(sid)
        state = load_state(path) or {}
        stage = state.get("stage")

        if stage is None:
            write_state_atomic(path, {
                "created_at": utc_now_iso(),
                "stage": Stage.PLAN_REVIEW,
                "plan_review_counter": 1,
                "plan_hash": _plan_hash(plan_text),
            })
            _emit_deny(SELF_REVIEW_BODY)
            return

        if stage == Stage.PLAN_REVIEW:
            counter = state.get("plan_review_counter", 1)
            current_hash = _plan_hash(plan_text)
            if current_hash == state.get("plan_hash") or counter >= PLAN_REVIEW_COUNTER_CAP:
                state["stage"] = Stage.CLARITY_CHECK
                write_state_atomic(path, state)
                write_plan_atomic(plan_path, plan_text)
                _emit_deny(CLARITY_BODY.format(plan_path=plan_path))
            else:
                state["plan_review_counter"] = counter + 1
                state["plan_hash"] = current_hash
                write_state_atomic(path, state)
                _emit_deny(SELF_REVIEW_BODY)
            return

        if stage == Stage.CLARITY_CHECK:
            err_prompt, ambiguity = _check_ambiguity(plan_text)
            if err_prompt:
                _emit_deny(err_prompt)
                return
            state["ambiguity"] = ambiguity
            write_state_atomic(path, state)
            write_plan_atomic(plan_path, AMBIGUITY_REGEX.sub("", plan_text))
            sys.exit(0)

        sys.exit(0)
    except BlockError as e:
        _emit_deny(str(e))
    except Exception as e:
        print(f"plan-review-gate: uncaught: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
