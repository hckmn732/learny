"""Public surface of the assessments context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.assessments.application.bricks import correct_brick, report_brick
from learny.assessments.application.exam_attempts import (
    get_exam_attempt,
    get_exam_result,
    start_exam_attempt,
    submit_exam,
)
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
from learny.assessments.application.quiz_result import get_quiz_result
from learny.assessments.application.quiz_start import start_validation_attempt
from learny.assessments.application.quiz_submit import finalize_attempt, submit_attempt

__all__ = [
    "AssessmentDeps",
    "ClockPort",
    "Transactions",
    "build_pack",
    "check_answer",
    "confirm_exam_format",
    "correct_brick",
    "ensure_mock_exam_slots",
    "finalize_attempt",
    "get_attempt",
    "get_exam_attempt",
    "get_exam_intro",
    "get_exam_result",
    "get_quiz_result",
    "mark_exam_question",
    "report_brick",
    "save_draft",
    "save_exam_answer",
    "start_exam_attempt",
    "start_validation_attempt",
    "submit_attempt",
    "submit_exam",
]
