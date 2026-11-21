"""Test configuration of the worker (SPEC-2102): determinism and the support package on sys.path."""

import os
import sys
from pathlib import Path

TESTS = Path(__file__).resolve().parent
WORKER_TESTS = Path(__file__).resolve().parents[3] / "packages-py" / "learny" / "tests"
for entry in (str(TESTS), str(WORKER_TESTS)):
    if entry not in sys.path:
        sys.path.insert(0, entry)

os.environ.setdefault("TZ", "UTC")
os.environ.setdefault("CLOCK_FIXED_AT", "2026-11-11T12:20:00Z")
os.environ.setdefault("LLM_MODE", "mock")


def pytest_configure(config: object) -> None:
    """Refuses a real AI provider, like `assertMockLlm` (ADR-0048)."""
    mode = os.environ.get("LLM_MODE", "mock")
    if mode not in ("", "mock"):
        raise RuntimeError(f"LLM_MODE={mode} is refused in tests: only mock is allowed")
