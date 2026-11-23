"""Pure grading of a mock exam and its question selection (SPEC-614 EF-3, EF-4, ET-4, ET-5).

Port of `packages/services/src/mock-exams/{grade,attempt}.ts` without any IO: the studied score only
counts the modules already studied, the diagnostic score of the unseen modules is reported
separately and never lowers the studied score, and only a failure of a studied module becomes a gap
(BR-PRA-04). The selection is deterministic: the official count is shared over the modules in
proportion to their notions and each module draws from its own bank, shuffled with one seed.
"""

import json
import math
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.domain.bricks.public import project_public
from learny.assessments.domain.bricks.random import shuffle_seeded
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.domain.exam_format import allocate_question_counts
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts

EXAM_GRADED_TYPES = ("choice_question", "cloze", "matching")
"""The three question types a mock exam draws and corrects by code (ET-5)."""

DEFAULT_THRESHOLD = 70
DEFAULT_DURATION_SEC = 2_400
DEFAULT_QUESTION_COUNT = 20


def as_object(value: Any) -> dict[str, Any] | None:
    """`asObject`: a JSON object, parsed when the driver returns the raw text."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed: Any = json.loads(value)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return dict(parsed) if isinstance(parsed, Mapping) else None
    return dict(value) if isinstance(value, Mapping) else None


def items_of(value: Any) -> list[dict[str, Any]]:
    """`itemsOf`: the activity items, ignoring anything that is not an object."""
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def text_field(value: Any) -> str:
    """`textField`: a stored string, empty when the column holds something else."""
    return value if isinstance(value, str) else ""


def number_field(value: Any, fallback: int | float = 1) -> int | float:
    """`numberField`: a finite number, the fallback otherwise."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    if not math.isfinite(value):
        return fallback
    return value


def config_of(value: Any) -> dict[str, Any]:
    """`configOf`: the attempt configuration with the documented defaults."""
    config = as_object(value) or {}
    threshold = config.get("threshold")
    duration = config.get("durationSec")
    count = config.get("questionCount")
    positions = config.get("diagnosticPositions")
    modules = config.get("modules")
    return {
        "threshold": threshold if isinstance(threshold, (int, float)) else DEFAULT_THRESHOLD,
        "durationSec": duration if isinstance(duration, (int, float)) else DEFAULT_DURATION_SEC,
        "questionCount": count if isinstance(count, (int, float)) else DEFAULT_QUESTION_COUNT,
        "examFormat": config.get("examFormat"),
        "diagnosticPositions": [
            entry for entry in positions if isinstance(entry, int) and not isinstance(entry, bool)
        ]
        if isinstance(positions, list)
        else [],
        "modules": [dict(entry) for entry in modules if isinstance(entry, Mapping)]
        if isinstance(modules, list)
        else [],
    }


def type_label_of(type_name: str, payload: Any) -> str:
    """ET-4 - the visible label of an exam question."""
    data = as_object(payload)
    if type_name == "choice_question":
        multiple = data is not None and data.get("mode") == "multiple"
        return texts.QUIZ_TYPE_CHOICE_MULTIPLE if multiple else texts.QUIZ_TYPE_CHOICE_SINGLE
    if type_name == "cloze":
        return texts.QUIZ_TYPE_CLOZE
    if type_name == "matching":
        return texts.QUIZ_TYPE_MATCHING
    return texts.EXAM_QUESTION_LABEL


def question_stem(type_name: str, payload: Any) -> str:
    """`questionStem`: the prompt of the question, empty when the payload is unreadable."""
    data = as_object(payload)
    if data is None:
        return ""
    if type_name in ("choice_question", "open_question"):
        return text_field(data.get("stem"))
    if type_name == "cloze":
        return text_field(data.get("template"))
    if type_name == "matching":
        return text_field(data.get("instruction"))
    return ""


def public_payload_of(type_name: str, payload: Any, version_id: str) -> Any:
    """`publicPayload`: the contract payload of one question, `None` when it cannot be read."""
    parsed, issues = parse_payload(type_name, payload)
    if parsed is None or issues:
        return None
    return project_public(type_name, parsed, version_id)


def has_response(type_name: str, response: Any) -> bool:
    """`hasResponse`: does the stored response carry at least one visible value?"""
    data = as_object(response)
    if data is None:
        return False
    if type_name == "choice_question":
        options = data.get("optionIds")
        return isinstance(options, list) and len(options) > 0
    if type_name == "cloze":
        gaps = as_object(data.get("gaps"))
        return gaps is not None and any(str(value).strip() != "" for value in gaps.values())
    if type_name == "matching":
        pairs = as_object(data.get("pairs"))
        return pairs is not None and any(value is not None and value != "" for value in pairs.values())
    text = data.get("text")
    if isinstance(text, str):
        return text.strip() != ""
    return len(data) > 0


def validate_exam_response(item: Mapping[str, Any], response: Any) -> None:
    """ET-1 - a response that does not match its brick schema creates nothing (CL-1)."""
    from learny.shared.errors import AppError

    type_name = text_field(item.get("type"))
    if type_name not in EXAM_GRADED_TYPES:
        return
    parsed, issues = parse_payload(type_name, item.get("payload"))
    if parsed is None or issues:
        raise AppError("VALIDATION_FAILED", texts.EXAM_QUESTION_UNREADABLE)
    try:
        grade_brick(type_name, parsed, response, text_field(item.get("brickVersionId")))
    except BrickGradeError as error:
        if error.code == "RESPONSE_INVALID":
            raise AppError(
                "VALIDATION_FAILED",
                texts.EXAM_RESPONSE_MISMATCH,
                errors=[{"path": issue["path"], "message": issue["message"]} for issue in error.issues],
            ) from error


def _label_list(labels: Sequence[str]) -> str | None:
    """`labelList`: the non-empty labels joined by a comma, `None` when nothing is left."""
    filtered = [label for label in labels if label.strip() != ""]
    return None if not filtered else ", ".join(filtered)


def _sans_reponse() -> str:
    return texts.EXAM_GIVEN_NONE


def correction_labels(correction: Any) -> dict[str, Any]:
    """`correctionLabels`: the given and expected answers of one correction view."""
    none = {"given": _sans_reponse(), "expected": None, "explanation": None}
    if not isinstance(correction, Mapping) or correction.get("kind") in (None, "none"):
        return none
    kind = correction.get("kind")
    if kind == "choice_question":
        options = correction.get("options") or []
        given = _label_list(
            [text_field(option.get("text")) for option in options if option.get("chosen") is True]
        )
        expected = _label_list(
            [text_field(option.get("text")) for option in options if option.get("correct") is True]
        )
        return {
            "given": given if given is not None else _sans_reponse(),
            "expected": expected,
            "explanation": correction.get("explanation"),
        }
    if kind == "cloze":
        gaps = correction.get("gaps") or []
        given = _label_list(
            [
                ""
                if text_field(gap.get("given")) == ""
                else f"{gap.get('id')}. {text_field(gap.get('given'))}"
                for gap in gaps
            ]
        )
        expected = _label_list([f"{gap.get('id')}. {text_field(gap.get('expected'))}" for gap in gaps])
        return {
            "given": given if given is not None else _sans_reponse(),
            "expected": expected,
            "explanation": correction.get("explanation"),
        }
    if kind == "matching":
        pairs = correction.get("pairs") or []
        given = _label_list(
            [
                ""
                if pair.get("givenRight") is None
                else f"{text_field(pair.get('left'))} \u2192 {text_field(pair.get('givenRight'))}"
                for pair in pairs
            ]
        )
        expected = _label_list(
            [
                f"{text_field(pair.get('left'))} \u2192 {text_field(pair.get('expectedRight'))}"
                for pair in pairs
            ]
        )
        return {
            "given": given if given is not None else _sans_reponse(),
            "expected": expected,
            "explanation": correction.get("explanation"),
        }
    return none


def expected_from_payload(type_name: str, payload: Any) -> str | None:
    """`expectedFromPayload`: the expected answer read from the payload when no view carries it."""
    data = as_object(payload)
    if data is None:
        return None
    if type_name == "choice_question":
        options = data.get("options")
        if not isinstance(options, list):
            options = []
        expected: list[str] = []
        for option in options:
            entry = as_object(option)
            if entry is None or entry.get("correct") is not True:
                continue
            expected.append(text_field(entry.get("text")))
        return _label_list(expected)
    if type_name == "cloze":
        gaps = data.get("gaps")
        if not isinstance(gaps, list):
            gaps = []
        labels: list[str] = []
        for gap in gaps:
            entry = as_object(gap) or {}
            answers = entry.get("answers")
            first = answers[0] if isinstance(answers, list) and answers else ""
            labels.append(f"{text_field(entry.get('id'))}. {text_field(first)}")
        return _label_list(labels)
    if type_name == "matching":
        pairs = data.get("pairs")
        if not isinstance(pairs, list):
            pairs = []
        return _label_list(
            [
                f"{text_field((as_object(pair) or {}).get('left'))} \u2192 "
                f"{text_field((as_object(pair) or {}).get('right'))}"
                for pair in pairs
            ]
        )
    return None


def percent(correct: int, total: int) -> float:
    """`percent`: the rounded share of correct answers, zero without a question."""
    if total <= 0:
        return 0
    return js_round((correct / total) * 100)


def score_of(questions: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """`scoreOf`: correct count, total and rounded percent of a question set."""
    correct = sum(1 for question in questions if question["isCorrect"] is True)
    return {"correct": correct, "total": len(questions), "score": percent(correct, len(questions))}


def _studied_label(modules: Sequence[Mapping[str, Any]]) -> str:
    """`studiedLabel`: the studied modules of the plan sentence, in programme order."""
    positions = sorted(int(module["position"]) for module in modules if module.get("studied") is True)
    if not positions:
        return texts.EXAM_PLAN_STUDIED_ALL
    if len(positions) == 1:
        return texts.EXAM_PLAN_STUDIED_ONE.format(position=positions[0])
    return texts.EXAM_PLAN_STUDIED_MANY.format(first=positions[0], last=positions[-1])


def plan_of(
    gaps: Sequence[Mapping[str, Any]], modules: Sequence[Mapping[str, Any]], diagnostic: int
) -> list[str]:
    """`plan`: the two or three sentences of the revision plan, copied from the TypeScript."""
    label = _studied_label(modules)
    if not gaps:
        plan = [
            texts.EXAM_PLAN_KEEP_STUDIED.format(label=label),
            texts.EXAM_PLAN_SPRINT,
        ]
    else:
        plan = [
            texts.EXAM_PLAN_GAPS_ONE if len(gaps) == 1 else texts.EXAM_PLAN_GAPS_MANY.format(count=len(gaps)),
            texts.EXAM_PLAN_SPRINT_AFTER_GAPS.format(label=label),
        ]
    if diagnostic > 0:
        plan.append(texts.EXAM_PLAN_DIAGNOSTIC.format(label=label))
    return plan


def grade_exam(
    questions: Sequence[Mapping[str, Any]],
    modules: Sequence[Mapping[str, Any]],
    threshold: float,
) -> dict[str, Any]:
    """EF-4, ET-5 - separates the global, studied and diagnostic scores and builds the review."""
    ordered = sorted(questions, key=lambda question: int(question["position"]))
    studied_questions = [question for question in ordered if question.get("studied") is True]
    diagnostic_questions = [question for question in ordered if question.get("studied") is not True]
    studied = score_of(studied_questions)
    diagnostic = score_of(diagnostic_questions)
    global_score = score_of(ordered)
    module_results = []
    for module in sorted(modules, key=lambda entry: int(entry["position"])):
        scoped = [question for question in ordered if question["moduleId"] == module["moduleId"]]
        module_score = score_of(scoped)
        module_results.append(
            {
                "moduleId": str(module["moduleId"]),
                "position": int(module["position"]),
                "label": str(module["label"]),
                "studied": module.get("studied") is True,
                "correct": module_score["correct"],
                "total": module_score["total"],
                "score": module_score["score"],
            }
        )
    gaps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for question in ordered:
        if question.get("studied") is not True or question["isCorrect"] is True:
            continue
        notion_id = str(question["notionId"])
        if notion_id in seen:
            continue
        seen.add(notion_id)
        gaps.append(
            {
                "notionId": notion_id,
                "notionLabel": str(question["notionLabel"]),
                "moduleId": str(question["moduleId"]),
                "modulePosition": int(question["modulePosition"]),
                "moduleLabel": str(question["moduleLabel"]),
            }
        )
    return {
        "score": global_score["score"],
        "passed": global_score["score"] >= threshold,
        "studied": studied,
        "diagnostic": diagnostic,
        "modules": module_results,
        "gaps": gaps,
        "plan": plan_of(gaps, modules, len(diagnostic_questions)),
        "review": [
            {
                "position": int(question["position"]),
                "brickVersionId": str(question["brickVersionId"]),
                "typeLabel": str(question["typeLabel"]),
                "question": str(question["question"]),
                "notionLabel": str(question["notionLabel"]),
                "modulePosition": int(question["modulePosition"]),
                "moduleLabel": str(question["moduleLabel"]),
                "studied": question.get("studied") is True,
                "isCorrect": question["isCorrect"] is True,
                "given": str(question["given"]),
                "expected": None if question["isCorrect"] is True else question["expected"],
                "explanation": question["explanation"],
            }
            for question in ordered
        ],
    }


def per_notion_of(questions: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, Any]]:
    """`perNotionOf`: correct count, total and rounded percent per notion."""
    grouped: dict[str, dict[str, Any]] = {}
    for question in questions:
        key = str(question["notionId"])
        entry = grouped.setdefault(key, {"correct": 0, "total": 0})
        entry["total"] += 1
        if question["isCorrect"] is True:
            entry["correct"] += 1
    return {
        notion_id: {
            "correct": entry["correct"],
            "total": entry["total"],
            "score": 0 if entry["total"] == 0 else js_round((entry["correct"] / entry["total"]) * 100),
        }
        for notion_id, entry in grouped.items()
    }


def select_exam_questions(
    candidates: Sequence[Mapping[str, Any]],
    modules: Sequence[Mapping[str, Any]],
    question_count: int,
    seed: str,
) -> list[dict[str, Any]]:
    """`selectExamQuestions`: one deterministic selection, choice questions first per module."""
    quotas = allocate_question_counts(
        question_count,
        [
            {"moduleId": str(module["moduleId"]), "notionCount": int(module["notionCount"])}
            for module in modules
        ],
    )
    by_module: dict[str, list[dict[str, Any]]] = {}
    for module in modules:
        module_id = str(module["moduleId"])
        pool = [dict(candidate) for candidate in candidates if candidate["moduleId"] == module_id]
        preferred = [candidate for candidate in pool if candidate["type"] == "choice_question"]
        others = [candidate for candidate in pool if candidate["type"] != "choice_question"]
        by_module[module_id] = shuffle_seeded([*preferred, *others], f"{seed}:{module_id}")
    selected: list[dict[str, Any]] = []
    used: set[str] = set()

    def take(module_id: str, count: int) -> int:
        taken = 0
        for candidate in by_module.get(module_id, []):
            if taken >= count or len(selected) >= question_count:
                break
            if candidate["brickId"] in used:
                continue
            used.add(str(candidate["brickId"]))
            selected.append(candidate)
            taken += 1
        return taken

    for module in modules:
        module_id = str(module["moduleId"])
        take(module_id, quotas.get(module_id, 0))
    guard = 0
    limit = len(modules) * 4 + 4
    while len(selected) < question_count and guard < limit:
        guard += 1
        before = len(selected)
        for module in modules:
            if len(selected) >= question_count:
                break
            take(str(module["moduleId"]), 1)
        if len(selected) == before:
            break
    ordered = sorted(
        enumerate(selected),
        key=lambda entry: (int(entry[1]["modulePosition"]), entry[0]),
    )
    return [candidate for _, candidate in ordered]


def candidates_of(rows: Sequence[Mapping[str, Any]], studied_modules: set[str]) -> list[dict[str, Any]]:
    """`candidatesOf`: the auto-graded bricks of the bank, exam-purpose only when there are some."""
    has_exam_bricks = any(row["purpose"] == "exam" for row in rows)
    candidates: list[dict[str, Any]] = []
    for row in rows:
        if has_exam_bricks and row["purpose"] != "exam":
            continue
        if str(row["type"]) not in EXAM_GRADED_TYPES:
            continue
        candidates.append(
            {
                "brickId": str(row["brick_id"]),
                "versionId": str(row["version_id"]),
                "type": str(row["type"]),
                "notionId": str(row["notion_id"]),
                "notionLabel": str(row["notion_label"]),
                "moduleId": str(row["module_id"]),
                "modulePosition": int(row["module_position"]),
                "moduleLabel": str(row["module_label"]),
                "studied": str(row["module_id"]) in studied_modules,
                "payload": row["payload"],
            }
        )
    return candidates


def marked_positions_of(value: Any) -> list[int]:
    """`markedPositionsOf`: the marked positions stored in `review_feedback`."""
    review = as_object(value)
    if review is None:
        return []
    positions = review.get("markedPositions")
    if not isinstance(positions, list):
        return []
    return [entry for entry in positions if isinstance(entry, int) and not isinstance(entry, bool)]


__all__ = [
    "EXAM_GRADED_TYPES",
    "as_object",
    "candidates_of",
    "config_of",
    "correction_labels",
    "expected_from_payload",
    "grade_exam",
    "has_response",
    "items_of",
    "marked_positions_of",
    "number_field",
    "per_notion_of",
    "public_payload_of",
    "question_stem",
    "select_exam_questions",
    "text_field",
    "type_label_of",
    "validate_exam_response",
]
