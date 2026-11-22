"""User-facing French strings of the automation engine (SPEC-2205, ADR-2011).

Every literal is copied word for word from the TypeScript: the one-line summaries and their status
prefixes of `packages/automations/src/moteur-d-automatismes.ts`, the zod messages the settings
service forwards, the global-pause sentences of `packages/services/src/pause/index.ts` and the
weekly-review labels of `packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts`.
"""

# packages/automations/src/moteur-d-automatismes.ts - the journal line of a decided action.
SUMMARY_UNDONE_PREFIX = "Annulé : "
SUMMARY_DECLINED_PREFIX = "Refusé : "
SUMMARY_ELLIPSIS = "…"

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
