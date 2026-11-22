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

# packages/services/src/agenda-deplacer-et-reajuster-le-planning.ts (SPEC-705).
PLANNING_PROFILE_NOT_FOUND = "Profil introuvable."
PLANNING_FORMATION_NOT_FOUND = "Formation introuvable."
PLANNING_SLOT_NOT_FOUND = "Créneau introuvable."
PLANNING_SLOT_NOT_MOVABLE = "Ce créneau ne peut plus être déplacé."
PLANNING_SLOT_WITHOUT_FORMATION = "Ce créneau n’appartient à aucune formation."
PLANNING_INVALID_FIELD = "Champ « {field} » invalide."
PLANNING_UUID_EXPECTED = "identifiant UUID attendu"
PLANNING_MOVE_FUTURE = "Le nouveau créneau doit être à venir."
PLANNING_MOVE_FUTURE_HINT = "créneau futur attendu"
PLANNING_MOVE_DURATION = "La durée de l’activité ne peut pas changer."
PLANNING_MOVE_DURATION_HINT = "durée identique attendue"
PLANNING_MOVE_OVERLAP = "Ce créneau vient d’être occupé : choisissez une autre option."
PLANNING_MOVE_OVERLAP_HINT = "créneau occupé"
PLANNING_MOVE_FAILED = "Créneau non déplacé."
PLANNING_MOVED_ALREADY = "Activité déjà déplacée."
PLANNING_MOVED_MISSING = "Le créneau déplacé est absent de l’agenda."
PLANNING_MOVED_LABEL = "Activité déplacée au {label}. Les marges restantes sont recalculées."
PLANNING_NO_BLOCKED_MODULE = "Aucun module n’est bloqué pour cette formation."
PLANNING_PLAN_CHANGED = "Le planning a changé : rechargez les options de réajustement."
PLANNING_OPTION_INFEASIBLE = "Cette option ne permet pas de tenir l’échéance."
PLANNING_OPTION_UNAVAILABLE = "Option indisponible pour cette formation."
PLANNING_VOLUME_MAX = "Volume quotidien déjà au maximum."
PLANNING_UNCHANGED_END = "Aucun changement nécessaire : la fin prévue tient déjà."
PLANNING_UNCHANGED_HOURS = "Aucun changement nécessaire : le volume quotidien est déjà suffisant."
PLANNING_SHIFT_EXPLANATION = "La fin de la formation est décalée au {date} pour absorber le retard."
PLANNING_VOLUME_EXPLANATION = "Le volume quotidien passe à {hours} h pour absorber le retard."
PLANNING_LIGHTEN_EXPLANATION = "Le programme est allégé de {minutes} min ; votre accord est requis."
PLANNING_REASON_STUDY_DAY = "Jour d’étude"
PLANNING_REASON_FREE = "Créneau libre"
PLANNING_REASON_MORNING = "Moment préféré : matin"
PLANNING_REASON_AFTERNOON = "Moment préféré : après-midi"
PLANNING_REASON_EVENING = "Moment préféré : soir"
PLANNING_REASON_IN_DATES = "Dans les dates de la formation"
PLANNING_AUTOMATION_FAILED = "Action non créée."

# packages/contracts/src/agenda-deplacer-et-reajuster-le-planning.ts (SPEC-705 ET-3).
PLANNING_MOVE_WINDOW_ORDER = "La fin du créneau doit suivre son début."
PLANNING_MOVE_WINDOW_PATH = "body.endsAt"


# --- application of one graded attempt (packages/services/src/learning/apply-result.ts) -----------

APPLY_ATTEMPT_NOT_FOUND = "Tentative introuvable."
APPLY_NOT_GRADED = (
    "La tentative n\u2019est pas corrig\u00e9e : "
    "ses r\u00e9sultats ne peuvent pas encore \u00eatre appliqu\u00e9s."
)
APPLY_KIND_UNSUPPORTED = "Ce type d\u2019activit\u00e9 n\u2019alimente pas le moteur d\u2019apprentissage."
APPLY_NOTION_NOT_FOUND = "Notion introuvable."
