"""Browser push subscriptions of a learner (SPEC-2205).

Every write goes through the RLS transaction of the caller: a learner only ever sees and touches
their own rows. The `unique(endpoint)` constraint keeps one endpoint on one account; when the insert
trips it, the endpoint belongs to someone else and the answer is a neutral refusal that neither
confirms nor describes the other row (CL-3, ADR-0261).
"""

from collections.abc import Mapping
from typing import Any

from sqlalchemy.exc import DBAPIError

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import to_iso

UNIQUE_VIOLATION = "23505"


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


def _require_user(actor: Actor | None) -> Actor:
    if actor is None:
        raise AppError("UNAUTHENTICATED", fr.PUSH_UNAUTHENTICATED)
    return actor


async def upsert_push_subscription(
    deps: EngagementDeps, actor: Actor | None, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-1 - creates the subscription of the current browser, or refreshes its keys.

    An endpoint already registered by the caller is updated (idempotent on endpoint + owner); an
    endpoint registered by another account is refused with a neutral `FORBIDDEN` (CL-3).
    """
    user = _require_user(actor)
    now = deps.clock.now()
    keys = body.get("keys")
    key_map = keys if isinstance(keys, Mapping) else {}
    user_agent = body.get("userAgent")
    agent = None if user_agent is None or user_agent == "" else str(user_agent)
    endpoint = str(body["endpoint"])
    p256dh = str(key_map["p256dh"])
    auth = str(key_map["auth"])
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


async def remove_push_subscription(
    deps: EngagementDeps, actor: Actor | None, body: Mapping[str, Any]
) -> None:
    """EF-2 - removes the subscription of the current browser; a replay answers the same success."""
    user = _require_user(actor)
    async with deps.db.user_tx(user) as tx:
        await queries.delete_subscription(tx, user_id=user.user_id, endpoint=str(body["endpoint"]))


async def list_push_subscriptions(deps: EngagementDeps, actor: Actor | None) -> list[queries.SubscriptionRow]:
    """The active subscriptions of the caller, oldest first (settings page, demonstration)."""
    user = _require_user(actor)
    async with deps.db.user_tx(user) as tx:
        return await queries.list_subscriptions(tx, user.user_id)


__all__ = [
    "UNIQUE_VIOLATION",
    "is_unique_violation",
    "list_push_subscriptions",
    "remove_push_subscription",
    "subscription_output",
    "upsert_push_subscription",
]
