"""Public surface of the assessments context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.assessments.application.bricks import correct_brick, report_brick
from learny.assessments.application.exam_format import (
    confirm_exam_format,
    ensure_mock_exam_slots,
    get_exam_intro,
)
from learny.assessments.application.exams import mark_exam_question, save_exam_answer
from learny.assessments.application.offline import build_pack
from learny.assessments.application.ports import (
    AssessmentDeps,
    ClockPort,
    Transactions,
)
from learny.assessments.application.quiz import check_answer, get_attempt, save_draft

__all__ = [
    "AssessmentDeps",
    "ClockPort",
    "Transactions",
    "build_pack",
    "check_answer",
    "confirm_exam_format",
    "correct_brick",
    "ensure_mock_exam_slots",
    "get_attempt",
    "get_exam_intro",
    "mark_exam_question",
    "report_brick",
    "save_draft",
    "save_exam_answer",
]
