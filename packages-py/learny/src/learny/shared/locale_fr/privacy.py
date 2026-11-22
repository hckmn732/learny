"""User-facing French strings of the privacy context, copied from the TypeScript backend.

Sources: `packages/services/src/personal-data/{export,deletion}.ts`,
`packages/jobs/src/personal-data/{zip-layout,collect}.ts` (SPEC-211, ADR-0044, ADR-0216).
"""

# `export.ts` - the daily quota (three exports per local civil day) and the archive lifetime.
EXPORT_LIMIT_MESSAGE = "Vous avez déjà demandé 3 exports aujourd’hui. Réessayez demain."
EXPORT_EXPIRED_MESSAGE = "Cet export a expiré. Demandez-en un nouveau depuis Paramètres."
EXPORT_NOT_FOUND = "Export introuvable."
PROFILE_NOT_FOUND = "Profil introuvable."
UNAUTHENTICATED = "Vous devez être connecté."

# `deletion.ts` - BR-ACC-11, the deletion is scheduled thirty days ahead.
ACCOUNT_INCONSISTENT = "Compte incohérent."

# `zip-layout.ts` - neutral names used when an original name carries nothing usable.
ARCHIVE_FILE_FALLBACK = "fichier"
ARCHIVE_APPORT_FALLBACK = "apport"
ARCHIVE_FORMATION_FALLBACK = "sans-titre"
ARCHIVE_FORMATION_FOLDER_FALLBACK = "formation"
ARCHIVE_MODULE_FALLBACK = "module"
ARCHIVE_SECTION_FALLBACK = "Section"
ARCHIVE_SOURCE_DELETED = "source supprimée"
COURSE_FILE_NAME = "cours.md"
PROGRAMME_FILE_NAME = "programme.json"
NOTE_FILE_SUFFIX = ".txt"

# `collect.ts` - `formatLongDate`: `mercredi 18 novembre à 13:20`, in the learner's zone.
LONG_DATE = "{weekday} {day} {month} \u00e0 {hour}:{minute}"

# `collect.ts` - the README of the archive (EF-3).
README_TITLE = "Export des données personnelles Learny"
README_REQUESTED_AT = "Demandé le : {date} ({timezone})"
README_ACCOUNT = "Compte : {email}"
README_FORMATIONS = "Formations : {count}"
README_CONTENT_HEADING = "Contenu :"
README_LINES = (
    "README.txt : ce fichier",
    "settings.json : profil, rythme, notifications et automatismes",
    "results.json : tentatives, réponses, maîtrise, lacunes, série et activité quotidienne",
    "conversations.json : historique des discussions avec le tuteur",
    "formations/<formation>/<module>/cours.md : cours en Markdown par module",
    "apports/<formation>/<module>/<nom d’origine> : apports originaux",
)
README_NO_SECRET = "Aucune clé d’IA ni aucun secret ne figure dans cet export."
README_REFERENCE_DATE = "Date de référence : {date}"
README_EXPIRATION = "Expiration du fichier : 7 jours après sa création ({instant})"

# `collect.ts` - names of the fixed files of the archive.
ARCHIVE_FORMATION_DEFAULT_TITLE = "Formation"
ARCHIVE_APPORTS_MODULE_TITLE = "Apports"
ARCHIVE_PROFILE_MISSING = "profil absent"

# `deletion.ts` - the e-mail sent when a deletion is scheduled; the template name is the TS key.
DELETION_SCHEDULED_TEMPLATE = "deletion_scheduled"
DELETION_COMPLETED_TEMPLATE = "deletion_completed"
EXPORT_READY_TEMPLATE = "export_ready"
