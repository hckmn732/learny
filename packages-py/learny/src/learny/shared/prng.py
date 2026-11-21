"""Deterministic pseudo-randomness shared by the pure domains (SPEC-401 ET-5, ADR-0140).

FNV-1a 32 bits over the UTF-16 code units, then mulberry32. No system randomness and no global
state: a seed always replays the same sequence, in tests and in production.
"""

from collections.abc import Callable, Iterable

FNV_OFFSET = 0x811C9DC5
FNV_PRIME = 0x01000193
MULBERRY_INCREMENT = 0x6D2B79F5
UINT32 = 4_294_967_296
_MASK = 0xFFFFFFFF


def utf16_code_units(text: str) -> list[int]:
    """The UTF-16 code units of `text`, as `String#charCodeAt` reads them."""
    data = text.encode("utf-16-le", "surrogatepass")
    return [data[index] | (data[index + 1] << 8) for index in range(0, len(data), 2)]


def utf16_key(text: str) -> bytes:
    """Big-endian UTF-16 bytes: comparing them mirrors the JavaScript `<` of two strings."""
    return text.encode("utf-16-be", "surrogatepass")


def fnv1a32(text: str) -> int:
    """FNV-1a 32-bit hash of a string (each UTF-16 code unit is hashed in order)."""
    hashed = FNV_OFFSET
    for unit in utf16_code_units(text):
        hashed ^= unit
        hashed = (hashed * FNV_PRIME) & _MASK
    return hashed


def _imul(left: int, right: int) -> int:
    """`Math.imul`: the low 32 bits of the product, as an unsigned pattern."""
    return (left * right) & _MASK


def seeded_random(seed: str) -> Callable[[], float]:
    """mulberry32 generator seeded by `fnv1a32(seed)`; every call returns a number in [0, 1)."""
    state = fnv1a32(seed)

    def next_value() -> float:
        nonlocal state
        state = (state + MULBERRY_INCREMENT) & _MASK
        value = state
        value = _imul(value ^ (value >> 15), value | 1)
        value = (value ^ ((value + _imul(value ^ (value >> 7), value | 61)) & _MASK)) & _MASK
        return ((value ^ (value >> 14)) & _MASK) / UINT32

    return next_value


def stable_shuffle[T](items: Iterable[T], seed: str, key: Callable[[T], str]) -> list[T]:
    """Sorts a copy by `fnv1a32(seed + '|' + key(item))`, then by key, then by input order."""
    entries: list[tuple[int, bytes, int, T]] = []
    for index, item in enumerate(items):
        item_key = key(item)
        entries.append((fnv1a32(f"{seed}|{item_key}"), utf16_key(item_key), index, item))
    entries.sort(key=lambda entry: (entry[0], entry[1], entry[2]))
    return [entry[3] for entry in entries]
