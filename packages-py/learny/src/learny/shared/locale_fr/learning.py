"""User-facing French strings of the learning context services (ADR-2011).

Every literal is copied verbatim from the TypeScript backend: the agenda labels come from
`packages/config/src/agenda.ts`, the service messages and the contract refinements from
`packages/services/src/{agenda,gaps,serie-regularite-et-jalons-interface,formations}/*.ts` and
`packages/contracts/src/{agenda,agenda-deplacer-et-reajuster-le-planning}.ts`. Codes reference the
constant, never an inline French string.
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

# packages/services/src/formations/{get-final-review,set-maintenance,final-review}.ts (SPEC-617).
FINAL_REVIEW_INVALID_FORMATION_ID = "Identifiant de formation invalide."
FINAL_REVIEW_FORMATION_NOT_FOUND = "Formation introuvable."
FINAL_REVIEW_NOT_COMPLETE = "Le bilan final n’est disponible qu’une fois tous les modules validés."
MAINTENANCE_NOT_COMPLETE = "L’entretien de mémoire ne se règle qu’une fois tous les modules validés."
MAINTENANCE_INVALID_VERSION = "Version de formation invalide."
MAINTENANCE_CONFLICT = "Cette formation a changé entre-temps. Rechargez le bilan avant de choisir."
MAINTENANCE_VERSION_LABEL = "Version actuelle : {version}"
MAINTENANCE_UNKNOWN_MODE = "Mode d’entretien inconnu."
RETENTION_UNAVAILABLE = "Pas encore disponible"
RETENTION_PERCENT = "{rate} %"
GAP_DEFAULT_LABEL = "Lacune"
GAP_NATURE_LABELS: dict[str, str] = {
    "confusion": "Confusion",
    "misunderstanding": "Incompréhension",
    "application": "Difficulté d'application",
    "forgetting": "Oubli",
}

# packages/services/src/quiz/result.ts `evidenceOf` (SPEC-612 ET-6, reused by SPEC-617).
GAP_EVIDENCE_CONFUSION = "Confondue avec une autre notion dans vos réponses."
GAP_EVIDENCE_MISUNDERSTANDING = "Réponses incomplètes ou à côté du sujet."
GAP_EVIDENCE_APPLICATION = "Définition juste, mais l’exercice n’a pas abouti."
GAP_EVIDENCE_FORGETTING = "Notion oubliée depuis la dernière révision."
