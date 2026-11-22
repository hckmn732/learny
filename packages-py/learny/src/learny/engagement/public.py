"""Public surface of the engagement context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal. `notify` is the
single entry point of the notification producers (BR-NOT-03): `learny.learning` calls it after the
commit of a session or of a milestone, never a second implementation of the routing.
"""

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

__all__ = [
    "ClockPort",
    "EngagementDeps",
    "Transactions",
    "active_notification_type_count",
    "can_send_service_email",
    "count_sent_notifications",
    "deliver_due_deliveries",
    "deliver_notification",
    "disable_email_channel",
    "get_notification_settings",
    "get_unread_notification_count",
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
    "unsubscribe_by_token",
    "unsubscribe_done",
    "unsubscribe_form",
    "unsubscribe_invalid",
    "update_notification_settings",
    "upsert_push_subscription",
    "welcome_idempotency_key",
]
