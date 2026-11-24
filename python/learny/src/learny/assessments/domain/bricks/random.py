"""Deterministic pseudo-randomness of the public payloads (SPEC-501 ET-7).

Same seed, same order, in the browser and on the server: no `random` module and no system state.
"""

import math
from collections.abc import Callable, Sequence

from learny.shared.prng import fnv1a32, mulberry32


def hash32(text: str) -> int:
    """FNV-1a 32-bit hash of a string (UTF-16 code units, in order)."""
    return fnv1a32(text)


def create_seeded_random(seed: str) -> Callable[[], float]:
    """mulberry32 generator seeded by `hash32(seed)`."""
    return mulberry32(hash32(seed))


def shuffle_seeded[T](items: Sequence[T], seed: str) -> list[T]:
    """Fisher-Yates with the generator of `seed`; the input is never mutated."""
    result = list(items)
    random = create_seeded_random(seed)
    for index in range(len(result) - 1, 0, -1):
        swap = math.floor(random() * (index + 1))
        result[index], result[swap] = result[swap], result[index]
    return result


__all__ = ["create_seeded_random", "hash32", "mulberry32", "shuffle_seeded"]
