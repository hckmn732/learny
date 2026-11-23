"""[SPEC-2205] The milestone notification of `learning` (debt taken over from SPEC-2202/SPEC-2203).

A session completion reconciles the milestones after its commit, which is where SPEC-723's
`review/session-completed` consumer sat.
"""

from dataclasses import dataclass
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, count, create_user
from learny.engagement.application import inbox as inbox_service
from learny.learning.application import series as series_service
from learny.shared.db.uow import Database
from learny.shared.locale_fr import engagement as engagement_texts
from learny.shared.locale_fr import learning as learning_texts
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

NOW = "2026-11-11T12:20:00.000Z"


@dataclass(frozen=True)
class DetectedMilestone:
    """The shape `insertMilestones` reads from the engine result (`kind`, `moduleId`)."""

    kind: str
    module_id: str | None = None


async def test_a_hundred_notions_milestone_is_announced_once(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Lina", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        await series_service._insert_milestones(deps, user, NOW, None, [], [DetectedMilestone("notions_100")])
        await series_service._insert_milestones(deps, user, NOW, None, [], [DetectedMilestone("notions_100")])

        stored = await tx.conn.execute(
            text(
                "select type, title, body, href, icon, dedupe_key from public.notifications "
                "where user_id = cast(:user as uuid)"
            ),
            {"user": user},
        )
        rows = [dict(row) for row in stored.mappings()]

        assert len(rows) == 1
        assert rows[0]["type"] == "milestone"
        assert rows[0]["dedupe_key"] == "milestone:notions_100"
        assert rows[0]["href"] == "/accueil"
        assert (rows[0]["icon"], rows[0]["title"]) == (
            "award",
            engagement_texts.NOTIFICATION_TITLE_MILESTONE,
        )
        assert learning_texts.SERIES_MILESTONE_NOTIONS in rows[0]["body"]
        assert len(deps.email.entries()) == 1

    await rolled_back(database, run)


async def test_a_streak_milestone_is_announced(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Marco", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        await series_service._insert_milestones(deps, user, NOW, None, [], [DetectedMilestone("streak_30")])
        inbox = await inbox_service.list_notifications(
            deps, actor_for(user), {"filter": "all", "limit": 20, "offset": 0}
        )

        assert [item["type"] for item in inbox["items"]] == ["milestone"]
        assert learning_texts.SERIES_MILESTONE_STREAK in inbox["items"][0]["body"]

    await rolled_back(database, run)


async def test_a_module_milestone_stays_in_app(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Nadia", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        await series_service._insert_milestones(
            deps, user, NOW, None, [], [DetectedMilestone("module_validated", None)]
        )

        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications where user_id = cast(:user as uuid)",
                user=user,
            )
            == 0
        )
        assert deps.email.entries() == ()

    await rolled_back(database, run)
