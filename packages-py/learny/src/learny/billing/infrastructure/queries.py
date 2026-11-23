"""SQL of the billing context (SPEC-2206).

The billing service acts with the owner role; every function takes the transaction as its first
parameter so a use case can chain them in one unit of work.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

INSERT_SUBSCRIPTION = text(
    "insert into public.subscriptions (user_id) values (cast(:user_id as uuid)) "
    "on conflict (user_id) do nothing"
)
SELECT_SUBSCRIPTION = text(
    "select user_id::text as user_id, status::text as status, stripe_customer_id, "
    "stripe_subscription_id, current_period_end, stripe_event_at, updated_at "
    "from public.subscriptions where user_id = cast(:user_id as uuid)"
)
LOCK_SUBSCRIPTION = text(
    "select user_id::text as user_id, status::text as status, stripe_customer_id, "
    "stripe_subscription_id, current_period_end, stripe_event_at, updated_at "
    "from public.subscriptions where user_id = cast(:user_id as uuid) for update"
)
LOCK_BY_CUSTOMER = text(
    "select user_id::text as user_id, status::text as status, stripe_customer_id, "
    "stripe_subscription_id, current_period_end, stripe_event_at, updated_at "
    "from public.subscriptions where stripe_customer_id = :customer_id for update"
)
SET_CUSTOMER = text(
    "update public.subscriptions set stripe_customer_id = :customer_id, updated_at = :now "
    "where user_id = cast(:user_id as uuid)"
)
CLAIM_EVENT = text(
    "insert into public.stripe_events (event_id, type, created_at) "
    "values (:event_id, :type, :created_at) on conflict (event_id) do nothing "
    "returning event_id"
)
MARK_PROCESSED = text("update public.stripe_events set processed_at = :now where event_id = :event_id")
APPLY_STATE = text(
    "update public.subscriptions set status = :status, "
    "stripe_customer_id = coalesce(stripe_customer_id, :customer_id), "
    "stripe_subscription_id = :subscription_id, current_period_end = :current_period_end, "
    "stripe_event_at = :stripe_event_at, updated_at = :now "
    "where user_id = cast(:user_id as uuid)"
)
PROFILE_EMAIL = text("select email from public.profiles where id = cast(:user_id as uuid)")
MOCK_COUNTERS = text(
    "select "
    "(select max(substring(stripe_customer_id from 'cus_mock_([0-9]+)$')::int) "
    " from public.subscriptions) as customer, "
    "(select max(substring(stripe_subscription_id from 'sub_mock_([0-9]+)$')::int) "
    " from public.subscriptions) as subscription, "
    "(select max(substring(event_id from 'evt_mock_([0-9]+)$')::int) "
    " from public.stripe_events) as event"
)


@dataclass(frozen=True, slots=True)
class SubscriptionRow:
    """One row of `subscriptions` (data-model section 9)."""

    user_id: str
    status: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    current_period_end: datetime | None
    stripe_event_at: datetime | None
    updated_at: datetime | None


def _row(record: Any) -> SubscriptionRow:
    data = dict(record)
    return SubscriptionRow(
        user_id=str(data["user_id"]),
        status=str(data["status"]),
        stripe_customer_id=data["stripe_customer_id"],
        stripe_subscription_id=data["stripe_subscription_id"],
        current_period_end=data["current_period_end"],
        stripe_event_at=data["stripe_event_at"],
        updated_at=data["updated_at"],
    )


async def insert_subscription(tx: Tx, user_id: str) -> None:
    """`insert(subscriptions).values({userId}).onConflictDoNothing()` (EF-1)."""
    await tx.conn.execute(INSERT_SUBSCRIPTION, {"user_id": user_id})


async def select_subscription(tx: Tx, user_id: str) -> SubscriptionRow | None:
    """The learner's subscription, without a lock (EF-3)."""
    result = await tx.conn.execute(SELECT_SUBSCRIPTION, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else _row(found[0])


async def lock_subscription(tx: Tx, user_id: str) -> SubscriptionRow | None:
    """`select ... for update`: two simultaneous clicks create a single customer (CL-6)."""
    result = await tx.conn.execute(LOCK_SUBSCRIPTION, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else _row(found[0])


async def lock_subscription_by_customer(tx: Tx, customer_id: str) -> SubscriptionRow | None:
    """`where stripeCustomerId = ... for update`, the fallback of `findRow` (EF-4)."""
    result = await tx.conn.execute(LOCK_BY_CUSTOMER, {"customer_id": customer_id})
    found = result.mappings().all()
    return None if not found else _row(found[0])


async def set_customer(tx: Tx, user_id: str, customer_id: str, now: datetime) -> None:
    """Stores the Stripe customer created on the first Checkout (EF-1)."""
    await tx.conn.execute(SET_CUSTOMER, {"user_id": user_id, "customer_id": customer_id, "now": now})


async def claim_event(tx: Tx, event_id: str, event_type: str, created_at: datetime) -> bool:
    """`insert(stripeEvents).onConflictDoNothing().returning()`: True when this delivery is new."""
    result = await tx.conn.execute(
        CLAIM_EVENT, {"event_id": event_id, "type": event_type, "created_at": created_at}
    )
    return len(result.mappings().all()) > 0


async def mark_processed(tx: Tx, event_id: str, now: datetime) -> None:
    """The delivery was applied or consciously ignored (EF-4)."""
    await tx.conn.execute(MARK_PROCESSED, {"event_id": event_id, "now": now})


async def apply_subscription_state(
    tx: Tx,
    user_id: str,
    *,
    status: str,
    customer_id: str,
    subscription_id: str,
    current_period_end: datetime,
    stripe_event_at: datetime,
    now: datetime,
) -> None:
    """Writes the state re-read from Stripe and the instant of the event (ET-3)."""
    await tx.conn.execute(
        APPLY_STATE,
        {
            "user_id": user_id,
            "status": status,
            "customer_id": customer_id,
            "subscription_id": subscription_id,
            "current_period_end": current_period_end,
            "stripe_event_at": stripe_event_at,
            "now": now,
        },
    )


async def profile_email(tx: Tx, user_id: str) -> str | None:
    """The profile e-mail of the future Stripe customer (EF-1)."""
    result = await tx.conn.execute(PROFILE_EMAIL, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else found[0]["email"]


async def mock_counters(tx: Tx) -> dict[str, int]:
    """Highest simulated identifiers already in the database (mock mode restart, EF-7)."""
    result = await tx.conn.execute(MOCK_COUNTERS)
    found = result.mappings().all()
    if not found:
        return {"customer": 0, "subscription": 0, "event": 0}
    data = dict(found[0])
    return {
        "customer": int(data["customer"] or 0),
        "subscription": int(data["subscription"] or 0),
        "event": int(data["event"] or 0),
    }
