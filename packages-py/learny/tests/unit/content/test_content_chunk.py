"""[SPEC-2203] Passage chunking of an extracted contribution (SPEC-509 ET-2, EF-3).

Ported from `packages/ingestion/src/chunk.ts` and its assertions. The vectors are the recordings of
the TypeScript implementation (`tools/content/oracle.mjs`): the Python passages must have the same
text, the same exact `{charStart, charEnd}` range, the same page or anchor and the same cost.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.content.domain.chunk import (
    OVERLAP_TOKENS,
    TARGET_TOKENS,
    SourceLocation,
    chunk_text,
    estimate_tokens,
    excerpt_of,
    js_length,
)
from learny.content.domain.errors import IngestionError

pytestmark = pytest.mark.spec("SPEC-2203")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
ORACLE: dict[str, Any] = json.loads((FIXTURES / "content_domain.json").read_text(encoding="utf-8"))

PARAGRAPHS = "\n\n".join(
    [
        "The first paragraph covers photosynthesis and light.",
        "The second paragraph explains cellular respiration.",
        "A third, longer paragraph returns to chloroplasts and chlorophyll.",
    ]
)
LONG = f"{'phrase courte. ' * 60}\n\n{'mot ' * 900}"
ACCENTS = (
    "L\u2019\u00e9l\u00e8ve r\u00e9vise l\u2019histoire g\u00e9n\u00e9rale."
    "\n\nDeuxi\u00e8me paragraphe : \u00e7a compte."
)
ASTRAL = "emoji \U0001f600 et suite. " * 40
PAGES_TEXT = "Page une.\n\nToujours page une.\n\nPage deux."
ANCHORS_TEXT = "Intro.\n\nSection A.\n\nSection B."

INPUTS: dict[str, dict[str, Any]] = {
    "paragraphs-default": {"text": PARAGRAPHS},
    "long-paragraphs": {"text": LONG},
    "small-target": {"text": PARAGRAPHS, "target_tokens": 20, "overlap_tokens": 5},
    "no-overlap": {"text": PARAGRAPHS, "target_tokens": 40, "overlap_tokens": 0},
    "accents": {"text": ACCENTS},
    "pdf-pages": {
        "text": PAGES_TEXT,
        "locations": [
            SourceLocation(page=1, char_start=0, char_end=29),
            SourceLocation(page=2, char_start=31, char_end=41),
        ],
    },
    "anchors": {
        "text": ANCHORS_TEXT,
        "locations": [
            SourceLocation(anchor="intro", char_start=0, char_end=6),
            SourceLocation(anchor="section-a", char_start=8, char_end=18),
            SourceLocation(anchor="section-b", char_start=20, char_end=30),
        ],
    },
}


def test_estimate_tokens_matches_typescript() -> None:
    for case in ORACLE["tokens"]:
        assert estimate_tokens(case["text"]) == case["tokens"]


def test_estimate_tokens_counts_javascript_units() -> None:
    astral = "\U0001f600\U0001f600"
    assert js_length(astral) == 4
    assert estimate_tokens(astral) == ORACLE["tokens"][4]["tokens"]


def test_defaults_match_the_contract() -> None:
    assert TARGET_TOKENS == ORACLE["targetTokens"] == 800
    assert OVERLAP_TOKENS == ORACLE["overlapTokens"] == 100


@pytest.mark.parametrize("case", ORACLE["chunks"], ids=lambda case: case["name"])
def test_chunk_text_matches_typescript(case: dict[str, Any]) -> None:
    inputs = INPUTS[case["name"]]
    chunks = chunk_text(
        inputs["text"],
        inputs.get("locations"),
        inputs.get("target_tokens", TARGET_TOKENS),
        inputs.get("overlap_tokens", OVERLAP_TOKENS),
    )
    produced = [
        {
            "position": chunk.position,
            "text": chunk.text,
            "location": chunk.location,
            "tokenCount": chunk.token_count,
        }
        for chunk in chunks
    ]
    assert produced == case["chunks"]


@pytest.mark.parametrize("case", ORACLE["chunks"], ids=lambda case: case["name"])
def test_every_passage_is_its_exact_slice(case: dict[str, Any]) -> None:
    inputs = INPUTS[case["name"]]
    text = inputs["text"]
    for chunk in chunk_text(
        text,
        inputs.get("locations"),
        inputs.get("target_tokens", TARGET_TOKENS),
        inputs.get("overlap_tokens", OVERLAP_TOKENS),
    ):
        start = chunk.location["charStart"]
        end = chunk.location["charEnd"]
        assert text[start:end] == chunk.text
        assert chunk.token_count == estimate_tokens(chunk.text)


def test_passages_never_cross_a_page() -> None:
    chunks = chunk_text(PAGES_TEXT, INPUTS["pdf-pages"]["locations"])
    pages = [chunk.location["page"] for chunk in chunks]
    assert pages == [1, 2]
    assert all(isinstance(chunk.location["page"], int) for chunk in chunks)


def test_empty_text_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        chunk_text("")
    assert error.value.code == "TEXT_EMPTY"


def test_location_beyond_the_text_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        chunk_text("court", [SourceLocation(char_start=0, char_end=90)])
    assert error.value.code == "TEXT_EMPTY"


def test_overlap_must_stay_below_the_target() -> None:
    with pytest.raises(IngestionError) as error:
        chunk_text("un texte", None, 40, 40)
    assert error.value.code == "TEXT_EMPTY"


def test_excerpt_is_the_exact_range() -> None:
    assert ORACLE["excerpt"] == excerpt_of("Le contenu, page 3.", 3, 10)
