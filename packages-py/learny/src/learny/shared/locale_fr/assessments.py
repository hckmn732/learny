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

# --- quiz attempts (packages/services/src/quiz/check.ts) -------------------------------------------

QUIZ_ATTEMPT_INVALID_ID = "Identifiant de tentative invalide."
QUIZ_ATTEMPT_NOT_FOUND = "Tentative introuvable."
QUIZ_ATTEMPT_CLOSED = "Cette tentative n\u2019est plus en cours."
QUIZ_QUESTION_NOT_FOUND = "Question introuvable."
QUIZ_QUESTION_CHECKED = "Cette question est d\u00e9j\u00e0 v\u00e9rifi\u00e9e."
QUIZ_FEEDBACK_MISSING = "Correction introuvable."
QUIZ_BRICK_PAYLOAD_INVALID = "La charge de la brique est invalide."
QUIZ_RESPONSE_EMPTY = "La r\u00e9ponse est vide."
QUIZ_RESPONSE_EMPTY_HINT = "\u00c9crivez au moins un caract\u00e8re."
QUIZ_RESPONSE_TOO_LONG = "La r\u00e9ponse est trop longue."
QUIZ_RESPONSE_TOO_LONG_HINT = "2 000 caract\u00e8res au maximum."
QUIZ_RESPONSE_INVALID = "La r\u00e9ponse envoy\u00e9e est invalide."
QUIZ_TUTOR_GRADED = "Cette question doit \u00eatre corrig\u00e9e par le tuteur."
QUIZ_FEEDBACK_SAVED = "R\u00e9ponse enregistr\u00e9e."
QUIZ_TYPE_CHOICE_SINGLE = "Choix unique"
QUIZ_TYPE_CHOICE_MULTIPLE = "Choix multiple"
QUIZ_TYPE_CLOZE = "Texte \u00e0 trous"
QUIZ_TYPE_MATCHING = "Association"
QUIZ_TYPE_OPEN = "Question ouverte"
QUIZ_DEFAULT_NOTION_LABEL = "Notion"


# --- mock exams (packages/services/src/mock-exams/attempt.ts) --------------------------------------

EXAM_ATTEMPT_NOT_FOUND = "Examen introuvable."
EXAM_ATTEMPT_CLOSED = "Cet examen est termin\u00e9."
EXAM_TIME_OVER = "Le temps de l\u2019examen est \u00e9coul\u00e9."
EXAM_POSITION_UNKNOWN = "Cette question n\u2019existe pas dans l\u2019examen."
EXAM_QUESTION_UNREADABLE = "La question jou\u00e9e est illisible."
EXAM_RESPONSE_MISMATCH = "La r\u00e9ponse ne correspond pas \u00e0 la question."

# --- exam format and introduction (packages/services/src/mock-exams/format.ts) ---------------------

EXAM_FORMATION_INVALID_ID = "Identifiant de formation invalide."
EXAM_FORMATION_NOT_FOUND = "Formation introuvable."
EXAM_FORMAT_NOT_CONFIRMED = "Confirmez le format extrait de votre guide avant de commencer."
EXAM_NO_PROGRAMME = "Cette formation n\u2019a pas encore de programme."
EXAM_NO_QUESTION_AVAILABLE = "Aucune question d\u2019examen n\u2019est disponible."

# --- exam attempts (packages/services/src/mock-exams/attempt.ts) -----------------------------------

EXAM_ATTEMPT_INVALID_ID = "Identifiant de tentative invalide."
EXAM_NOT_GRADED = "Cet examen n\u2019est pas encore corrig\u00e9."
EXAM_ACTIVITY_NOT_CREATED = "Activit\u00e9 non cr\u00e9\u00e9e."
EXAM_ATTEMPT_NOT_CREATED = "Tentative non cr\u00e9\u00e9e."
EXAM_GIVEN_NONE = "sans r\u00e9ponse"
EXAM_GIVEN_INCOMPLETE = "r\u00e9ponse incompl\u00e8te"
EXAM_PLAN_STUDIED_ALL = "vos modules \u00e9tudi\u00e9s"
EXAM_PLAN_STUDIED_ONE = "le module {position}"
EXAM_PLAN_STUDIED_MANY = "les modules {first} \u00e0 {last}"
EXAM_PLAN_KEEP_STUDIED = "Vos prochains quiz globaux entretiennent {label}."
EXAM_PLAN_SPRINT = "Un sprint de r\u00e9vision sera propos\u00e9 avant le prochain quiz de validation."
EXAM_PLAN_GAPS_ONE = "1 notion ajout\u00e9e en priorit\u00e9 dans vos prochains quiz globaux."
EXAM_PLAN_GAPS_MANY = "{count} notions ajout\u00e9es en priorit\u00e9 dans vos prochains quiz globaux."
EXAM_PLAN_SPRINT_AFTER_GAPS = (
    "Un sprint de r\u00e9vision sera propos\u00e9 avant le prochain quiz de validation de {label}."
)
EXAM_PLAN_DIAGNOSTIC = (
    "Les modules diagnostiques seront travaill\u00e9s dans l\u2019ordre du programme, "
    "sans p\u00e9naliser {label}."
)
