"""Root grading entry point of the auto-corrected bricks (SPEC-502 ET-2, BR-BRI-08).

`grade_brick` dispatches to the pure module of each auto-corrected type and explicitly refuses the
three tutor-graded types. No IO, no clock, no model call (BR-IA-09, CA-7). Errors are raised as
`BrickGradeError` carrying the stable code (`RESPONSE_INVALID` or `GRADED_BY_TUTOR`) and one issue
per invalid field. The shared helpers live in `grade_support` so a type grader never imports this
dispatcher.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.categorization import grade_categorization
from learny.assessments.domain.bricks.choice_question import grade_choice_question
from learny.assessments.domain.bricks.cloze import grade_cloze
from learny.assessments.domain.bricks.grade_support import (
    EPSILON,
    BrickGradeError,
    clamp_score,
    clamp_tutor_score,
    dedupe_confusions,
    feedback_title,
    graded_by_tutor,
    invalid_response,
    outcome,
    round2,
    round4,
)
from learny.assessments.domain.bricks.matching import grade_matching
from learny.assessments.domain.bricks.ordering import grade_ordering
from learny.assessments.domain.bricks.recall_card import grade_recall_card
from learny.assessments.domain.bricks.types import TUTOR_GRADED_TYPES


def grade_brick(
    type_name: str,
    payload: Mapping[str, Any],
    response: Any,
    seed: str,
) -> dict[str, Any]:
    """Grades one response against the version payload; raises `BrickGradeError` otherwise.

    `seed` is the version id: it rebuilds the opaque ids of the public payload (ADR-0150). The
    payload is assumed schema-valid (stored versions were validated when written).
    """
    if type_name == "choice_question":
        return grade_choice_question(payload, response)
    if type_name == "cloze":
        return grade_cloze(payload, response)
    if type_name == "matching":
        return grade_matching(payload, response, seed)
    if type_name == "ordering":
        return grade_ordering(payload, response)
    if type_name == "categorization":
        return grade_categorization(payload, response)
    if type_name == "recall_card":
        return grade_recall_card(payload, response)
    if type_name in TUTOR_GRADED_TYPES:
        raise graded_by_tutor(type_name)
    raise invalid_response([{"path": "type", "message": f'Brick type "{type_name}" has no code correction.'}])


__all__ = [
    "EPSILON",
    "BrickGradeError",
    "clamp_score",
    "clamp_tutor_score",
    "dedupe_confusions",
    "feedback_title",
    "grade_brick",
    "graded_by_tutor",
    "invalid_response",
    "outcome",
    "round2",
    "round4",
]
