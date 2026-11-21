"""Application errors and problem+json rendering (00-conventions section 4 and section 7).

Business code raises `AppError(code)`; the HTTP pipeline maps it to the same problem body the
TypeScript backend produces. Titles come from the generated catalog (`api/errors.json`, SPEC-2002),
never from a literal in the code (ADR-2011).
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from learny.shared.locale_fr.details import UNEXPECTED_ERROR


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
    """Port of `toProblem` (`packages/core/src/errors.ts`): same fields, same order."""
    entry = catalog.get(error.code) or catalog["INTERNAL_ERROR"]
    status = error.status if error.status is not None else entry.status
    detail = error.detail if error.detail is not None and status < 500 else _unexpected(request_id)
    problem: dict[str, Any] = {
        "type": entry.type,
        "title": entry.title,
        "status": status,
        "detail": detail,
        "code": error.code,
        "requestId": request_id,
    }
    problem.update(error.extra)
    return problem


def _unexpected(request_id: str) -> str:
    """Generic French detail for 5xx, copied verbatim from the TypeScript behaviour."""
    return UNEXPECTED_ERROR.format(request_id=request_id)
