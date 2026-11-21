"""User-facing French strings of the learning context services (ADR-2011).

Every literal is copied verbatim from the TypeScript backend: the agenda labels come from
`packages/config/src/agenda.ts`, the service messages and the contract refinements from
`packages/services/src/{agenda,gaps,serie-regularite-et-jalons-interface}/*.ts` and
`packages/contracts/src/agenda.ts`. Codes reference the constant, never an inline French string.
"""

# packages/config/src/agenda.ts (SPEC-704 ET-3, BR-AGE-02): labels of the twelve slot kinds.
AGENDA_SLOT_LABELS: dict[str, str] = {
    "contributions": "Apports",
    "course": "Cours",
    "exercise": "Exercice",
    "validation_quiz": "Quiz de validation",
    "mock_exam": "Examen blanc",
    "global_quiz": "Quiz global",
    "revision": "Révision",
    "sprint": "Sprint",
    "warmup": "Échauffement",
    "micro_session": "Micro-séance",
    "buffer": "Marge de rattrapage",
    "weekly_review": "Bilan de la semaine",
}

# packages/services/src/agenda/get-agenda.ts
AGENDA_GROUP_MILESTONE = "Jalon du groupe"
AGENDA_PROFILE_NOT_FOUND = "Profil introuvable."
AGENDA_FORMATION_NOT_FOUND = "Formation introuvable dans votre agenda."

# packages/contracts/src/agenda.ts: the two `AgendaQuery` refinements (SPEC-704 ET-1).
AGENDA_RANGE_ORDER = "La date de début doit précéder la date de fin."
AGENDA_RANGE_TOO_WIDE = "La période affichée ne peut pas dépasser 42 jours."

# packages/services/src/gaps/list-gaps.ts (SPEC-615).
GAPS_FORMATION_NOT_FOUND = "Formation introuvable."
GAPS_NATURE_UNKNOWN = "Nature de lacune inconnue."
GAPS_NATURE_EXPECTED = "Valeur attendue parmi les quatre natures."
GAPS_NATURE_PATH = "nature"

# packages/services/src/serie-regularite-et-jalons-interface.ts (SPEC-723).
SERIES_PROFILE_NOT_FOUND = "Profil introuvable."
SERIES_FORMATION_NOT_FOUND = "Formation introuvable."
SERIES_MODULE_VALIDATED = "Module validé"
SERIES_MODULE_VALIDATED_LABEL = "Module « {title} » validé"
SERIES_MODULE_TO_VALIDATE_LABEL = "Module « {title} » à valider"
SERIES_MILESTONE_NOTIONS = "100 notions retenues"
SERIES_MILESTONE_STREAK = "30 jours de série"
SERIES_MILESTONE_DEFAULT = "Jalon atteint"
