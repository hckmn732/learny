"""Public surface of the assessments context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.assessments.application.bricks import (
    correct_brick,
    create_brick,
    get_public_brick,
    report_brick,
)
from learny.assessments.application.diagnostic import (
    create_diagnostic_attempt,
    grade_diagnostic_attempt,
)
from learny.assessments.application.exam_attempts import (
    get_exam_attempt,
    get_exam_result,
    start_exam_attempt,
    submit_exam,
)
from learny.assessments.application.exam_deadline import submit_exam_at_deadline
from learny.assessments.application.exam_format import (
    confirm_exam_format,
    ensure_mock_exam_slots,
    get_exam_intro,
)
from learny.assessments.application.exams import mark_exam_question, save_exam_answer
from learny.assessments.application.exercises import (
    get_practice_exercise,
    request_exercise_hint,
    save_exercise_draft,
    start_exercise_attempt,
    submit_exercise,
)
from learny.assessments.application.grade_open import grade_open_answers
from learny.assessments.application.grade_quiz import grade_quiz
from learny.assessments.application.offline import build_pack
from learny.assessments.application.offline_purge import purge_offline_receipts
from learny.assessments.application.offline_sync import sync_offline_answers
from learny.assessments.application.ports import (
    AssessmentDeps,
    ClockPort,
    Transactions,
)
from learny.assessments.application.quiz import check_answer, get_attempt, save_draft
from learny.assessments.application.quiz_result import get_quiz_result
from learny.assessments.application.quiz_start import start_validation_attempt
from learny.assessments.application.quiz_submit import finalize_attempt, submit_attempt
from learny.assessments.application.remediation import (
    complete_remediation,
    get_remediation,
    prepare_remediation,
    request_remediation_preparation,
)

__all__ = [
    "AssessmentDeps",
    "ClockPort",
    "Transactions",
    "build_pack",
    "check_answer",
    "complete_remediation",
    "confirm_exam_format",
    "correct_brick",
    "create_brick",
    "create_diagnostic_attempt",
    "ensure_mock_exam_slots",
    "finalize_attempt",
    "get_attempt",
    "get_exam_attempt",
    "get_exam_intro",
    "get_exam_result",
    "get_practice_exercise",
    "get_public_brick",
    "get_quiz_result",
    "get_remediation",
    "grade_diagnostic_attempt",
    "grade_open_answers",
    "grade_quiz",
    "mark_exam_question",
    "prepare_remediation",
    "purge_offline_receipts",
    "report_brick",
    "request_exercise_hint",
    "request_remediation_preparation",
    "save_draft",
    "save_exam_answer",
    "save_exercise_draft",
    "start_exam_attempt",
    "start_exercise_attempt",
    "start_validation_attempt",
    "submit_attempt",
    "submit_exam",
    "submit_exam_at_deadline",
    "submit_exercise",
    "sync_offline_answers",
]
