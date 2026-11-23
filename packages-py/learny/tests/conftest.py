"""Shared pytest configuration of the Python test suite (00-conventions section 10).

The suite is deterministic: fixed clock, UTC, simulated AI. `tests/` is on `sys.path` so the test
factories (`factories/`) are importable without turning the tree into a package.
"""

import os
import sys
from pathlib import Path

TESTS = Path(__file__).resolve().parent
if str(TESTS) not in sys.path:
    sys.path.insert(0, str(TESTS))

os.environ.setdefault("TZ", "UTC")
os.environ.setdefault("CLOCK_FIXED_AT", "2026-11-11T12:20:00Z")
os.environ.setdefault("LLM_MODE", "mock")


def pytest_configure(config: object) -> None:
    """Refuses a real AI provider, like `assertMockLlm` (ADR-0048)."""
    mode = os.environ.get("LLM_MODE", "mock")
    if mode not in ("", "mock"):
        raise RuntimeError(f"LLM_MODE={mode} is refused in tests: only mock is allowed")
    # ADR-2042: the Python modes derive from APP_ENV, so a live environment is refused as well.
    app_env = os.environ.get("APP_ENV", "")
    if app_env in ("preview", "production"):
        raise RuntimeError(f"APP_ENV={app_env} is refused in tests: its modes are live")
