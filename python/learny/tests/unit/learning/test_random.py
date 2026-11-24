"""[SPEC-2202] Seeded randomness of the engine (SPEC-401 ET-5, CL-8)."""

import pytest
from learny.shared.prng import fnv1a32, seeded_random, stable_shuffle

pytestmark = pytest.mark.spec("SPEC-2202")


def test_fnv1a32_control_values() -> None:
    assert fnv1a32("") == 2_166_136_261
    assert fnv1a32("a") == 3_826_002_220


def test_the_sequence_is_reproducible_and_in_unit_interval() -> None:
    first = seeded_random("")
    second = seeded_random("")
    values = [first() for _ in range(100)]
    assert [second() for _ in range(100)] == values
    assert all(0 <= value < 1 for value in values)


def test_two_seeds_give_different_sequences() -> None:
    differing = 0
    for index in range(100):
        left = seeded_random(f"graine-{index}")
        right = seeded_random(f"autre-graine-{index}")
        if all(left() != right() for _ in range(10)):
            differing += 1
    assert differing == 100


def test_shuffle_does_not_mutate_and_loses_nothing() -> None:
    items = ["b", "a", "c", "d"]
    before = list(items)
    shuffled = stable_shuffle(items, "seed", lambda item: item)
    assert items == before
    assert sorted(shuffled) == sorted(items)
    assert stable_shuffle(items, "seed", lambda item: item) == shuffled


def test_equal_hashes_are_tie_broken_by_key() -> None:
    items = [{"id": "b", "rank": "1"}, {"id": "a", "rank": "2"}, {"id": "c", "rank": "3"}]
    stable_shuffle(items, "seed", lambda item: item["id"])
    assert [item["id"] for item in items] == ["b", "a", "c"]
    duplicates = [{"id": "same", "rank": "1"}, {"id": "same", "rank": "2"}]
    assert stable_shuffle(duplicates, "seed", lambda item: item["id"]) == duplicates
