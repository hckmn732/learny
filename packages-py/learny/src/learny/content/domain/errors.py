"""Typed errors of the content context (SPEC-509 EF-5, ET-4; SPEC-2203).

`IngestionError` extends `AppError` with `permanent`, which tells the ingestion whether a failure
ends the resource in `failed` (the learner can retry) or leaves it `processing` for the next
attempt. The detail is always safe to display: no key, no provider body, no contribution text.
"""

from learny.shared.errors import AppError


class IngestionError(AppError):
    """A content failure carrying the stable catalog code and a user-facing French detail."""

    def __init__(
        self,
        code: str,
        detail: str,
        *,
        permanent: bool = True,
        status: int | None = None,
    ) -> None:
        super().__init__(code, detail, status=status)
        self.permanent = permanent


def is_ingestion_error(value: object) -> bool:
    """Narrows to `IngestionError` without importing the class in every caller."""
    return isinstance(value, IngestionError)
