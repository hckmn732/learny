"""[SPEC-2202] Composition of the mastery, the gaps and the draw (SPEC-405, CA-1 to CA-4).

Ported from `packages/learning-engine/test/integration/draw-attempt.test.ts`: the notions of the
reference curriculum are enriched with the computed mastery and the detected gaps, then drawn from
the brick bank with a seeded PRNG.
"""

from typing import Any

import pytest
from factories.learning_support import (
    REFERENCE_NOW,
    SAP_NOTIONS,
    build_answer,
    mastery_of,
)
from learny.learning.domain.draw import draw_attempt, engine_draw_params
from learny.learning.domain.gaps import detect_gap
from learny.learning.domain.params import ENGINE

pytestmark = pytest.mark.spec("SPEC-2202")

NOTIONS = [notion for notion in SAP_NOTIONS if notion["moduleId"] == "sap-m3"][:8]
GAP_NOTIONS = {"n-cle", "n-equilibre"}
PARAMS = engine_draw_params()
GAP_PARAMS: dict[str, Any] = {
    **ENGINE["gaps"],
    "masteryThreshold": ENGINE["mastery"]["threshold"],
}
OLD_SUCCESS = "2026-09-01T12:20:00.000Z"
SEQUENCE = [0]


def fingerprint(value: int) -> str:
    return format(value, "x").rjust(64, "0")


def answer(notion_id: str, **partial: Any) -> dict[str, Any]:
    return build_answer(notionIds=[notion_id], countsForGaps=True, **partial)


def draw_notions() -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for notion in NOTIONS:
        if notion["notionId"] in GAP_NOTIONS:
            answers = [
                answer(
                    notion["notionId"],
                    answerId=f"a-old-{notion['notionId']}",
                    attemptId=f"t-old-{notion['notionId']}",
                    score=1,
                    maxScore=1,
                    answeredAt=OLD_SUCCESS,
                ),
                answer(
                    notion["notionId"],
                    answerId=f"a-fail-{notion['notionId']}",
                    attemptId=f"t-fail-{notion['notionId']}",
                    score=0,
                    maxScore=1,
                    correct=False,
                    chosenDistractorNotionId="n-type",
                    answeredAt=REFERENCE_NOW,
                ),
            ]
        else:
            answers = [
                answer(
                    notion["notionId"],
                    answerId=f"a-ok-{notion['notionId']}",
                    attemptId=f"t-ok-{notion['notionId']}",
                    score=1,
                    maxScore=1,
                    answeredAt=REFERENCE_NOW,
                )
            ]
        enriched.append({**notion, "mastery": mastery_of(answers)})
    return enriched


def gaps_of(notions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    for notion in notions:
        failure = answer(
            notion["notionId"],
            answerId=f"a-gap-{notion['notionId']}",
            attemptId=f"t-gap-{notion['notionId']}",
            score=0,
            maxScore=1,
            correct=False,
            chosenDistractorNotionId="n-type",
            answeredAt=REFERENCE_NOW,
        )
        attempts = (
            [
                {
                    "attemptId": f"t-gap-{notion['notionId']}",
                    "attemptKind": "validation_quiz",
                    "answers": [failure],
                }
            ]
            if notion["notionId"] in GAP_NOTIONS
            else []
        )
        detected = detect_gap(
            notion["notionId"],
            attempts,
            notion.get("mastery") or 0,
            REFERENCE_NOW,
            params=GAP_PARAMS,
        )
        if detected["active"] and detected["nature"] is not None:
            gaps.append({"notionId": notion["notionId"], "nature": detected["nature"]})
    return gaps


def brick(notion_id: str, format_name: str) -> dict[str, Any]:
    SEQUENCE[0] += 1
    return {
        "brickId": f"b-{SEQUENCE[0]}",
        "brickVersionId": f"v-{SEQUENCE[0]}",
        "notionIds": [notion_id],
        "format": format_name,
        "status": "active",
        "valid": True,
        "ownedByLearner": True,
        "fingerprint": fingerprint(30_000 + SEQUENCE[0]),
    }


def bank() -> list[dict[str, Any]]:
    bricks: list[dict[str, Any]] = []
    for notion in NOTIONS:
        bricks.append(brick(notion["notionId"], "choice_question"))
        bricks.append(brick(notion["notionId"], "cloze"))
        bricks.append(brick(notion["notionId"], "matching"))
        bricks.append(brick(notion["notionId"], "open_question"))
        bricks.append(brick(notion["notionId"], "open_question"))
    return bricks


def test_the_normative_parameters_are_reflected() -> None:
    bounds = ENGINE["draw"]
    assert PARAMS["defaultSize"] == bounds["defaultSize"]
    assert PARAMS["minSize"] == bounds["minSize"]
    assert PARAMS["maxSize"] == bounds["maxSize"]
    assert PARAMS["openShare"] == bounds["openShare"]
    assert PARAMS["minOpen"] == bounds["minOpen"]
    assert PARAMS["gapWeight"] == bounds["gapWeight"]
    assert PARAMS["weakWeight"] == bounds["weakWeight"]
    assert PARAMS["baseWeight"] == bounds["baseWeight"]
    assert PARAMS["totalPoints"] == bounds["totalPoints"]
    assert PARAMS["masteryThreshold"] == ENGINE["mastery"]["threshold"]


def test_the_mastery_the_gaps_and_the_draw_are_composed() -> None:
    notions = draw_notions()
    gaps = gaps_of(notions)
    assert sorted(gap["notionId"] for gap in gaps) == sorted(GAP_NOTIONS)

    bricks = bank()
    seen = [bricks[0]["fingerprint"], bricks[10]["fingerprint"]]
    result = draw_attempt(
        notions=notions,
        bank=bricks,
        seen_fingerprints=seen,
        gaps=gaps,
        params=PARAMS,
        seed="user-module-attempt-1",
    )

    assert result["size"] == 12
    assert result["minimumReached"] is True
    assert result["coverageLimited"] is False
    assert result["uncoveredNotionIds"] == []
    assert result["exhausted"] == []
    assert result["exhaustedFormats"] == []
    assert sum(entry["quota"] for entry in result["plan"]) == 12
    for notion in notions:
        assert any(notion["notionId"] in question["notionIds"] for question in result["questions"]), notion[
            "notionId"
        ]
    assert not any(question["fingerprint"] in seen for question in result["questions"])

    gap_plans = [entry for entry in result["plan"] if entry["notionId"] in GAP_NOTIONS]
    assert all(entry["gap"] for entry in gap_plans)
    assert all(entry["weight"] == ENGINE["draw"]["gapWeight"] for entry in gap_plans)
    assert min(entry["quota"] for entry in gap_plans) > ENGINE["draw"]["baseWeight"]

    opens = [question for question in result["questions"] if question["share"] == "open"]
    assert len(opens) >= ENGINE["draw"]["minOpen"]
    assert (
        abs(sum(question["points"] for question in result["questions"]) - ENGINE["draw"]["totalPoints"])
        < 0.005
    )

    repeated = draw_attempt(
        notions=list(reversed(notions)),
        bank=list(reversed(bricks)),
        seen_fingerprints=list(reversed(seen)),
        gaps=list(reversed(gaps)),
        params=PARAMS,
        seed="user-module-attempt-1",
    )
    assert repeated["questions"] == result["questions"]


def test_a_notion_without_a_bank_is_reported_and_no_question_is_invented() -> None:
    notions = draw_notions()
    gaps = gaps_of(notions)
    missing = NOTIONS[0]
    bricks = [entry for entry in bank() if missing["notionId"] not in entry["notionIds"]]
    result = draw_attempt(
        notions=notions,
        bank=bricks,
        seen_fingerprints=[],
        gaps=gaps,
        params=PARAMS,
        seed="attempt-exhausted",
    )

    assert missing["notionId"] in result["uncoveredNotionIds"]
    assert any(
        entry["notionId"] == missing["notionId"] and entry["reason"] == "bank_exhausted"
        for entry in result["exhausted"]
    )
    assert not any(question["notionId"] == missing["notionId"] for question in result["questions"])
    assert result["minimumReached"] is True


def test_the_coverage_limit_is_reported_above_twenty_notions() -> None:
    notions = [{**notion, "mastery": 70} for notion in SAP_NOTIONS[:21]]
    bricks = [
        entry
        for notion in notions
        for entry in (
            brick(notion["notionId"], "choice_question"),
            brick(notion["notionId"], "open_question"),
        )
    ]
    result = draw_attempt(
        notions=notions,
        bank=bricks,
        seen_fingerprints=[],
        gaps=[],
        params=PARAMS,
        target_count=ENGINE["draw"]["maxSize"],
        seed="attempt-21-notions",
    )

    assert result["coverageLimited"] is True
    assert result["size"] == ENGINE["draw"]["maxSize"]
    assert len(result["uncoveredNotionIds"]) == 1
    assert any(entry["reason"] == "capacity" for entry in result["exhausted"])
