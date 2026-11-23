"""[SPEC-701] Daily global quiz: last formats, per-notion split and the smoothing note.

Ports of `loadLastFormats` and `splitResultByNotion` (`packages/services/src/review`): the engine
receives one `{notionId, format}` per notion, and a game is split from its contract correction
(`gameCorrection`), never from the brick grade. The note of a smoothed day keeps the TypeScript verb.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.application import review
from learny.learning.application.review_games import split_result_by_notion
from learny.learning.infrastructure import queries
from learny.shared.locale_fr import review as texts

pytestmark = pytest.mark.spec("SPEC-701")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


async def test_the_latest_answer_gives_the_format_of_each_notion(monkeypatch: pytest.MonkeyPatch) -> None:
    rows: list[dict[str, Any]] = [
        {"notion_ids": ["n-1", "n-2"], "type": "matching"},
        {"notion_ids": ["n-1"], "type": "flashcard"},
        {"notion_ids": ["n-3"], "type": "mcq"},
        {"notion_ids": None, "type": "mcq"},
    ]

    async def read(_tx: Any, _user_id: str, _formation_id: str) -> list[dict[str, Any]]:
        return rows

    monkeypatch.setattr(queries, "read_quiz_last_formats", read)

    assert await review.load_last_formats(None, "u", "f") == [
        {"notionId": "n-1", "format": "matching"},
        {"notionId": "n-2", "format": "matching"},
        {"notionId": "n-3", "format": "mcq"},
    ]


def test_a_categorization_is_split_from_its_contract_rows() -> None:
    payload = {
        "categories": [{"id": "c1", "notionId": "n-1"}, {"id": "c2", "notionId": "n-2"}],
        "items": [{"id": "i1", "categoryId": "c1"}, {"id": "i2", "categoryId": "c2"}],
    }
    correction = {
        "kind": "categorization",
        "rows": [
            {"itemId": "i1", "categoryId": "c1", "ok": True, "expectedCategoryId": "c1"},
            {"itemId": "i2", "categoryId": "c1", "ok": False, "expectedCategoryId": "c2"},
        ],
    }
    context = {"notionIds": ["n-1"], "isCorrect": False, "confusions": []}

    assert split_result_by_notion("categorization", payload, correction, context) == [
        {"notionId": "n-1", "correct": True},
        {"notionId": "n-2", "correct": False, "confusedWithNotionId": "n-1"},
    ]


def test_a_matching_is_split_from_its_contract_pairs() -> None:
    payload = {"pairs": [{"id": "p1", "notionId": "n-1"}, {"id": "p2", "notionId": "n-2"}]}
    correction = {
        "kind": "matching",
        "pairs": [{"leftId": "p1", "ok": True}, {"leftId": "p2", "ok": False}],
    }
    context = {"notionIds": ["n-1", "n-2"], "isCorrect": False, "confusions": []}

    assert split_result_by_notion("matching", payload, correction, context) == [
        {"notionId": "n-1", "correct": True},
        {"notionId": "n-2", "correct": False},
    ]


def test_the_smoothing_note_keeps_the_typescript_verb() -> None:
    oracle = json.loads((FIXTURES / "review_notes.json").read_text(encoding="utf-8"))["smoothedNote"]
    note = texts.NOTE_DEFERRED.format(
        due=review.was_due_word(oracle["dueCount"]),
        deferred=oracle["deferredCount"],
        verb=texts.SMOOTHING_VERB_MANY,
        day=oracle["weekday"],
        cap=oracle["capMinutes"],
    )
    assert note == oracle["expected"]
