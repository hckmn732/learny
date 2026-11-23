"""User-facing French strings of the learning engine (ADR-2011).

The gap evidence lines are stored in `gap_events` and displayed by the gaps screen, so they are
copied verbatim from `packages/learning-engine/src/gaps/detect.ts`.
"""

GAP_EVIDENCE_CONFUSION = "{count} réponse(s) erronée(s) avec le distracteur « {notion} »."
GAP_EVIDENCE_CONFUSION_GENERIC = "Confusion entre deux notions."
GAP_EVIDENCE_APPLICATION = "Questions de définition réussies mais exercice échoué."
GAP_EVIDENCE_MISUNDERSTANDING_THRESHOLD = "Maîtrise {mastery} % sous le seuil {threshold} %."
GAP_EVIDENCE_MISUNDERSTANDING_OFF_TOPIC = (
    "{failures} échecs sur la notion, dont une réponse ouverte hors sujet."
)
GAP_EVIDENCE_FORGETTING_LAPSE = "Lapse FSRS signalé sur la notion."
GAP_EVIDENCE_FORGETTING = "Notion réussie le {day}, échouée {days} jours plus tard."
GAP_TRIGGER_QUALIFYING = "{kind} sous le seuil de {threshold} % pour cette notion."
# Learner-facing name of a qualifying activity (hotfix QA), "Tentative" for an unknown kind.
GAP_ATTEMPT_KIND_LABELS = {
    "validation_quiz": "Quiz de validation",
    "global_quiz": "Quiz global",
    "mock_exam": "Examen blanc",
    "exercise": "Exercice",
    "remediation": "Remédiation",
}
GAP_ATTEMPT_KIND_FALLBACK = "Tentative"
GAP_TRIGGER_REPEATED = "Erreur « {key} » répétée sur {count} tentatives."
GAP_INACTIVE_NO_ATTEMPT = "Aucune tentative qualifiante pour cette notion."
GAP_INACTIVE_MASTERED = "Maîtrise {mastery} % au seuil de {threshold} %, aucune erreur répétée."
GAP_INACTIVE_DEFAULT = "Aucune tentative qualifiante échouée sous le seuil, aucune erreur répétée."
GAP_CLEARANCE_NONE = "Aucune lacune active à lever."
GAP_CLEARANCE_NOT_ENOUGH = "Lacune maintenue : {count} réussite(s) sur {required} requises."
GAP_CLEARANCE_NOT_SPACED = "Lacune maintenue : {observed} h entre les réussites, minimum {minimum} h."
GAP_CLEARANCE_NOT_MASTERED = "Lacune maintenue : maîtrise {mastery} % sous le seuil {threshold} %."
GAP_CLEARANCE_KEPT = "Lacune maintenue."
GAP_CLEARANCE_DONE = (
    "Lacune levée : {count} réussites espacées de {interval} h, maîtrise {mastery} % ≥ {threshold} %."
)

# Planner (SPEC-407): the slot titles, the conflict messages and the BR-FOR-14 option reasons all
# cross the HTTP contract, so they are copied verbatim from `packages/learning-engine/src/planner/plan.ts`.
PLANNER_SLOT_CONTRIBUTIONS = "Apports — {label}"
PLANNER_SLOT_COURSE = "Cours — {label}"
PLANNER_SLOT_EXERCISE = "Exercice — {label}"
PLANNER_SLOT_VALIDATION_QUIZ = "Quiz de validation — {label}"
PLANNER_SLOT_VALIDATION_QUIZ_PREFIX = "Quiz de validation — "
PLANNER_SLOT_BUFFER = "Marge de rattrapage — {label}"
PLANNER_SLOT_MOCK_EXAM = "Examen blanc {number} — {title}"
PLANNER_SLOT_SPRINT = "Sprint — {title}"
PLANNER_SLOT_GLOBAL_QUIZ = "Quiz global"
PLANNER_REASON_UNSCHEDULED = "Aucun créneau compatible dans l’horizon de 366 jours."
PLANNER_REASON_MANUAL_MOVE = "Déplacement manuel incompatible avec le rythme : il sera recalculé."
PLANNER_CONFLICT_OVERLAP = "Chevauchement de créneaux le {date}."
PLANNER_CONFLICT_CAPACITY = "Capacité dépassée le {date} : {used} min pour {capacity} min."
PLANNER_REASON_VOLUME = "Capacité insuffisante même à {hours} h/jour."
PLANNER_REASON_LIGHTEN = "Même allégé de 90 %, le programme ne tient pas dans l’échéance."
