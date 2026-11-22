"""E-mail side of a notification (SPEC-2205).

Ported from `packages/notifications/src/templates/email-props.ts`.

A notification type maps to one of the service templates: `reminder` for ordinary messages,
`weekly_review` and `ai_task_failed` for their own, `daily_digest` for the programme du jour.
`export_ready` has no e-mail at all (SPEC-211 sends the export message itself). The title, body and
href of the message are the already-rendered strings of the in-app row, so the mail and the inbox
never diverge (BR-NOT-03); the French literals come from `learny.shared.locale_fr.engagement_email`.
"""

from collections.abc import Mapping, Sequence
from typing import Any, Literal

from learny.engagement.domain.templates import NOTIFICATION_TEMPLATES
from learny.engagement.infrastructure.email import (
    UNSUBSCRIBE_PATH,
    EmailMessage,
    EmailTag,
    RenderedEmail,
    render_template_file,
)
from learny.engagement.infrastructure.unsubscribe import create_unsubscribe_token
from learny.shared.locale_fr import engagement_email as fr

Tone = Literal["vous", "tu"]

EMAIL_TEMPLATE_KEYS: tuple[str, ...] = (
    "welcome",
    "daily_digest",
    "reminder",
    "weekly_review",
    "ai_task_failed",
)

# Every template used by a notification is a service e-mail (ADR-0124): it carries the one-click
# unsubscribe headers and link.
SERVICE_CATEGORY = "service"

ACTIVITY_LIMIT = 20
HELD_TITLE_LIMIT = 10
SUBJECT_LIMIT = 120


class EmailContentUnknown(Exception):
    """The notification type has no e-mail template: the delivery is skipped as `no_template`."""


MappingContent = Mapping[str, Any]


def _text(data: MappingContent, key: str, fallback: str) -> str:
    value = data.get(key)
    return value.strip() if isinstance(value, str) and value.strip() != "" else fallback


def _count(data: MappingContent, key: str, fallback: int) -> int:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    return int(value)


def _activities_of(data: MappingContent) -> list[dict[str, str]]:
    value = data.get("activities")
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    activities: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, Mapping):
            continue
        activities.append(
            {
                "time": _text(item, "time", fr.ACTIVITY_TIME_FALLBACK),
                "title": _text(item, "title", fr.ACTIVITY_TITLE_FALLBACK),
                "detail": _text(item, "detail", ""),
                "formationTitle": _text(item, "formationTitle", ""),
            }
        )
    return activities[:ACTIVITY_LIMIT]


def _held_of(data: MappingContent) -> dict[str, Any] | None:
    value = data.get("held")
    if not isinstance(value, Mapping):
        return None
    held_count = _count(value, "count", 0)
    if held_count <= 0:
        return None
    max_per_day = _count(value, "maxPerDay", 5)
    titles = value.get("titles")
    kept: list[str] = []
    if isinstance(titles, Sequence) and not isinstance(titles, (str, bytes)):
        kept = [title for title in titles if isinstance(title, str)][:HELD_TITLE_LIMIT]
    return {
        "count": held_count,
        "maxPerDay": max_per_day if max_per_day in (3, 8) else 5,
        "titles": kept,
    }


def _global_quiz_of(data: MappingContent) -> dict[str, Any] | None:
    value = data.get("globalQuiz")
    if not isinstance(value, Mapping):
        return None
    return dict(value)


def build_email_content(
    notification_type: str,
    data: MappingContent,
    rendered: Mapping[str, str],
    first_name: str | None,
) -> dict[str, Any] | None:
    """The template key and the props of the e-mail, or `None` for a type with no e-mail."""
    template = NOTIFICATION_TEMPLATES[notification_type]
    key = template.email_template
    if key is None:
        return None
    formation_title = _text(data, "formationTitle", "")
    formation = formation_title if formation_title != "" else None
    if key == "daily_digest":
        return {
            "template": key,
            "props": {
                "firstName": first_name,
                "dateLabel": _text(data, "dateLabel", fr.DATE_TODAY),
                "plannedLabel": _text(data, "plannedLabel", ""),
                "activities": _activities_of(data),
                "globalQuiz": _global_quiz_of(data),
                "held": _held_of(data),
            },
        }
    if key == "weekly_review":
        retention = data.get("retentionPercent")
        return {
            "template": key,
            "props": {
                "periodStartLabel": _text(data, "periodStartLabel", fr.WEEK_THIS),
                "periodEndLabel": _text(data, "periodEndLabel", fr.DATE_TODAY),
                "studyLabel": _text(data, "studyLabel", fr.STUDY_ZERO),
                "retentionPercent": retention if isinstance(retention, (int, float)) else None,
                "atRiskCount": _count(data, "atRiskCount", 0),
                "succeeded": _text(data, "succeeded", fr.SUCCEEDED_DEFAULT),
                "atRisk": _text(data, "atRisk", fr.AT_RISK_DEFAULT),
                "nextWeek": _text(data, "nextWeek", fr.NEXT_WEEK_DEFAULT),
            },
        }
    if key == "ai_task_failed":
        return {
            "template": key,
            "props": {
                "taskLabel": _text(data, "taskLabel", fr.TASK_FALLBACK),
                "modelLabel": _text(data, "modelLabel", fr.MODEL_FALLBACK),
                "subject": _text(data, "subject", rendered["title"])[:SUBJECT_LIMIT],
            },
        }
    return {
        "template": "reminder",
        "props": {
            "title": rendered["title"],
            "body": rendered["body"],
            "href": rendered["href"],
            "ctaLabel": fr.CTA_LABEL,
            "formationTitle": formation,
        },
    }


def _tone(tone: Tone, variants: Mapping[str, str]) -> str:
    return variants["tu"] if tone == "tu" else variants["vous"]


def subject_of(template: str, props: Mapping[str, Any], tone: Tone) -> str:
    """The subject line of a template, in the tone of the learner."""
    if template == "welcome":
        return fr.WELCOME_SUBJECT
    if template == "reminder":
        return str(props["title"])
    if template == "daily_digest":
        return _tone(tone, fr.DIGEST_SUBJECT).format(date=props["dateLabel"])
    if template == "weekly_review":
        return _tone(tone, fr.WEEKLY_REVIEW_SUBJECT).format(
            start=props["periodStartLabel"], end=props["periodEndLabel"]
        )
    return fr.AI_TASK_FAILED_SUBJECT.format(task_label=props["taskLabel"])


def unsubscribe_url(app_url: str, link_secret: str, user_id: str) -> str:
    """`unsubscribeUrl`: the absolute page of the one-click unsubscribe, token included."""
    return f"{app_url}{UNSUBSCRIBE_PATH}?token={create_unsubscribe_token(link_secret, user_id)}"


def _welcome_context(props: Mapping[str, Any], tone: Tone, frame: Mapping[str, Any]) -> dict[str, Any]:
    first_name = props["firstName"]
    greeting = fr.WELCOME_GREETING
    if first_name:
        greeting = fr.WELCOME_GREETING_NAMED.format(first_name=first_name)
    return {
        **frame,
        "preview": _tone(tone, fr.WELCOME_PREVIEW),
        "greeting": greeting,
        "intro": _tone(tone, fr.WELCOME_INTRO),
        "bullets": [
            _tone(tone, fr.WELCOME_BULLET_COURSES),
            fr.WELCOME_BULLET_REVIEWS,
            _tone(tone, fr.WELCOME_BULLET_KEY),
        ],
        "cta_label": fr.WELCOME_CTA,
        "cta_href": f"{frame['app_url']}{fr.WELCOME_CTA_PATH}",
    }


def _reminder_context(props: Mapping[str, Any], frame: Mapping[str, Any]) -> dict[str, Any]:
    return {
        **frame,
        "preview": str(props["body"]),
        "title": props["title"],
        "body": props["body"],
        "formation_title": props["formationTitle"],
        "cta_label": props["ctaLabel"] or fr.REMINDER_CTA_DEFAULT,
        "cta_href": f"{frame['app_url']}{props['href']}",
    }


def _digest_context(props: Mapping[str, Any], tone: Tone, frame: Mapping[str, Any]) -> dict[str, Any]:
    first_name = props["firstName"]
    greeting = fr.DIGEST_GREETING
    if first_name:
        greeting = fr.DIGEST_GREETING_NAMED.format(first_name=first_name)
    activities = list(props["activities"])
    count = len(activities)
    planned = props["plannedLabel"]
    preview = (
        fr.DIGEST_PREVIEW_EMPTY
        if count == 0
        else _tone(tone, fr.DIGEST_PREVIEW_MANY).format(count=count, planned=planned)
    )
    global_quiz = props["globalQuiz"]
    held = props["held"]
    return {
        **frame,
        "preview": preview,
        "greeting": greeting,
        "empty": count == 0,
        "empty_text": _tone(tone, fr.DIGEST_EMPTY_TEXT),
        "intro": _tone(tone, fr.DIGEST_INTRO).format(count=count, planned=planned),
        "activities": activities,
        "global_quiz_text": (
            None
            if global_quiz is None
            else fr.DIGEST_GLOBAL_QUIZ.format(
                notions=global_quiz.get("notions", 0),
                minutes=global_quiz.get("minutes", 0),
            )
        ),
        "held": held,
        "held_intro": (
            None
            if held is None
            else _tone(tone, fr.DIGEST_HELD_INTRO).format(count=held["count"], max_per_day=held["maxPerDay"])
        ),
        "cta_label": fr.DIGEST_CTA,
        "cta_href": f"{frame['app_url']}{fr.DIGEST_CTA_PATH}",
    }


def _weekly_review_context(props: Mapping[str, Any], tone: Tone, frame: Mapping[str, Any]) -> dict[str, Any]:
    retention = props["retentionPercent"]
    return {
        **frame,
        "preview": fr.WEEKLY_REVIEW_PREVIEW.format(study=props["studyLabel"], at_risk=props["atRiskCount"]),
        "title": _tone(tone, fr.WEEKLY_REVIEW_TITLE).format(
            start=props["periodStartLabel"], end=props["periodEndLabel"]
        ),
        "study_figure": fr.WEEKLY_REVIEW_STUDY.format(study=props["studyLabel"]),
        "retention_figure": (
            fr.WEEKLY_REVIEW_RETENTION_EMPTY
            if retention is None
            else fr.WEEKLY_REVIEW_RETENTION.format(percent=int(retention))
        ),
        "at_risk_figure": fr.WEEKLY_REVIEW_AT_RISK.format(count=props["atRiskCount"]),
        "succeeded_text": fr.WEEKLY_REVIEW_SUCCEEDED.format(succeeded=props["succeeded"]),
        "at_risk_text": _tone(tone, fr.WEEKLY_REVIEW_AT_RISK_LINE).format(at_risk=props["atRisk"]),
        "next_week_text": fr.WEEKLY_REVIEW_NEXT_WEEK.format(next_week=props["nextWeek"]),
        "question": _tone(tone, fr.WEEKLY_REVIEW_QUESTION),
        "cta_label": fr.WEEKLY_REVIEW_CTA,
        "cta_href": f"{frame['app_url']}{fr.WEEKLY_REVIEW_CTA_PATH}",
        "secondary_label": fr.WEEKLY_REVIEW_SECONDARY_CTA,
        "secondary_href": f"{frame['app_url']}{fr.WEEKLY_REVIEW_SECONDARY_PATH}",
    }


def _ai_task_failed_context(props: Mapping[str, Any], tone: Tone, frame: Mapping[str, Any]) -> dict[str, Any]:
    subject = fr.AI_TASK_FAILED_SUBJECT.format(task_label=props["taskLabel"])
    return {
        **frame,
        "preview": _tone(tone, fr.AI_TASK_FAILED_PREVIEW),
        "title": subject,
        "intro": _tone(tone, fr.AI_TASK_FAILED_INTRO).format(
            model=props["modelLabel"], subject=props["subject"]
        ),
        "second": _tone(tone, fr.AI_TASK_FAILED_SECOND),
        "cta_label": fr.AI_TASK_FAILED_CTA,
        "cta_href": f"{frame['app_url']}{fr.AI_TASK_FAILED_CTA_PATH}",
    }


def render_email(
    content: Mapping[str, Any],
    *,
    tone: Tone,
    user_id: str,
    app_url: str,
    link_secret: str,
) -> RenderedEmail:
    """Renders one template into HTML, text, subject, headers and tags (SPEC-204 ET-1, ET-4)."""
    template = str(content["template"])
    props: Mapping[str, Any] = content["props"]
    template_unsubscribe = unsubscribe_url(app_url, link_secret, user_id)
    frame: dict[str, Any] = {
        "tone": tone,
        "app_url": app_url,
        "unsubscribe_url": template_unsubscribe,
        "preferences_url": f"{app_url}{fr.EMAIL_PREFERENCES_PATH}",
        "footer": _tone(tone, fr.EMAIL_FOOTER),
        "preferences_link": fr.EMAIL_PREFERENCES_LINK,
        "unsubscribe_link": fr.EMAIL_UNSUBSCRIBE_LINK_SERVICE,
        "category": SERVICE_CATEGORY,
        "held_title_label": fr.DIGEST_HELD_TITLE,
        "held_link_label": fr.DIGEST_HELD_LINK,
        "held_href": f"{app_url}{fr.DIGEST_HELD_PATH}",
    }
    if template == "welcome":
        context = _welcome_context(props, tone, frame)
    elif template == "daily_digest":
        context = _digest_context(props, tone, frame)
    elif template == "weekly_review":
        context = _weekly_review_context(props, tone, frame)
    elif template == "ai_task_failed":
        context = _ai_task_failed_context(props, tone, frame)
    else:
        context = _reminder_context(props, frame)
    html = render_template_file(f"{template}.html.j2", context)
    text = render_template_file(f"{template}.txt.j2", context)
    headers = {
        "List-Unsubscribe": f"<{template_unsubscribe}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    return RenderedEmail(
        subject=subject_of(template, props, tone),
        html=html,
        text=text,
        headers=headers,
        tags=(
            EmailTag(name="template", value=template),
            EmailTag(name="category", value=SERVICE_CATEGORY),
        ),
    )


def build_message(
    rendered: RenderedEmail, *, recipient: str, sender: str, idempotency_key: str
) -> EmailMessage:
    """The message handed to the transport; the entity reference keeps the send traceable."""
    headers = {**rendered.headers, "X-Entity-Ref-ID": idempotency_key}
    return EmailMessage(
        to=recipient,
        sender=sender,
        subject=rendered.subject,
        html=rendered.html,
        text=rendered.text,
        headers=headers,
        tags=rendered.tags,
    )


__all__ = [
    "ACTIVITY_LIMIT",
    "EMAIL_TEMPLATE_KEYS",
    "SERVICE_CATEGORY",
    "EmailContentUnknown",
    "build_email_content",
    "build_message",
    "render_email",
    "subject_of",
    "unsubscribe_url",
]
