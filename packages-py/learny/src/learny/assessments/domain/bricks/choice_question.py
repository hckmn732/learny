"""Code grading of a choice question (SPEC-502 ET-3, EF-2, EF-3).

Single mode is all-or-nothing; multiple mode applies `max(0, (TP - FP) / C)` and is correct only on
the exact set. Pure port of `packages/bricks/src/types/choice-question/grade.ts`.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.grade_support import (
    clamp_score,
    invalid_response,
    outcome,
    round4,
)
from learny.assessments.domain.bricks.responses import read_id_list, read_object


def parse_choice_response(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Validates a choice response against the payload; raises `BrickGradeError` otherwise."""
    parsed = read_object(response, ("optionIds",))
    option_ids = read_id_list(
        parsed["optionIds"],
        "response.optionIds",
        minimum=1,
        maximum=6,
        unique_message="Option ids must be unique.",
    )
    issues: list[dict[str, str]] = []
    if payload["mode"] == "single" and len(option_ids) != 1:
        issues.append(
            {
                "path": "response.optionIds",
                "message": "A single-choice question accepts exactly one option.",
            }
        )
    known = {str(option["id"]) for option in payload["options"]}
    for index, option_id in enumerate(option_ids):
        if option_id not in known:
            issues.append(
                {
                    "path": f"response.optionIds.{index}",
                    "message": f'Unknown option "{option_id}".',
                }
            )
    if issues:
        raise invalid_response(issues)
    return {"optionIds": option_ids}


def grade_choice_question(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Grades one choice response; raises `BrickGradeError` on an invalid response."""
    parsed = parse_choice_response(payload, response)
    chosen = list(parsed["optionIds"])
    chosen_set = set(chosen)
    correct_ids = [str(option["id"]) for option in payload["options"] if option["correct"] is True]
    correct_set = set(correct_ids)
    true_positives = sum(1 for option_id in chosen if option_id in correct_set)
    false_positives = len(chosen_set) - true_positives
    is_correct = len(chosen_set) == len(correct_set) and all(
        option_id in chosen_set for option_id in correct_ids
    )
    if payload["mode"] == "single":
        score: float | int = 1 if is_correct else 0
    else:
        divisor = len(correct_ids) if correct_ids else 1
        score = round4(clamp_score(max(0, true_positives - false_positives) / divisor))
    distractor = next(
        (
            option
            for option in payload["options"]
            if option["correct"] is not True and option["id"] in chosen_set
        ),
        None,
    )
    return outcome(
        is_correct=is_correct,
        score=score,
        chosen_distractor_notion_id=None if distractor is None else distractor.get("notionId"),
        confusions=[],
        normalized_response=",".join(sorted(chosen_set)),
        correction={
            "kind": "choice_question",
            "explanation": payload["explanation"],
            "options": [
                {
                    "id": option["id"],
                    "text": option["text"],
                    "correct": option["correct"],
                    "chosen": option["id"] in chosen_set,
                }
                for option in payload["options"]
            ],
        },
    )


__all__ = ["grade_choice_question", "parse_choice_response"]
