"""[SPEC-2207] Daily digest: the hourly tick plans it, `job/daily-digest` sends it once.

The planning consumer emits the internal event of ADR-2014 with its instant; the dispatcher turns
that instant into `run_after` (`step.sleepUntil` replaced), and the sending consumer creates exactly
one notification, whose dedupe key makes a replay a no-op.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import create_user
from learny.shared.db.uow import Database, Tx
from sqlalchemy import text
from support.jobs import consumer_named, count, delivery, emit_event, harness, outbox_event

pytestmark = pytest.mark.spec("SPEC-2207")

TICK_AT = "2026-11-11T05:05:00.000Z"
DIGEST_AT = "2026-11-11T05:30:00.000Z"
ACTIVE_USER = text(
    "update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris' "
    "where id = cast(:user as uuid)"
)
DIGEST_SETTINGS = text(
    "update public.notification_settings set digest_time = '06:30' where user_id = cast(:user as uuid)"
)


async def active_learner(tx: Tx, first_name: str) -> str:
    user = await create_user(tx.conn, first_name, timezone="Europe/Paris")
    await tx.conn.execute(ACTIVE_USER, {"user": user})
    await tx.conn.execute(DIGEST_SETTINGS, {"user": user})
    return user


async def notifications_of(tx: Tx, user: str) -> int:
    return await count(
        tx,
        "select count(*)::int from public.notifications "
        "where user_id = cast(:user as uuid) and type = 'daily_digest'",
        user=user,
    )


async def test_an_hourly_tick_plans_then_sends_the_digest_once(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await active_learner(tx, "Camille")
        tick = await emit_event(tx, "cron/hourly-tick", {"tickAt": TICK_AT}, "spec-2207:hourly-digest")

        planner = harness(tx, ("engagement.plan_daily_digests",))
        planned = await planner.drain()
        digest_id = f"daily-digest:{user}:{DIGEST_AT}"
        planned_event = await outbox_event(tx, digest_id)
        planned_delivery = await delivery(tx, tick, "engagement.plan_daily_digests")

        sender = harness(tx, ("engagement.send_daily_digest",))
        sent = await sender.drain()
        digest_delivery = await delivery(tx, digest_id, "engagement.send_daily_digest")
        created = await notifications_of(tx, user)

        replay = await sender.drain()
        after_replay = await notifications_of(tx, user)
        return {
            "planned": planned,
            "planned_event": planned_event,
            "planned_delivery": planned_delivery,
            "sent": sent,
            "digest_delivery": digest_delivery,
            "created": created,
            "replay": replay,
            "after_replay": after_replay,
        }

    result = await rolled_back(database, run)

    assert result["planned"][1] == 1
    assert result["planned_event"] is not None
    assert result["planned_event"]["name"] == "job/daily-digest"
    assert result["planned_event"]["data"]["userId"] == result["planned_event"]["data"]["userId"]
    assert result["planned_delivery"] is not None
    assert result["planned_delivery"]["status"] == "done"

    # `run_at = data.at`: the delivery waits for the digest instant, not for the tick.
    assert result["digest_delivery"] is not None
    assert result["digest_delivery"]["run_after"].isoformat() == "2026-11-11T05:30:00+00:00"
    assert result["digest_delivery"]["status"] == "done"

    assert result["created"] == 1
    assert result["replay"][1] == 0
    assert result["after_replay"] == 1


async def test_the_planned_event_carries_the_user_and_its_instant(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await active_learner(tx, "Diane")
        await emit_event(tx, "cron/hourly-tick", {"tickAt": TICK_AT}, "spec-2207:hourly-digest-2")
        planner = harness(tx, ("engagement.plan_daily_digests",))
        await planner.drain()
        event = await outbox_event(tx, f"daily-digest:{user}:{DIGEST_AT}")
        consumer = consumer_named("engagement.send_daily_digest")
        return {"event": event, "user": user, "run_at": consumer.run_at is not None}

    result = await rolled_back(database, run)

    assert result["event"] is not None
    assert result["event"]["data"] == {"userId": result["user"], "at": DIGEST_AT}
    assert result["run_at"] is True


async def test_the_digest_waits_for_its_instant_when_it_is_still_ahead(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await active_learner(tx, "Elsa")
        digest_id = f"daily-digest:{user}:2026-11-11T23:30:00.000Z"
        await emit_event(
            tx,
            "job/daily-digest",
            {"userId": user, "at": "2026-11-11T23:30:00.000Z"},
            digest_id,
        )
        sender = harness(tx, ("engagement.send_daily_digest",))
        created = await sender.dispatcher.dispatch_once()
        state = await delivery(tx, digest_id, "engagement.send_daily_digest")
        ran = await sender.runner.run_once()
        notifications = await notifications_of(tx, user)
        return {"created": created, "state": state, "ran": ran, "notifications": notifications}

    result = await rolled_back(database, run)

    assert result["created"] == 1
    assert result["state"] is not None
    assert result["state"]["status"] == "pending"
    assert result["state"]["run_after"].isoformat() == "2026-11-11T23:30:00+00:00"
    assert result["ran"] == 0
    assert result["notifications"] == 0
