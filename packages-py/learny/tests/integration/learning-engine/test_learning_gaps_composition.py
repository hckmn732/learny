"""[SPEC-2202] Composition of gap detection and clearance (SPEC-404, CA-1 to CA-4).

Ported from `packages/learning-engine/test/integration/gaps.test.ts`: the mastery, the FSRS lapse,
the normalised error and the spaced successes of the engine are chained with `ENGINE.gaps` bounds.
"""

import ast
from pathlib import Path
from typing import Any

import pytest
from factories.learning_support import REFERENCE_NOW, build_answer, build_gap, mastery_of
from learny.learning.domain.fsrs import apply_review, create_notion_card, grade_review
from learny.learning.domain.gaps import DEFAULT_GAP_PARAMS, clear_gap, detect_gap, normalize_error
from learny.learning.domain.params import ENGINE

pytestmark = pytest.mark.spec("SPEC-2202")

NOTION = "n-s4"
NOW = REFERENCE_NOW
PARAMS: dict[str, Any] = {**ENGINE["gaps"], "masteryThreshold": ENGINE["mastery"]["threshold"]}
GAPS_MODULE = Path(__file__).resolve().parents[3] / "src" / "learny" / "learning" / "domain" / "gaps.py"


def recorded(**partial: Any) -> dict[str, Any]:
    return build_answer(**{"notionIds": [NOTION], "countsForGaps": True, **partial})


def attempt(attempt_id: str, attempt_kind: str, answers: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "attemptId": attempt_id,
        "attemptKind": attempt_kind,
        "answers": [{**answer, "attemptId": attempt_id, "attemptKind": attempt_kind} for answer in answers],
    }


def test_the_engine_bounds_are_the_normative_parameters() -> None:
    assert DEFAULT_GAP_PARAMS.to_dict() == PARAMS
    assert PARAMS["failureRatio"] == ENGINE["gaps"]["failureRatio"]
    assert PARAMS["forgettingMinDays"] == ENGINE["gaps"]["forgettingMinDays"]
    assert PARAMS["repeatedErrorAttempts"] == ENGINE["gaps"]["repeatedErrorAttempts"]
    assert PARAMS["clearSuccesses"] == ENGINE["gaps"]["clearSuccesses"]
    assert PARAMS["clearMinDaysApart"] == ENGINE["gaps"]["clearMinDaysApart"]
    assert PARAMS["masteryThreshold"] == ENGINE["mastery"]["threshold"]


def test_the_computed_mastery_and_the_detection_are_composed() -> None:
    failed = recorded(
        answerId="a-fail",
        attemptId="attempt-quiz",
        attemptKind="validation_quiz",
        correct=False,
        score=0,
        maxScore=1,
        answeredAt=NOW,
        chosenDistractorNotionId="n-type",
    )
    mastery = mastery_of([failed])
    assert mastery == 0

    detection = detect_gap(
        NOTION, [attempt("attempt-quiz", "validation_quiz", [failed])], mastery, NOW, params=PARAMS
    )
    assert detection["active"] is True
    assert detection["event"] == "detected"
    assert detection["nature"] == "confusion"
    assert detection["confusedWith"] == "n-type"
    assert detection["recommendedAction"] == "confrontation"

    successful = recorded(
        answerId="a-good",
        attemptId="attempt-ok",
        correct=True,
        score=1,
        maxScore=1,
        answeredAt=NOW,
    )
    not_detected = detect_gap(
        NOTION,
        [attempt("attempt-ok", "validation_quiz", [successful])],
        mastery_of([successful]),
        NOW,
        params=PARAMS,
    )
    assert not_detected["active"] is False


def test_an_fsrs_lapse_composes_with_the_forgetting_nature() -> None:
    card = create_notion_card("2026-10-01T12:20:00.000Z", ENGINE["fsrs"]["requestRetention"])
    decision = grade_review(
        correct=False,
        time_ms=20_000,
        format_name="choice_question",
        settings=_grade_settings(),
    )
    assert decision.rating == "again"
    reviewed, _due_at = apply_review(
        card, decision.rating or "again", "2026-10-01T12:20:00.000Z", ENGINE["fsrs"]["requestRetention"]
    )
    assert reviewed.reps == 1

    failed = recorded(
        answerId="a-lapse",
        attemptId="attempt-lapse",
        correct=False,
        score=0,
        maxScore=1,
        answeredAt=NOW,
    )
    detection = detect_gap(
        NOTION,
        [attempt("attempt-lapse", "validation_quiz", [failed])],
        40,
        NOW,
        existing_gap=None,
        fsrs_lapsed=True,
        params=PARAMS,
    )
    assert detection["active"] is True
    assert detection["nature"] == "forgetting"
    assert detection["recommendedAction"] == "global_quiz"


def test_a_normalised_error_repeated_over_two_attempts_composes() -> None:
    first = recorded(
        answerId="a-1",
        attemptId="attempt-1",
        attemptKind="global_quiz_session",
        correct=False,
        format="open_question",
        normalizedResponse="Th\u00e9or\u00e8me de Pythagore",
        score=0,
        maxScore=1,
        answeredAt="2026-11-10T12:20:00.000Z",
    )
    second = recorded(
        answerId="a-2",
        attemptId="attempt-2",
        attemptKind="global_quiz_session",
        correct=False,
        format="open_question",
        normalizedResponse="theoreme  de pythagore",
        score=0,
        maxScore=1,
        answeredAt=NOW,
    )
    assert normalize_error(first["normalizedResponse"]) == normalize_error(second["normalizedResponse"])
    detection = detect_gap(
        NOTION,
        [
            attempt("attempt-1", "global_quiz_session", [first]),
            attempt("attempt-2", "global_quiz_session", [second]),
        ],
        90,
        NOW,
        params=PARAMS,
    )
    assert detection["active"] is True
    assert detection["triggers"] == ["repeated_error"]
    assert detection["repeatedErrors"] == [
        {"key": "response:theoreme de pythagore", "attemptIds": ["attempt-1", "attempt-2"]}
    ]

    both_in_one = detect_gap(
        NOTION,
        [
            attempt(
                "attempt-1",
                "global_quiz_session",
                [first, {**second, "answerId": "a-1-bis", "attemptId": "attempt-1"}],
            )
        ],
        90,
        NOW,
        params=PARAMS,
    )
    assert both_in_one["active"] is False


def test_the_clearance_uses_the_engine_successes_and_the_threshold() -> None:
    gap = build_gap(
        nature="forgetting",
        confusedWith=None,
        detectedAt="2026-11-01T12:20:00.000Z",
        evidence="D\u00e9tection de composition.",
    )
    first = recorded(
        answerId="a-clear-1",
        attemptId="attempt-clear-1",
        correct=True,
        score=1,
        maxScore=1,
        answeredAt="2026-11-10T12:20:00.000Z",
        source="warmup",
        attemptKind="warmup",
        countsForGaps=False,
    )
    second = recorded(
        answerId="a-clear-2",
        attemptId="attempt-clear-2",
        correct=True,
        score=1,
        maxScore=1,
        answeredAt=NOW,
        source="global_quiz",
        attemptKind="global_quiz_session",
    )
    mastery = mastery_of([first, second])
    assert mastery >= ENGINE["mastery"]["threshold"]

    clearance = clear_gap(gap, [first, second], mastery, NOW, NOTION, PARAMS)
    assert clearance["cleared"] is True
    assert clearance["event"] == "cleared"
    assert clearance["gap"]["clearedAt"] == NOW
    assert clearance["successCount"] == 2

    too_short = clear_gap(
        gap,
        [first, {**second, "answeredAt": "2026-11-11T12:19:59.999Z"}],
        mastery,
        NOW,
        NOTION,
        PARAMS,
    )
    assert too_short["cleared"] is False
    assert too_short["checks"]["spaced"] is False


def test_repetition_and_input_order_change_nothing() -> None:
    attempts = [
        attempt(
            "attempt-1",
            "validation_quiz",
            [
                recorded(
                    answerId="a-1",
                    attemptId="attempt-1",
                    correct=False,
                    chosenDistractorNotionId="n-type",
                    answeredAt="2026-11-10T12:20:00.000Z",
                )
            ],
        ),
        attempt(
            "attempt-2",
            "exercise",
            [recorded(answerId="a-2", attemptId="attempt-2", correct=False, answeredAt=NOW)],
        ),
    ]
    first = detect_gap(NOTION, attempts, 30, NOW, params=PARAMS)
    assert detect_gap(NOTION, attempts, 30, NOW, params=PARAMS) == first
    assert detect_gap(NOTION, list(reversed(attempts)), 30, NOW, params=PARAMS) == first
    assert [item["attemptId"] for item in attempts] == ["attempt-1", "attempt-2"]

    gap = build_gap(nature="forgetting", confusedWith=None, detectedAt="2026-11-01T12:20:00.000Z")
    successes = [
        recorded(answerId="s-1", correct=True, score=1, maxScore=1, answeredAt="2026-11-02T12:20:00.000Z"),
        recorded(answerId="s-2", correct=True, score=1, maxScore=1, answeredAt=NOW),
    ]
    reference = clear_gap(gap, successes, 100, NOW, NOTION, PARAMS)
    assert clear_gap(gap, list(reversed(successes)), 100, NOW, NOTION, PARAMS) == reference
    assert reference["cleared"] is True


def test_the_gaps_module_stays_pure_without_configuration_clock_or_io() -> None:
    source = GAPS_MODULE.read_text(encoding="utf-8")
    assert "@learny/config" not in source
    assert "Date.now" not in source
    assert "datetime.now(" not in source
    assert "time.time(" not in source
    assert "fetch(" not in source
    assert "httpx" not in source
    assert "requests" not in source

    tree = ast.parse(source)
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imported.add(node.module)
    assert not [name for name in imported if name.startswith(("learny.shared.db", "learny.platform"))]


def _grade_settings() -> Any:
    from learny.learning.domain.fsrs import GradeSettings

    values = ENGINE["fsrs"]
    return GradeSettings(
        median_window=values["medianWindow"],
        median_min_samples=values["medianMinSamples"],
        default_median_ms=values["defaultMedianMs"],
        hard_factor=values["hardFactor"],
        easy_factor=values["easyFactor"],
    )
