"""[SPEC-2101] Unit of work: RLS claims and outbox event identifiers."""

import json

import pytest
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import claims_json, event_id_for

pytestmark = pytest.mark.spec("SPEC-2101")


def actor(user_id: str = "11111111-1111-4111-8111-111111111111") -> Actor:
    return Actor(
        user_id=user_id,
        email="session@test.learny.test",
        email_confirmed=True,
        transport="bearer",
    )


def test_claims_match_the_typescript_serialisation() -> None:
    produced = claims_json(actor())
    assert produced == json.dumps(
        {
            "sub": "11111111-1111-4111-8111-111111111111",
            "role": "authenticated",
            "aud": "authenticated",
            "email": "session@test.learny.test",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def test_claims_key_order_is_the_typescript_order() -> None:
    produced = json.loads(claims_json(actor()))
    assert list(produced.keys()) == ["sub", "role", "aud", "email"]


def test_event_id_is_name_colon_sha256_prefix() -> None:
    identifier = event_id_for("quiz/submitted", {"attemptId": "a1", "score": 1})
    assert identifier.startswith("quiz/submitted:")
    assert len(identifier) == len("quiz/submitted:") + 32
    assert identifier == event_id_for("quiz/submitted", {"attemptId": "a1", "score": 1})


def test_event_id_ignores_key_order() -> None:
    first = event_id_for("user/signed-up", {"b": 1, "a": 2, "A": 3})
    second = event_id_for("user/signed-up", {"A": 3, "b": 1, "a": 2})
    assert first == second


def test_event_id_keeps_null_members_like_canonical_json() -> None:
    # `canonicalJson` only drops `undefined`; an explicit `null` changes the payload, hence the id.
    with_null = event_id_for("user/signed-up", {"b": 1, "a": None})
    without = event_id_for("user/signed-up", {"b": 1})
    assert with_null != without


def test_event_id_changes_with_the_payload() -> None:
    assert event_id_for("quiz/submitted", {"score": 1}) != event_id_for("quiz/submitted", {"score": 2})
