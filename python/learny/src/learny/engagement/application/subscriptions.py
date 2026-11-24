"""Push subscriptions of a learner (SPEC-2205 for the browser, SPEC-3501 for the native channels).

Every write goes through the RLS transaction of the caller: a learner only ever sees and touches
their own rows. Two partial unique indexes keep one endpoint or one device token on one account
(EF-4 of SPEC-3501); when an insert trips one of them, the resource belongs to someone else and the
answer is a neutral refusal that neither confirms nor describes the other row (CL-3, ADR-0261).

A body is either the Web Push form of SPEC-205 (`kind` absent means `webpush`) or the native form of
ADR-3007 (`kind: "apns" | "fcm"`, `token`, optional `platform` and `deviceName`). The device name is
stored in the `user_agent` column: one description column, whatever the channel.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from sqlalchemy.exc import DBAPIError

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.push_token import is_native_kind, is_valid_token, platform_of
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import to_iso

UNIQUE_VIOLATION = "23505"
DEVICE_NAME_MAX = 120


def is_unique_violation(error: BaseException) -> bool:
    """`isUniqueViolation`: walks the cause chain for the PostgreSQL `23505` SQLSTATE."""
    current: BaseException | None = error
    for _ in range(5):
        if current is None:
            return False
        for candidate in (current, getattr(current, "orig", None), current.__cause__):
            code = getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)
            if code == UNIQUE_VIOLATION:
                return True
        current = current.__cause__
    return False


def subscription_output(row: queries.SubscriptionRow, created: bool) -> dict[str, Any]:
    return {
        "id": row.id,
        "created": created,
        "createdAt": to_iso(row.created_at),
        "updatedAt": to_iso(row.updated_at),
    }


def kind_of(body: Mapping[str, Any]) -> str:
    """EF-3 - the channel of the body; an absent `kind` is the browser channel of SPEC-205."""
    value = body.get("kind")
    return value if isinstance(value, str) and value != "" else "webpush"


def _require_user(actor: Actor | None) -> Actor:
    if actor is None:
        raise AppError("UNAUTHENTICATED", fr.PUSH_UNAUTHENTICATED)
    return actor


def _device_label(body: Mapping[str, Any]) -> str | None:
    name = body.get("deviceName")
    if name is None:
        return None
    label = str(name).strip()
    return label[:DEVICE_NAME_MAX] if label != "" else None


def _require_token(body: Mapping[str, Any]) -> str:
    token = body.get("token")
    if not is_valid_token(token):
        raise AppError("VALIDATION_FAILED", fr.PUSH_TOKEN_INVALID)
    return str(token)


async def upsert_push_subscription(
    deps: EngagementDeps, actor: Actor | None, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-1 - creates the subscription of the current device, or refreshes it.

    A Web Push endpoint already registered by the caller is updated (idempotent on endpoint + owner);
    a native token already registered by the caller refreshes its description (CL-3, a reinstalled
    application). A resource registered by another account is refused with a neutral `FORBIDDEN`.
    """
    user = _require_user(actor)
    now = deps.clock.now()
    kind = kind_of(body)
    if is_native_kind(kind):
        return await _upsert_native(deps, user, body, kind=kind, now=now)
    keys = body.get("keys")
    key_map = keys if isinstance(keys, Mapping) else {}
    endpoint = str(body["endpoint"])
    p256dh = str(key_map["p256dh"])
    auth = str(key_map["auth"])
    user_agent = body.get("userAgent")
    agent = None if user_agent is None or user_agent == "" else str(user_agent)
    try:
        async with deps.db.user_tx(user) as tx:
            existing = await queries.find_subscription(tx, user_id=user.user_id, endpoint=endpoint)
            if existing is not None:
                updated = await queries.update_subscription(
                    tx,
                    subscription_id=existing.id,
                    p256dh=p256dh,
                    auth=auth,
                    user_agent=agent,
                    now=now,
                )
                return subscription_output(updated, False)
            inserted = await queries.insert_subscription(
                tx,
                user_id=user.user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                user_agent=agent,
                now=now,
            )
            return subscription_output(inserted, True)
    except DBAPIError as error:
        if not is_unique_violation(error):
            raise
        deps.logger.warn("push subscription refused", code="FORBIDDEN", outcome="foreign_endpoint")
        raise AppError("FORBIDDEN", fr.PUSH_FOREIGN_ENDPOINT) from error


async def _upsert_native(
    deps: EngagementDeps,
    user: Actor,
    body: Mapping[str, Any],
    *,
    kind: str,
    now: datetime,
) -> dict[str, Any]:
    """EF-1, CL-3 - one row per (account, channel, token); a known token refreshes its label."""
    token = _require_token(body)
    platform = platform_of(kind, body.get("platform"))
    label = _device_label(body)
    try:
        async with deps.db.user_tx(user) as tx:
            existing = await queries.find_native_subscription(
                tx, user_id=user.user_id, kind=kind, token=token
            )
            if existing is not None:
                updated = await queries.update_subscription_device(
                    tx,
                    subscription_id=existing.id,
                    platform=platform,
                    user_agent=label,
                    now=now,
                )
                return subscription_output(updated, False)
            inserted = await queries.insert_subscription(
                tx,
                user_id=user.user_id,
                kind=kind,
                endpoint=None,
                p256dh=None,
                auth=None,
                token=token,
                platform=platform,
                user_agent=label,
                now=now,
            )
            return subscription_output(inserted, True)
    except DBAPIError as error:
        if not is_unique_violation(error):
            raise
        deps.logger.warn("push subscription refused", code="FORBIDDEN", outcome="foreign_token")
        raise AppError("FORBIDDEN", fr.PUSH_FOREIGN_ENDPOINT) from error


async def remove_push_subscription(
    deps: EngagementDeps, actor: Actor | None, body: Mapping[str, Any]
) -> None:
    """EF-2 - removes the subscription of the current device; a replay answers the same success."""
    user = _require_user(actor)
    kind = kind_of(body)
    async with deps.db.user_tx(user) as tx:
        if is_native_kind(kind):
            await queries.delete_native_subscription(
                tx, user_id=user.user_id, kind=kind, token=_require_token(body)
            )
            return
        await queries.delete_subscription(tx, user_id=user.user_id, endpoint=str(body["endpoint"]))


async def list_push_subscriptions(deps: EngagementDeps, actor: Actor | None) -> list[queries.SubscriptionRow]:
    """The active subscriptions of the caller, oldest first (settings page, demonstration)."""
    user = _require_user(actor)
    async with deps.db.user_tx(user) as tx:
        return await queries.list_subscriptions(tx, user.user_id)


__all__ = [
    "DEVICE_NAME_MAX",
    "UNIQUE_VIOLATION",
    "is_unique_violation",
    "kind_of",
    "list_push_subscriptions",
    "remove_push_subscription",
    "subscription_output",
    "upsert_push_subscription",
]
