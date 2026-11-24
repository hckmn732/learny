"""[SPEC-2205] Inbox of the notification panel: list, read, read-all and the unread counter.

The four reads and mutations run under the learner's own RLS transaction (BR-NOT-01, ET-2): another
learner's notification is neither listed, counted nor updated, and a foreign identifier answers
NOT_FOUND without revealing whether the row exists.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, count, create_notification, create_user
from learny.engagement.application import inbox as inbox_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import (
    NotificationsListOutput,
    NotificationsReadAllOutput,
    NotificationsReadOutput,
    NotificationsUnreadCountOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")


async def seed_inbox(conn: Any, user_id: str) -> None:
    """Three notifications: one read the day before, two unread today."""
    await conn.execute(
        text(
            """
            insert into public.notifications (user_id, type, title, body, href, icon, read_at, created_at)
            values
              (cast(:user as uuid), 'course_ready', 'Course ready', 'Your course is ready.',
               '/formations', 'book-open', now(), '2026-11-11T09:00:00.000Z'),
              (cast(:user as uuid), 'new_gap', 'Gap', 'A notion to review.',
               '/formations', 'alert-triangle', null, '2026-11-11T09:30:00.000Z'),
              (cast(:user as uuid), 'course_ready', 'Yesterday', 'A notification of the day before.',
               '/formations', 'book-open', null, '2026-11-10T09:00:00.000Z')
            """
        ),
        {"user": user_id},
    )


async def test_list_groups_by_local_civil_day(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Ines", timezone="Europe/Paris")
        await seed_inbox(tx.conn, user)
        deps = engagement_deps(tx)

        dto = await inbox_service.list_notifications(
            deps, actor_for(user), {"filter": "all", "limit": 10, "offset": 0}
        )

        assert NotificationsListOutput.model_validate(dto) is not None
        assert dto["timezone"] == "Europe/Paris"
        assert (dto["total"], dto["unreadCount"]) == (3, 2)
        assert [item["group"] for item in dto["items"]] == ["today", "today", "yesterday"]
        assert next(item["title"] for item in dto["items"]) == "Gap"

    await rolled_back(database, run)


async def test_list_filters_unread_and_paginates(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Noe", timezone="Europe/Paris")
        await seed_inbox(tx.conn, user)
        deps = engagement_deps(tx)

        unread = await inbox_service.list_notifications(
            deps, actor_for(user), {"filter": "unread", "limit": 10, "offset": 0}
        )
        page = await inbox_service.list_notifications(
            deps, actor_for(user), {"filter": "all", "limit": 1, "offset": 0}
        )
        second = await inbox_service.list_notifications(
            deps, actor_for(user), {"filter": "all", "limit": 1, "offset": 1}
        )

        assert unread["unreadCount"] == 2
        assert len(unread["items"]) == 2
        assert all(item["readAt"] is None for item in unread["items"])
        assert page["total"] == 3
        assert len(page["items"]) == 1
        assert second["items"][0]["id"] != page["items"][0]["id"]

    await rolled_back(database, run)


async def test_a_foreign_notification_is_never_listed_or_counted(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        await create_notification(tx.conn, bob)
        deps = engagement_deps(tx)

        listed = await inbox_service.list_notifications(
            deps, actor_for(alice), {"filter": "all", "limit": 20, "offset": 0}
        )
        unread = await inbox_service.get_unread_notification_count(deps, actor_for(alice))

        assert listed["items"] == []
        assert (listed["total"], listed["unreadCount"]) == (0, 0)
        assert unread == {"count": 0}

    await rolled_back(database, run)


async def test_mark_read_is_idempotent_and_returns_the_counter(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Louis", timezone="Europe/Paris")
        notification_id = await create_notification(tx.conn, user)
        deps = engagement_deps(tx)

        first = await inbox_service.mark_notification_read(deps, actor_for(user), notification_id)
        second = await inbox_service.mark_notification_read(deps, actor_for(user), notification_id)
        stored = await tx.conn.execute(
            text("select read_at from public.notifications where id = cast(:id as uuid)"),
            {"id": notification_id},
        )

        assert NotificationsReadOutput.model_validate(first) is not None
        assert first == {"unreadCount": 0}
        assert second == {"unreadCount": 0}
        assert stored.mappings().one()["read_at"] is not None

    await rolled_back(database, run)


async def test_marking_a_foreign_notification_read_is_a_404(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        foreign = await create_notification(tx.conn, bob)
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as raised:
            await inbox_service.mark_notification_read(deps, actor_for(alice), foreign)

        assert raised.value.code == "NOT_FOUND"
        untouched = await count(
            tx.conn,
            "select count(*)::int as count from public.notifications where id = cast(:id as uuid) "
            "and read_at is null",
            id=foreign,
        )
        assert untouched == 1

    await rolled_back(database, run)


async def test_mark_all_read_marks_only_the_callers_rows(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        own = await create_notification(tx.conn, alice)
        foreign = await create_notification(tx.conn, bob)
        deps = engagement_deps(tx)

        dto = await inbox_service.mark_all_read(deps, actor_for(alice))
        again = await inbox_service.mark_all_read(deps, actor_for(alice))

        assert NotificationsReadAllOutput.model_validate(dto) is not None
        assert dto == {"unreadCount": 0}
        assert again == {"unreadCount": 0}
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications where id = any("
                "array[cast(:own as uuid), cast(:foreign as uuid)]) and read_at is null",
                own=own,
                foreign=foreign,
            )
            == 1
        )

    await rolled_back(database, run)


async def test_unread_count_is_published_for_the_contract(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Mila", timezone="Europe/Paris")
        await create_notification(tx.conn, user)
        await create_notification(tx.conn, user, read_at=engagement_deps(tx).clock.now())
        deps = engagement_deps(tx)

        dto = await inbox_service.get_unread_notification_count(deps, actor_for(user))

        assert NotificationsUnreadCountOutput.model_validate(dto) is not None
        assert dto == {"count": 1}

    await rolled_back(database, run)


async def test_a_learner_without_profile_gets_a_404(database: Database) -> None:
    async def run(tx: Any) -> None:
        deps = engagement_deps(tx)
        ghost = "11111111-1111-4111-8111-111111111111"

        with pytest.raises(AppError) as raised:
            await inbox_service.list_notifications(
                deps, actor_for(ghost), {"filter": "all", "limit": 20, "offset": 0}
            )

        assert raised.value.code == "NOT_FOUND"

    await rolled_back(database, run)
