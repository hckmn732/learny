"""Text normalization shared by fingerprints, cloze correction and bank deduplication.

normative, and the function is idempotent: `normalize_text(normalize_text(s)) == normalize_text(s)`.
1. NFKC; 2. typographic apostrophes/quotes/dashes/spaces to ASCII; 3. lower case;
4. NFD, remove diacritics, NFC; 5. collapse whitespace; 6. trim; 7. drop trailing punctuation.
"""

import re
import unicodedata

_TYPOGRAPHIC = str.maketrans(
    {
        "\u2019": "'",
        "\u2018": "'",
        "\u201b": "'",
        "\u02bc": "'",
        "\u00ab": '"',
        "\u00bb": '"',
        "\u201c": '"',
        "\u201d": '"',
        "\u201e": '"',
        "\u2010": "-",
        "\u2011": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u00a0": " ",
        "\u2009": " ",
        "\u202f": " ",
    }
)

# The JavaScript `\s` class, which is not exactly the Python one (`\ufeff` only exists in JS,
# `\x1c`-`\x1f` and `\x85` only in Python).
_WHITESPACE = re.compile("[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+")
_TRAILING_PUNCTUATION = re.compile("[.?!:;\u2026]+$")


def _strip_marks(value: str) -> str:
    return "".join(
        character
        for character in unicodedata.normalize("NFD", value)
        if not unicodedata.category(character).startswith("M")
    )


def normalize_text(value: str) -> str:
    """The normative normalized form of a free text (ADR-0151)."""
    text = unicodedata.normalize("NFKC", value)
    text = text.translate(_TYPOGRAPHIC)
    text = text.lower()
    text = unicodedata.normalize("NFC", _strip_marks(text))
    text = _WHITESPACE.sub(" ", text).strip()
    return _TRAILING_PUNCTUATION.sub("", text).strip()


def comparison_key(value: str) -> str:
    """Normalized comparison key of free text; always case- and accent-insensitive (BR-MEM-05)."""
    return normalize_text(value)


__all__ = ["comparison_key", "normalize_text"]
