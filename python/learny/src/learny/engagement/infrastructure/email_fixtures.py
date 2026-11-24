"""Fixtures of the e-mail templates (SPEC-204 ET-8)."""

from typing import Any

from learny.engagement.domain.templates import Tone
from learny.shared.locale_fr import engagement_email_fixtures as fx

FIXTURE_USER = {"firstName": fx.FIXTURE_FIRST_NAME, "formationTitle": fx.FIXTURE_FORMATION_TITLE}


def fixture_for(template: str, tone: Tone) -> dict[str, Any]:
    """`fixtureFor`: the sample props of one template, in the tone of the demonstration."""
    if template == "welcome":
        return {"firstName": fx.FIXTURE_FIRST_NAME}
    if template == "daily_digest":
        held_title = fx.DIGEST_HELD_TITLE_TU if tone == "tu" else fx.DIGEST_HELD_TITLE_VOUS
        return {
            "firstName": fx.FIXTURE_FIRST_NAME,
            "dateLabel": fx.DIGEST_DATE_LABEL,
            "plannedLabel": fx.DIGEST_PLANNED_LABEL,
            "activities": [
                {**activity, "formationTitle": fx.FIXTURE_FORMATION_TITLE}
                for activity in fx.DIGEST_ACTIVITIES
            ],
            "globalQuiz": {
                "notions": 14,
                "minutes": 10,
                "formationTitle": fx.FIXTURE_FORMATION_TITLE,
            },
            "held": {
                "count": 2,
                "maxPerDay": 5,
                "titles": [*fx.DIGEST_HELD_TITLES, held_title],
            },
        }
    if template == "reminder":
        return {
            "title": fx.REMINDER_TITLE,
            "body": fx.REMINDER_BODY_TU if tone == "tu" else fx.REMINDER_BODY_VOUS,
            "href": fx.REMINDER_HREF,
            "ctaLabel": fx.REMINDER_CTA_LABEL,
            "formationTitle": fx.FIXTURE_FORMATION_TITLE,
        }
    if template == "weekly_review":
        return {
            "periodStartLabel": fx.WEEKLY_START_LABEL,
            "periodEndLabel": fx.WEEKLY_END_LABEL,
            "studyLabel": fx.WEEKLY_STUDY_LABEL,
            "retentionPercent": 86,
            "atRiskCount": 3,
            "succeeded": fx.WEEKLY_SUCCEEDED,
            "atRisk": fx.WEEKLY_AT_RISK,
            "nextWeek": fx.WEEKLY_NEXT_WEEK,
        }
    if template == "ai_task_failed":
        return {
            "taskLabel": fx.AI_TASK_FAILED_TASK_LABEL,
            "modelLabel": fx.AI_TASK_FAILED_MODEL_LABEL,
            "subject": fx.AI_TASK_FAILED_SUBJECT,
        }
    if template == "export_ready":
        return {
            "downloadUrl": fx.EXPORT_READY_DOWNLOAD_URL,
            "sizeLabel": fx.EXPORT_READY_SIZE_LABEL,
            "expiresLabel": fx.EXPORT_READY_EXPIRES_LABEL,
        }
    if template == "deletion_scheduled":
        return {"scheduledLabel": fx.DELETION_SCHEDULED_LABEL}
    return {"requestedLabel": fx.DELETION_COMPLETED_LABEL}
