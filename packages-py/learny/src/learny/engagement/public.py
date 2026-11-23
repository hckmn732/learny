"""Public surface of the engagement context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal. `notify` is the
single entry point of the notification producers (BR-NOT-03): `learny.learning` calls it after the
commit of a session or of a milestone, never a second implementation of the routing.
"""

from collections.abc import Mapping
from typing import Any

from learny.engagement.application.automations import (
    accept_automation_action,
    decline_automation_action,
    expire_due_automation_actions,
    list_my_automation_actions,
    list_my_automations,
    undo_automation_action,
    update_my_automation_setting,
)
from learny.engagement.application.dev_email import (
    list_demo_outbox,
    preview_email,
    purge_demo_outbox,
    send_demo_email,
)
from learny.engagement.application.digest import (
    build_digest_data,
    held_block,
    plan_daily_digests,
    send_daily_digest,
    send_daily_digest_at,
)
from learny.engagement.application.email import (
    can_send_service_email,
    disable_email_channel,
    send_email,
    send_welcome_email,
    welcome_idempotency_key,
)
from learny.engagement.application.inbox import (
    get_unread_notification_count,
    list_notifications,
    mark_all_read,
    mark_notification_read,
    notification_group,
    previous_civil_day,
)
from learny.engagement.application.local_ticks import (
    LOCAL_TICK_EVENT,
    local_tick_event_id,
    local_tick_page,
    local_tick_payload,
)
from learny.engagement.application.notify import (
    count_sent_notifications,
    deliver_due_deliveries,
    deliver_notification,
    notify,
    send_push,
    settings_of,
)
from learny.engagement.application.pause import (
    complete_pause_diagnostic,
    end_pause,
    get_pause_state,
    start_pause,
)
from learny.engagement.application.ports import ClockPort, EngagementDeps, Transactions
from learny.engagement.application.practice_exercises import ensure_practice_exercise
from learny.engagement.application.reminders import (
    list_validation_reminders,
    next_reminder_instant,
    profile_timezone,
    prune_validation_quiz_reminders,
    quiz_link,
    reminder_key_of,
    schedule_validation_quiz_reminder,
    sync_validation_quiz_reminders,
)
from learny.engagement.application.settings import (
    active_notification_type_count,
    get_notification_settings,
    notification_settings_to_dto,
    quiet_hours_of,
    update_notification_settings,
)
from learny.engagement.application.subscriptions import (
    list_push_subscriptions,
    remove_push_subscription,
    upsert_push_subscription,
)
from learny.engagement.application.unsubscribe import (
    read_unsubscribe_token,
    unsubscribe_by_token,
    unsubscribe_done,
    unsubscribe_form,
    unsubscribe_invalid,
)
from learny.engagement.application.weekly_review import get_weekly_review
from learny.engagement.domain.automations import decode_cursor, encode_cursor
from learny.engagement.domain.push_endpoint import is_public_push_endpoint
from learny.engagement.domain.reminders import local_moment_label
from learny.engagement.domain.tick import build_local_tick, tick_instant
from learny.engagement.infrastructure.push import mock_outcome_of
from learny.shared.locale_fr import engagement as fr


def push_upsert_issues(body: Mapping[str, Any]) -> list[dict[str, str]]:
    """The `PushEndpoint` refinement of `pushSubscriptions.upsert`: one `body.endpoint` issue."""
    endpoint = body.get("endpoint")
    if isinstance(endpoint, str) and not is_public_push_endpoint(endpoint):
        return [{"path": "body.endpoint", "message": fr.PUSH_ENDPOINT_INVALID}]
    return []


__all__ = [
    "LOCAL_TICK_EVENT",
    "ClockPort",
    "EngagementDeps",
    "Transactions",
    "accept_automation_action",
    "active_notification_type_count",
    "build_digest_data",
    "build_local_tick",
    "can_send_service_email",
    "complete_pause_diagnostic",
    "count_sent_notifications",
    "decline_automation_action",
    "decode_cursor",
    "deliver_due_deliveries",
    "deliver_notification",
    "disable_email_channel",
    "encode_cursor",
    "end_pause",
    "ensure_practice_exercise",
    "expire_due_automation_actions",
    "get_notification_settings",
    "get_pause_state",
    "get_unread_notification_count",
    "get_weekly_review",
    "held_block",
    "is_public_push_endpoint",
    "list_demo_outbox",
    "list_my_automation_actions",
    "list_my_automations",
    "list_notifications",
    "list_push_subscriptions",
    "list_validation_reminders",
    "local_moment_label",
    "local_tick_event_id",
    "local_tick_page",
    "local_tick_payload",
    "mark_all_read",
    "mark_notification_read",
    "mock_outcome_of",
    "next_reminder_instant",
    "notification_group",
    "notification_settings_to_dto",
    "notify",
    "plan_daily_digests",
    "preview_email",
    "previous_civil_day",
    "profile_timezone",
    "prune_validation_quiz_reminders",
    "purge_demo_outbox",
    "push_upsert_issues",
    "quiet_hours_of",
    "quiz_link",
    "read_unsubscribe_token",
    "reminder_key_of",
    "remove_push_subscription",
    "schedule_validation_quiz_reminder",
    "send_daily_digest",
    "send_daily_digest_at",
    "send_demo_email",
    "send_email",
    "send_push",
    "send_welcome_email",
    "settings_of",
    "start_pause",
    "sync_validation_quiz_reminders",
    "tick_instant",
    "undo_automation_action",
    "unsubscribe_by_token",
    "unsubscribe_done",
    "unsubscribe_form",
    "unsubscribe_invalid",
    "update_my_automation_setting",
    "update_notification_settings",
    "upsert_push_subscription",
    "welcome_idempotency_key",
]
