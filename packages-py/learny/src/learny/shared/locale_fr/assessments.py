"""User-facing French strings of the assessments context (ADR-2011).

The grading feedback title and the tutor-score detail cross the HTTP contract, so they are copied
verbatim from `packages/bricks/src/grade-support.ts` and `packages/bricks/src/grade.ts`.
"""

GRADE_FEEDBACK_EXACT = "Exact."
GRADE_FEEDBACK_APPROXIMATE = "Pas tout à fait."
TUTOR_SCORE_NOT_FINITE = "La note du tuteur doit être un nombre fini."
INSTRUCTION_VERDICT_PASSED = "Réussi"
INSTRUCTION_VERDICT_FAILED = "À retravailler"
