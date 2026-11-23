"""[SPEC-801] Server sync order, clamp and expiry (ported from `sync.test.ts`).

The batch is applied in `answeredAt` order, an answer can never be in the future, and an answer
older than the local day of the activity or seven days is `EXPIRED`. Each case is the Python port of
a Vitest case of `packages/services/src/offline/sync.test.ts`.
"""

from typing import Any

import pytest
from learny.assessments.application.offline_sync import (
    clamp_answered_at,
    is_expired,
    order_entries,
)
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2202")

NOW = parse_iso("2026-11-11T12:20:00Z")


def entry(client_id: str, answered_at: str) -> dict[str, Any]:
    """The `entry` fixture of the TypeScript test, unchanged."""
    return {
        "clientId": client_id,
        "kind": "complete",
        "formationId": "22222222-2222-4222-8222-222222222222",
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "answeredAt": answered_at,
    }


def test_sorts_the_entries_by_ascending_answered_at() -> None:
    ordered = order_entries(
        [
            entry("11111111-1111-4111-8111-111111111111", "2026-11-11T12:03:00.000Z"),
            entry("22222222-2222-4222-8222-222222222222", "2026-11-11T12:01:00.000Z"),
            entry("33333333-3333-4333-8333-333333333333", "2026-11-11T12:02:00.000Z"),
        ]
    )

    assert [value["answeredAt"] for value in ordered] == [
        "2026-11-11T12:01:00.000Z",
        "2026-11-11T12:02:00.000Z",
        "2026-11-11T12:03:00.000Z",
    ]


def test_clamps_a_future_answer_to_the_server_instant() -> None:
    assert clamp_answered_at("2026-11-12T08:00:00.000Z", NOW) == "2026-11-11T12:20:00.000Z"
    assert clamp_answered_at("2026-11-11T12:01:00.000Z", NOW) == "2026-11-11T12:01:00.000Z"


def test_rejects_an_answer_older_than_seven_days_or_the_local_day() -> None:
    assert is_expired("2026-11-11T08:00:00.000Z", "2026-11-11", "Europe/Paris", NOW) is False
    assert is_expired("2026-11-03T12:00:00.000Z", "2026-11-11", "Europe/Paris", NOW) is True
    # 23:30 UTC on the 10th is 00:30 local on the 11th: inside the local day.
    assert is_expired("2026-11-10T23:30:00.000Z", "2026-11-11", "Europe/Paris", NOW) is False
    assert is_expired("2026-11-09T22:30:00.000Z", "2026-11-11", "Europe/Paris", NOW) is True
