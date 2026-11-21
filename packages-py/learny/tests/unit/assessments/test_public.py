"""[SPEC-2202] Public payload of every brick type (SPEC-501 ET-7, ADR-0150).

Ported from `packages/bricks/src/public.test.ts`. The expected projections are the recordings of
the TypeScript engine taken on 2026-11-21 from the reference examples and the version seed.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.public import ordering_public
from learny.assessments.domain.bricks.public_brick import (
    BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS,
    to_public_brick,
)
from learny.assessments.domain.bricks.random import shuffle_seeded

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
IDS = FIXTURE["ids"]
CASES = FIXTURE["public"]


def _public(case: dict[str, Any]) -> dict[str, Any]:
    return to_public_brick(
        brick_id=IDS["brick"],
        version_id=case["versionId"],
        type_name=case["type"],
        notion_ids=IDS["notions"],
        payload=case["payload"],
    )


@pytest.mark.parametrize("case", CASES, ids=[case["type"] for case in CASES])
def test_the_public_brick_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert _public(case) == case["output"]


def _walk(value: Any, forbidden: tuple[str, ...], found: list[str], path: str = "") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in forbidden:
                found.append(f"{path}.{key}")
            _walk(item, forbidden, found, f"{path}.{key}")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _walk(item, forbidden, found, f"{path}[{index}]")


@pytest.mark.parametrize("case", CASES, ids=[case["type"] for case in CASES])
def test_the_public_payload_never_exposes_a_correction_field(case: dict[str, Any]) -> None:
    found: list[str] = []
    _walk(_public(case)["publicPayload"], BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS, found)
    assert found == []


def test_the_brick_document_carries_the_identity_of_the_version() -> None:
    case = CASES[0]
    document = _public(case)
    assert document["brickId"] == IDS["brick"]
    assert document["versionId"] == case["versionId"]
    assert document["type"] == case["type"]
    assert document["notionIds"] == IDS["notions"]


@pytest.mark.parametrize("case", CASES, ids=[case["type"] for case in CASES])
def test_the_projection_is_stable_for_one_version(case: dict[str, Any]) -> None:
    assert _public(case) == _public(case)


@pytest.mark.parametrize(
    "case",
    [case for case in CASES if case["type"] in ("matching", "ordering", "categorization")],
    ids=["matching", "ordering", "categorization"],
)
def test_another_version_shuffles_another_way(case: dict[str, Any]) -> None:
    orders = {
        json.dumps(
            _public({**case, "versionId": f"00000000-0000-4000-8000-00000000000{index}"})["publicPayload"],
            sort_keys=True,
        )
        for index in range(6)
    }
    assert len(orders) > 1


def test_an_ordering_that_survives_the_shuffle_is_rotated() -> None:
    payload = next(case["payload"] for case in CASES if case["type"] == "ordering")
    original = [{"id": item["id"], "text": item["text"]} for item in payload["items"]]
    seed = next(
        f"seed-{index}"
        for index in range(5000)
        if shuffle_seeded(original, f"seed-{index}:items") == original
    )
    public = ordering_public(payload, seed)
    assert [item["id"] for item in public["items"]] == [
        *[item["id"] for item in original[1:]],
        original[0]["id"],
    ]


def test_the_matching_rights_never_carry_their_pair() -> None:
    case = next(case for case in CASES if case["type"] == "matching")
    public = _public(case)["publicPayload"]
    assert all(set(right) == {"id", "text"} for right in public["rights"])
    assert len({right["id"] for right in public["rights"]}) == len(public["rights"])
