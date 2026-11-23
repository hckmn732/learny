"""[SPEC-2202] An absent optional output field is omitted, exactly like the Zod contract.

`zod` keeps an optional field the handler did not set absent, and `JSON.stringify` omits it. The e2e
`@SPEC-2202` observes it on `offline.sync` (a rejected entry carries no `correct` key).
"""

from typing import Any

import pytest
from learny_api.pipeline import without_absent_optionals
from pydantic import BaseModel

pytestmark = pytest.mark.spec("SPEC-2202")


class SyncResult(BaseModel):
    clientId: str
    status: str
    code: str | None = None
    correct: bool | None = None
    nextDueAt: str | None = None


class SyncOutput(BaseModel):
    results: list[SyncResult]


def wire(payload: dict[str, Any]) -> Any:
    """The pipeline step: validate the handler payload, dump it, drop what was not provided."""
    return without_absent_optionals(SyncOutput.model_validate(payload).model_dump(), payload)


def test_an_absent_optional_field_is_omitted() -> None:
    payload = {"results": [{"clientId": "c-1", "status": "rejected", "code": "SESSION_NOT_FOUND"}]}

    assert wire(payload) == {
        "results": [{"clientId": "c-1", "status": "rejected", "code": "SESSION_NOT_FOUND"}]
    }


def test_a_duplicate_result_keeps_only_the_provided_fields() -> None:
    payload = {"results": [{"clientId": "c-1", "status": "duplicate"}]}

    assert wire(payload) == {"results": [{"clientId": "c-1", "status": "duplicate"}]}


def test_an_explicit_null_is_kept_and_nested_lists_are_walked() -> None:
    payload = {
        "results": [
            {"clientId": "c-1", "status": "rejected", "correct": None},
            {
                "clientId": "c-2",
                "status": "applied",
                "correct": True,
                "nextDueAt": "2026-11-12T08:00:00.000Z",
            },
        ]
    }

    assert wire(payload) == {
        "results": [
            {"clientId": "c-1", "status": "rejected", "correct": None},
            {
                "clientId": "c-2",
                "status": "applied",
                "correct": True,
                "nextDueAt": "2026-11-12T08:00:00.000Z",
            },
        ]
    }
