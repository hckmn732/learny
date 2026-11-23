"""[SPEC-2202] Weighted mastery and streak (SPEC-403, SPEC-409).

Ported from `packages/learning-engine/src/mastery/calculate.test.ts` and
`packages/learning-engine/src/streak/calculate.test.ts`; the expected values are the recordings of
the TypeScript engine (2026-11-21), including the two vectors of
`api/oracles/vectors/learning-engine.json`.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.mastery import calculate_mastery
from learny.learning.domain.streak import MilestoneParams, StreakParams, calculate_streak, detect_milestones

pytestmark = pytest.mark.spec("SPEC-2202")

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_domain.json").read_text(
        encoding="utf-8"
    )
)
ORACLE = json.loads(
    (Path(__file__).resolve().parents[5] / "api" / "oracles" / "vectors" / "learning-engine.json").read_text(
        encoding="utf-8"
    )
)
MASTERY = [case for case in CASES if case["key"].startswith("mastery.")]
STREAK = [case for case in CASES if case["key"].startswith("streak.")]
MILESTONES = [case for case in CASES if case["key"].startswith("milestones.")]


@pytest.mark.parametrize("case", MASTERY, ids=lambda case: case["key"])
def test_mastery_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    result = calculate_mastery(data["answers"], data["at"], data.get("threshold"), data.get("halfLifeDays"))
    assert result.to_dict() == case["output"]


@pytest.mark.parametrize("entry", ORACLE["mastery"], ids=["vector-0", "vector-1"])
def test_mastery_replays_the_oracle_vectors(entry: dict[str, Any]) -> None:
    data = entry["input"]
    result = calculate_mastery(data["answers"], data["at"], data.get("threshold"), data.get("halfLifeDays"))
    assert result.mastery == entry["output"]["mastery"]
    assert result.weight_sum == entry["output"]["weightSum"]
    assert result.weighted_score == entry["output"]["weightedScore"]
    assert result.mastered == entry["output"]["mastered"]
    assert [weight.to_dict() for weight in result.weights] == entry["output"]["weights"]


def test_an_answer_after_the_evaluation_instant_is_refused() -> None:
    with pytest.raises(EngineError) as refused:
        calculate_mastery(
            [{"answerId": "a", "attemptId": "t", "score": 1, "answeredAt": "2026-11-12T00:00:00.000Z"}],
            "2026-11-11T12:20:00.000Z",
        )
    assert refused.value.code == "INVALID_INPUT"
    assert refused.value.path == "answers.0.answeredAt"


def test_empty_history_is_never_mastered() -> None:
    result = calculate_mastery([], "2026-11-11T12:20:00.000Z")
    assert result.mastery == 0
    assert result.mastered is False
    assert result.answer_count == 0


@pytest.mark.parametrize("case", STREAK, ids=lambda case: case["key"])
def test_streak_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    params = data["params"]
    result = calculate_streak(
        data["dailyActivity"],
        data["studyDays"],
        data["pauses"],
        data["at"],
        data["timeZone"],
        StreakParams(params["readingMinSeconds"], params["regularityDays"], params["maxLookbackDays"]),
    )
    assert result.to_dict() == case["output"]


@pytest.mark.parametrize("case", MILESTONES, ids=lambda case: case["key"])
def test_milestones_match_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    params = data["params"]
    milestones = detect_milestones(
        data["previousKeys"],
        data["validatedModules"],
        data["masteredNotions"],
        data["streakDays"],
        MilestoneParams(params["notionsRetained"], params["streakDays"]),
    )
    assert [milestone.to_dict() for milestone in milestones] == case["output"]


def test_two_consecutive_studied_days_give_a_two_day_streak() -> None:
    result = calculate_streak(
        [
            {"at": "2026-11-11T08:00:00.000Z", "kind": "quiz"},
            {"at": "2026-11-10T08:00:00.000Z", "kind": "quiz"},
        ],
        [1, 2, 3, 4, 5],
        [],
        "2026-11-11T12:20:00.000Z",
        "Europe/Paris",
        StreakParams(300, 14, 3660),
    )
    assert result.days == 2
    assert result.last_qualifying_day == "2026-11-11"
