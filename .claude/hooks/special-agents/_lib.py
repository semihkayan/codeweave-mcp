"""Shared helpers for the special-agents hook chain.

Two responsibilities:
  1. Session state lifecycle (typed schema, atomic JSON I/O, TTL, sweep).
  2. Plan resolution from `ExitPlanMode` tool_input, with fallback path.
"""

import glob
import json
import os
import re
from datetime import datetime, timezone
from enum import StrEnum
from typing import NotRequired, TypedDict


# === CONSTANTS ===
STATE_DIR_NAME = ".claude/hooks/special-agents/state"
PROJECT_DIR = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
STATE_DIR = os.path.join(PROJECT_DIR, STATE_DIR_NAME)
FALLBACK_PLANS_DIR = os.path.join(PROJECT_DIR, ".claude/hooks/special-agents/plans")
SESSION_STATE_PREFIX = "session"
TTL_SECONDS = 3600

SESSION_ID_PATTERN = r"^[A-Za-z0-9_-]+$"
AMBIGUITY_REGEX = re.compile(
    r'(?m)^<!--\s*ambiguity\s*:\s*(\d{1,2})(?:\s*/\s*10)?\s*-->$',
    re.IGNORECASE,
)
AMBIGUITY_MIN, AMBIGUITY_MAX = 1, 10


# === TYPES ===
class Stage(StrEnum):
    PLAN_REVIEW = "plan_review"
    CLARITY_CHECK = "clarity_check"
    IMPLEMENTATION = "implementation"


class ImplState(TypedDict):
    started_at: str


class SessionState(TypedDict):
    created_at: str
    stage: NotRequired[str]
    plan_review_counter: NotRequired[int]
    plan_hash: NotRequired[str]
    ambiguity: NotRequired[int]
    impl: NotRequired[ImplState]


class BlockError(Exception):
    pass


# === HELPERS ===
def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_session_id(sid: str | None) -> str:
    if not sid:
        raise BlockError("session_id missing from hook payload. State cannot be persisted.")
    if not re.fullmatch(SESSION_ID_PATTERN, sid):
        raise BlockError(f"session_id format is not accepted (pattern: {SESSION_ID_PATTERN}).")
    return sid


# === STATE I/O ===
def session_state_path(session_id: str) -> str:
    return os.path.join(STATE_DIR, f"{SESSION_STATE_PREFIX}-{session_id}.json")


def fallback_plan_path(session_id: str) -> str:
    return os.path.join(FALLBACK_PLANS_DIR, f"session-{session_id}.md")


def load_state(path: str, ttl: int = TTL_SECONDS, ts_key: str = "created_at") -> SessionState | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
        if ts_key not in state:
            return None
        created = datetime.fromisoformat(state[ts_key])
        age = (datetime.now(timezone.utc) - created).total_seconds()
        if age > ttl:
            return None
        return state
    except (json.JSONDecodeError, KeyError, ValueError, OSError):
        return None


def write_state_atomic(path: str, state: SessionState) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, path)


def write_plan_atomic(path: str, content: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(content)
    os.replace(tmp, path)


def delete_state(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def sweep_stale_states(state_dir: str, prefix: str, ttl_seconds: int) -> None:
    pattern = os.path.join(state_dir, f"{prefix}-*.json")
    now_ts = datetime.now(timezone.utc).timestamp()
    for path in glob.glob(pattern):
        try:
            if now_ts - os.path.getmtime(path) > ttl_seconds:
                delete_state(path)
        except OSError:
            pass


# === PLAN RESOLUTION ===
def resolve_plan(payload: dict, session_id: str) -> tuple[str | None, str | None, str | None]:
    tool_input = payload.get("tool_input") or {}
    plan_text = tool_input.get("plan") or None
    if not plan_text:
        return None, None, "plan_unavailable"
    plan_path = tool_input.get("planFilePath") or fallback_plan_path(session_id)
    return plan_text, plan_path, None


def parse_ambiguity(text: str) -> int | None:
    matches = AMBIGUITY_REGEX.findall(text)
    return int(matches[-1]) if matches else None
