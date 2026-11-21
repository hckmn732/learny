"""Code grading of a recall card (SPEC-502 EF-8, BR-MEM-02).

The learner self-assesses and the same grade feeds FSRS: `again` is incorrect, the three other
grades are correct. Pure port of `packages/bricks/src/types/recall-card/grade.ts`.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.grade_support import invalid_response, outcome
from learny.assessments.domain.bricks.responses import read_object
from learny.assessments.domain.bricks.types import RECALL_SELF_GRADES


def parse_recall_card_response(response: Any) -> dict[str, Any]:
    """Validates a self-assessment; raises `BrickGradeError` otherwise."""
    parsed = read_object(response, ("selfGrade",))
    self_grade = parsed["selfGrade"]
    if not isinstance(self_grade, str) or self_grade not in RECALL_SELF_GRADES:
        raise invalid_response(
            [
                {
                    "path": "response.selfGrade",
                    "message": f"Expected one of {', '.join(RECALL_SELF_GRADES)}.",
                }
            ]
        )
    return {"selfGrade": self_grade}


def grade_recall_card(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Grades one self-assessment; raises `BrickGradeError` on an invalid response."""
    parsed = parse_recall_card_response(response)
    self_grade = str(parsed["selfGrade"])
    is_correct = self_grade != "again"
    return outcome(
        is_correct=is_correct,
        score=1 if is_correct else 0,
        chosen_distractor_notion_id=None,
        confusions=[],
        normalized_response=self_grade,
        correction={
            "kind": "recall_card",
            "front": payload["front"],
            "back": payload["back"],
            "selfGrade": self_grade,
            "fsrsGrade": self_grade,
            "correct": is_correct,
            "explanation": None,
        },
    )


__all__ = ["grade_recall_card", "parse_recall_card_response"]
