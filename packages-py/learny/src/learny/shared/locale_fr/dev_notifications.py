"""Sample data of the notification demonstrations (SPEC-209 EF-8, SPEC-706 EF-8, SPEC-205).

Copied from `packages/services/src/notifications-generation-des-rappels.ts`,
`packages/services/src/dev/notifications.ts` and `packages/notifications/src/push/demo.ts`. Only the
labels live here; the demonstration builds the same facts as the production producers.
"""

NOTIFY_FORMATION_TITLE = "SAP S/4HANA Finance"
NOTIFY_MODULE_TITLE = "Comptabilité générale"
NOTIFY_NOTION_TITLE = "Saisie des pièces comptables"
NOTIFY_TITLE = "Séance de travail"
NOTIFY_PLANNED_LABEL = "5 h"
NOTIFY_STUDY_LABEL = "13 h"
NOTIFY_TASK_LABEL = "Génération du cours"
NOTIFY_GROUP_TITLE = "Promotion Finance"

COURSE_READY_MODULE = "Saisie des pièces comptables"
NEW_GAP_NOTION = "Clé de comptabilisation"
NEW_GAP_FORMATION = "SAP S/4HANA Finance"
SESSION_PLANNED_TITLE = "Rétrospectives"
MODULE_VALIDATED_TITLE = "Comptabilité générale"
MODULE_VALIDATED_NEXT = "Saisie des pièces comptables"
SESSION_RESCHEDULE_TITLE = "Ledgers parallèles"
WEEKLY_STUDY_LABEL = "13 h d’étude"
MILESTONE_LABEL = "Sept jours d’affilée"
AI_TASK_LABEL = "La correction de votre quiz"
AI_MODEL_LABEL = "personnel"
GROUP_INVITATION_TITLE = "Promotion SAP 2026"

PUSH_TYPE = "global_quiz_today"
PUSH_TITLE = "Votre quiz global du jour est prêt"
PUSH_BODY = "Dix questions pour entretenir vos acquis. Comptez cinq minutes."
PUSH_HREF = "/quiz/global"
PUSH_ICON = "calendar"
