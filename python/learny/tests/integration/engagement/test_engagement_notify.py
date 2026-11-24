"""[SPEC-2205] `notify`: routing, daily cap, quiet hours, dedupe and the delivery journal.

Every assertion is taken from the pure domain (`render_notification`, `decide_delivery`) and from
the stored rows: the service is never compared with a hand-written expectation of the text. The
e-mail channel captures in memory and the push channel is mocked, so nothing leaves the process.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, count, create_user
from learny.engagement.application import inbox as inbox_service
from learny.engagement.application import notify as notify_service
from learny.engagement.domain.templates import render_notification
from learny.engagement.infrastructure.push import mock_push_endpoint
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.time import parse_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

DATA = {"formationTitle": "SAP", "moduleTitle": "Module 1", "minutes": 20, "when": "demain"}


async def settings_of_user(tx: Any, user_id: str) -> dict[str, Any]:
    result = await tx.conn.execute(
        text(
            "select channel_email, channel_push, quiet_start::text as quiet_start, "
            "quiet_end::text as quiet_end, weekend_quiet, max_per_day "
            "from public.notification_settings where user_id = cast(:user as uuid)"
        ),
        {"user": user_id},
    )
    return dict(result.mappings().one())


# The column names below are the literals of `notification_settings`, never a request value.
SET_SETTINGS_COLUMNS = {
    "channel_email",
    "channel_push",
    "quiet_start",
    "quiet_end",
    "weekend_quiet",
    "max_per_day",
}


async def set_settings(tx: Any, user_id: str, **values: Any) -> None:
    assert set(values) <= SET_SETTINGS_COLUMNS, sorted(set(values) - SET_SETTINGS_COLUMNS)
    assignments = ", ".join(f"{name} = :{name}" for name in values)
    statement = text(
        f"update public.notification_settings set {assignments} "  # noqa: S608 - literals above
        "where user_id = cast(:user as uuid)"
    )
    await tx.conn.execute(statement, {**values, "user": user_id})


async def deliveries_of(tx: Any, notification_id: str) -> dict[str, dict[str, Any]]:
    result = await tx.conn.execute(
        text(
            "select channel, status, scheduled_for, sent_at, error "
            "from public.notification_deliveries where notification_id = cast(:id as uuid)"
        ),
        {"id": notification_id},
    )
    return {row["channel"]: dict(row) for row in result.mappings()}


def by_channel(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The delivery decisions of a `notify` answer, keyed by channel."""
    return {item["channel"]: item for item in result["deliveries"]}


async def subscribe(tx: Any, user_id: str, endpoint: str) -> None:
    await tx.conn.execute(
        text(
            "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) "
            "values (cast(:user as uuid), :endpoint, 'p256dh-key', 'auth-key')"
        ),
        {"user": user_id, "endpoint": endpoint},
    )


async def test_notify_creates_the_row_and_one_delivery_per_channel(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Nina", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        result = await notify_service.notify(
            deps,
            user_id=user,
            notification_type="validation_soon",
            data=DATA,
            formation_id=None,
            dedupe_key="validation:1",
        )

        expected = render_notification("validation_soon", DATA, "vous")
        stored = await tx.conn.execute(
            text(
                "select type, title, body, href, icon, dedupe_key from public.notifications "
                "where id = cast(:id as uuid)"
            ),
            {"id": result["notificationId"]},
        )
        row = stored.mappings().one()
        journal = await deliveries_of(tx, result["notificationId"])

        assert result["created"] is True
        assert (row["title"], row["body"], row["href"], row["icon"]) == (
            expected["title"],
            expected["body"],
            "/aujourdhui",
            "clock",
        )
        assert journal["email"]["status"] == "sent"
        assert journal["email"]["sent_at"] is not None
        assert journal["push"]["status"] == "skipped_pref"
        assert journal["push"]["error"] == "no_subscription"
        assert [(item["channel"], item["status"]) for item in result["deliveries"]] == [
            ("email", "sent"),
            ("push", "skipped_pref"),
        ]
        assert len(deps.email.entries()) == 1
        assert deps.email.entries()[0].message.subject == expected["title"]

    await rolled_back(database, run)


async def test_notify_is_idempotent_on_the_dedupe_key(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Nora", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        first = await notify_service.notify(
            deps, user_id=user, notification_type="course_ready", data=DATA, dedupe_key="course:1"
        )
        second = await notify_service.notify(
            deps, user_id=user, notification_type="course_ready", data=DATA, dedupe_key="course:1"
        )

        assert first["created"] is True
        assert second["created"] is False
        assert second["notificationId"] == first["notificationId"]
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications where user_id = cast(:user as uuid)",
                user=user,
            )
            == 1
        )
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notification_deliveries "
                "where notification_id = cast(:id as uuid)",
                id=first["notificationId"],
            )
            == 2
        )
        # A single message left the application; one event per channel decided `sent` was
        # published, and the replay published none.
        assert len(deps.email.entries()) == 1
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.event_outbox "
                "where event_id like 'notification-delivery:%' and data->>'notificationId' = :id",
                id=first["notificationId"],
            )
            == 2
        )

    await rolled_back(database, run)


async def test_the_daily_cap_counts_distinct_notifications(database: Database) -> None:
    async def run(tx: Any) -> None:
        await without_other_deliveries(tx)
        user = await create_user(tx.conn, "Omar", timezone="Europe/Paris")
        await set_settings(tx, user, max_per_day=3, channel_push=False)
        deps = engagement_deps(tx)

        statuses = []
        for index, notification_type in enumerate(("validation_soon", "course_ready", "new_gap", "relaunch")):
            result = await notify_service.notify(
                deps,
                user_id=user,
                notification_type=notification_type,
                data=DATA,
                dedupe_key=f"{notification_type}:{index}",
            )
            statuses.append([item["status"] for item in result["deliveries"]])

        # The push channel is off: its decision is journalled as `skipped_pref` before the cap.
        assert [row[0] for row in statuses] == ["sent", "sent", "sent", "capped"]
        assert [row[1] for row in statuses] == ["skipped_pref"] * 4
        assert len(deps.email.entries()) == 3
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notification_deliveries where status = 'capped'",
            )
            == 1
        )

    await rolled_back(database, run)


async def test_the_programme_of_the_day_is_never_capped(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Paul", timezone="Europe/Paris")
        await set_settings(tx, user, max_per_day=3, channel_push=False)
        deps = engagement_deps(tx)
        for index in range(3):
            await notify_service.notify(
                deps,
                user_id=user,
                notification_type="relaunch",
                data=DATA,
                dedupe_key=f"relaunch:{index}",
            )

        digest = await notify_service.notify(
            deps,
            user_id=user,
            notification_type="daily_digest",
            data={"activityCount": 2, "plannedLabel": "1 h"},
        )

        assert [item["status"] for item in digest["deliveries"]] == ["sent"]
        assert digest["deliveries"][0]["channel"] == "email"

    await rolled_back(database, run)


async def test_quiet_hours_defer_the_external_send(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Quentin", timezone="Europe/Paris")
        await set_settings(tx, user, quiet_start="12:00", quiet_end="14:00", channel_push=False)
        deps = engagement_deps(tx)

        result = await notify_service.notify(
            deps, user_id=user, notification_type="validation_soon", data=DATA
        )
        journal = await deliveries_of(tx, result["notificationId"])

        assert result["deliveries"][0]["status"] == "deferred_quiet"
        assert journal["email"]["scheduled_for"] == parse_iso("2026-11-11T13:00:00Z")
        assert deps.email.entries() == ()

    await rolled_back(database, run)


async def test_the_weekend_defers_everything_but_the_revision(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Rachel", timezone="Europe/Paris")
        await set_settings(tx, user, channel_push=False)
        deps = engagement_deps(tx, now=parse_iso("2026-11-14T12:20:00Z"))

        course = await notify_service.notify(
            deps, user_id=user, notification_type="course_ready", data=DATA, dedupe_key="a"
        )
        revision = await notify_service.notify(
            deps, user_id=user, notification_type="global_quiz_today", data=DATA, dedupe_key="b"
        )
        deferred = await deliveries_of(tx, course["notificationId"])

        assert course["deliveries"][0]["status"] == "deferred_quiet"
        assert deferred["email"]["scheduled_for"] == parse_iso("2026-11-16T07:00:00Z")
        assert revision["deliveries"][0]["status"] == "sent"

    await rolled_back(database, run)


async def test_eligible_and_stale_options(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Sarah", timezone="Europe/Paris")
        await set_settings(tx, user, channel_push=False)
        deps = engagement_deps(tx)

        scheduled = await notify_service.notify(
            deps,
            user_id=user,
            notification_type="session_planned",
            data=DATA,
            dedupe_key="eligible",
            eligible_at="2026-11-12T09:00:00Z",
        )
        stale = await notify_service.notify(
            deps,
            user_id=user,
            notification_type="session_planned",
            data=DATA,
            dedupe_key="stale",
            stale_at="2026-11-11T10:00:00Z",
        )

        assert scheduled["deliveries"][0]["status"] == "scheduled"
        assert scheduled["deliveries"][0]["scheduledFor"] == "2026-11-12T09:00:00.000Z"
        assert stale["deliveries"][0]["status"] == "skipped_pref"
        assert (await deliveries_of(tx, stale["notificationId"]))["email"]["error"] == "stale"
        assert len(deps.email.entries()) == 0

    await rolled_back(database, run)


async def test_the_producer_may_restrict_the_external_channels(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Tarek", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        in_app = await notify_service.notify(
            deps,
            user_id=user,
            notification_type="validation_soon",
            data=DATA,
            dedupe_key="in-app",
            external_channels=[],
        )
        email_only = await notify_service.notify(
            deps,
            user_id=user,
            notification_type="course_ready",
            data=DATA,
            dedupe_key="email-only",
            external_channels=["email"],
        )

        assert in_app["deliveries"] == []
        assert [item["channel"] for item in email_only["deliveries"]] == ["email"]
        assert len(deps.email.entries()) == 1

    await rolled_back(database, run)


async def test_notify_refuses_an_unknown_type_and_a_missing_profile(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Ugo", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as unknown:
            await notify_service.notify(deps, user_id=user, notification_type="not_a_type", data={})
        with pytest.raises(AppError) as ghost:
            await notify_service.notify(
                deps,
                user_id="11111111-1111-4111-8111-111111111111",
                notification_type="course_ready",
                data={},
            )

        assert unknown.value.code == "VALIDATION_FAILED"
        assert ghost.value.code == "NOT_FOUND"

    await rolled_back(database, run)


async def test_delivering_twice_sends_once(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Vera", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        delivery_id = await delivery_id_of(tx, result["notificationId"], "email")
        assert len(deps.email.entries()) == 1

        replayed = await notify_service.deliver_notification(deps, delivery_id)
        again = await notify_service.deliver_notification(deps, delivery_id)

        assert replayed["status"] == "sent"
        assert replayed["skipped"] is True
        assert again["status"] == "sent"
        assert again["skipped"] is True
        assert len(deps.email.entries()) == 1

    await rolled_back(database, run)


async def without_other_deliveries(tx: Any) -> None:
    """These cases count the journal and the due sends of the whole database: the shared local stack
    also holds the demonstration dataset (deferred and capped sends), so the journal is emptied inside
    the rolled-back transaction of the test. Nothing outlives the test."""
    await tx.conn.execute(text("delete from public.notification_deliveries"))


async def delivery_id_of(tx: Any, notification_id: str, channel: str) -> str:
    """The identifier of one journal line of a notification."""
    result = await tx.conn.execute(
        text(
            "select id::text as id from public.notification_deliveries "
            "where notification_id = cast(:id as uuid) and channel = cast(:channel as delivery_channel)"
        ),
        {"id": notification_id, "channel": channel},
    )
    return str(result.mappings().one()["id"])


async def test_deliver_due_deliveries_sends_a_deferred_message(database: Database) -> None:
    async def run(tx: Any) -> None:
        await without_other_deliveries(tx)
        user = await create_user(tx.conn, "Wanda", timezone="Europe/Paris")
        await set_settings(tx, user, quiet_start="12:00", quiet_end="14:00", channel_push=False)
        early = engagement_deps(tx)
        late = engagement_deps(tx, now=parse_iso("2026-11-11T13:05:00Z"))

        result = await notify_service.notify(
            early, user_id=user, notification_type="validation_soon", data=DATA
        )
        due = await notify_service.deliver_due_deliveries(late)
        journal = await deliveries_of(tx, result["notificationId"])

        assert [item["status"] for item in due] == ["sent"]
        assert journal["email"]["status"] == "sent"
        assert len(late.email.entries()) == 1
        assert early.email.entries() == ()

    await rolled_back(database, run)


async def test_a_read_notification_abandons_its_deferred_send(database: Database) -> None:
    async def run(tx: Any) -> None:
        await without_other_deliveries(tx)
        user = await create_user(tx.conn, "Xavier", timezone="Europe/Paris")
        await set_settings(tx, user, quiet_start="12:00", quiet_end="14:00", channel_push=False)
        early = engagement_deps(tx)
        late = engagement_deps(tx, now=parse_iso("2026-11-11T13:05:00Z"))

        result = await notify_service.notify(
            early, user_id=user, notification_type="validation_soon", data=DATA
        )
        await inbox_service.mark_notification_read(early, actor_for(user), result["notificationId"])
        due = await notify_service.deliver_due_deliveries(late)
        journal = await deliveries_of(tx, result["notificationId"])

        assert [item["status"] for item in due] == ["skipped_pref"]
        assert journal["email"]["status"] == "skipped_pref"
        assert journal["email"]["error"] == "stale"
        assert late.email.entries() == ()

    await rolled_back(database, run)


async def test_the_push_round_drops_a_gone_subscription(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Yanis", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        await subscribe(tx, user, mock_push_endpoint("yanis", "gone"))
        deps = engagement_deps(tx)

        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        journal = await deliveries_of(tx, result["notificationId"])

        decisions = by_channel(result)
        assert decisions["email"]["status"] == "skipped_pref"
        assert decisions["push"] == {"channel": "push", "status": "failed", "scheduledFor": None}
        assert journal["push"]["error"] == "gone"
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.push_subscriptions "
                "where user_id = cast(:user as uuid)",
                user=user,
            )
            == 0
        )
        assert [record.outcome for record in deps.push.records()] == ["gone"]

    await rolled_back(database, run)


async def test_a_successful_push_resets_the_failure_counter(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Zoe", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        await subscribe(tx, user, mock_push_endpoint("zoe", "success"))
        await tx.conn.execute(
            text(
                "update public.push_subscriptions set failure_count = 4 where user_id = cast(:user as uuid)"
            ),
            {"user": user},
        )
        deps = engagement_deps(tx)

        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        stored = await tx.conn.execute(
            text(
                "select failure_count, last_success_at from public.push_subscriptions "
                "where user_id = cast(:user as uuid)"
            ),
            {"user": user},
        )
        row = stored.mappings().one()

        assert by_channel(result)["push"]["status"] == "sent"
        assert row["failure_count"] == 0
        assert row["last_success_at"] is not None

    await rolled_back(database, run)
