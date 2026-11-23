"""Display derivations shared by the identity and formation contexts (SPEC-2201).

Port of `accentOf` and `formationMonogram` (`packages/services/src/sidebar.ts`,
`packages/db/src/formation-monogram.ts`). Both lived in `learny.identity.application.sidebar`;
they move here because the formation context writes the same values, and 00-conventions section 2
forbids duplicating a derivation in the caller (ADR-0162 keeps the stored value authoritative).
"""

import re
import unicodedata

FORMATION_ACCENTS = ("indigo", "green", "orange", "violet", "teal")
FORMATION_MONOGRAM_MAX_LENGTH = 2
_NON_ALPHANUMERIC = re.compile(r"[^A-Z0-9]")


def accent_of(value: str) -> str:
    """ADR-0162 - the stored accent wins, `indigo` is the defensive fallback."""
    return value if value in FORMATION_ACCENTS else "indigo"


def next_accent(used: list[str] | tuple[str, ...]) -> str:
    """`nextAccent` (`cadrage/create.ts`): first free accent of the palette, else the first one."""
    for accent in FORMATION_ACCENTS:
        if accent not in used:
            return accent
    return FORMATION_ACCENTS[0]


def formation_monogram(title: str, monogram: str | None = None) -> str:
    """ADR-0162 fallback, identical to `formationMonogram` (`packages/db`)."""
    stored = (monogram or "").strip()
    if stored != "":
        return stored[:FORMATION_MONOGRAM_MAX_LENGTH]
    decomposed = unicodedata.normalize("NFKD", title)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    folded = _NON_ALPHANUMERIC.sub("", without_marks.upper())
    if folded[:FORMATION_MONOGRAM_MAX_LENGTH] == "":
        return "?"
    return folded[:FORMATION_MONOGRAM_MAX_LENGTH]
