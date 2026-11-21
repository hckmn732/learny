"""Job errors shared by the worker and the consumers (SPEC-2102).

A permanent failure is never retried: the delivery is marked `failed` at the first attempt, exactly
like the TypeScript `NonRetriableError`.
"""


class PermanentJobError(Exception):
    """A failure that retrying cannot fix (invalid payload, business refusal, conflict)."""

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
