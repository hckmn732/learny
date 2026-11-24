"""[SPEC-2003] Problem+json rendering of the API contract (ADR-2008)."""

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


def test_validation_errors_are_merged() -> None:
    errors = [{"path": ["a"], "message": "x"}]
    problem = to_problem(
        AppError("VALIDATION_FAILED", "invalid payload", errors=errors),
        "req-4",
        CATALOG,
    )
    assert problem["errors"] == errors


def test_errors_are_not_merged_outside_the_three_validation_codes() -> None:
    problems = [
        to_problem(AppError(code, "detail", errors=[{"path": [], "message": "x"}]), "req", CATALOG)
        for code in ("NOT_FOUND", "ORIGIN_REJECTED", "RATE_LIMITED")
    ]
    assert all("errors" not in problem for problem in problems)


def test_retry_after_never_reaches_the_body() -> None:
    # `retryAfterSec` drives the `Retry-After` header of, not the body.
    problem = to_problem(AppError("RATE_LIMITED", "too many", retry_after=2), "req-5", CATALOG)
    assert "retryAfterSec" not in problem
    assert "retry_after" not in problem
    assert list(problem.keys()) == ["type", "title", "status", "detail", "code", "requestId"]


def test_reason_and_available_at_are_kept() -> None:
    problem = to_problem(
        AppError(
            "SERVICE_UNAVAILABLE", "down", reason="AI_UNAVAILABLE", availableAt="2026-11-11T12:20:00.000Z"
        ),
        "req-6",
        CATALOG,
    )
    assert problem["reason"] == "AI_UNAVAILABLE"
    assert problem["availableAt"] == "2026-11-11T12:20:00.000Z"


def test_unknown_code_becomes_internal_error() -> None:
    problem = to_problem(AppError("NOT_A_CODE", "detail"), "req-7", CATALOG)
    assert problem["code"] == "INTERNAL_ERROR"
    assert problem["status"] == 500
    assert "detail" not in problem["detail"]
