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
EXAM_QUESTION_LABEL = "Question"
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

# --- retry gate of a validation attempt (packages/services/src/quiz/retry-guard.ts) ---------------

RETRY_REMEDIATION_DETAIL = "Terminez d\u2019abord la rem\u00e9diation cibl\u00e9e."
RETRY_AVAILABLE_AT = "Nouvelle tentative possible {label}."
RETRY_NOT_AVAILABLE = "La nouvelle tentative n\u2019est pas encore disponible."

# --- result of a validation attempt (packages/services/src/quiz/result.ts) ------------------------

RESULT_GAP_DEFAULT_LABEL = "Lacune"
RESULT_EVIDENCE_CONFUSION = "Confondue avec une autre notion dans vos r\u00e9ponses."
RESULT_EVIDENCE_MISUNDERSTANDING = "R\u00e9ponses incompl\u00e8tes ou \u00e0 c\u00f4t\u00e9 du sujet."
RESULT_EVIDENCE_APPLICATION = "D\u00e9finition juste, mais l\u2019exercice n\u2019a pas abouti."
RESULT_EVIDENCE_FORGETTING = "Notion oubli\u00e9e depuis la derni\u00e8re r\u00e9vision."
RESULT_DEFAULT_NOTION_LABEL = "Notion"

GAP_NATURE_LABELS = {
    "confusion": "Confusion",
    "misunderstanding": "Incompr\u00e9hension",
    "application": "Difficult\u00e9 d\u2019application",
    "forgetting": "Oubli",
}
"""GAP_NATURE_LABELS of `packages/config/src/product.ts` (BR-LAC-04)."""

GAP_PROPOSALS = {
    "confusion": "une question qui oppose les deux notions.",
    "misunderstanding": "une nouvelle explication, sous un autre angle.",
    "application": "un exercice pratique.",
    "forgetting": "une r\u00e9vision dans le quiz global.",
}
"""GAP_PROPOSALS of `packages/config/src/product.ts` (BR-LAC-04)."""

REMEDIATION_MAX_GAPS = 3
"""REMEDIATION_RULES.maxGaps (ADR-0173)."""

# --- creation of a validation attempt (packages/services/src/quiz/start.ts) -----------------------

QUIZ_MODULE_INVALID_ID = "Identifiant de module invalide."
QUIZ_MODULE_NOT_FOUND = "Module introuvable."
QUIZ_MODULE_LOCKED = "Ce module est verrouill\u00e9."
QUIZ_MODULE_WITHOUT_NOTIONS = "Ce module n\u2019a pas encore de notions."
QUIZ_NO_QUESTION_FOR_MODULE = "Aucune question disponible pour ce module."
QUIZ_ACTIVITY_NOT_CREATED = "Activit\u00e9 non cr\u00e9\u00e9e."
QUIZ_ATTEMPT_NOT_CREATED = "Tentative non cr\u00e9\u00e9e."

# --- submission of a validation attempt (packages/services/src/quiz/submit.ts) --------------------

QUIZ_NOT_SUBMITTED = "Cette tentative n\u2019est pas soumise."
QUIZ_NOT_MODIFIABLE = "Cette tentative n\u2019est plus modifiable."
QUIZ_UNCHECKED = "Toutes les questions doivent \u00eatre v\u00e9rifi\u00e9es."
QUIZ_UNCHECKED_HINT = "V\u00e9rifiez cette question avant de terminer."
