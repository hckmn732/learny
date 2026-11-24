"""Application errors and problem+json rendering (00-conventions section 4 and section 7).

Titles come from the generated catalog (`api/errors.json`, SPEC-2002), never from a literal in the
code (ADR-2011).
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from learny.shared.locale_fr.details import UNEXPECTED_ERROR

# `toProblem` only copies these codes' `errors` list into the body (packages/core/src/errors.ts).
ERRORS_IN_BODY = frozenset({"VALIDATION_FAILED", "BRICK_INVALID", "RESPONSE_INVALID"})


@dataclass(frozen=True, slots=True)
class ErrorEntry:
    """One line of the generated error catalog."""

    status: int
    title: str
    type: str


def load_catalog(path: Path) -> dict[str, ErrorEntry]:
    """Reads `api/errors.json` produced by `contract:export` (SPEC-2002)."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {
        code: ErrorEntry(status=entry["status"], title=entry["title"], type=entry["type"])
        for code, entry in raw.items()
    }


class JwksUnavailable(Exception):
    """The key set could not be consulted: the caller falls back to the Auth server (ADR-1009)."""


class AppError(Exception):
    """A business error carrying a catalog code and an already user-facing French detail."""

    def __init__(
        self,
        code: str,
        detail: str | None = None,
        *,
        status: int | None = None,
        retry_after: int | None = None,
        **extra: Any,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail
        self.status = status
        self.retry_after = retry_after
        self.extra: dict[str, Any] = extra


def to_problem(
    error: AppError,
    request_id: str,
    catalog: dict[str, ErrorEntry],
) -> dict[str, Any]:
    """Same fields, same order.

    An unknown code becomes `INTERNAL_ERROR`; a server error never echoes its message and only gives
    the request reference. `retry_after` drives the `Retry-After` header, never the body.
    """
    known = catalog.get(error.code)
    entry = known if known is not None else catalog["INTERNAL_ERROR"]
    code = error.code if known is not None else "INTERNAL_ERROR"
    status = error.status if known is not None and error.status is not None else entry.status
    detail = (
        (error.detail if error.detail is not None else entry.title)
        if known is not None and status < 500
        else _unexpected(request_id)
    )
    problem: dict[str, Any] = {
        "type": entry.type,
        "title": entry.title,
        "status": status,
        "detail": detail,
        "code": code,
        "requestId": request_id,
    }
    errors = error.extra.get("errors")
    if code in ERRORS_IN_BODY and errors is not None:
        problem["errors"] = errors
    for key, value in (
        ("reason", error.extra.get("reason")),
        ("availableAt", error.extra.get("availableAt")),
        ("remediationRequired", error.extra.get("remediationRequired")),
    ):
        if value is not None:
            problem[key] = value
    # SPEC-4001 ET-2 - the tasks missing a model are named in `details.tasks`.
    details = error.extra.get("details")
    if details is not None and status < 500:
        problem["details"] = details
    return problem


def _unexpected(request_id: str) -> str:
    """Generic French detail for 5xx."""
    return UNEXPECTED_ERROR.format(request_id=request_id)
