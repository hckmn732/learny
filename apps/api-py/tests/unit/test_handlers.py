"""[SPEC-2201] Every `py`-owned operation has exactly one registered handler.

`pipeline.install` fails at startup when a `py` route has no handler; this test moves that failure
to the test suite, before any deployment, and pins that no `ts` route is served by Python.
"""

from pathlib import Path

import pytest
from learny_api import handlers  # noqa: F401 - imported for its registration side effect
from learny_api.generated.routes import ROUTES
from learny_api.ownership import load_ownership
from learny_api.pipeline import HANDLERS

pytestmark = pytest.mark.spec("SPEC-2201")

ROOT = Path(__file__).resolve().parents[4]


def test_every_py_operation_has_one_handler() -> None:
    ownership = load_ownership(ROOT / "api" / "ownership.yaml")

    py_operations = sorted(operation for operation, owner in ownership.operations.items() if owner == "py")

    assert py_operations == sorted(HANDLERS)


def test_every_registered_handler_matches_a_generated_route() -> None:
    generated = {spec.id for spec in ROUTES}

    assert set(HANDLERS) <= generated


def test_no_ts_operation_is_served_by_python() -> None:
    ownership = load_ownership(ROOT / "api" / "ownership.yaml")

    assert all(ownership.operations.get(operation) == "py" for operation in HANDLERS)
