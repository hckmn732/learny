"""[SPEC-2206] Subscription service against the local stack (SPEC-210 CA-1 to CA-5).

Postgres is real (RLS, constraints, the `enqueue_event` function, row locks); Stripe is the simulated
gateway of `STRIPE_MODE=mock`, signed like the real one. The clock is frozen at 2026-11-11T12:20:00Z
and only advanced explicitly (ADR-0047).
"""

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import pytest
import structlog
from factories.db_support import rolled_back
from factories.engagement_deps import EngagementTransactions
from factories.identity_support import FIXED, actor_for, create_user
from learny.billing.application.checkout import get_subscription, open_portal, start_checkout
from learny.billing.application.webhook import handle_webhook
from learny.billing.domain.config import resolve_billing_config
from learny.platform.stripe import MockStripeGateway, WebhookJournal
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2206")

WEBHOOK_KEY = "learny-integration-signing-value"
SUCCESS = {"successPath": "/_dev/sdd/SPEC-2206", "cancelPath": "/_dev/sdd/SPEC-2206"}
DAY = timedelta(days=1)


@dataclass
class BillingTestDeps:
    """The bundle the billing use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: EngagementTransactions
    logger: Any
    stripe: MockStripeGateway
    webhook_journal: WebhookJournal


def deps(tx: Any) -> BillingTestDeps:
    clock = FixedClock(FIXED)
    return BillingTestDeps(
        settings=Settings(app_env="test", stripe_mode="mock"),
        clock=clock,
        db=EngagementTransactions(tx),
        logger=structlog.get_logger("learny.test"),
        stripe=MockStripeGateway(clock, WEBHOOK_KEY),
        webhook_journal=WebhookJournal(),
    )


async def outbox_names(tx: Any, user_id: str) -> list[str]:
    result = await tx.conn.execute(
        text("select name from public.event_outbox where user_id = cast(:user as uuid) order by name"),
        {"user": user_id},
    )
    return [str(row["name"]) for row in result.mappings().all()]


async def row(tx: Any, user_id: str) -> dict[str, Any] | None:
    result = await tx.conn.execute(
        text(
            "select status::text as status, stripe_customer_id, stripe_subscription_id, "
            "current_period_end, stripe_event_at from public.subscriptions "
            "where user_id = cast(:user as uuid)"
        ),
        {"user": user_id},
    )
    found = result.mappings().all()
    return None if not found else dict(found[0])


async def count_events(tx: Any) -> tuple[int, int]:
    result = await tx.conn.execute(
        text("select count(*)::int as n, count(processed_at)::int as processed from public.stripe_events")
    )
    data = dict(result.mappings().one())
    return (int(data["n"]), int(data["processed"]))


async def test_the_whole_checkout_cycle_opens_then_cancels_the_subscription(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Cycle")
        bundle = deps(tx)
        actor = actor_for(user)

        assert await get_subscription(bundle, actor) == {"status": "none", "currentPeriodEnd": None}

        checkout = await start_checkout(bundle, actor, SUCCESS)
        assert checkout["url"] == "/_dev/stripe/checkout?session=cs_mock_1"
        assert (await row(tx, user))["stripe_customer_id"] == "cus_mock_1"

        paid = await handle_webhook(
            bundle, *(lambda d: (d.payload, d.signature))(bundle.stripe.complete_checkout("cs_mock_1"))
        )
        assert paid.result == "applied"
        active = await get_subscription(bundle, actor)
        assert active["status"] == "active"
        assert active["currentPeriodEnd"] == (FIXED + 30 * DAY).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )

        with pytest.raises(AppError) as raised:
            await start_checkout(bundle, actor, SUCCESS)
        assert raised.value.code == "ALREADY_SUBSCRIBED"

        delivery = bundle.stripe.cancel_subscription("sub_mock_1")
        ended = await handle_webhook(bundle, delivery.payload, delivery.signature)
        assert ended.result == "applied"
        assert (await get_subscription(bundle, actor))["status"] == "canceled"
        assert await outbox_names(tx, user) == [
            "billing/subscription-changed",
            "billing/subscription-changed",
        ]
        assert (await start_checkout(bundle, actor, SUCCESS))[
            "url"
        ] == "/_dev/stripe/checkout?session=cs_mock_2"

    await rolled_back(database, run)


async def test_an_invalid_signature_writes_nothing(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Signature")
        bundle = deps(tx)
        actor = actor_for(user)
        await start_checkout(bundle, actor, SUCCESS)
        delivery = bundle.stripe.complete_checkout("cs_mock_1")

        past = bundle.stripe.sign(delivery.payload, FIXED - timedelta(seconds=301))
        for signature in (None, "garbage", past):
            with pytest.raises(AppError) as raised:
                await handle_webhook(bundle, delivery.payload, signature)
            assert raised.value.code == "INVALID_SIGNATURE"
        with pytest.raises(AppError):
            await handle_webhook(bundle, f"{delivery.payload} ", delivery.signature)

        assert await count_events(tx) == (0, 0)
        assert (await row(tx, user))["status"] == "none"
        assert (
            await handle_webhook(bundle, delivery.payload, bundle.stripe.sign(delivery.payload))
        ).result == "applied"

    await rolled_back(database, run)


async def test_a_replayed_delivery_has_a_single_effect(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Doublon")
        bundle = deps(tx)
        await start_checkout(bundle, actor_for(user), SUCCESS)
        delivery = bundle.stripe.complete_checkout("cs_mock_1")

        assert (await handle_webhook(bundle, delivery.payload, delivery.signature)).result == "applied"
        assert (await handle_webhook(bundle, delivery.payload, delivery.signature)).result == "duplicate"
        assert (
            await handle_webhook(bundle, delivery.payload, bundle.stripe.sign(delivery.payload))
        ).result == "duplicate"

        assert await count_events(tx) == (1, 1)
        assert await outbox_names(tx, user) == ["billing/subscription-changed"]
        assert [entry.result for entry in bundle.webhook_journal.list(user)] == [
            "applied",
            "duplicate",
            "duplicate",
        ]

    await rolled_back(database, run)


async def test_an_older_event_never_overwrites_a_newer_state(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Ordre")
        bundle = deps(tx)
        now = int(FIXED.timestamp())
        await start_checkout(bundle, actor_for(user), SUCCESS)
        paid = bundle.stripe.complete_checkout("cs_mock_1", created=now)
        await handle_webhook(bundle, paid.payload, paid.signature)

        newer = bundle.stripe.cancel_subscription("sub_mock_1", created=now + 10)
        assert (await handle_webhook(bundle, newer.payload, newer.signature)).result == "applied"
        older = bundle.stripe.renew_subscription("sub_mock_1", created=now + 5)
        assert (await handle_webhook(bundle, older.payload, older.signature)).result == "stale"
        assert (await row(tx, user))["status"] == "canceled"

        bundle.stripe.set_subscription_state("sub_mock_1", "active")
        same_second = bundle.stripe.renew_subscription("sub_mock_1", created=now + 10)
        assert (await handle_webhook(bundle, same_second.payload, same_second.signature)).result == "applied"
        assert (await row(tx, user))["status"] == "active"

    await rolled_back(database, run)


async def test_an_unknown_customer_is_acknowledged_without_creating_a_user(database: Database) -> None:
    async def run(tx: Any) -> None:
        bundle = deps(tx)
        before = await tx.conn.execute(text("select count(*)::int as n from auth.users"))
        stranger = bundle.stripe.create_event(
            "customer.subscription.updated",
            {"id": "sub_mock_77", "customer": "cus_unknown_0042", "status": "active", "metadata": {}},
        )
        assert (
            await handle_webhook(bundle, stranger.payload, stranger.signature)
        ).result == "unknown_customer"
        processed = await tx.conn.execute(
            text("select processed_at from public.stripe_events where event_id = :event"),
            {"event": stranger.event_id},
        )
        assert processed.mappings().one()["processed_at"] is not None
        after = await tx.conn.execute(text("select count(*)::int as n from auth.users"))
        assert after.scalar_one() == before.scalar_one()
        assert bundle.webhook_journal.last("x") is None

    await rolled_back(database, run)


async def test_external_return_paths_are_refused_before_any_write(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chemin")
        bundle = deps(tx)
        for path in ("https://evil.example/x", "//evil.example", "x"):
            with pytest.raises(AppError) as raised:
                await start_checkout(bundle, actor_for(user), {"successPath": path, "cancelPath": "/ko"})
            assert raised.value.code == "VALIDATION_FAILED"
        assert await row(tx, user) is None
        assert bundle.stripe.state.counters["customer"] == 0

    await rolled_back(database, run)


async def test_the_portal_needs_a_stripe_customer_then_returns_the_settings_tab(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Portail")
        bundle = deps(tx)
        with pytest.raises(AppError) as raised:
            await open_portal(bundle, actor_for(user))
        assert raised.value.code == "NOT_FOUND"
        await start_checkout(bundle, actor_for(user), SUCCESS)
        portal = await open_portal(bundle, actor_for(user))
        assert portal["url"] == "/_dev/stripe/portal?return=%2Fparametres%23abonnement"

    await rolled_back(database, run)


async def test_the_configuration_of_the_suite_is_the_simulated_mode() -> None:
    config = resolve_billing_config({"APP_ENV": "test", "STRIPE_MODE": "mock"})
    assert (config.mode, config.app_url) == ("mock", "http://localhost:3000")
