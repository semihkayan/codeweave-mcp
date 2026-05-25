#!/usr/bin/env python3
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
from _lib import (
    BlockError,
    delete_state, session_state_path, validate_session_id,
)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        sid = validate_session_id(payload.get("session_id"))
        delete_state(session_state_path(sid))
        sys.exit(0)
    except BlockError:
        sys.exit(0)
    except Exception as e:
        print(f"discard-state: uncaught: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
