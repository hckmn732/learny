"""Public surface of the engagement context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal. `notify` is the
single entry point of the notification producers (BR-NOT-03): `learny.learning` calls it after the
commit of a session or of a milestone, never a second implementation of the routing.
"""

from learny.engagement.application.automations import (
    accept_automation_action,
    decline_automation_action,
    expire_due_automation_actions,
    list_my_automation_actions,
    list_my_automations,
    undo_automation_action,
    update_my_automation_setting,
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

__all__ = [
    "ClockPort",
    "EngagementDeps",
    "Transactions",
    "accept_automation_action",
    "active_notification_type_count",
    "can_send_service_email",
    "complete_pause_diagnostic",
    "count_sent_notifications",
    "decline_automation_action",
    "deliver_due_deliveries",
    "deliver_notification",
    "disable_email_channel",
    "end_pause",
    "expire_due_automation_actions",
    "get_notification_settings",
    "get_pause_state",
    "get_unread_notification_count",
    "get_weekly_review",
    "list_my_automation_actions",
    "list_my_automations",
    "list_notifications",
    "list_push_subscriptions",
    "mark_all_read",
    "mark_notification_read",
    "notification_group",
    "notification_settings_to_dto",
    "notify",
    "previous_civil_day",
    "quiet_hours_of",
    "read_unsubscribe_token",
    "remove_push_subscription",
    "send_email",
    "send_push",
    "send_welcome_email",
    "settings_of",
    "start_pause",
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
