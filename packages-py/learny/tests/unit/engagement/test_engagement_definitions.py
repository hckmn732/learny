"""[SPEC-2205] Ten automation definitions: registry and one-line explanations.

The vectors are produced by `tools/engagement/oracle-definitions.mjs` from the TypeScript
definitions on frozen journal rows; the Python port must return the same sentence, character for
character, in both tones and for every status (EF-2, EF-8, ET-3). The `apply`/`undo` effects are
proved by the server integration tests, where a real transaction exists.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.engagement.domain.automations import (
    AUTOMATION_KEYS,
    ActionView,
    DraftError,
    create_registry,
)
from learny.engagement.domain.automations.definitions import DEFINITIONS, product_registry

pytestmark = pytest.mark.spec("SPEC-2205")

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "engagement_definitions.json"
VECTORS = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_the_product_registry_holds_the_ten_keys_in_enumeration_order() -> None:
    registry = product_registry()

    assert registry.keys() == list(AUTOMATION_KEYS)
    assert registry.size == 10
    assert set(DEFINITIONS) == set(AUTOMATION_KEYS)


def test_a_registry_refuses_a_duplicate_key_and_an_unknown_key() -> None:
    registry = create_registry()
    for key in AUTOMATION_KEYS:
        registry.register(DEFINITIONS[key])

    with pytest.raises(DraftError) as duplicate:
        registry.register(DEFINITIONS["micro_seance"])
    assert duplicate.value.code == "CONFLICT"

    with pytest.raises(DraftError) as unknown:
        registry.require("inconnu")
    assert unknown.value.code == "NOT_FOUND"


@pytest.mark.parametrize("vector", VECTORS, ids=[f"{v['key']}-{v['kind']}-{v['status']}" for v in VECTORS])
def test_every_explanation_matches_the_typescript_vector(vector: dict[str, Any]) -> None:
    action = ActionView(
        id="00000000-0000-4000-8000-000000000001",
        automation=vector["key"],
        kind=vector["kind"],
        summary="",
        formation_id="00000000-0000-4000-8000-000000000010",
        payload=vector["payload"],
        undo_payload=None,
        requires_consent=True,
        status=vector["status"],
        decided_at=None if vector["status"] == "pending_consent" else vector["createdAt"],
        created_at=vector["createdAt"],
    )

    summary = DEFINITIONS[vector["key"]].explain(action, vector["tone"], vector["timeZone"])

    assert summary == vector["summary"]
    assert "\n" not in summary
    assert len(summary) <= 160
