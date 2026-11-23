"""Format of the mock exam and its question quotas (SPEC-614 EF-1, EF-5, ET-3, BR-PRA-02).

Port of the pure half of `packages/services/src/mock-exams/format.ts`: the normative default comes
from the product configuration, a format extracted from a guide stays *proposed* until the learner
confirms it, and a stored confirmed format always wins. The quota distribution shares the question
count over the modules in proportion to their notions, then by largest fractional share in a stable
module order. No IO, no clock, no model call.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

from learny.learning.domain.params import ENGINE

MAX_QUESTIONS = 200
MIN_QUESTIONS = 1
MIN_DURATION_MIN = 1
MAX_DURATION_MIN = 600
MAX_SECONDS_PER_QUESTION = 3_600
MIN_THRESHOLD = 1
MAX_THRESHOLD = 100


def planificador() -> Mapping[str, Any]:
    """The `planner.mockExam` block of the engine configuration (BR-PRA-02)."""
    planner = ENGINE["planner"]
    assert isinstance(planner, Mapping)
    block = planner["mockExam"]
    assert isinstance(block, Mapping)
    return block


def _integer(value: Any, low: int, high: int) -> int | None:
    """A bounded integer, `None` when the value is not one (Zod `int().min().max()`)."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    if value < low or value > high:
        return None
    return value


def _round_half_up(value: float) -> int:
    """`Math.round`: halves go up, unlike the banker's rounding of `round`."""
    return math.floor(value + 0.5)


def seconds_from_duration(question_count: int, duration_min: int) -> int:
    """`secondsFromDuration`: the round per-question share of the duration, at least one second."""
    return max(1, _round_half_up((duration_min * 60) / question_count))


def default_exam_format() -> dict[str, Any]:
    """BR-PRA-02 - 20 questions x 2 minutes and a 70 % threshold, from the configuration."""
    block = planificador()
    questions = int(block["questions"])
    minutes_per_question = int(block["minutesPerQuestion"])
    return {
        "questionCount": questions,
        "secondsPerQuestion": minutes_per_question * 60,
        "durationMin": questions * minutes_per_question,
        "threshold": int(block["threshold"]),
        "source": "default",
        "confirmed": True,
    }


def _stored_format(value: Any) -> dict[str, Any] | None:
    """`examFormatSchema.safeParse`: a strict object, `None` when anything is off."""
    if not isinstance(value, Mapping):
        return None
    questions = _integer(value.get("questions"), MIN_QUESTIONS, MAX_QUESTIONS)
    duration_min = _integer(value.get("durationMin"), MIN_DURATION_MIN, MAX_DURATION_MIN)
    threshold = _integer(value.get("threshold"), MIN_THRESHOLD, MAX_THRESHOLD)
    confirmed = value.get("confirmed")
    if questions is None or duration_min is None or threshold is None or not isinstance(confirmed, bool):
        return None
    allowed = {"questions", "durationMin", "threshold", "confirmed", "sourceResourceId"}
    if set(value.keys()) - allowed:
        return None
    source_resource_id = value.get("sourceResourceId")
    if source_resource_id is not None and not isinstance(source_resource_id, str):
        return None
    return {
        "questions": questions,
        "durationMin": duration_min,
        "threshold": threshold,
        "confirmed": confirmed,
        "sourceResourceId": source_resource_id,
    }


def _guide_format(metadata: Any) -> dict[str, Any] | None:
    """`guideFormatSchema`: a loose object whose `threshold` is required and bounded."""
    if not isinstance(metadata, Mapping):
        return None
    raw = metadata.get("examFormat")
    if raw is None:
        raw = metadata.get("format")
    if not isinstance(raw, Mapping):
        return None
    threshold = _integer(raw.get("threshold"), MIN_THRESHOLD, MAX_THRESHOLD)
    if threshold is None:
        return None
    questions = _integer(raw.get("questions"), MIN_QUESTIONS, MAX_QUESTIONS)
    question_count = _integer(raw.get("questionCount"), MIN_QUESTIONS, MAX_QUESTIONS)
    duration_min = _integer(raw.get("durationMin"), MIN_DURATION_MIN, MAX_DURATION_MIN)
    seconds = _integer(raw.get("secondsPerQuestion"), 1, MAX_SECONDS_PER_QUESTION)
    return {
        "questions": questions,
        "questionCount": question_count,
        "durationMin": duration_min,
        "secondsPerQuestion": seconds,
        "threshold": threshold,
    }


def format_from_guide(guide_id: str, extracted: Mapping[str, Any]) -> dict[str, Any]:
    """`formatFromGuide`: the guide format, still unconfirmed until the learner accepts it."""
    questions = extracted["questions"] if extracted["questions"] is not None else extracted["questionCount"]
    if questions is None:
        questions = 20
    seconds = extracted["secondsPerQuestion"]
    duration_min = extracted["durationMin"]
    if duration_min is None:
        duration_min = max(1, _round_half_up((questions * (seconds if seconds is not None else 120)) / 60))
    return {
        "questionCount": questions,
        "secondsPerQuestion": (
            seconds if seconds is not None else seconds_from_duration(questions, duration_min)
        ),
        "durationMin": duration_min,
        "threshold": extracted["threshold"],
        "source": "guide",
        "confirmed": False,
        "sourceResourceId": guide_id,
    }


def propose_exam_format(stored: Any, guide: Mapping[str, Any] | None) -> dict[str, Any]:
    """ET-3 - stored format wins, then the extracted guide format, then the normative default."""
    parsed = _stored_format(stored)
    if parsed is not None:
        source_resource_id = parsed["sourceResourceId"]
        proposal: dict[str, Any] = {
            "questionCount": parsed["questions"],
            "secondsPerQuestion": seconds_from_duration(parsed["questions"], parsed["durationMin"]),
            "durationMin": parsed["durationMin"],
            "threshold": parsed["threshold"],
            "source": "default" if source_resource_id is None else "guide",
            "confirmed": parsed["confirmed"],
        }
        if source_resource_id is not None:
            proposal["sourceResourceId"] = source_resource_id
        return proposal
    if guide is not None:
        extracted = _guide_format(guide.get("metadata"))
        if extracted is not None:
            return format_from_guide(str(guide["id"]), extracted)
    return default_exam_format()


def format_dto(format_value: Mapping[str, Any]) -> dict[str, Any]:
    """The contract shape of one format: `sourceResourceId` is absent, never null."""
    payload: dict[str, Any] = {
        "confirmed": bool(format_value["confirmed"]),
        "durationMin": int(format_value["durationMin"]),
        "questionCount": int(format_value["questionCount"]),
        "secondsPerQuestion": (
            None
            if format_value.get("secondsPerQuestion") is None
            else int(format_value["secondsPerQuestion"])
        ),
        "source": str(format_value["source"]),
        "threshold": int(format_value["threshold"]),
    }
    source_resource_id = format_value.get("sourceResourceId")
    if source_resource_id is not None:
        payload["sourceResourceId"] = str(source_resource_id)
    return payload


def is_studied_module(status: str, seen_count: int) -> bool:
    """A module is studied when it is open/validated or when one of its notions was seen."""
    return status != "locked" or seen_count > 0


def allocate_question_counts(question_count: int, modules: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    """Shares the question count in proportion to the notions, largest fraction first."""
    counts: dict[str, int] = {}
    if not modules or question_count <= 0:
        return counts
    notion_counts = [max(0, int(module["notionCount"])) for module in modules]
    total_notions = sum(notion_counts)
    if total_notions == 0:
        each = question_count // len(modules)
        remainder = question_count - each * len(modules)
        for module in modules:
            counts[str(module["moduleId"])] = each + (1 if remainder > 0 else 0)
            remainder -= 1
        return counts
    shares: list[dict[str, Any]] = []
    for module, notion_count in zip(modules, notion_counts, strict=True):
        exact = (question_count * notion_count) / total_notions
        floor = math.floor(exact)
        shares.append({"moduleId": str(module["moduleId"]), "floor": floor, "fraction": exact - floor})
    assigned = sum(int(share["floor"]) for share in shares)
    for share in shares:
        counts[str(share["moduleId"])] = int(share["floor"])
    by_fraction = sorted(shares, key=lambda share: (-float(share["fraction"]), str(share["moduleId"])))
    index = 0
    while assigned < question_count and by_fraction:
        share = by_fraction[index % len(by_fraction)]
        module_id = str(share["moduleId"])
        counts[module_id] = counts.get(module_id, 0) + 1
        assigned += 1
        index += 1
    return counts


__all__ = [
    "allocate_question_counts",
    "default_exam_format",
    "format_dto",
    "format_from_guide",
    "is_studied_module",
    "propose_exam_format",
    "seconds_from_duration",
]
