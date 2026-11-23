"""User-facing French strings of the automation engine (SPEC-2205, ADR-2011).

Every literal is copied word for word from the TypeScript: the one-line summaries and their status
prefixes of `packages/automations/src/moteur-d-automatismes.ts`, the zod messages the settings
service forwards, the global-pause sentences of `packages/services/src/pause/index.ts`, the
weekly-review labels of `packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts` and the
explanations of the ten definitions of `packages/automations/src/definitions/*.ts`.
"""

# packages/automations/src/moteur-d-automatismes.ts - the journal line of a decided action.
SUMMARY_UNDONE_PREFIX = "Annulé : "
SUMMARY_DECLINED_PREFIX = "Refusé : "
SUMMARY_ELLIPSIS = "…"
SUMMARY_EXPIRED_PREFIX = "Expiré : "

# The engine registry and draft validation.
ENGINE_UNKNOWN_KEY = "Clé d'automatisme inconnue : {key}."
ENGINE_DUPLICATE_KEY = "Deux définitions pour l'automatisme « {key} » : le registre refuse le doublon."
ENGINE_MISSING_KEY = "Aucune définition enregistrée pour l'automatisme « {key} »."
FIELD_INVALID = "Champ « {path} » invalide : {message}"
DEDUPE_KEY_INVALID = "une clé de déduplication de 1 à 200 caractères est requise"
KIND_INVALID = "type d’action snake_case de 1 à 80 caractères attendu"
SUMMARY_REJECTED = "l'explication d'une ligne est refusée ({message})"
SUMMARY_ONE_LINE = "une seule ligne, sans retour à la ligne"
EXPIRES_AT_INVALID = "instant ISO 8601 attendu"
NOTIFICATION_HREF_INVALID = "chemin interne commençant par « / » attendu"

# packages/contracts/src/automations.ts - the one refinement of the ten schemas.
REPRISE_ORDER = "le seuil d’allègement doit être supérieur au seuil de reprise"
PAUSE_UNTIL_PATTERN = "date civile AAAA-MM-JJ attendue"

# packages/services/src/pause/index.ts - the two journal sentences of the pause.
PAUSE_STARTED = {
    "tu": "Pause déclarée jusqu’au {end_date}. Ton planning est gelé et ta série reste intacte.",
    "vous": "Pause déclarée jusqu’au {end_date}. Votre planning est gelé et votre série reste intacte.",
}
PAUSE_ENDED_DIAGNOSTIC = (
    "Pause terminée : un diagnostic de 10 minutes sur les notions à risque précède la reprise."
)
PAUSE_ENDED_DIRECT = {
    "tu": "Pause terminée : ton planning reprend dès aujourd’hui.",
    "vous": "Pause terminée : votre planning reprend dès aujourd’hui.",
}
PAUSE_DATE_PATTERN = "date civile AAAA-MM-JJ attendue"
PAUSE_DATE_ORDER = "la fin de pause ne peut pas précéder aujourd’hui"

# packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts - the weekly-review labels.
WEEKLY_RETENTION_UNAVAILABLE = "Non disponible"
WEEKLY_RECEIVED = "reçu {weekday} {time}"
WEEKLY_PERIOD_SAME_MONTH = "{start_day} – {end_day} {month}"
WEEKLY_PERIOD_RANGE = "{start_day} {start_month} – {end_day} {end_month}"
WEEKLY_MONTHS = (
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
WEEKLY_WEEKDAYS = ("lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim.")

# packages/services/src/weekly-review.ts - one review that is not this learner's own.
WEEKLY_REVIEW_NOT_FOUND = "Bilan introuvable."

# The French month names of the warm-up day label.
MONTHS_LONG = (
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

# packages/automations/src/definitions/micro-seance.ts
MICRO_SLOT_TITLE = "Micro-séance de secours"
MICRO_SLOT_META = "{duration} min · ajoutée par le tuteur"
MICRO_CONSUMED = "Micro-séance de {duration} min proposée et faite : série conservée."
MICRO_EXPIRED = "Micro-séance de {duration} min proposée à {hour}:00, non faite."
MICRO_UNDONE = "Annulé : micro-séance de {duration} min du {day}."
MICRO_DECLINED = "Refusé : micro-séance de {duration} min proposée à {hour}:00."
MICRO_PENDING = {
    "tu": "Micro-séance de {duration} min proposée à {hour}:00 pour garder ta série.",
    "vous": "Micro-séance de {duration} min proposée à {hour}:00 pour garder votre série.",
}
MICRO_CARD = {
    "tu": "{day} {hour}:00, micro-séance de {duration} min faite : ta série est conservée.",
    "vous": "{day} {hour}:00, micro-séance de {duration} min faite : votre série est conservée.",
}
MICRO_NOTIFICATION_BODY = {
    "tu": "Pas eu le temps aujourd’hui ? {duration} minutes de cartes de rappel suffisent pour garder ta série.",  # noqa: E501
    "vous": "Pas eu le temps aujourd’hui ? {duration} minutes de cartes de rappel suffisent pour garder votre série.",  # noqa: E501
}

# packages/automations/src/definitions/questions-cartes.ts
QUESTION_CARD = {
    "declined": "Refusé : la question sur « {notion} » ne devient pas une carte.",
    "undone": "Annulé : carte de rappel « {notion} » retirée des prochains tirages.",
    "expired": "Expiré : la question sur « {notion} » ne devient pas une carte.",
    "consumed": "Carte de rappel « {notion} » jouée.",
    "applied": "Carte de rappel « {notion} » ajoutée au quiz global.",
    "pending": "Une question sur « {notion} » peut devenir une carte de rappel : acceptez pour l’ajouter au quiz global.",  # noqa: E501
}
QUESTION_CARD_DEFAULT_NOTION = "cette notion"
QUESTION_CARD_DEFAULT_SOURCE = "Votre question au tuteur"

# packages/automations/src/automatisme-7-quiz-global-plafonne-et-lisse.ts
QUIZ_SMOOTHED_UNDONE = "Annulé : le lissage du {day} est retiré, toutes les notions dues restent aujourd’hui."
QUIZ_SMOOTHED_NONE = "Aucune notion reportée : la journée tient sous {cap} min."
QUIZ_SMOOTHED_SINGULAR = (
    "{due} notions étaient dues aujourd’hui : {deferred} est reportée à {weekday} pour rester sous {cap} min."
)
QUIZ_SMOOTHED_PLURAL = "{due} notions étaient dues aujourd’hui : {deferred} sont reportées à {weekday} pour rester sous {cap} min."  # noqa: E501

# packages/automations/src/automatisme-9-bilan-de-la-semaine.ts
WEEKLY_REVIEW_SENTENCE = "{prefix}Bilan de la semaine{received} : {study} d’étude, {retention}, {at_risk}."
WEEKLY_REVIEW_RETENTION_UNAVAILABLE = "rétention non disponible"
WEEKLY_REVIEW_RETENTION = "{label} retenu à 1 mois"
WEEKLY_REVIEW_NO_RISK = "aucune notion à risque"
WEEKLY_REVIEW_ONE_RISK = "1 notion à risque"
WEEKLY_REVIEW_MANY_RISK = "{count} notions à risque"

# packages/automations/src/definitions/echauffement.ts
WARMUP_SLOT_TITLE = "Échauffement"
WARMUP_ADDED = {
    "tu": "Échauffement ajouté avant ton {noun} de {hour} : {count} question{suffix} sur {notions}.",
    "vous": "Échauffement ajouté avant votre {noun} de {hour} : {count} question{suffix} sur {notions}.",
}
WARMUP_LAST_ACTION = "{when}, {count} questions : {notions}."
WARMUP_EXPIRED = "Échauffement du {day} non fait."
WARMUP_UNDONE = "Annulé : échauffement du {day}."
WARMUP_NOT_FOUND = "Échauffement introuvable."
WARMUP_META = "{count} questions de rappel · {duration} min · ajouté par le tuteur"
WARMUP_KIND_DEFAULT = "séance"
WARMUP_WHEN_MORNING = "ce matin"
WARMUP_WHEN_AFTERNOON = "cet après-midi"
WARMUP_WHEN_YESTERDAY = "hier"
WARMUP_WHEN_DAY = "le {day}"

# packages/automations/src/definitions/jeu-lacune.ts
GAME_FORMAT = {
    "recall_card": "carte de rappel",
    "choice_question": "question",
}
GAME_FORMAT_DEFAULT = "jeu"
GAME_APPLIED_CONFUSION = (
    "Lacune « {notion} » : {format} « {notion} / {confusion} » ajouté au quiz global.{pending}"
)
GAME_APPLIED_CARD = "Lacune « {notion} » : carte de rappel ajoutée au quiz global.{pending}"
GAME_PENDING_SUFFIX = " (en préparation)"
GAME_EXERCISE_NO_SLOT = "Lacune « {notion} » : exercice pratique en préparation."
GAME_EXERCISE_SLOT = "Lacune « {notion} » : exercice pratique placé {day} {hour}."
GAME_UNDONE_EXERCISE = "Annulé : exercice pratique de « {notion} »."
GAME_UNDONE_CARD = "Annulé : {format} de « {notion} » retiré du quiz global."
GAME_EXPIRED = "Lacune « {notion} » levée avant l’entraînement."
GAME_APPLICATION_PENDING = "Lacune « {notion} » : exercice pratique en préparation."
GAME_NOTION_DEFAULT = "cette notion"
GAME_EXERCISE_TITLE = "Exercice pratique"
GAME_EXERCISE_META = "{notion} · ajouté par le tuteur"
GAME_INCOMPLETE = "Exercice incomplet."

# packages/automations/src/definitions/remediation.ts
REMEDIATION_UNDONE = "Annulé : délai et remédiation planifiée du quiz du module {position}."
REMEDIATION_PENDING = "Quiz à {score} % : tentative {attempt} placée {when}. La remédiation sera prête dès que l’IA sera disponible."  # noqa: E501
REMEDIATION_READY = "Quiz à {score} % : remédiation de 15 min préparée, tentative {attempt} placée {when}."
REMEDIATION_MANDATORY = " Remédiation obligatoire avant la tentative."
REMEDIATION_AT_RESUME = "à la reprise"
REMEDIATION_RETRY_TITLE = "Quiz · tentative {attempt}"
REMEDIATION_RETRY_META = "Nouvelle tentative après remédiation"

# packages/automations/src/definitions/reprise.ts
REPRISE_DEFAULT_TITLE = "Séance de travail"
REPRISE_DEFAULT_FORMATION = "votre formation"
REPRISE_ONE_DAY = "1 jour"
REPRISE_MANY_DAYS = "{count} jours"
REPRISE_NOTE_TU = "C’est noté : reprise de « {title} » {day} {hour}. Elle est dans ton agenda."
REPRISE_NOTE_VOUS = "C’est noté : reprise de « {title} » {day} {hour}. Elle est dans votre agenda."
REPRISE_PROPOSED_TU = (
    "« {title} » n’a pas été terminé {missed_day}. Je propose de le reprendre {day} à {hour}, {where}."
)
REPRISE_PROPOSED_VOUS = (
    "« {title} » n’a pas été terminé {missed_day}. Je propose de le reprendre {day} à {hour}, {where}."
)
REPRISE_BUFFER_TU = "dans une marge de ton agenda"
REPRISE_BUFFER_VOUS = "dans une marge de votre agenda"
REPRISE_FREE_TU = "dans un créneau libre de ton agenda"
REPRISE_FREE_VOUS = "dans un créneau libre de votre agenda"
REPRISE_SHORT_APPLIED_TU = "C’est noté : reprise de 5 minutes {day} {hour}. Elle est dans ton agenda."
REPRISE_SHORT_APPLIED_VOUS = "C’est noté : reprise de 5 minutes {day} {hour}. Elle est dans votre agenda."
REPRISE_SHORT_PROPOSED_TU = (
    "Tu n’as pas étudié depuis {days} jours. Je te propose une reprise de 5 minutes {day} à {hour}."
)
REPRISE_SHORT_PROPOSED_VOUS = (
    "Vous n’avez pas étudié depuis {days} jours. Je propose une reprise de 5 minutes {day} à {hour}."
)
REPRISE_PLAN_APPLIED = "C’est noté : « {formation} », {option}."
REPRISE_PLAN_SHIFT_END = "Décaler la fin"
REPRISE_PLAN_LIGHTEN = "Alléger le programme"
REPRISE_PLAN_NO_ROOM = "Plus de place pour reprendre « {title} » cette semaine : je propose d’alléger le programme ou de décaler la fin."  # noqa: E501
REPRISE_PLAN_INACTIVE = (
    "{days} sans étude sur « {formation} » : je propose d’alléger le programme ou de décaler la fin."
)
REPRISE_UNKNOWN_KIND = "Action de reprise : {kind}."
REPRISE_SHORT_SLOT_TITLE = "Reprise en douceur"
REPRISE_CHOICE_INVALID = "Le créneau choisi ne fait pas partie des alternatives."
REPRISE_UNKNOWN_OPTION = "Choisissez « Décaler la fin » ou « Alléger le programme »."

# packages/automations/src/automatisme-8-sprint-avant-un-jalon.ts
SPRINT_UNDONE = (
    "Annulé : sprints avant « {exam} » retirés ; les créneaux déjà faits restent dans l’historique."
)
SPRINT_NO_SLOT = "aucun créneau compatible"
SPRINT_SENTENCE_TU = "Tes sprints de {duration} min avant « {exam} » : {dates}{notions}{missing}."
SPRINT_SENTENCE_VOUS = "Vos sprints de {duration} min avant « {exam} » : {dates}{notions}{missing}."
SPRINT_NOTIONS = " · notions ciblées : {notions}"
SPRINT_MISSING = " · {count} jour(s) impossible(s) expliqué(s)"
SPRINT_TITLE = "Sprint · {exam}"
SPRINT_META = "Notions ciblées : {notions} · sprint avant « {exam} » du {date}"
SPRINT_SLOT_TITLE = "Sprint"
SPRINT_INCOMPLETE = "Sprint incomplet."
SPRINT_DEFAULT_EXAM = "l’épreuve"
SPRINT_EXAM_FALLBACK = "épreuve"
SPRINT_DAY_HOUR = "{day} à {hour}"

# SPEC-719 — the sprint planning service and its route (`planSprintsBeforeMilestones`).
SPRINT_INVALID_EXAM_DATE = "Date d’épreuve invalide."
SPRINT_INVALID_DELAY = "Délai K invalide."
SPRINT_NO_COMPATIBLE_SLOT = "Aucun créneau de sprint compatible."
SPRINT_INVALID_FORMATION = "Formation invalide."
SPRINT_INVALID_EXAM = "Épreuve invalide."
SPRINT_UUID_EXPECTED = "UUID attendu"
SPRINT_FORMATION_NOT_FOUND = "Formation introuvable."
SPRINT_EXAM_NOT_FOUND = "Épreuve introuvable."
SPRINT_NOT_AN_EXAM = "Ce créneau n’est pas une épreuve."
SPRINT_EXAM_KIND_EXPECTED = "quiz de validation ou examen blanc attendu"
SPRINT_EXAM_NOT_PLANNED = "Cette épreuve n’est plus planifiée : rechargez l’agenda."
SPRINT_UNAUTHENTICATED = "Vous devez être connecté pour planifier un sprint."
SPRINT_PARAMS_INVALID = "réglages invalides : recharger les réglages de l’automatisme"
SPRINT_PLAN_EXAM_FALLBACK = "Épreuve"
SPRINT_ACTION_NOT_CREATED = "Action non créée."
SPRINT_SLOT_NOT_CREATED = "Créneau de sprint non créé."

# The decisions of the learner and the pause service (EF-2, EF-3, ET-4).
ACTION_NOT_FOUND = "Action introuvable."
DECISION_NOT_PENDING = "Cette action n’attend plus d’accord : rechargez le journal pour voir son état."
UNDO_CONSUMED = "Cette action a déjà été consommée : elle ne peut plus être annulée."
UNDO_NOT_APPLIED = "Seule une action appliquée peut être annulée."
UNDO_NO_PAYLOAD = "Cette action ne porte pas de charge d’annulation : elle ne peut pas être annulée."
PROFILE_NOT_FOUND = "Profil introuvable."
PAUSE_ALREADY_ACTIVE = "Une pause est déjà active. Reprenez-la ou annulez-la avant d’en déclarer une autre."
PAUSE_DIAGNOSTIC_MISSING = "Aucun diagnostic de retour en attente."
PAUSE_DIAGNOSTIC_EMPTY = "Un diagnostic sans réponse ne déclenche pas la replanification."
PAUSE_ANSWERED_REQUIRED = "au moins une réponse attendue"
PAUSE_NOT_WRITTEN = "Pause non écrite."
PAUSE_ACTION_NOT_WRITTEN = "Action de pause non écrite."
MISSED_SLOT_NOT_FOUND = "Séance manquée introuvable."
MISSED_SLOT_ALREADY_MOVED = "Cette séance a déjà été replacée."
WARMUP_STARTED = "Cet échauffement a commencé : il ne peut plus être annulé."
