"""SQL of the engagement context, copied from the TypeScript repositories (00-conventions section 3).

Every raw `sql` block of `packages/db/src/repositories/{notifications,push-subscriptions}.ts` and
of `packages/services/src/{notifications/list,parametres-notifications}.ts` is copied verbatim,
with `${x}` turned into a bound `:x` parameter and the same `order by`, `for update` and
`on conflict` clauses. Each function takes the transaction as its first parameter and returns a
frozen row.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx
from learny.shared.time import to_iso

ADVISORY_LOCK_USER = text("select pg_advisory_xact_lock(hashtext(:user_id)::bigint)")

INSERT_NOTIFICATION = text(
    "insert into public.notifications "
    "(user_id, formation_id, type, title, body, href, icon, dedupe_key, created_at) "
    "values (cast(:user_id as uuid), cast(:formation_id as uuid), cast(:type as notification_type), "
    ":title, :body, :href, :icon, :dedupe_key, :created_at) "
    "on conflict (user_id, dedupe_key) do nothing "
    "returning id, user_id, formation_id, type, title, body, href, icon, dedupe_key, read_at, "
    "created_at"
)

SELECT_NOTIFICATION = text(
    "select id, user_id, formation_id, type, title, body, href, icon, dedupe_key, read_at, "
    "created_at from public.notifications "
    "where user_id = cast(:user_id as uuid) "
    # A bound NULL has no type until it is cast: `:x is null` alone is ambiguous for the planner.
    "and (cast(:notification_id as uuid) is null or id = cast(:notification_id as uuid)) "
    "and (cast(:dedupe_key as text) is null or dedupe_key = :dedupe_key) "
    "order by created_at desc limit 1"
)

LIST_DELIVERIES = text(
    "select d.id, d.notification_id, d.channel, d.status, d.scheduled_for, d.sent_at, d.error "
    "from public.notification_deliveries d "
    "join public.notifications n on n.id = d.notification_id "
    "where n.user_id = cast(:user_id as uuid) "
    "and d.notification_id = cast(:notification_id as uuid) "
    "order by d.channel"
)

INSERT_DELIVERY = text(
    "insert into public.notification_deliveries "
    "(notification_id, channel, status, scheduled_for, sent_at, error) "
    "values (cast(:notification_id as uuid), cast(:channel as delivery_channel), "
    "cast(:status as delivery_status), :scheduled_for, null, :error) "
    "on conflict (notification_id, channel) do nothing "
    "returning id, notification_id, channel, status, scheduled_for, sent_at, error"
)

SELECT_DELIVERY_FOR_CHANNEL = text(
    "select id, notification_id, channel, status, scheduled_for, sent_at, error "
    "from public.notification_deliveries "
    "where notification_id = cast(:notification_id as uuid) "
    "and channel = cast(:channel as delivery_channel) limit 1"
)

UPDATE_DELIVERY = text(
    "update public.notification_deliveries set status = cast(:status as delivery_status), "
    "scheduled_for = :scheduled_for, sent_at = :sent_at, error = :error "
    "where id = cast(:delivery_id as uuid) "
    "returning id, notification_id, channel, status, scheduled_for, sent_at, error"
)

LOAD_DELIVERY = text(
    "select d.id as delivery_id, d.notification_id, d.channel, d.status, d.scheduled_for, "
    "d.sent_at, d.error, n.id as id, n.user_id, n.formation_id, n.type, n.title, n.body, "
    "n.href, n.icon, "
    "n.dedupe_key, n.read_at, n.created_at, p.first_name, p.tutor_tone, p.email "
    "from public.notification_deliveries d "
    "join public.notifications n on n.id = d.notification_id "
    "join public.profiles p on p.id = n.user_id "
    "where d.id = cast(:delivery_id as uuid) limit 1"
)

LIST_DUE_DELIVERIES = text(
    "select id, notification_id, channel, status, scheduled_for, sent_at, error "
    "from public.notification_deliveries "
    "where status in ('scheduled', 'deferred_quiet') and scheduled_for <= :now "
    "order by scheduled_for asc limit :limit"
)

COUNT_SENT_NOTIFICATIONS = text(
    "select count(distinct d.notification_id)::int as count "
    "from public.notification_deliveries d "
    "join public.notifications n on n.id = d.notification_id "
    "where n.user_id = cast(:user_id as uuid) and n.type <> 'daily_digest' "
    "and (d.status = 'sent' "
    "or (d.status = 'scheduled' and d.scheduled_for <= :now)) "
    "and ((d.sent_at >= :day_start and d.sent_at < :day_end) "
    "or (d.scheduled_for >= :day_start and d.scheduled_for < :day_end))"
)

COUNT_UNREAD = text(
    "select count(*)::int as count from public.notifications "
    "where user_id = cast(:user_id as uuid) and read_at is null"
)

COUNT_ALL = text(
    "select count(*)::int as total from public.notifications where user_id = cast(:user_id as uuid)"
)

MARK_READ = text(
    "update public.notifications set read_at = :read_at "
    "where user_id = cast(:user_id as uuid) and id = cast(:notification_id as uuid) "
    "and read_at is null"
)

MARK_ALL_READ = text(
    "update public.notifications set read_at = :read_at "
    "where user_id = cast(:user_id as uuid) and read_at is null"
)

LIST_INBOX_ROWS = text(
    "select n.id, n.type, n.icon, n.title, n.body, n.href, f.title as formation_title, "
    "n.created_at, n.read_at "
    "from public.notifications n "
    "left join public.formations f on f.id = n.formation_id "
    "where n.user_id = cast(:user_id as uuid) "
    "and (cast(:unread_only as boolean) is false or n.read_at is null) "
    "order by n.created_at desc, n.id desc limit :limit offset :offset"
)

SELECT_SETTINGS = text(
    "select user_id, channel_email, channel_push, type_revision, type_validation, type_course, "
    "type_gap, type_planning, type_relaunch, digest_time::text as digest_time, "
    "quiet_start::text as quiet_start, quiet_end::text as quiet_end, weekend_quiet, max_per_day, "
    "updated_at from public.notification_settings "
    "where user_id = cast(:user_id as uuid) limit 1"
)

SELECT_SETTINGS_FOR_UPDATE = text(
    "select user_id, channel_email, channel_push, type_revision, type_validation, type_course, "
    "type_gap, type_planning, type_relaunch, digest_time::text as digest_time, "
    "quiet_start::text as quiet_start, quiet_end::text as quiet_end, weekend_quiet, max_per_day, "
    "updated_at from public.notification_settings "
    "where user_id = cast(:user_id as uuid) for update limit 1"
)

INSERT_DEFAULT_SETTINGS = text(
    "insert into public.notification_settings (user_id) values (cast(:user_id as uuid)) "
    "on conflict (user_id) do nothing"
)

SELECT_PROFILE = text(
    "select timezone, tutor_tone, first_name, email from public.profiles "
    "where id = cast(:user_id as uuid) limit 1"
)

PATCH_SETTINGS = text(
    "update public.notification_settings set "
    "channel_email = coalesce(:channel_email, channel_email), "
    "channel_push = coalesce(:channel_push, channel_push), "
    "type_revision = coalesce(:type_revision, type_revision), "
    "type_validation = coalesce(:type_validation, type_validation), "
    "type_course = coalesce(:type_course, type_course), "
    "type_gap = coalesce(:type_gap, type_gap), "
    "type_planning = coalesce(:type_planning, type_planning), "
    "type_relaunch = coalesce(:type_relaunch, type_relaunch), "
    "digest_time = coalesce(cast(:digest_time as time), digest_time), "
    "quiet_start = coalesce(cast(:quiet_start as time), quiet_start), "
    "quiet_end = coalesce(cast(:quiet_end as time), quiet_end), "
    "weekend_quiet = coalesce(:weekend_quiet, weekend_quiet), "
    "max_per_day = coalesce(cast(:max_per_day as smallint), max_per_day), "
    "updated_at = :updated_at where user_id = cast(:user_id as uuid)"
)

DISABLE_EMAIL_CHANNEL = text(
    "update public.notification_settings set channel_email = false, updated_at = :updated_at "
    "where user_id = cast(:user_id as uuid) returning user_id"
)

FIND_SUBSCRIPTION = text(
    "select id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at, "
    "last_success_at, failure_count from public.push_subscriptions "
    "where user_id = cast(:user_id as uuid) and endpoint = :endpoint limit 1"
)

INSERT_SUBSCRIPTION = text(
    "insert into public.push_subscriptions "
    "(user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at) "
    "values (cast(:user_id as uuid), :endpoint, :p256dh, :auth, :user_agent, :created_at, "
    ":updated_at) returning id, user_id, endpoint, p256dh, auth, user_agent, created_at, "
    "updated_at, last_success_at, failure_count"
)

UPDATE_SUBSCRIPTION = text(
    "update public.push_subscriptions set p256dh = :p256dh, auth = :auth, "
    "user_agent = :user_agent, updated_at = :updated_at "
    "where id = cast(:subscription_id as uuid) returning id, user_id, endpoint, p256dh, auth, "
    "user_agent, created_at, updated_at, last_success_at, failure_count"
)

DELETE_SUBSCRIPTION = text(
    "delete from public.push_subscriptions "
    "where user_id = cast(:user_id as uuid) and endpoint = :endpoint returning id"
)

LIST_SUBSCRIPTIONS = text(
    "select id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at, "
    "last_success_at, failure_count from public.push_subscriptions "
    "where user_id = cast(:user_id as uuid) order by created_at, id"
)

DELETE_SUBSCRIPTION_BY_ID = text(
    "delete from public.push_subscriptions where id = cast(:subscription_id as uuid) returning id"
)

RESET_SUBSCRIPTION_FAILURES = text(
    "update public.push_subscriptions set failure_count = 0, last_success_at = :now, "
    "updated_at = :now where id = cast(:subscription_id as uuid)"
)

INCREMENT_SUBSCRIPTION_FAILURES = text(
    "update public.push_subscriptions set failure_count = failure_count + 1, updated_at = :now "
    "where id = cast(:subscription_id as uuid)"
)

# packages/notifications/src/deliveries.ts (`automationStaleAt`): an automation notification
# expires with the action it announces.
SELECT_AUTOMATION_ACTION_EXPIRY = text(
    "select payload from public.automation_actions where id = cast(:action_id as uuid) limit 1"
)


@dataclass(frozen=True, slots=True)
class NotificationRow:
    """One row of `notifications`, as every reader of the context sees it."""

    id: str
    user_id: str
    formation_id: str | None
    type: str
    title: str
    body: str
    href: str
    icon: str
    dedupe_key: str | None
    read_at: datetime | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class DeliveryRow:
    """One row of `notification_deliveries`."""

    id: str
    notification_id: str
    channel: str
    status: str
    scheduled_for: datetime | None
    sent_at: datetime | None
    error: str | None


@dataclass(frozen=True, slots=True)
class SettingsRow:
    """One row of `notification_settings`; the three times are `HH:mm` strings."""

    user_id: str
    channel_email: bool
    channel_push: bool
    type_revision: bool
    type_validation: bool
    type_course: bool
    type_gap: bool
    type_planning: bool
    type_relaunch: bool
    digest_time: str
    quiet_start: str
    quiet_end: str
    weekend_quiet: bool
    max_per_day: int
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class SubscriptionRow:
    """One row of `push_subscriptions`."""

    id: str
    user_id: str
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None
    created_at: datetime
    updated_at: datetime
    failure_count: int


@dataclass(frozen=True, slots=True)
class InboxRow:
    """One row of the paginated inbox, with the formation name of the notification."""

    id: str
    type: str
    icon: str
    title: str
    body: str
    href: str
    formation_title: str | None
    created_at: datetime
    read_at: datetime | None


@dataclass(frozen=True, slots=True)
class LoadedDelivery:
    """A delivery with the notification and the recipient profile it needs to be sent."""

    delivery: DeliveryRow
    notification: NotificationRow
    first_name: str | None
    tutor_tone: str
    email: str


def _notification(row: Any) -> NotificationRow:
    return NotificationRow(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        formation_id=None if row["formation_id"] is None else str(row["formation_id"]),
        type=str(row["type"]),
        title=str(row["title"]),
        body=str(row["body"]),
        href=str(row["href"]),
        icon=str(row["icon"]),
        dedupe_key=None if row["dedupe_key"] is None else str(row["dedupe_key"]),
        read_at=row["read_at"],
        created_at=row["created_at"],
    )


def _delivery(row: Any) -> DeliveryRow:
    return DeliveryRow(
        id=str(row["id"]),
        notification_id=str(row["notification_id"]),
        channel=str(row["channel"]),
        status=str(row["status"]),
        scheduled_for=row["scheduled_for"],
        sent_at=row["sent_at"],
        error=None if row["error"] is None else str(row["error"]),
    )


def _settings(row: Any) -> SettingsRow:
    return SettingsRow(
        user_id=str(row["user_id"]),
        channel_email=bool(row["channel_email"]),
        channel_push=bool(row["channel_push"]),
        type_revision=bool(row["type_revision"]),
        type_validation=bool(row["type_validation"]),
        type_course=bool(row["type_course"]),
        type_gap=bool(row["type_gap"]),
        type_planning=bool(row["type_planning"]),
        type_relaunch=bool(row["type_relaunch"]),
        digest_time=str(row["digest_time"])[:5],
        quiet_start=str(row["quiet_start"])[:5],
        quiet_end=str(row["quiet_end"])[:5],
        weekend_quiet=bool(row["weekend_quiet"]),
        max_per_day=int(row["max_per_day"]),
        updated_at=row["updated_at"],
    )


def _subscription(row: Any) -> SubscriptionRow:
    return SubscriptionRow(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        endpoint=str(row["endpoint"]),
        p256dh=str(row["p256dh"]),
        auth=str(row["auth"]),
        user_agent=None if row["user_agent"] is None else str(row["user_agent"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        failure_count=int(row["failure_count"]),
    )


async def lock_learner(tx: Tx, user_id: str) -> None:
    """ET-5 - serialises the cap count of one learner, never of the whole table."""
    await tx.conn.execute(ADVISORY_LOCK_USER, {"user_id": user_id})


async def insert_notification(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str | None,
    notification_type: str,
    title: str,
    body: str,
    href: str,
    icon: str,
    dedupe_key: str | None,
    created_at: datetime,
) -> NotificationRow | None:
    """`on conflict (user_id, dedupe_key) do nothing`: a replay returns `None`."""
    result = await tx.conn.execute(
        INSERT_NOTIFICATION,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "type": notification_type,
            "title": title,
            "body": body,
            "href": href,
            "icon": icon,
            "dedupe_key": dedupe_key,
            "created_at": created_at,
        },
    )
    row = result.mappings().first()
    return None if row is None else _notification(row)


async def find_notification(
    tx: Tx,
    *,
    user_id: str,
    notification_id: str | None = None,
    dedupe_key: str | None = None,
) -> NotificationRow | None:
    """One notification of the learner, by identifier or by dedupe key."""
    result = await tx.conn.execute(
        SELECT_NOTIFICATION,
        {"user_id": user_id, "notification_id": notification_id, "dedupe_key": dedupe_key},
    )
    row = result.mappings().first()
    return None if row is None else _notification(row)


async def list_deliveries(tx: Tx, *, user_id: str, notification_id: str) -> list[DeliveryRow]:
    result = await tx.conn.execute(LIST_DELIVERIES, {"user_id": user_id, "notification_id": notification_id})
    return [_delivery(row) for row in result.mappings()]


async def insert_delivery(
    tx: Tx,
    *,
    notification_id: str,
    channel: str,
    status: str,
    scheduled_for: datetime | None,
    error: str | None,
) -> DeliveryRow:
    result = await tx.conn.execute(
        INSERT_DELIVERY,
        {
            "notification_id": notification_id,
            "channel": channel,
            "status": status,
            "scheduled_for": scheduled_for,
            "error": error,
        },
    )
    row = result.mappings().first()
    if row is not None:
        return _delivery(row)
    existing = await tx.conn.execute(
        SELECT_DELIVERY_FOR_CHANNEL, {"notification_id": notification_id, "channel": channel}
    )
    return _delivery(existing.mappings().one())


async def update_delivery_status(
    tx: Tx,
    *,
    delivery_id: str,
    status: str,
    scheduled_for: datetime | None,
    sent_at: datetime | None,
    error: str | None,
) -> DeliveryRow:
    result = await tx.conn.execute(
        UPDATE_DELIVERY,
        {
            "delivery_id": delivery_id,
            "status": status,
            "scheduled_for": scheduled_for,
            "sent_at": sent_at,
            "error": error,
        },
    )
    return _delivery(result.mappings().one())


async def load_delivery(tx: Tx, delivery_id: str) -> LoadedDelivery | None:
    result = await tx.conn.execute(LOAD_DELIVERY, {"delivery_id": delivery_id})
    row = result.mappings().first()
    if row is None:
        return None
    return LoadedDelivery(
        delivery=DeliveryRow(
            id=str(row["delivery_id"]),
            notification_id=str(row["notification_id"]),
            channel=str(row["channel"]),
            status=str(row["status"]),
            scheduled_for=row["scheduled_for"],
            sent_at=row["sent_at"],
            error=None if row["error"] is None else str(row["error"]),
        ),
        notification=_notification(row),
        first_name=None if row["first_name"] is None else str(row["first_name"]),
        tutor_tone=str(row["tutor_tone"]),
        email=str(row["email"]),
    )


async def list_due_deliveries(tx: Tx, *, now: datetime, limit: int = 100) -> list[DeliveryRow]:
    result = await tx.conn.execute(LIST_DUE_DELIVERIES, {"now": now, "limit": limit})
    return [_delivery(row) for row in result.mappings()]


async def count_sent_notifications(
    tx: Tx, *, user_id: str, day_start: datetime, day_end: datetime, now: datetime
) -> int:
    result = await tx.conn.execute(
        COUNT_SENT_NOTIFICATIONS,
        {"user_id": user_id, "day_start": day_start, "day_end": day_end, "now": now},
    )
    row = result.mappings().first()
    return 0 if row is None else int(row["count"])


async def count_unread(tx: Tx, user_id: str) -> int:
    result = await tx.conn.execute(COUNT_UNREAD, {"user_id": user_id})
    row = result.mappings().first()
    return 0 if row is None else int(row["count"])


async def count_all(tx: Tx, user_id: str) -> int:
    result = await tx.conn.execute(COUNT_ALL, {"user_id": user_id})
    row = result.mappings().first()
    return 0 if row is None else int(row["total"])


async def mark_read(tx: Tx, *, user_id: str, notification_id: str, read_at: datetime) -> None:
    await tx.conn.execute(
        MARK_READ, {"user_id": user_id, "notification_id": notification_id, "read_at": read_at}
    )


async def mark_all_read(tx: Tx, *, user_id: str, read_at: datetime) -> None:
    await tx.conn.execute(MARK_ALL_READ, {"user_id": user_id, "read_at": read_at})


async def list_inbox_rows(
    tx: Tx, *, user_id: str, unread_only: bool, limit: int, offset: int
) -> list[InboxRow]:
    result = await tx.conn.execute(
        LIST_INBOX_ROWS,
        {"user_id": user_id, "unread_only": unread_only, "limit": limit, "offset": offset},
    )
    return [
        InboxRow(
            id=str(row["id"]),
            type=str(row["type"]),
            icon=str(row["icon"]),
            title=str(row["title"]),
            body=str(row["body"]),
            href=str(row["href"]),
            formation_title=(None if row["formation_title"] is None else str(row["formation_title"])),
            created_at=row["created_at"],
            read_at=row["read_at"],
        )
        for row in result.mappings()
    ]


async def read_profile(tx: Tx, user_id: str) -> Any | None:
    """The recipient profile: zone, tone, first name and address, read with the owner role."""
    result = await tx.conn.execute(SELECT_PROFILE, {"user_id": user_id})
    return result.mappings().first()


async def select_settings(tx: Tx, user_id: str, *, for_update: bool = False) -> SettingsRow | None:
    statement = SELECT_SETTINGS_FOR_UPDATE if for_update else SELECT_SETTINGS
    result = await tx.conn.execute(statement, {"user_id": user_id})
    row = result.mappings().first()
    return None if row is None else _settings(row)


async def insert_default_settings(tx: Tx, user_id: str) -> None:
    await tx.conn.execute(INSERT_DEFAULT_SETTINGS, {"user_id": user_id})


async def patch_settings(tx: Tx, user_id: str, values: Mapping[str, Any]) -> None:
    await tx.conn.execute(PATCH_SETTINGS, {"user_id": user_id, **values})


async def disable_email_channel(tx: Tx, *, user_id: str, updated_at: datetime) -> bool:
    result = await tx.conn.execute(DISABLE_EMAIL_CHANNEL, {"user_id": user_id, "updated_at": updated_at})
    return result.mappings().first() is not None


async def find_subscription(tx: Tx, *, user_id: str, endpoint: str) -> SubscriptionRow | None:
    result = await tx.conn.execute(FIND_SUBSCRIPTION, {"user_id": user_id, "endpoint": endpoint})
    row = result.mappings().first()
    return None if row is None else _subscription(row)


async def insert_subscription(
    tx: Tx,
    *,
    user_id: str,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
    now: datetime,
) -> SubscriptionRow:
    result = await tx.conn.execute(
        INSERT_SUBSCRIPTION,
        {
            "user_id": user_id,
            "endpoint": endpoint,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent,
            "created_at": now,
            "updated_at": now,
        },
    )
    return _subscription(result.mappings().one())


async def update_subscription(
    tx: Tx,
    *,
    subscription_id: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
    now: datetime,
) -> SubscriptionRow:
    result = await tx.conn.execute(
        UPDATE_SUBSCRIPTION,
        {
            "subscription_id": subscription_id,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent,
            "updated_at": now,
        },
    )
    return _subscription(result.mappings().one())


async def delete_subscription(tx: Tx, *, user_id: str, endpoint: str) -> int:
    result = await tx.conn.execute(DELETE_SUBSCRIPTION, {"user_id": user_id, "endpoint": endpoint})
    return len(list(result.mappings()))


async def list_subscriptions(tx: Tx, user_id: str) -> list[SubscriptionRow]:
    result = await tx.conn.execute(LIST_SUBSCRIPTIONS, {"user_id": user_id})
    return [_subscription(row) for row in result.mappings()]


async def delete_subscription_by_id(tx: Tx, subscription_id: str) -> bool:
    """The push round removes a subscription whose endpoint is gone or has failed five times."""
    result = await tx.conn.execute(DELETE_SUBSCRIPTION_BY_ID, {"subscription_id": subscription_id})
    return result.mappings().first() is not None


async def reset_subscription_failures(tx: Tx, *, subscription_id: str, now: datetime) -> None:
    """A success resets the consecutive-failure counter and stamps the last success."""
    await tx.conn.execute(RESET_SUBSCRIPTION_FAILURES, {"subscription_id": subscription_id, "now": now})


async def increment_subscription_failures(tx: Tx, *, subscription_id: str, now: datetime) -> None:
    await tx.conn.execute(INCREMENT_SUBSCRIPTION_FAILURES, {"subscription_id": subscription_id, "now": now})


async def find_delivery(tx: Tx, *, notification_id: str, channel: str) -> DeliveryRow | None:
    """`getDelivery`: the journal line of one (notification, channel) pair, or `None`."""
    result = await tx.conn.execute(
        SELECT_DELIVERY_FOR_CHANNEL, {"notification_id": notification_id, "channel": channel}
    )
    row = result.mappings().first()
    return None if row is None else _delivery(row)


async def read_automation_action_expiry(tx: Tx, action_id: str) -> object | None:
    """`automationStaleAt`: the `expiresAt` of the action a notification announces, if any."""
    result = await tx.conn.execute(SELECT_AUTOMATION_ACTION_EXPIRY, {"action_id": action_id})
    row = result.mappings().first()
    return None if row is None else row["payload"]


# --- automations of SPEC-2205 ------------------------------------------------------------------
#
# Copied from `packages/services/src/automations/index.ts` and
# `packages/db/src/repositories/automation-actions.ts`: the same columns, the same
# `on conflict (user_id, key)` and the same `(created_at, id) < cursor` page.

SELECT_AUTOMATION_SETTINGS = text(
    "select user_id, key::text as key, enabled, params, updated_at "
    "from public.automation_settings where user_id = cast(:user_id as uuid) order by key"
)

UPSERT_AUTOMATION_SETTING = text(
    "insert into public.automation_settings (user_id, key, enabled, params, updated_at) "
    "values (cast(:user_id as uuid), cast(:key as public.automation_key), :enabled, "
    "cast(:params as jsonb), :updated_at) "
    "on conflict (user_id, key) do update set enabled = excluded.enabled, "
    "params = excluded.params, updated_at = excluded.updated_at "
    "returning user_id, key::text as key, enabled, params, updated_at"
)

SELECT_ACTIVE_PAUSE = text(
    "select starts_on::text as starts_on, ends_on::text as ends_on from public.pauses "
    "where user_id = cast(:user_id as uuid) and status = 'active' "
    "and cast(:local_day as date) between starts_on and ends_on limit 1"
)

SELECT_AUTOMATION_ACTIONS = text(
    "select id::text as id, user_id::text as user_id, formation_id::text as formation_id, "
    "automation::text as automation, kind, summary, payload, undo_payload, requires_consent, "
    "status::text as status, decided_at, created_at "
    "from public.automation_actions "
    "where user_id = cast(:user_id as uuid) "
    "and (cast(:status as public.automation_status) is null "
    "     or status = cast(:status as public.automation_status)) "
    "and (cast(:kind as text) is null or kind = cast(:kind as text)) "
    "and (cast(:automation as public.automation_key) is null "
    "     or automation = cast(:automation as public.automation_key)) "
    "and (cast(:formation_id as uuid) is null or formation_id = cast(:formation_id as uuid)) "
    "and (cast(:since as timestamptz) is null or created_at >= cast(:since as timestamptz)) "
    "and (cast(:cursor_k as timestamptz) is null "
    "     or (created_at, id) < (cast(:cursor_k as timestamptz), cast(:cursor_id as uuid))) "
    "order by created_at desc, id desc limit :limit"
)

COUNT_AUTOMATION_ACTIONS_SINCE = text(
    "select count(*)::int as count from public.automation_actions "
    "where user_id = cast(:user_id as uuid) and created_at >= cast(:since as timestamptz)"
)

EXPIRE_DUE_AUTOMATION_ACTIONS = text(
    "update public.automation_actions set status = 'expired', decided_at = :now "
    "where status = 'pending_consent' "
    "and payload ? 'expiresAt' "
    "and (payload ->> 'expiresAt')::timestamptz <= cast(:now as timestamptz) "
    "returning id::text as id"
)


@dataclass(frozen=True, slots=True)
class AutomationSettingRow:
    """One stored setting; a missing key falls back to the canonical defaults."""

    key: str
    enabled: bool
    params: Mapping[str, Any]
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class AutomationActionRow:
    """One journal row of the automation engine."""

    id: str
    formation_id: str | None
    automation: str
    kind: str
    summary: str
    payload: Mapping[str, Any]
    undo_payload: Mapping[str, Any] | None
    requires_consent: bool
    status: str
    decided_at: datetime | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AutomationActionPage:
    """One page of the journal plus the cursor of the next one."""

    rows: list[AutomationActionRow]
    next_cursor: tuple[str, str] | None


def _automation_setting(row: Any) -> AutomationSettingRow:
    return AutomationSettingRow(
        key=str(row["key"]),
        enabled=bool(row["enabled"]),
        params=row["params"],
        updated_at=row["updated_at"],
    )


def _automation_action(row: Any) -> AutomationActionRow:
    return AutomationActionRow(
        id=str(row["id"]),
        formation_id=row["formation_id"],
        automation=str(row["automation"]),
        kind=str(row["kind"]),
        summary=str(row["summary"]),
        payload=row["payload"],
        undo_payload=row["undo_payload"],
        requires_consent=bool(row["requires_consent"]),
        status=str(row["status"]),
        decided_at=row["decided_at"],
        created_at=row["created_at"],
    )


async def read_automation_settings(tx: Tx, user_id: str) -> list[AutomationSettingRow]:
    result = await tx.conn.execute(SELECT_AUTOMATION_SETTINGS, {"user_id": user_id})
    return [_automation_setting(row) for row in result.mappings()]


async def upsert_automation_setting(
    tx: Tx, *, user_id: str, key: str, enabled: bool, params: Mapping[str, Any], now: datetime
) -> AutomationSettingRow:
    result = await tx.conn.execute(
        UPSERT_AUTOMATION_SETTING,
        {
            "user_id": user_id,
            "key": key,
            "enabled": enabled,
            "params": json.dumps(dict(params), ensure_ascii=False),
            "updated_at": now,
        },
    )
    return _automation_setting(result.mappings().one())


async def read_active_pause(tx: Tx, user_id: str, local_day: str) -> Any | None:
    """CL-5 - the active global pause covering the given local civil day."""
    result = await tx.conn.execute(SELECT_ACTIVE_PAUSE, {"user_id": user_id, "local_day": local_day})
    return result.mappings().first()


async def list_automation_actions(
    tx: Tx,
    *,
    user_id: str,
    status: str | None,
    kind: str | None,
    automation: str | None,
    formation_id: str | None,
    since: datetime | None,
    limit: int,
    cursor: tuple[str, str] | None,
) -> AutomationActionPage:
    """ET-5 - one filtered page, newest first, with the extra row giving the next cursor."""
    cursor_k, cursor_id = (None, None) if cursor is None else cursor
    result = await tx.conn.execute(
        SELECT_AUTOMATION_ACTIONS,
        {
            "user_id": user_id,
            "status": status,
            "kind": kind,
            "automation": automation,
            "formation_id": formation_id,
            "since": since,
            "cursor_k": cursor_k,
            "cursor_id": cursor_id,
            "limit": limit + 1,
        },
    )
    rows = [_automation_action(row) for row in result.mappings()]
    page = rows[:limit]
    extra = rows[limit] if len(rows) > limit else None
    if extra is None or not page:
        return AutomationActionPage(rows=page, next_cursor=None)
    last = page[-1]
    return AutomationActionPage(rows=page, next_cursor=(to_iso(last.created_at), last.id))


async def count_automation_actions_since(tx: Tx, user_id: str, since: datetime) -> int:
    """BR-AUT-12 - N actions cette semaine, from the given instant inclusive."""
    result = await tx.conn.execute(COUNT_AUTOMATION_ACTIONS_SINCE, {"user_id": user_id, "since": since})
    row = result.mappings().one()
    return int(row["count"])


async def expire_due_automation_actions(tx: Tx, now: datetime) -> int:
    """CL-3 - expires every pending action whose `expiresAt` has passed; returns the count."""
    result = await tx.conn.execute(EXPIRE_DUE_AUTOMATION_ACTIONS, {"now": now})
    return len(list(result.mappings()))
