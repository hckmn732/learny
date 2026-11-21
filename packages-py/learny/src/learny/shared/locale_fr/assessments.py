"""User-facing French strings of the assessments context (ADR-2011).

The grading feedback title, the tutor-score detail, the exercise verdicts and the structured-table
labels cross the HTTP contract, so they are copied verbatim from
`packages/bricks/src/{grade-support,grade}.ts` and
`packages/bricks/src/types/{instruction/table-checks,scoring/compute}.ts`.
"""

GRADE_FEEDBACK_EXACT = "Exact."
GRADE_FEEDBACK_APPROXIMATE = "Pas tout à fait."
TUTOR_SCORE_NOT_FINITE = "La note du tuteur doit être un nombre fini."
INSTRUCTION_VERDICT_PASSED = "Réussi"
INSTRUCTION_VERDICT_FAILED = "À retravailler"
TABLE_CHECK_EMPTY = "Pas encore de montant"
TABLE_CHECK_BALANCED = "✓ Pièce équilibrée"
TABLE_CHECK_DIFFERENCE = "Écart : {amount}"
TABLE_CHECK_EURO = "{amount} €"
