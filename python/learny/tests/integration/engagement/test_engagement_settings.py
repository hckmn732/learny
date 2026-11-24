"""[SPEC-2205] Notifications tab of the settings screen: read, partial patch and conflict.

The stored row stays `notification_settings`; the service only normalises it for the screen and
writes a partial patch in one transaction under the learner's RLS transaction. A stale
`expectedUpdatedAt` answers 409 and leaves the row untouched (CL-2), and another learner's settings
are never read nor written.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, create_user
from learny.engagement.application import settings as settings_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import (
    MeNotificationSettingsGetOutput,
    MeNotificationSettingsUpdateOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")


async def stored_settings(tx: Any, user_id: str) -> dict[str, Any]:
    result = await tx.conn.execute(
        text(
            "select channel_email, channel_push, type_revision, type_validation, "
            "digest_time::text as digest_time, quiet_start::text as quiet_start, "
            "quiet_end::text as quiet_end, weekend_quiet, max_per_day "
            "from public.notification_settings where user_id = cast(:user as uuid)"
        ),
        {"user": user_id},
    )
    return dict(result.mappings().one())


async def test_the_defaults_are_normalised_for_the_screen(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Adele", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await settings_service.get_notification_settings(deps, actor_for(user))

        assert MeNotificationSettingsGetOutput.model_validate(dto) is not None
        assert dto["channels"] == {"app": True, "email": True, "browser": True}
        assert dto["types"] == {
            "revision": True,
            "validation": True,
            "course": True,
            "gap": True,
            "planning": True,
            "relaunch": True,
        }
        assert dto["quiet"] == {
            "start": "21:00",
            "end": "08:00",
            "crossesMidnight": True,
            "empty": False,
        }
        assert (dto["digestTime"], dto["maxPerDay"], dto["weekendQuiet"]) == ("08:00", 5, True)
        assert dto["activeTypeCount"] == 6
        assert dto["updatedAt"].endswith("Z")

    await rolled_back(database, run)


async def test_a_partial_patch_leaves_every_other_field_untouched(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Bastien", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await settings_service.update_notification_settings(
            deps,
            actor_for(user),
            {
                "types": {"revision": False, "gap": False},
                "quietStart": "22:00",
                "maxPerDay": 3,
                "channels": {"browser": False},
            },
        )
        row = await stored_settings(tx, user)

        assert MeNotificationSettingsUpdateOutput.model_validate(dto) is not None
        assert dto["activeTypeCount"] == 4
        assert dto["types"]["revision"] is False
        assert dto["types"]["gap"] is False
        assert dto["types"]["course"] is True
        assert dto["quiet"]["start"] == "22:00"
        assert dto["quiet"]["end"] == "08:00"
        assert dto["maxPerDay"] == 3
        assert dto["channels"]["browser"] is False
        assert row["channel_email"] is True
        assert row["quiet_start"] == "22:00:00"

    await rolled_back(database, run)


async def test_a_stale_expected_updated_at_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chloe", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        before = await stored_settings(tx, user)

        with pytest.raises(AppError) as raised:
            await settings_service.update_notification_settings(
                deps,
                actor_for(user),
                {"maxPerDay": 8, "expectedUpdatedAt": "2026-11-10T08:00:00.000Z"},
            )

        assert raised.value.code == "CONFLICT"
        assert raised.value.status == 409
        assert await stored_settings(tx, user) == before

    await rolled_back(database, run)


async def test_the_current_updated_at_is_accepted(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "David", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        current = await settings_service.get_notification_settings(deps, actor_for(user))

        dto = await settings_service.update_notification_settings(
            deps,
            actor_for(user),
            {"weekendQuiet": False, "expectedUpdatedAt": current["updatedAt"]},
        )

        assert dto["weekendQuiet"] is False

    await rolled_back(database, run)


async def test_a_patch_never_touches_another_learner(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        before = await stored_settings(tx, bob)

        await settings_service.update_notification_settings(
            deps, actor_for(alice), {"types": {"course": False}, "maxPerDay": 8}
        )
        own = await settings_service.get_notification_settings(deps, actor_for(alice))

        assert await stored_settings(tx, bob) == before
        assert own["maxPerDay"] == 8
        assert own["types"]["course"] is False

    await rolled_back(database, run)


async def test_a_missing_row_is_created_with_the_defaults(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Elise", timezone="Europe/Paris")
        await tx.conn.execute(
            text("delete from public.notification_settings where user_id = cast(:user as uuid)"),
            {"user": user},
        )
        deps = engagement_deps(tx)

        dto = await settings_service.get_notification_settings(deps, actor_for(user))

        assert dto["maxPerDay"] == 5
        assert (await stored_settings(tx, user))["channel_email"] is True

    await rolled_back(database, run)


async def test_a_learner_without_profile_is_a_404(database: Database) -> None:
    async def run(tx: Any) -> None:
        deps = engagement_deps(tx)
        ghost = "11111111-1111-4111-8111-111111111111"

        with pytest.raises(AppError) as read:
            await settings_service.get_notification_settings(deps, actor_for(ghost))
        with pytest.raises(AppError) as written:
            await settings_service.update_notification_settings(deps, actor_for(ghost), {"maxPerDay": 3})

        assert read.value.code == "NOT_FOUND"
        assert written.value.code == "NOT_FOUND"

    await rolled_back(database, run)
