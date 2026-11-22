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

# --- bricks (packages/services/src/bricks/brick-service.ts) ---------------------------------------

BRICK_DATA_INVALID = "Les données envoyées sont invalides."
BRICK_INVALID = "La brique est invalide."
FORMATION_NOT_FOUND = "Formation introuvable."
BRICK_NOT_FOUND = "Brique introuvable."
BRICK_RETIRED = "Cette brique a été retirée."
BRICK_VERSION_OUTDATED = "Version obsolète : la brique est en version {version}."
BRICK_CHANGED_MEANWHILE = "La brique a été modifiée entre-temps."
BRICK_CURRENT_VERSION_MISSING = "Version courante de la brique introuvable."
BRICK_REPORT_NOT_CREATED = "Signalement non créé."
BRICK_VERSION_NOT_CREATED = "Version de brique non créée."
