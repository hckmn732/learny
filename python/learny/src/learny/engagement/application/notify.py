"""Unified notification service (SPEC-2205).

`notify` is the only entry point of the notification producers. It always creates the in-app row
(BR-NOT-03), then records one decision per external channel inside the same transaction, and finally
sends the deliveries that are due after the commit. Deduplication is the database unique key
`(user_id, dedupe_key)`: a second call creates neither a row nor a delivery (EF-1, CL-4).

The daily cap is counted and decided under the transaction-scoped advisory lock of the learner, so
ten concurrent calls cannot exceed `max_per_day` (ET-5, CL-3). The distinct notification is the
counting unit: the e-mail and the push of the same notification count once (EF-7, ADR-0214).
"""

import re
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, cast

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.routing import DeliveryChannel, DeliverySettings, decide_delivery
from learny.engagement.domain.templates import (
    NOTIFICATION_TEMPLATES,
    Tone,
    channels_of,
    render_notification,
)
from learny.engagement.infrastructure import queries
from learny.engagement.infrastructure.email import (
    EmailMessage,
    is_rejected_email_error,
    is_transient_email_error,
)
from learny.engagement.infrastructure.email_templates import (
    build_email_content,
    build_message,
    render_email,
)
from learny.engagement.infrastructure.push import (
    PUSH_ERROR_CODES,
    PUSH_TTL_SECONDS,
    PushPayload,
    PushSendResult,
    PushTarget,
    build_push_payload,
    decide_attempt,
    summarize_round,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import (
    from_epoch_ms,
    parse_iso,
    to_epoch_ms,
    to_iso,
    user_day_bounds,
    user_local_day,
)

DELIVERY_CHANNELS: tuple[str, ...] = ("email", "push")
DEDUPE_KEY_MAX = 200
AUTOMATION_PREFIX = "automation:"
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def settings_of(row: queries.SettingsRow | None) -> DeliverySettings:
    """`toSettings`: the stored row, or the defaults of a learner without settings."""
    if row is None:
        return DeliverySettings()
    max_per_day = row.max_per_day if row.max_per_day in (3, 8) else 5
    return DeliverySettings(
        channel_email=row.channel_email,
        channel_push=row.channel_push,
        type_revision=row.type_revision,
        type_validation=row.type_validation,
        type_course=row.type_course,
        type_gap=row.type_gap,
        type_planning=row.type_planning,
        type_relaunch=row.type_relaunch,
        quiet_start=row.quiet_start,
        quiet_end=row.quiet_end,
        weekend_quiet=row.weekend_quiet,
        max_per_day=max_per_day,
    )


def _validate(
    notification_type: str,
    dedupe_key: str | None,
    external_channels: Sequence[str] | None,
) -> str | None:
    """`NotifyInput`: the type, the dedupe key and the optional channel restriction."""
    if notification_type not in NOTIFICATION_TEMPLATES:
        raise AppError("VALIDATION_FAILED", fr.NOTIFY_INVALID)
    key: str | None = None
    if dedupe_key is not None:
        key = dedupe_key.strip()
        if key == "" or len(key) > DEDUPE_KEY_MAX:
            raise AppError("VALIDATION_FAILED", fr.NOTIFY_INVALID)
    if external_channels is not None and any(
        channel not in DELIVERY_CHANNELS for channel in external_channels
    ):
        raise AppError("VALIDATION_FAILED", fr.NOTIFY_INVALID)
    return key


def _instant_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return to_iso(value)
    return None


async def count_sent_notifications(
    deps: EngagementDeps,
    *,
    user_id: str,
    day_start: datetime,
    day_end: datetime,
    now: datetime,
) -> int:
    """EF-7 - counts the distinct notifications sent during the local day, digest excluded."""
    async with deps.db.service_tx() as tx:
        return await queries.count_sent_notifications(
            tx, user_id=user_id, day_start=day_start, day_end=day_end, now=now
        )


async def notify(
    deps: EngagementDeps,
    *,
    user_id: str,
    notification_type: str,
    data: Mapping[str, Any],
    formation_id: str | None = None,
    dedupe_key: str | None = None,
    eligible_at: str | None = None,
    stale_at: str | None = None,
    external_channels: Sequence[str] | None = None,
) -> dict[str, Any]:
    """EF-1 - creates the in-app notification and the delivery decisions, then sends what is due."""
    key = _validate(notification_type, dedupe_key, external_channels)
    async with deps.db.service_tx() as tx:
        profile = await queries.read_profile(tx, user_id)
        settings_row = await queries.select_settings(tx, user_id)
    if profile is None:
        raise AppError("NOT_FOUND", fr.NOTIFY_PROFILE_NOT_FOUND)

    settings = settings_of(settings_row)
    time_zone = str(profile["timezone"])
    tone: Tone = "tu" if str(profile["tutor_tone"]) == "tu" else "vous"
    rendered = render_notification(notification_type, data, tone)
    now = deps.clock.now()
    today = user_local_day(to_epoch_ms(now), time_zone)
    start_ms, end_ms = user_day_bounds(today, time_zone)
    eligible = None if eligible_at is None else parse_iso(eligible_at)
    stale = None if stale_at is None else parse_iso(stale_at)
    allowed = None if external_channels is None else set(external_channels)

    due: list[str] = []
    async with deps.db.service_tx() as tx:
        # ET-5 - serialise the cap count of one learner, never of the whole table.
        await queries.lock_learner(tx, user_id)
        inserted = await queries.insert_notification(
            tx,
            user_id=user_id,
            formation_id=formation_id,
            notification_type=notification_type,
            title=rendered["title"],
            body=rendered["body"],
            href=rendered["href"],
            icon=rendered["icon"],
            dedupe_key=key,
            created_at=now,
        )
        if inserted is None:
            replay = await queries.find_notification(tx, user_id=user_id, dedupe_key=key)
            if replay is None:  # pragma: no cover - the conflicting row is readable with the owner role
                raise AppError("INTERNAL_ERROR")
            deliveries = await queries.list_deliveries(tx, user_id=user_id, notification_id=replay.id)
            return _result(replay.id, False, deliveries)

        sent_today = await queries.count_sent_notifications(
            tx,
            user_id=user_id,
            day_start=from_epoch_ms(start_ms),
            day_end=from_epoch_ms(end_ms),
            now=now,
        )
        for channel in channels_of(notification_type):
            # SPEC-720 EF-3 - a producer may keep a notification strictly in-app (`[]`) or restrict
            # it to one channel; the default keeps every channel of the template.
            if allowed is not None and channel not in allowed:
                continue
            decision = decide_delivery(
                channel=cast(DeliveryChannel, channel),
                notification_type=notification_type,
                settings=settings,
                now=now,
                time_zone=time_zone,
                sent_today=sent_today,
                eligible_at=eligible,
                stale_at=stale,
            )
            # A `sent` decision is recorded as scheduled at the current instant until the send is
            # done: a rollback keeps the journal coherent and a crash leaves a replayable line.
            status = "scheduled" if decision.status == "sent" else decision.status
            scheduled_for = now if decision.status == "sent" else decision.scheduled_for
            row = await queries.insert_delivery(
                tx,
                notification_id=inserted.id,
                channel=channel,
                status=status,
                scheduled_for=(scheduled_for if status in ("scheduled", "deferred_quiet") else None),
                error=decision.error,
            )
            if decision.status == "sent":
                await tx.emit(
                    "notification/delivery-due",
                    {
                        "userId": user_id,
                        "notificationId": inserted.id,
                        "deliveryId": row.id,
                        "channel": channel,
                        "data": dict(data),
                    },
                    event_id=f"notification-delivery:{row.id}",
                    user_id=user_id,
                )
                due.append(row.id)
        notification_id = inserted.id

    # Sending happens after the commit. The outbox event above remains the durable retry path.
    for delivery_id in due:
        await deliver_notification(deps, delivery_id, stale_at=stale, data=data)

    async with deps.db.service_tx() as tx:
        final = await queries.list_deliveries(tx, user_id=user_id, notification_id=notification_id)
    return _result(notification_id, True, final)


def _result(notification_id: str, created: bool, deliveries: Sequence[queries.DeliveryRow]) -> dict[str, Any]:
    return {
        "notificationId": notification_id,
        "created": created,
        "deliveries": [
            {
                "channel": row.channel,
                "status": row.status,
                "scheduledFor": _instant_text(row.scheduled_for),
            }
            for row in deliveries
        ],
    }


async def _automation_stale_at(deps: EngagementDeps, dedupe_key: str | None) -> datetime | None:
    """SPEC-713 EF-4 - an automation notification expires with the action it announces."""
    if dedupe_key is None or not dedupe_key.startswith(AUTOMATION_PREFIX):
        return None
    action_id = dedupe_key[len(AUTOMATION_PREFIX) :]
    if not _is_uuid(action_id):
        return None
    async with deps.db.service_tx() as tx:
        payload = await queries.read_automation_action_expiry(tx, action_id)
    if not isinstance(payload, Mapping):
        return None
    expires_at = payload.get("expiresAt")
    if not isinstance(expires_at, str):
        return None
    try:
        return parse_iso(expires_at)
    except ValueError:
        return None


def _is_uuid(value: str) -> bool:
    return _UUID.match(value) is not None


async def deliver_notification(
    deps: EngagementDeps,
    delivery_id: str,
    *,
    stale_at: datetime | None = None,
    data: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """EF-5, EF-7, ET-4 - sends one pending delivery, if it is due and still meaningful."""
    async with deps.db.service_tx() as tx:
        loaded = await queries.load_delivery(tx, delivery_id)
    if loaded is None:
        raise AppError("NOT_FOUND", fr.DELIVERY_NOT_FOUND)
    now = deps.clock.now()
    effective_stale = (
        stale_at if stale_at is not None else await _automation_stale_at(deps, loaded.notification.dedupe_key)
    )
    delivery = loaded.delivery
    if delivery.status == "sent":
        return _outcome(delivery.id, delivery.channel, "sent", None, False, True)
    if (
        delivery.status in ("scheduled", "deferred_quiet")
        and delivery.scheduled_for is not None
        and delivery.scheduled_for > now
    ):
        return _outcome(delivery.id, delivery.channel, delivery.status, delivery.error, False, True)
    abandoned = await _abandon_if_stale(deps, loaded, effective_stale, now)
    if abandoned is not None:
        return abandoned
    if delivery.status in ("capped", "skipped_pref"):
        return _outcome(delivery.id, delivery.channel, delivery.status, delivery.error, False, True)
    if delivery.channel == "email":
        return await _deliver_email(deps, loaded, data or {})
    return await _deliver_push(deps, loaded)


def _outcome(
    delivery_id: str,
    channel: str,
    status: str,
    error: str | None,
    retryable: bool,
    skipped: bool,
) -> dict[str, Any]:
    return {
        "deliveryId": delivery_id,
        "channel": channel,
        "status": status,
        "error": error,
        "retryable": retryable,
        "skipped": skipped,
    }


async def _abandon_if_stale(
    deps: EngagementDeps,
    loaded: queries.LoadedDelivery,
    stale_at: datetime | None,
    now: datetime,
) -> dict[str, Any] | None:
    """BR-NOT-06, CL-5 - a read notification or a passed deadline abandons the deferred send."""
    stale = loaded.notification.read_at is not None or (stale_at is not None and stale_at <= now)
    if not stale:
        return None
    async with deps.db.service_tx() as tx:
        updated = await queries.update_delivery_status(
            tx,
            delivery_id=loaded.delivery.id,
            status="skipped_pref",
            scheduled_for=None,
            sent_at=None,
            error="stale",
        )
    return _outcome(updated.id, updated.channel, "skipped_pref", "stale", False, True)


async def _deliver_email(
    deps: EngagementDeps,
    loaded: queries.LoadedDelivery,
    data: Mapping[str, Any],
) -> dict[str, Any]:
    """The e-mail of one delivery: rendered from the in-app row, sent with its journal key."""
    tone: Tone = "tu" if loaded.tutor_tone == "tu" else "vous"
    content = build_email_content(
        loaded.notification.type,
        data,
        {
            "title": loaded.notification.title,
            "body": loaded.notification.body,
            "href": loaded.notification.href,
        },
        loaded.first_name,
    )
    if content is None:
        await _set_failed(deps, loaded.delivery.id, "skipped_pref", "no_template")
        return _outcome(loaded.delivery.id, "email", "skipped_pref", "no_template", False, True)
    rendered = render_email(
        content,
        tone=tone,
        user_id=loaded.notification.user_id,
        app_url=deps.email_config.app_url,
        link_secret=deps.email_config.link_secret,
    )
    message: EmailMessage = build_message(
        rendered,
        recipient=loaded.email,
        sender=deps.email_config.sender,
        idempotency_key=f"notification:{loaded.delivery.id}",
    )
    try:
        message_id = await deps.email.send(message, idempotency_key=f"notification:{loaded.delivery.id}")
    except Exception as error:
        transient = is_transient_email_error(error) or not is_rejected_email_error(error)
        code = "transient" if transient else "rejected"
        await _set_failed(deps, loaded.delivery.id, "failed", code)
        deps.logger.warn("notification email failed", outcome=code)
        raise AppError(
            "SERVICE_UNAVAILABLE" if transient else "VALIDATION_FAILED",
            fr.DELIVERY_EMAIL_TRANSIENT if transient else fr.DELIVERY_EMAIL_REJECTED,
        ) from error
    async with deps.db.service_tx() as tx:
        await queries.update_delivery_status(
            tx,
            delivery_id=loaded.delivery.id,
            status="sent",
            scheduled_for=None,
            sent_at=deps.clock.now(),
            error=None,
        )
    deps.logger.info(
        "email sent",
        userId=loaded.notification.user_id,
        template=content["template"],
        component=deps.email.name,
        messageId=message_id,
    )
    return _outcome(loaded.delivery.id, "email", "sent", None, False, False)


async def _set_failed(deps: EngagementDeps, delivery_id: str, status: str, error: str) -> queries.DeliveryRow:
    async with deps.db.service_tx() as tx:
        return await queries.update_delivery_status(
            tx,
            delivery_id=delivery_id,
            status=status,
            scheduled_for=None,
            sent_at=None,
            error=error,
        )


async def _deliver_push(deps: EngagementDeps, loaded: queries.LoadedDelivery) -> dict[str, Any]:
    outcome = await send_push(
        deps,
        user_id=loaded.notification.user_id,
        notification={
            "id": loaded.notification.id,
            "title": loaded.notification.title,
            "body": loaded.notification.body,
            "icon": loaded.notification.icon,
            "href": loaded.notification.href,
        },
    )
    status = "skipped_pref" if outcome["status"] == "skipped" else str(outcome["status"])
    return _outcome(
        loaded.delivery.id,
        "push",
        status,
        outcome["error"],
        bool(outcome["retryable"]),
        outcome["status"] == "skipped",
    )


async def _record_push_delivery(
    deps: EngagementDeps,
    notification_id: str,
    *,
    status: str,
    sent_at: datetime | None,
    error: str | None,
) -> queries.DeliveryRow:
    """Writes the push line of the journal: created once, updated while it is not `sent`."""
    async with deps.db.service_tx() as tx:
        existing = await queries.find_delivery(tx, notification_id=notification_id, channel="push")
        if existing is None:
            return await queries.insert_delivery(
                tx,
                notification_id=notification_id,
                channel="push",
                status=status,
                scheduled_for=None,
                error=error,
                sent_at=sent_at,
            )
        if existing.status == "sent":
            return existing
        return await queries.update_delivery_status(
            tx,
            delivery_id=existing.id,
            status=status,
            scheduled_for=None,
            sent_at=sent_at,
            error=error,
        )


async def send_push(
    deps: EngagementDeps,
    *,
    user_id: str,
    notification: Mapping[str, object],
) -> dict[str, Any]:
    """Sends one notification to every subscription of the learner and records the round."""
    payload: PushPayload = build_push_payload(notification)
    body = payload.to_json()
    now = deps.clock.now()
    async with deps.db.service_tx() as tx:
        subscriptions = await queries.list_subscriptions(tx, user_id)
    notification_id = str(notification["id"])
    if not subscriptions:
        delivery = await _record_push_delivery(
            deps,
            notification_id,
            status="skipped_pref",
            sent_at=None,
            error=PUSH_ERROR_CODES["noSubscription"],
        )
        return {
            "status": "skipped",
            "error": PUSH_ERROR_CODES["noSubscription"],
            "retryable": False,
            "payload": payload,
            "delivery": delivery,
            "attempts": [],
            "remainingSubscriptions": 0,
        }

    # 1. The push service, outside any transaction (network time never holds a connection).
    results: list[tuple[queries.SubscriptionRow, PushSendResult]] = []
    for subscription in subscriptions:
        result = await deps.push.send(
            PushTarget(
                endpoint=subscription.endpoint,
                p256dh=subscription.p256dh,
                auth=subscription.auth,
            ),
            body,
            ttl=PUSH_TTL_SECONDS,
            topic=payload.tag.replace("-", "")[:32],
        )
        results.append((subscription, result))

    # 2. One transaction for the counters, the removals and the journal (ET-5).
    attempts: list[dict[str, Any]] = []
    summaries: list[tuple[PushSendResult, bool]] = []
    async with deps.db.service_tx() as tx:
        for subscription, result in results:
            decision = decide_attempt(subscription.failure_count, result)
            if decision.removed:
                await queries.delete_subscription_by_id(tx, subscription.id)
            elif result.ok:
                await queries.reset_subscription_failures(tx, subscription_id=subscription.id, now=now)
            else:
                await queries.increment_subscription_failures(tx, subscription_id=subscription.id, now=now)
            attempts.append(
                {
                    "subscriptionId": subscription.id,
                    "endpoint": subscription.endpoint,
                    "result": result,
                    "removed": decision.removed,
                    "failureCount": decision.failure_count,
                }
            )
            summaries.append((result, decision.removed))
            deps.logger.info(
                "push attempt",
                userId=user_id,
                status=result.status_code or 0,
                outcome="sent" if result.ok else result.reason,
            )
        summary = summarize_round(summaries)
        delivery = await _record_push_delivery(
            deps,
            notification_id,
            status=summary.status,
            sent_at=now if summary.status == "sent" else None,
            error=summary.error,
        )
    return {
        "status": summary.status,
        "error": summary.error,
        "retryable": summary.retryable,
        "payload": payload,
        "delivery": delivery,
        "attempts": attempts,
        "remainingSubscriptions": len([item for item in attempts if not item["removed"]]),
    }


async def deliver_due_deliveries(deps: EngagementDeps, *, limit: int = 100) -> list[dict[str, Any]]:
    """EF-5 - re-evaluates every delivery whose instant is reached, oldest first."""
    async with deps.db.service_tx() as tx:
        due = await queries.list_due_deliveries(tx, now=deps.clock.now(), limit=limit)
    outcomes: list[dict[str, Any]] = []
    for row in due:
        outcomes.append(await deliver_notification(deps, row.id))
    return outcomes


__all__ = [
    "AUTOMATION_PREFIX",
    "DEDUPE_KEY_MAX",
    "DELIVERY_CHANNELS",
    "count_sent_notifications",
    "deliver_due_deliveries",
    "deliver_notification",
    "notify",
    "send_push",
    "settings_of",
]
