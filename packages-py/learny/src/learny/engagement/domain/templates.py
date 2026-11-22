"""Templates of the sixteen notification types, ported from `templates/index.ts` (SPEC-209 ET-2).

One template decides the icon, the title, the body, the internal link and the e-mail template of a
notification. Every text exists in two variants, `vous` and `tu`; the literals live in
`learny.shared.locale_fr.engagement` so no French string is inlined in the logic.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from learny.shared.locale_fr import engagement as fr

Tone = Literal["vous", "tu"]
TITLE_MAX = 120
BODY_MAX = 400

_WHITESPACE = re.compile(r"\s+")
_SPACES = re.compile(r"[ \t]+")
_UUID = re.compile(r"^[0-9a-f-]{36}$")
_FORBIDDEN_HREF = re.compile(r"[\s\\]")


def clamps_title(value: str) -> str:
    """A bounded, trimmed one-line text: no template can break a SPEC-109 constraint."""
    text = _WHITESPACE.sub(" ", value).strip()
    if len(text) <= TITLE_MAX:
        return text
    return f"{text[: TITLE_MAX - 1].rstrip()}{fr.NOTIFICATION_ELLIPSIS}"


def clamp_body(value: str) -> str:
    """A bounded, trimmed body; line breaks are allowed but never start or end it."""
    text = _SPACES.sub(" ", value).strip()
    if len(text) <= BODY_MAX:
        return text
    return f"{text[: BODY_MAX - 1].rstrip()}{fr.NOTIFICATION_ELLIPSIS}"


clamp_title = clamps_title


def js_number_text(value: int | float) -> str:
    """`String(value)` of JavaScript: an integral float renders without its decimal part."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if value.is_integer():
        return str(int(value))
    return repr(value)


def _text(data: Mapping[str, Any], key: str, fallback: str) -> str:
    value = data.get(key)
    if isinstance(value, str) and value.strip() != "":
        return value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return js_number_text(value)
    return fallback


def _number(data: Mapping[str, Any], key: str, fallback: int | float) -> int | float:
    value = data.get(key)
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return value
    return fallback


def _internal_path(candidate: Any) -> str | None:
    if not isinstance(candidate, str) or not candidate.startswith("/") or candidate.startswith("//"):
        return None
    if _FORBIDDEN_HREF.search(candidate):
        return None
    return candidate


def href_of(data: Mapping[str, Any], fallback: str = fr.NOTIFICATION_HREF_FALLBACK) -> str:
    """The link of a notification: the producer's internal path, then the formation, then a fallback."""
    explicit = _internal_path(data.get("href"))
    if explicit is not None:
        return explicit
    formation_id = data.get("formationId")
    if isinstance(formation_id, str) and _UUID.match(formation_id):
        return f"/formations/{formation_id}"
    return fallback


def _tone_of(tone: Tone, vous: str, tu: str) -> str:
    return tu if tone == "tu" else vous


def _module_label(data: Mapping[str, Any]) -> str:
    return _text(data, "moduleTitle", fr.NOTIFICATION_MODULE_FALLBACK)


def _formation_label(data: Mapping[str, Any]) -> str:
    return _text(data, "formationTitle", fr.NOTIFICATION_FORMATION_FALLBACK)


def _formation_href(data: Mapping[str, Any]) -> str:
    return href_of(data, fr.NOTIFICATION_HREF_TODAY_FALLBACK)


@dataclass(frozen=True, slots=True)
class NotificationTemplate:
    """Icon, e-mail template and the pure renderers of one notification type."""

    icon: str
    email_template: str | None
    title: Any
    body: Any
    href: Any


def _validation_soon_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_VALIDATION_SOON[tone]


def _validation_soon_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_VALIDATION_SOON[tone].format(
        module=_module_label(data),
        when=_text(data, "when", fr.NOTIFICATION_WHEN_SHORT),
        minutes=js_number_text(_number(data, "minutes", 20)),
    )


def _course_ready_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_COURSE_READY[tone]


def _course_ready_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_COURSE_READY[tone].format(module=_module_label(data))


def _global_quiz_today_title(data: Mapping[str, Any], tone: Tone) -> str:
    return _text(data, "titleOverride", fr.NOTIFICATION_TITLE_GLOBAL_QUIZ_TODAY[tone])


def _global_quiz_today_body(data: Mapping[str, Any], tone: Tone) -> str:
    override = data.get("bodyOverride")
    if isinstance(override, str) and override.strip() != "":
        return override.strip()
    del tone
    return fr.NOTIFICATION_BODY_GLOBAL_QUIZ_TODAY.format(
        notions=js_number_text(_number(data, "notions", 10)),
        minutes=js_number_text(_number(data, "minutes", 10)),
    )


def _new_gap_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_NEW_GAP[tone]


def _new_gap_body(data: Mapping[str, Any], tone: Tone) -> str:
    del tone
    return fr.NOTIFICATION_BODY_NEW_GAP.format(
        notion=_text(data, "notionTitle", fr.NOTIFICATION_NOTION_FALLBACK),
        formation=_formation_label(data),
    )


def _session_planned_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_SESSION_PLANNED[tone]


def _session_planned_body(data: Mapping[str, Any], tone: Tone) -> str:
    del tone
    return fr.NOTIFICATION_BODY_SESSION_PLANNED.format(
        title=_text(data, "title", fr.NOTIFICATION_SESSION_FALLBACK),
        when=_text(data, "when", fr.NOTIFICATION_WHEN_FALLBACK),
    )


def _module_validated_title(data: Mapping[str, Any], tone: Tone) -> str:
    del tone
    position = _number(data, "modulePosition", 0)
    score = round(_number(data, "score", 0))
    if position > 0:
        return fr.NOTIFICATION_TITLE_MODULE_VALIDATED_POSITION.format(
            position=js_number_text(position), score=js_number_text(score)
        )
    return fr.NOTIFICATION_TITLE_MODULE_VALIDATED


def _module_validated_body(data: Mapping[str, Any], tone: Tone) -> str:
    next_position = _number(data, "nextModulePosition", 0)
    next_title = data.get("nextModuleTitle")
    if isinstance(next_title, str) and next_title.strip() != "":
        return fr.NOTIFICATION_BODY_MODULE_VALIDATED_NEXT.format(
            position=js_number_text(next_position), title=next_title.strip()
        )
    if data.get("isLastModule") is True:
        return fr.NOTIFICATION_BODY_MODULE_VALIDATED_LAST[tone]
    return fr.NOTIFICATION_BODY_MODULE_VALIDATED[tone].format(module=_module_label(data))


def _session_to_reschedule_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data, tone
    return fr.NOTIFICATION_TITLE_SESSION_TO_RESCHEDULE


def _session_to_reschedule_body(data: Mapping[str, Any], tone: Tone) -> str:
    summary = data.get("summary")
    if isinstance(summary, str) and summary.strip() != "":
        return summary.strip()
    return fr.NOTIFICATION_BODY_SESSION_TO_RESCHEDULE[tone].format(
        title=_text(data, "title", fr.NOTIFICATION_SESSION_FALLBACK)
    )


def _weekly_review_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_WEEKLY_REVIEW[tone]


def _weekly_review_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_WEEKLY_REVIEW[tone].format(
        study=_text(data, "studyLabel", fr.NOTIFICATION_STUDY_FALLBACK[tone])
    )


def _milestone_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data, tone
    return fr.NOTIFICATION_TITLE_MILESTONE


def _milestone_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_MILESTONE[tone].format(
        label=_text(data, "label", fr.NOTIFICATION_MILESTONE_FALLBACK)
    )


def _ai_cost_alert_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_AI_COST_ALERT[tone]


def _ai_cost_alert_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_AI_COST_ALERT[tone].format(
        percent=js_number_text(_number(data, "percent", 80))
    )


def _ai_task_failed_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data, tone
    return fr.NOTIFICATION_TITLE_AI_TASK_FAILED


def _ai_task_failed_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_AI_TASK_FAILED[tone].format(
        task=_text(data, "taskLabel", fr.NOTIFICATION_TASK_FALLBACK)
    )


def _export_ready_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_EXPORT_READY[tone]


def _export_ready_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_EXPORT_READY[tone].format(days=js_number_text(_number(data, "days", 7)))


def _group_invitation_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data, tone
    return fr.NOTIFICATION_TITLE_GROUP_INVITATION


def _group_invitation_body(data: Mapping[str, Any], tone: Tone) -> str:
    return fr.NOTIFICATION_BODY_GROUP_INVITATION[tone].format(
        group=_text(data, "groupTitle", fr.NOTIFICATION_GROUP_FALLBACK)
    )


def _daily_digest_title(data: Mapping[str, Any], tone: Tone) -> str:
    del data
    return fr.NOTIFICATION_TITLE_DAILY_DIGEST[tone]


def _daily_digest_body(data: Mapping[str, Any], tone: Tone) -> str:
    del tone
    planned = _text(data, "plannedLabel", "")
    suffix = "" if planned == "" else f", {planned}"
    return fr.NOTIFICATION_BODY_DAILY_DIGEST.format(
        count=js_number_text(_number(data, "activityCount", 0)), planned=suffix
    )


def _relaunch_title(data: Mapping[str, Any], tone: Tone) -> str:
    return _text(data, "titleOverride", fr.NOTIFICATION_TITLE_RELAUNCH[tone])


def _relaunch_body(data: Mapping[str, Any], tone: Tone) -> str:
    override = data.get("bodyOverride")
    if isinstance(override, str) and override.strip() != "":
        return override.strip()
    return fr.NOTIFICATION_BODY_RELAUNCH[tone].format(formation=_formation_label(data))


def _planning_adjusted_title(data: Mapping[str, Any], tone: Tone) -> str:
    return _text(data, "titleOverride", fr.NOTIFICATION_TITLE_PLANNING_ADJUSTED[tone])


def _planning_adjusted_body(data: Mapping[str, Any], tone: Tone) -> str:
    override = data.get("bodyOverride")
    if isinstance(override, str) and override.strip() != "":
        return override.strip()
    return fr.NOTIFICATION_BODY_PLANNING_ADJUSTED[tone].format(formation=_formation_label(data))


def _definition(
    icon: str,
    email_template: str | None,
    title: Any,
    body: Any,
    href: Any,
) -> NotificationTemplate:
    def render_title(data: Mapping[str, Any], tone: Tone) -> str:
        return clamps_title(title(data, tone))

    def render_body(data: Mapping[str, Any], tone: Tone) -> str:
        return clamp_body(body(data, tone))

    return NotificationTemplate(
        icon=icon, email_template=email_template, title=render_title, body=render_body, href=href
    )


NOTIFICATION_TEMPLATES: dict[str, NotificationTemplate] = {
    "validation_soon": _definition(
        "clock", "reminder", _validation_soon_title, _validation_soon_body, _formation_href
    ),
    "course_ready": _definition(
        "book-open", "reminder", _course_ready_title, _course_ready_body, _formation_href
    ),
    "global_quiz_today": _definition(
        "refresh", "reminder", _global_quiz_today_title, _global_quiz_today_body, _formation_href
    ),
    "new_gap": _definition("alert-triangle", "reminder", _new_gap_title, _new_gap_body, _formation_href),
    "session_planned": _definition(
        "calendar",
        "reminder",
        _session_planned_title,
        _session_planned_body,
        lambda data: href_of(data, "/agenda"),
    ),
    "module_validated": _definition(
        "check-circle", "reminder", _module_validated_title, _module_validated_body, _formation_href
    ),
    "session_to_reschedule": _definition(
        "calendar-x",
        "reminder",
        _session_to_reschedule_title,
        _session_to_reschedule_body,
        lambda data: href_of(data, "/agenda"),
    ),
    "weekly_review": _definition(
        "bar-chart", "weekly_review", _weekly_review_title, _weekly_review_body, _formation_href
    ),
    "milestone": _definition("award", "reminder", _milestone_title, _milestone_body, _formation_href),
    "ai_cost_alert": _definition(
        "gauge",
        "reminder",
        _ai_cost_alert_title,
        _ai_cost_alert_body,
        lambda data: href_of(data, fr.NOTIFICATION_HREF_SETTINGS_AI),
    ),
    "ai_task_failed": _definition(
        "alert-circle", "ai_task_failed", _ai_task_failed_title, _ai_task_failed_body, _formation_href
    ),
    "export_ready": _definition(
        "download",
        None,
        _export_ready_title,
        _export_ready_body,
        lambda data: href_of(data, fr.NOTIFICATION_HREF_SETTINGS_DATA),
    ),
    "group_invitation": _definition(
        "users",
        "reminder",
        _group_invitation_title,
        _group_invitation_body,
        lambda data: href_of(data, fr.NOTIFICATION_HREF_GROUPS),
    ),
    "daily_digest": _definition(
        "sun",
        "daily_digest",
        _daily_digest_title,
        _daily_digest_body,
        lambda data: href_of(data, fr.NOTIFICATION_HREF_TODAY_FALLBACK),
    ),
    "relaunch": _definition("play-circle", "reminder", _relaunch_title, _relaunch_body, _formation_href),
    "planning_adjusted": _definition(
        "calendar",
        "reminder",
        _planning_adjusted_title,
        _planning_adjusted_body,
        lambda data: href_of(data, "/agenda"),
    ),
}

NOTIFICATION_TYPES: tuple[str, ...] = tuple(NOTIFICATION_TEMPLATES)


def channels_of(notification_type: str) -> tuple[str, ...]:
    """ADR-0265 - the external channels a type may use (EF-6, ET-7)."""
    if notification_type == "daily_digest":
        return ("email",)
    if notification_type == "export_ready":
        return ("push",)
    return ("email", "push")


def render_notification(notification_type: str, data: Mapping[str, Any], tone: Tone) -> dict[str, str]:
    """Icon, title, body and href of one notification, as the inbox stores them."""
    template = NOTIFICATION_TEMPLATES[notification_type]
    return {
        "icon": template.icon,
        "title": template.title(data, tone),
        "body": template.body(data, tone),
        "href": template.href(data),
    }
