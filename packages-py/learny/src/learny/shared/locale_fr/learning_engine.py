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
GAP_TRIGGER_QUALIFYING = "Tentative qualifiante « {kind} » sous le seuil de {threshold} %."
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
