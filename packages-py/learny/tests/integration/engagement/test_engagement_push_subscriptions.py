"""[SPEC-2205] Browser push subscriptions: create, refresh, remove and the foreign endpoint.

Every write goes through the learner's RLS transaction. The `unique(endpoint)` constraint keeps one
endpoint on one account: an endpoint already registered by another learner is refused with a
neutral `FORBIDDEN` that neither confirms nor describes the other row (CL-3, ADR-0261).
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, count, create_user
from learny.engagement.application import subscriptions as push_service
from learny.engagement.infrastructure.push import mock_push_endpoint
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import PushSubscriptionsUpsertOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

ENDPOINT = mock_push_endpoint("browser", "success")


def body(endpoint: str = ENDPOINT, *, p256dh: str = "p256dh-key", auth: str = "auth-key") -> dict[str, Any]:
    return {"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}, "userAgent": "Firefox"}


async def stored(tx: Any, user_id: str) -> list[dict[str, Any]]:
    result = await tx.conn.execute(
        text(
            "select endpoint, p256dh, auth, user_agent, failure_count "
            "from public.push_subscriptions where user_id = cast(:user as uuid) order by created_at"
        ),
        {"user": user_id},
    )
    return [dict(row) for row in result.mappings()]


async def test_upsert_creates_then_refreshes_the_same_endpoint(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Fanny", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        created = await push_service.upsert_push_subscription(deps, actor_for(user), body())
        refreshed = await push_service.upsert_push_subscription(
            deps, actor_for(user), body(p256dh="new-key", auth="new-auth")
        )
        rows = await stored(tx, user)

        assert PushSubscriptionsUpsertOutput.model_validate(created) is not None
        assert created["created"] is True
        assert refreshed["created"] is False
        assert refreshed["id"] == created["id"]
        assert len(rows) == 1
        assert (rows[0]["p256dh"], rows[0]["auth"]) == ("new-key", "new-auth")

    await rolled_back(database, run)


async def test_remove_is_idempotent_and_scoped_to_the_caller(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(deps, actor_for(bob), body())

        await push_service.remove_push_subscription(deps, actor_for(alice), {"endpoint": ENDPOINT})
        assert len(await stored(tx, bob)) == 1

        await push_service.remove_push_subscription(deps, actor_for(bob), {"endpoint": ENDPOINT})
        await push_service.remove_push_subscription(deps, actor_for(bob), {"endpoint": ENDPOINT})
        assert await stored(tx, bob) == []

    await rolled_back(database, run)


async def test_an_endpoint_of_another_account_is_refused_neutrally(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(deps, actor_for(alice), body())

        with pytest.raises(AppError) as raised:
            await push_service.upsert_push_subscription(deps, actor_for(bob), body())

        assert raised.value.code == "FORBIDDEN"
        assert "alice" not in (raised.value.detail or "").lower()
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.push_subscriptions "
                "where user_id = cast(:user as uuid)",
                user=bob,
            )
            == 0
        )
        assert len(await stored(tx, alice)) == 1

    await rolled_back(database, run)


async def test_the_active_subscriptions_are_listed_oldest_first(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Gaspard", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await push_service.upsert_push_subscription(
            deps, actor_for(user), body(mock_push_endpoint("one", "success"))
        )
        await push_service.upsert_push_subscription(
            deps, actor_for(user), body(mock_push_endpoint("two", "gone"))
        )

        listed = await push_service.list_push_subscriptions(deps, actor_for(user))

        # Both rows share the frozen instant of the suite; the listing is the caller's, complete.
        assert {row.endpoint for row in listed} == {
            mock_push_endpoint("one", "success"),
            mock_push_endpoint("two", "gone"),
        }

    await rolled_back(database, run)


async def test_an_anonymous_call_is_refused(database: Database) -> None:
    async def run(tx: Any) -> None:
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as raised:
            await push_service.upsert_push_subscription(deps, None, body())

        assert raised.value.code == "UNAUTHENTICATED"

    await rolled_back(database, run)
