"""User-facing French strings of the daily review session and the warm-up answer (ADR-2011).

Every literal is copied verbatim from the reference implementation. Codes reference the constant,
never an inline French string.
"""

# packages/config/src/product.ts — GAME_LABELS (EF-6, EF-8).
GAME_LABELS: dict[str, dict[str, str]] = {
    "recall_card": {"name": "Carte de rappel", "tech": "Rappel actif"},
    "matching": {"name": "Association", "tech": "Notions proches"},
    "ordering": {"name": "Remise en ordre", "tech": "Séquence"},
    "categorization": {"name": "Classement", "tech": "Catégorisation"},
    "cloze": {"name": "Texte à trous", "tech": "Rappel actif"},
    "choice_question": {"name": "Question", "tech": "Question"},
    "open_question": {"name": "Question", "tech": "Question"},
}

# rail reasons (EF-6) and the question card code.
REASON_TEXTS: dict[str, str] = {
    "gap_forgetting": "Choisi pour votre oubli",
    "gap_confusion": "Choisi pour votre confusion",
    "gap_misunderstanding": "Choisi pour votre malentendu",
    "gap_application": "Choisi pour votre entraînement",
    "question_card": "Votre question",
}

QUESTION_CARD_AUTOMATION = "questions_cartes"
QUESTION_CARD_KIND = "card_created"
QUESTION_CARD_FORMAT = "recall_card"
QUESTION_CARD_REASON_CODE = "question_card"
QUESTION_CARD_REASON_LABEL = "Votre question"

# « Réglé par le tuteur » bullets.
RATIONALE_GAP_LABEL = "Lacune en priorité"
RATIONALE_LOAD_LABEL = "Charge lissée"
RATIONALE_MODULES_LABEL = "Modules mêlés"
RATIONALE_MODULES_TEXT = "retrouver la bonne notion parmi d’autres la fixe mieux."
RATIONALE_MICRO_LABEL = "Micro-séance"
RATIONALE_MICRO_NO_QUESTION_MANY = "les notions les plus urgentes en cartes de rappel."
RATIONALE_MICRO_NO_QUESTION_ONE = "la notion la plus urgente en carte de rappel."
RATIONALE_MICRO_QUESTION_ONLY = "une question qui mêle plusieurs notions prioritaires."
RATIONALE_MICRO_MANY_THEN_QUESTION = (
    "les notions les plus urgentes en cartes de rappel, puis une question qui en mêle plusieurs."
)
RATIONALE_MICRO_ONE_THEN_QUESTION = (
    "la notion la plus urgente en carte de rappel, puis une question qui en mêle plusieurs."
)
RATIONALE_LOAD_TEXT = (
    "{deferred} notion{plural} sur {due} reportée{plural} à {day}, pour rester sous {cap} min par jour."
)
RATIONALE_GAP_TEXT = "{notion}, oubliée depuis le {day}, revient en {game}."

# buildMicroNote (SPEC-703 EF-3, CL-1, CL-2).
MICRO_NOTE_MANY_CARDS = (
    "Version courte de secours : deux cartes de rappel et une question. "
    "Elle garde le rythme et la série les jours chargés."
)
MICRO_NOTE_ONE_CARD = (
    "Version courte de secours : une carte de rappel et une question. "
    "Elle garde le rythme et la série les jours chargés."
)
MICRO_NOTE_QUESTION = (
    "Version courte de secours : une question. Elle garde le rythme et la série les jours chargés."
)
MICRO_NOTE_TWO_CARDS = "Version courte de secours : deux cartes de rappel."
MICRO_NOTE_ONE_CARD_ONLY = "Version courte de secours : une carte de rappel."

# tutor box of the imposed gaps (SPEC-716 ET-7).
TUNED_LABEL = "Lacune en priorité"
TUNED_FORGETTING = "{notion}, oubliée depuis le {day}, revient en carte de rappel."
TUNED_CONFUSION = "« {notion} » et « {confused} » se confondent : {format} les oppose."
TUNED_FORMAT_ORDER = "un classement"
TUNED_FORMAT_PAIR = "une association"
TUNED_RECENT = "récemment"
TUNED_DEFAULT_NOTION = "cette notion"

# notes and headers (EF-3, EF-4).
NOTE_DEFERRED = "{due} aujourd’hui : {deferred} {verb} à {day} pour que vos révisions restent sous {cap} min."
NOTE_DEFAULT = "{notions} à revoir aujourd’hui, lacunes en priorité."
NOTE_WARMUP_ITEM = "Rappel de l’échauffement"
SCOPE_MODULE = "Module {position}"
SCOPE_TWO_MODULES = "Modules {first} et {second}"
SCOPE_MODULES = "Modules {positions}"
SCOPE_TWO_MODULES_MIXED = "Modules {first} et {second} mêlés"
SCOPE_MODULES_MIXED = "Modules {head} et {last} mêlés"
HEADER_SUBTITLE = "{title} · session du {weekday} {day}"
SMOOTHING_SUMMARY = (
    "{due} notions étaient dues aujourd’hui : {deferred} {verb} à {day} pour rester sous {cap} min."
)
SMOOTHING_VERB_ONE = "est reportée"
SMOOTHING_VERB_MANY = "sont reportées"

# service errors.
REVIEW_ATTEMPT_NOT_FOUND = "Tentative introuvable."
REVIEW_ATTEMPT_NOT_GRADED = (
    "La tentative n’est pas corrigée : ses résultats ne peuvent pas encore être appliqués."
)
REVIEW_ATTEMPT_KIND_UNSUPPORTED = "Ce type d’activité n’alimente pas le moteur d’apprentissage."
REVIEW_NOTION_NOT_FOUND = "Notion introuvable."
REVIEW_ANSWER_MISSING = "Réponse de la tentative introuvable."

# service errors.
SESSION_FORMATION_INVALID = "Identifiant de formation invalide."
SESSION_FORMATION_NOT_FOUND = "Formation introuvable."
SESSION_CONFIG_UNREADABLE = "Configuration de session illisible."
SESSION_NOT_FOUND = "Session introuvable."
SESSION_CLOSED = "Cette session est déjà clôturée."
SESSION_ITEM_NOT_FOUND = "Jeu introuvable dans cette session."
SESSION_ITEM_WITHDRAWN = "Ce jeu a été retiré de la session."
SESSION_ITEM_ALREADY_ANSWERED = "Ce jeu a déjà été répondu."
SESSION_BRICK_NOT_FOUND = "Brique introuvable."
SESSION_GAME_INCOMPLETE = "La réponse du jeu est incomplète ou invalide."
SESSION_GAME_UNKNOWN_ID = "La réponse du jeu contient un identifiant inconnu."
SESSION_RESPONSE_INVALID = "Réponse invalide."

# service errors.
WARMUP_ID_INVALID = "Identifiant d’échauffement invalide."
WARMUP_POSITION_INVALID = "Position de question invalide."
WARMUP_POSITION_HINT = "entier positif ou nul attendu"
WARMUP_NOT_FOUND = "Échauffement introuvable."
WARMUP_UNAVAILABLE = "Cet échauffement n’est plus disponible."
WARMUP_POSITION_OUT_OF_RANGE = "Position de question hors bornes."
WARMUP_POSITION_RANGE_HINT = "position dans l’échauffement attendue"
WARMUP_ALREADY_ANSWERED = "Cette question a déjà été répondue : rechargez l’échauffement pour voir son état."
WARMUP_QUESTION_NOT_FOUND = "Question d’échauffement introuvable."
WARMUP_ATTEMPT_MISSING = "Tentative d’échauffement absente."

# warmUpConsumedSummary (EF-10).
WARMUP_SCORE = "Échauffement fait : {knew} sur {count}"
WARMUP_CONSUMED_REVIEW_ONE = "1 notion repasse"
WARMUP_CONSUMED_REVIEW_MANY = "{count} notions repassent"
WARMUP_CONSUMED_NEXT_QUIZ = "dans le prochain quiz global"
WARMUP_CONSUMED_EVENING_QUIZ = "dans le quiz global du soir"

# packages/contracts/src/review.ts — `ReviewAnswerInputSchema` refinement (SPEC-701 ET-3).
REVIEW_ANSWER_EXCLUSIVE = "Exactement l’un de skipped ou response est requis."

# weekday and month labels of the subtitle.
WEEKDAY_LABELS = ("dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi")
MONTH_LABELS = (
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
)
MONTH_SHORT_LABELS = (
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
)
WAS_DUE_ONE = "1 notion était due"
WAS_DUE_MANY = "{count} notions étaient dues"
NOTION_ONE = "1 notion"
NOTION_MANY = "{count} notions"
