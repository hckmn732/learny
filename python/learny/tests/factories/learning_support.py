"""Shared data of the learning-engine port (SPEC-2202).

The reference fixture `learning_engine_reference.json` is recorded once from the reference
implementation (`@learny/learning-engine/fixtures` and `@learny/learning-engine/fixtures/builders`)
on 2026-11-21: the SAP demonstration curriculum, the reference instant and the defaults of the test
builders. Tests replay it instead of transcribing it, so the Python port is compared with the source
of truth (SPEC-401 ET-7, ET-8).
"""

import json
from pathlib import Path
from typing import Any

from learny.learning.domain.time import add_days, instant_at, local_date_of

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
REFERENCE: dict[str, Any] = json.loads(
    (FIXTURES / "learning_engine_reference.json").read_text(encoding="utf-8")
)

REFERENCE_NOW: str = REFERENCE["referenceNow"]
"""Frozen reference instant of the whole suite (ADR-0047)."""

SAP = REFERENCE["sap"]
SAP_FORMATION: dict[str, Any] = SAP["formation"]
SAP_AVAILABILITY: dict[str, Any] = SAP["availability"]
SAP_MODULES: list[dict[str, Any]] = SAP["modules"]
SAP_CHAPTERS: list[dict[str, Any]] = SAP["chapters"]
SAP_NOTIONS: list[dict[str, Any]] = SAP["notions"]
SAP_LINKS: list[dict[str, Any]] = SAP["links"]
SAP_MASTERY_AT_REFERENCE: dict[str, Any] = SAP["mastery"]
SAP_GAPS_AT_REFERENCE: list[dict[str, Any]] = SAP["gaps"]

BUILDERS = REFERENCE["builders"]


def build_card(**overrides: Any) -> dict[str, Any]:
    """`buildCard`: a ts-fsrs card in its `new` state, due at the reference instant."""
    return {**BUILDERS["card"], **overrides}


def build_notion_state(**overrides: Any) -> dict[str, Any]:
    """`buildNotionState`: a notion never seen before, with no gap and no FSRS card."""
    return {**BUILDERS["notionState"], **overrides}


def build_answer(**overrides: Any) -> dict[str, Any]:
    """`buildAnswer`: a correct 20-second choice answer on the default notion."""
    return {**BUILDERS["answer"], **overrides}


def build_gap(**overrides: Any) -> dict[str, Any]:
    """`buildGap`: a stored confusion detected at the reference instant."""
    return {**BUILDERS["gap"], **overrides}


def build_review_event(**overrides: Any) -> dict[str, Any]:
    """`buildReviewEvent`: an applied review event on the default notion."""
    return {**BUILDERS["reviewEvent"], **overrides}


def at_days_before(now: str, days: int, time: str = "09:00") -> str:
    """`atDaysBefore`: the instant `days` civil days before `now` at `time` in UTC."""
    return instant_at(add_days(local_date_of(now, "UTC"), -days), time, "UTC")


def mastery_answer(answer: dict[str, Any]) -> dict[str, Any]:
    """`fromRecord`: the stored answer projected onto the narrow mastery contract."""
    return {
        "answerId": answer["answerId"],
        "attemptId": answer["attemptId"],
        "score": float(answer["score"]) / float(answer["maxScore"]),
        "answeredAt": answer["answeredAt"],
    }


def mastery_of(answers: list[dict[str, Any]], at: str = REFERENCE_NOW) -> float:
    """The mastery of a list of stored answers with the normative bounds."""
    from learny.learning.domain.mastery import calculate_mastery
    from learny.learning.domain.params import ENGINE

    points = [
        mastery_answer(answer)
        for answer in answers
        if answer.get("score") is not None
        and answer.get("maxScore") is not None
        and float(answer["maxScore"]) > 0
    ]
    return calculate_mastery(
        points,
        at,
        ENGINE["mastery"]["threshold"],
        ENGINE["mastery"]["halfLifeDays"],
    ).mastery
