"""[SPEC-2202] FSRS card scheduling and review grading (SPEC-402).

The expected values are the recordings of `ts-fsrs` 5.4.2 recorded once from the reference
implementation: the Python scheduler must produce the same cards, due dates, difficulties and
stabilities, digit for digit.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.fsrs import (
    GradeSettings,
    TimedResponse,
    apply_review,
    create_notion_card,
    grade_review,
    personal_median_ms,
    preview_grades,
)

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
SEQUENCES = json.loads((FIXTURES / "learning_engine_fsrs.json").read_text(encoding="utf-8"))
GRADES = json.loads((FIXTURES / "learning_engine_grade.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "case",
    [case for case in SEQUENCES if "sequence" in case],
    ids=lambda case: f"{case['retention']}-{'-'.join(case['sequence'])}",
)
def test_card_sequence_matches_the_typescript_scheduler(case: dict[str, Any]) -> None:
    card = create_notion_card("2026-11-11T12:20:00.000Z", case["retention"])
    assert card.to_dict() == case["steps"][0]
    for index, grade in enumerate(case["sequence"]):
        due = _offset_instant(index)
        card, due_at = apply_review(card, grade, due, case["retention"])
        assert card.to_dict() == case["steps"][index + 1]
        assert due_at == card.due


def _offset_instant(index: int) -> str:
    offsets = (0, 1, 10, 30, 45, 90, 120, 365, 400, 700)
    base = "2026-11-11T12:20:00.000Z"
    from datetime import UTC, datetime, timedelta

    moment = datetime.fromisoformat(base.replace("Z", "+00:00")).astimezone(UTC)
    shifted = moment + timedelta(days=offsets[index])
    return shifted.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def test_new_card_is_the_empty_ts_fsrs_card() -> None:
    card = create_notion_card("2026-11-11T12:20:00.000Z", 0.9)
    assert card.to_dict() == {
        "due": "2026-11-11T12:20:00.000Z",
        "stability": 0,
        "difficulty": 0,
        "elapsed_days": 0,
        "scheduled_days": 0,
        "learning_steps": 0,
        "reps": 0,
        "lapses": 0,
        "state": "new",
        "last_review": None,
    }


def test_preview_returns_the_four_due_dates_in_the_stable_order() -> None:
    card = create_notion_card("2026-11-11T12:20:00.000Z", 0.9)
    preview = preview_grades(card, "2026-11-11T12:20:00.000Z", 0.9)
    expected = next(case["preview"] for case in SEQUENCES if "preview" in case)
    assert preview == expected
    assert list(preview) == ["again", "hard", "good", "easy"]


@pytest.mark.parametrize(
    "case", GRADES, ids=lambda case: f"{case['input']['format']}-{case['output']['reason']}"
)
def test_grade_review_matches_the_typescript_decision(case: dict[str, Any]) -> None:
    data = case["input"]
    settings = data["settings"]
    history = [
        TimedResponse(
            answered_at=entry["answeredAt"],
            format=entry["format"],
            time_ms=entry["timeMs"],
            answer_id=entry.get("answerId"),
        )
        for entry in data["history"]
    ]
    decision = grade_review(
        correct=data["correct"],
        time_ms=data["timeMs"],
        format_name=data["format"],
        settings=GradeSettings(
            median_window=settings["medianWindow"],
            median_min_samples=settings["medianMinSamples"],
            default_median_ms=settings["defaultMedianMs"],
            hard_factor=settings["hardFactor"],
            easy_factor=settings["easyFactor"],
        ),
        history=history,
        self_rating=data["selfRating"],
    )
    assert decision.to_dict() == case["output"]


def test_personal_median_ignores_invalid_durations_and_keeps_the_window() -> None:
    settings = GradeSettings(
        median_window=3, median_min_samples=2, default_median_ms=20_000, hard_factor=2, easy_factor=0.5
    )
    history = [
        TimedResponse("2026-11-01T09:00:00.000Z", "cloze", 40_000, "a"),
        TimedResponse("2026-11-02T09:00:00.000Z", "cloze", 0, "b"),
        TimedResponse("2026-11-03T09:00:00.000Z", "cloze", 10_000, "c"),
        TimedResponse("2026-11-04T09:00:00.000Z", "cloze", 20_000, "d"),
        TimedResponse("2026-11-05T09:00:00.000Z", "choice_question", 5_000, "e"),
    ]
    # The newest three valid cloze durations are 20 000, 10 000 and 40 000 ms.
    assert personal_median_ms(history, "cloze", settings) == 20_000
    assert personal_median_ms(history, "cloze", settings) == 20_000


def test_invalid_retention_and_grade_are_refused() -> None:
    card = create_notion_card("2026-11-11T12:20:00.000Z", 0.9)
    with pytest.raises(EngineError) as invalid_param:
        apply_review(card, "good", "2026-11-11T12:20:00.000Z", 1)
    assert invalid_param.value.code == "INVALID_PARAM"
    with pytest.raises(EngineError) as invalid_input:
        apply_review(card, "unknown", "2026-11-11T12:20:00.000Z", 0.9)
    assert invalid_input.value.code == "INVALID_INPUT"
