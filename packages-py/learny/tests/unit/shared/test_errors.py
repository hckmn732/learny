"""[SPEC-2003] Problem+json rendering matches the TypeScript backend (ADR-2008)."""

from pathlib import Path

import pytest
from learny.shared.errors import AppError, load_catalog, to_problem

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[5]
CATALOG = load_catalog(ROOT / "api" / "errors.json")


def test_catalog_covers_the_contract() -> None:
    assert len(CATALOG) == 104
    assert CATALOG["UNAUTHENTICATED"].status == 401
    assert CATALOG["UNAUTHENTICATED"].type.startswith("https://learny.app/errors/")


def test_problem_keeps_the_typescript_field_order_and_values() -> None:
    problem = to_problem(AppError("NOT_FOUND", "resource missing"), "req-1", CATALOG)
    assert list(problem.keys()) == ["type", "title", "status", "detail", "code", "requestId"]
    assert problem["status"] == 404
    assert problem["code"] == "NOT_FOUND"
    assert problem["detail"] == "resource missing"
    assert problem["requestId"] == "req-1"


def test_server_errors_hide_the_internal_detail() -> None:
    problem = to_problem(AppError("INTERNAL_ERROR", "boom"), "req-2", CATALOG)
    assert "boom" not in problem["detail"]
    assert problem["detail"].endswith("req-2.")


def test_status_override() -> None:
    problem = to_problem(AppError("INTERNAL_ERROR", "boom", status=503), "req-3", CATALOG)
    assert problem["status"] == 503
    assert problem["detail"].endswith("req-3.")


def test_extra_fields_are_merged() -> None:
    problem = to_problem(
        AppError("VALIDATION_FAILED", "invalid payload", errors=[{"path": ["a"], "message": "x"}]),
        "req-4",
        CATALOG,
    )
    assert problem["errors"] == [{"path": ["a"], "message": "x"}]
