"""Sample data of the e-mail templates (SPEC-204 ET-8), copied from `emails/fixtures.ts`.

Alex Perrin on Wednesday 11 November 2026, as the mockups show. Only the data lives here: the
demonstration route of SPEC-2207 renders it with the real templates.
"""

FIXTURE_FIRST_NAME = "Alex"
FIXTURE_FORMATION_TITLE = "SAP S/4HANA Finance"

DIGEST_DATE_LABEL = "mercredi 11 novembre"
DIGEST_PLANNED_LABEL = "5 h"
DIGEST_ACTIVITIES = (
    {
        "time": "09:00",
        "title": "Relecture du cours",
        "detail": "Chapitre 2 · Saisie des pièces comptables",
    },
    {
        "time": "13:50",
        "title": "Échauffement",
        "detail": "3 questions · 2 min",
    },
    {
        "time": "14:00",
        "title": "Quiz de validation, tentative 2",
        "detail": "Module 3 · Comptabilité générale · seuil 80 %",
    },
    {
        "time": "17:00",
        "title": "Quiz global",
        "detail": "14 notions à revoir · environ 10 min",
    },
)
DIGEST_HELD_TITLES = ("Une séance à replacer",)
DIGEST_HELD_TITLE_TU = "Ton cours est prêt"
DIGEST_HELD_TITLE_VOUS = "Votre cours est prêt"

REMINDER_TITLE = "Quiz de validation à 14:00"
REMINDER_BODY_TU = (
    "Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %. Compte 20 minutes."
)
REMINDER_BODY_VOUS = (
    "Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %. Comptez 20 minutes."
)
REMINDER_HREF = "/formations/sap-s4hana-finance/modules/3/quiz"
REMINDER_CTA_LABEL = "Commencer le quiz"

WEEKLY_START_LABEL = "2 novembre"
WEEKLY_END_LABEL = "8 novembre"
WEEKLY_STUDY_LABEL = "13 h"
WEEKLY_SUCCEEDED = "module 2 validé à 92 %, 41 notions consolidées"
WEEKLY_AT_RISK = "écritures d’abonnement, ledgers parallèles, clôture périodique"
WEEKLY_NEXT_WEEK = "module 3 Comptabilité générale, quiz de validation mercredi, 5 séances prévues"

AI_TASK_FAILED_TASK_LABEL = "rédaction du cours"
AI_TASK_FAILED_MODEL_LABEL = "gpt-4.1-mini"
AI_TASK_FAILED_SUBJECT = "Chapitre 4 · Clôture périodique"

EXPORT_READY_DOWNLOAD_URL = "https://learny.example/exports/alex-perrin-2026-11-11.zip?token=exemple"
EXPORT_READY_SIZE_LABEL = "42 Mo"
EXPORT_READY_EXPIRES_LABEL = "mercredi 18 novembre à 13:20"

DELETION_SCHEDULED_LABEL = "vendredi 11 décembre 2026"
DELETION_COMPLETED_LABEL = "11 novembre 2026"
