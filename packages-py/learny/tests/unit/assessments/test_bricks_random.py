"""[SPEC-2202] Deterministic shuffle of the public payloads (SPEC-501 ET-7, ADR-0140).

Same seed, same order, and the input is never mutated.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.random import (
    create_seeded_random,
    hash32,
    mulberry32,
    shuffle_seeded,
)

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
CASES = FIXTURE["shuffle"]


@pytest.mark.parametrize("case", CASES, ids=[case["seed"] or "empty" for case in CASES])
def test_the_shuffle_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert shuffle_seeded(case["items"], case["seed"]) == case["output"]


def test_the_input_is_never_mutated() -> None:
    items = ["a", "b", "c", "d", "e"]
    shuffled = shuffle_seeded(items, "seed")
    assert items == ["a", "b", "c", "d", "e"]
    assert sorted(shuffled) == items


def test_the_same_seed_always_replays_the_same_order() -> None:
    first = shuffle_seeded(list("abcdefgh"), "SPEC-2202")
    second = shuffle_seeded(list("abcdefgh"), "SPEC-2202")
    assert first == second


def test_two_seeds_generally_differ() -> None:
    orders = {tuple(shuffle_seeded(list("abcdefgh"), f"seed-{index}")) for index in range(20)}
    assert len(orders) > 1


def test_hash32_is_fnv1a32() -> None:
    assert hash32("") == 0x811C9DC5
    assert hash32("a") == 0xE40C292C


def test_the_generator_stays_within_the_unit_interval() -> None:
    random = create_seeded_random("SPEC-2202")
    values = [random() for _ in range(64)]
    assert all(0.0 <= value < 1.0 for value in values)


def test_mulberry32_replays_the_same_sequence_for_one_integer_seed() -> None:
    first = mulberry32(42)
    second = mulberry32(42)
    assert [first() for _ in range(8)] == [second() for _ in range(8)]


def test_a_single_item_is_returned_unchanged() -> None:
    assert shuffle_seeded(["only"], "seed") == ["only"]
    assert shuffle_seeded([], "seed") == []
