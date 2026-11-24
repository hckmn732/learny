"""[SPEC-3501] Native push subscriptions and routing against the local stack.

The suite runs inside a transaction that is always rolled back, with the push channels in
`PUSH_MODE=mock`: the native sends land in the demonstration box of the round instead of reaching
Apple or Google (EF-6). What is asserted is the stored row, the journal line, the demonstration box
and the delivery counter - never a hand-written expectation of a provider answer.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, count, create_user
from learny.engagement.application import notify as notify_service
from learny.engagement.application import subscriptions as push_service
from learny.engagement.infrastructure.push import mock_native_token, mock_push_endpoint
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.time import parse_iso
from learny_api.generated.models import PushSubscriptionsUpsertOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-3501")

DATA = {"formationTitle": "SAP", "moduleTitle": "Module 1", "minutes": 20, "when": "demain"}
TOKEN = "fcm-token-0123456789abcdef"
SET_SETTINGS_COLUMNS = {
    "channel_email",
    "channel_push",
    "quiet_start",
    "quiet_end",
    "weekend_quiet",
    "max_per_day",
}


def native_body(
    *,
    kind: str = "fcm",
    token: str = TOKEN,
    device_name: str | None = "Pixel 8",
    platform: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"kind": kind, "token": token, "deviceName": device_name}
    if platform is not None:
        body["platform"] = platform
    return body


async def stored(tx: Any, user_id: str) -> list[dict[str, Any]]:
    result = await tx.conn.execute(
        text(
            "select kind, endpoint, token, platform, user_agent, failure_count "
            "from public.push_subscriptions where user_id = cast(:user as uuid) order by created_at"
        ),
        {"user": user_id},
    )
    return [dict(row) for row in result.mappings()]


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


async def push_delivery_id(tx: Any, notification_id: str) -> str:
    result = await tx.conn.execute(
        text(
            "select id from public.notification_deliveries "
            "where notification_id = cast(:id as uuid) and channel = 'push'"
        ),
        {"id": notification_id},
    )
    return str(result.mappings().one()["id"])


# --- EF-1: registration -------------------------------------------------------------------------


async def test_a_native_subscription_is_created_with_its_kind_and_token(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Naelle", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        created = await push_service.upsert_push_subscription(
            deps, actor_for(user), native_body(platform="android")
        )
        rows = await stored(tx, user)

        assert PushSubscriptionsUpsertOutput.model_validate(created).created is True
        assert len(rows) == 1
        assert rows[0] == {
            "kind": "fcm",
            "endpoint": None,
            "token": TOKEN,
            "platform": "android",
            "user_agent": "Pixel 8",
            "failure_count": 0,
        }

    await rolled_back(database, run)


async def test_the_platform_follows_the_channel_when_the_body_omits_it(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Noe", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        await push_service.upsert_push_subscription(
            deps, actor_for(user), native_body(kind="apns", token="a" * 64)
        )
        rows = await stored(tx, user)

        assert rows[0]["kind"] == "apns"
        assert rows[0]["platform"] == "ios"

    await rolled_back(database, run)


async def test_a_webpush_body_without_kind_stays_the_browser_channel(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Olive", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        created = await push_service.upsert_push_subscription(
            deps,
            actor_for(user),
            {
                "endpoint": mock_push_endpoint("olive", "success"),
                "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
                "userAgent": "Firefox",
            },
        )
        rows = await stored(tx, user)

        assert created["created"] is True
        assert rows[0]["kind"] == "webpush"
        assert rows[0]["token"] is None
        assert rows[0]["endpoint"] == mock_push_endpoint("olive", "success")

    await rolled_back(database, run)


async def test_a_known_device_token_refreshes_its_description_instead_of_adding_a_row(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Pia", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        created = await push_service.upsert_push_subscription(
            deps, actor_for(user), native_body(device_name="Pixel 8")
        )
        refreshed = await push_service.upsert_push_subscription(
            deps, actor_for(user), native_body(device_name="Pixel 8 Pro", platform="android")
        )
        rows = await stored(tx, user)

        assert refreshed["created"] is False
        assert refreshed["id"] == created["id"]
        assert len(rows) == 1
        assert rows[0]["user_agent"] == "Pixel 8 Pro"

    await rolled_back(database, run)


async def test_a_malformed_token_is_refused_before_any_write(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Quentin", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as raised:
            await push_service.upsert_push_subscription(deps, actor_for(user), native_body(token="short"))

        assert raised.value.code == "VALIDATION_FAILED"
        assert await stored(tx, user) == []

    await rolled_back(database, run)


async def test_two_accounts_may_register_the_same_device_token(database: Database) -> None:
    """CL-3 - a token belongs to an installation, not to an account: the uniqueness is per learner."""

    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        await push_service.upsert_push_subscription(deps, actor_for(alice), native_body())
        await push_service.upsert_push_subscription(deps, actor_for(bob), native_body())

        assert len(await stored(tx, alice)) == 1
        assert len(await stored(tx, bob)) == 1

    await rolled_back(database, run)


async def test_removing_a_token_is_idempotent_and_scoped_to_the_caller(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(deps, actor_for(bob), native_body())

        await push_service.remove_push_subscription(deps, actor_for(alice), native_body())
        assert len(await stored(tx, bob)) == 1

        await push_service.remove_push_subscription(deps, actor_for(bob), native_body())
        await push_service.remove_push_subscription(deps, actor_for(bob), native_body())
        assert await stored(tx, bob) == []

    await rolled_back(database, run)


async def test_an_anonymous_native_registration_is_refused(database: Database) -> None:
    async def run(tx: Any) -> None:
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as raised:
            await push_service.upsert_push_subscription(deps, None, native_body())

        assert raised.value.code == "UNAUTHENTICATED"

    await rolled_back(database, run)


# --- EF-5, ET-3: routing, journal and demonstration box -----------------------------------------


async def test_a_native_round_sends_through_its_channel_and_journals_it(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Romy", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(deps, actor_for(user), native_body())

        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        journal = await deliveries_of(tx, result["notificationId"])
        records = deps.push.records()

        assert journal["push"]["status"] == "sent"
        assert len(records) == 1
        assert records[0].kind == "fcm"
        assert records[0].target.endswith(TOKEN[-4:])
        assert TOKEN not in records[0].target
        assert "Quiz" not in records[0].target
        assert records[0].payload_bytes > 0

    await rolled_back(database, run)


async def test_a_dead_native_token_removes_the_subscription_at_once(database: Database) -> None:
    """CL-2 - a 410/UNREGISTERED token is never retried: the row goes with the failed delivery."""

    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Sami", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(
            deps, actor_for(user), native_body(token=mock_native_token("dead", "gone"))
        )

        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        journal = await deliveries_of(tx, result["notificationId"])

        assert journal["push"]["status"] == "failed"
        assert journal["push"]["error"] == "gone"
        assert await stored(tx, user) == []

    await rolled_back(database, run)


async def test_five_consecutive_transient_failures_remove_the_subscription(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Tessa", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(
            deps, actor_for(user), native_body(token=mock_native_token("down", "transient"))
        )

        for index in range(4):
            await notify_service.notify(
                deps,
                user_id=user,
                notification_type="course_ready",
                data=DATA,
                dedupe_key=f"transient:{index}",
            )
        rows = await stored(tx, user)
        assert rows[0]["failure_count"] == 4

        await notify_service.notify(
            deps, user_id=user, notification_type="course_ready", data=DATA, dedupe_key="transient:4"
        )

        assert await stored(tx, user) == []
        assert all(record.outcome == "transient" for record in deps.push.records())

    await rolled_back(database, run)


async def test_a_resumed_delivery_is_never_sent_twice(database: Database) -> None:
    """ET-3 - replaying a delivery that is already `sent` writes nothing to the demonstration box."""

    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Ulysse", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(deps, actor_for(user), native_body())

        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        delivery_id = await push_delivery_id(tx, result["notificationId"])
        replay = await notify_service.deliver_notification(deps, delivery_id)

        assert replay["skipped"] is True
        assert len(deps.push.records()) == 1
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notification_deliveries "
                "where notification_id = cast(:id as uuid) and channel = 'push'",
                id=result["notificationId"],
            )
            == 1
        )

    await rolled_back(database, run)


async def test_quiet_hours_defer_a_native_send_until_the_plage_ends(database: Database) -> None:
    """BR-NOT-06, CA-2 - nothing leaves during the quiet hours; the send is replayed afterwards."""

    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Vera", timezone="Europe/Paris")
        await set_settings(tx, user, quiet_start="12:00", quiet_end="14:00", channel_email=False)
        early = engagement_deps(tx)
        late = engagement_deps(tx, now=parse_iso("2026-11-11T13:05:00Z"))
        await push_service.upsert_push_subscription(early, actor_for(user), native_body())

        result = await notify_service.notify(early, user_id=user, notification_type="course_ready", data=DATA)
        journal = await deliveries_of(tx, result["notificationId"])
        assert journal["push"]["status"] == "deferred_quiet"
        assert early.push.records() == ()

        due = await notify_service.deliver_due_deliveries(late)
        journal = await deliveries_of(tx, result["notificationId"])

        assert [item["status"] for item in due] == ["sent"]
        assert journal["push"]["status"] == "sent"
        assert len(late.push.records()) == 1

    await rolled_back(database, run)


async def test_the_daily_cap_counts_a_native_send_like_the_other_channels(database: Database) -> None:
    """BR-NOT-05 - the cap is per notification: a native send counts once, like e-mail and Web Push."""

    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Wanda", timezone="Europe/Paris")
        await set_settings(tx, user, max_per_day=3, channel_email=False)
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(deps, actor_for(user), native_body())

        statuses = []
        for index in range(4):
            result = await notify_service.notify(
                deps,
                user_id=user,
                notification_type="course_ready",
                data=DATA,
                dedupe_key=f"cap:{index}",
            )
            statuses.append({item["channel"]: item["status"] for item in result["deliveries"]}["push"])

        assert statuses == ["sent", "sent", "sent", "capped"]
        assert len(deps.push.records()) == 3

    await rolled_back(database, run)


async def test_the_browser_channel_still_reaches_its_endpoint(database: Database) -> None:
    """CA-5 - no regression of SPEC-205: the Web Push round is unchanged next to the native one."""

    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Xena", timezone="Europe/Paris")
        await set_settings(tx, user, channel_email=False)
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(
            deps,
            actor_for(user),
            {
                "kind": "webpush",
                "endpoint": mock_push_endpoint("xena", "success"),
                "keys": {"p256dh": "p256dh-key", "auth": "auth-key"},
            },
        )
        await push_service.upsert_push_subscription(deps, actor_for(user), native_body())

        result = await notify_service.notify(deps, user_id=user, notification_type="course_ready", data=DATA)
        records = deps.push.records()
        journal = await deliveries_of(tx, result["notificationId"])

        assert journal["push"]["status"] == "sent"
        assert sorted(record.kind for record in records) == ["fcm", "webpush"]
        assert json.loads(records[0].payload).keys() == json.loads(records[1].payload).keys()

    await rolled_back(database, run)
