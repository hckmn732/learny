"""[SPEC-2201] Settings screen state (port of parametres-onglets-et-profil.ts)."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_export,
    create_formation,
    create_group,
    create_user,
    deps_for,
    join_group,
    one,
)
from learny.identity.application.profile import get_settings_state, update_settings_profile
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PROFILE_NOT_FOUND, PROFILE_VERSION_CONFLICT
from learny.shared.time import parse_iso, to_iso
from learny_api.generated.models import MeProfileGetOutput, MeProfileUpdateOutput

pytestmark = pytest.mark.spec("SPEC-2201")


async def test_get_profile_state_returns_the_settings_state(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice", last_name="Martin")
        result = await get_settings_state(deps_for(tx), actor_for(user))
        MeProfileGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    assert result["me"]["firstName"] == "Alice"
    assert result["me"]["lastName"] == "Martin"
    assert result["rhythm"] == {
        "hoursPerDay": 2,
        "studyDays": [1, 2, 3, 4, 5],
        "preferredSlots": ["soir"],
    }
    assert result["activeFormationCount"] == 0
    assert result["deletionScheduledFor"] is None
    assert result["export"] is None
    assert result["createdAt"] == result["updatedAt"]


async def test_get_profile_state_returns_the_latest_export(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        await create_export(
            tx.conn,
            user,
            created_at=parse_iso("2026-11-09T08:00:00Z"),
            expires_at=parse_iso("2026-11-16T08:00:00Z"),
        )
        latest = await create_export(
            tx.conn,
            user,
            size_bytes=2048,
            created_at=parse_iso("2026-11-10T08:00:00Z"),
            expires_at=parse_iso("2026-11-17T08:00:00Z"),
        )
        result = await get_settings_state(deps_for(tx), actor_for(user))
        return latest, result

    latest, result = await rolled_back(database, scenario)
    assert result["export"] == {
        "id": latest,
        "status": "done",
        "sizeBytes": 2048,
        "createdAt": "2026-11-10T08:00:00.000Z",
        "expiresAt": "2026-11-17T08:00:00.000Z",
    }


async def test_update_profile_writes_the_profile_and_the_rhythm(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice", last_name="Martin")
        body = {
            "firstName": "Alicia",
            "tutorTone": "tu",
            "courseLanguage": "en",
            "timezone": "Europe/London",
            "rhythm": {"hoursPerDay": 3, "studyDays": [1, 3, 5], "preferredSlots": ["matin"]},
        }
        result = await update_settings_profile(deps_for(tx), actor_for(user), body)
        MeProfileUpdateOutput.model_validate(result)
        stored = await one(
            tx.conn,
            "select first_name, tutor_tone::text as tone, course_language::text as language, "
            "timezone from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        return result, stored

    result, stored = await rolled_back(database, scenario)
    assert result["me"]["firstName"] == "Alicia"
    assert result["me"]["tutorTone"] == "tu"
    assert result["me"]["courseLanguage"] == "en"
    assert result["me"]["timezone"] == "Europe/London"
    assert result["rhythm"] == {
        "hoursPerDay": 3,
        "studyDays": [1, 3, 5],
        "preferredSlots": ["matin"],
    }
    assert stored["first_name"] == "Alicia"
    assert stored["tone"] == "tu"
    assert stored["language"] == "en"
    assert stored["timezone"] == "Europe/London"


async def test_stale_expected_version_is_a_conflict_and_writes_nothing(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        with pytest.raises(AppError) as raised:
            await update_settings_profile(
                deps_for(tx),
                actor_for(user),
                {"expectedUpdatedAt": "2026-01-01T00:00:00.000Z", "firstName": "Alicia"},
            )
        error = raised.value
        row = await one(
            tx.conn,
            "select first_name from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        return error, row

    error, row = await rolled_back(database, scenario)
    assert error.code == "CONFLICT"
    assert error.status == 409
    assert error.detail == PROFILE_VERSION_CONFLICT
    assert row["first_name"] == "Alice"


async def test_current_expected_version_is_accepted(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        row = await one(
            tx.conn,
            "select updated_at from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        expected = to_iso(row["updated_at"])
        result = await update_settings_profile(
            deps_for(tx),
            actor_for(user),
            {"expectedUpdatedAt": expected, "firstName": "Alicia"},
        )
        return result

    result = await rolled_back(database, scenario)
    assert result["me"]["firstName"] == "Alicia"


async def test_update_profile_without_profile_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        with pytest.raises(AppError) as raised:
            await update_settings_profile(
                deps_for(tx),
                actor_for("11111111-1111-4111-8111-111111111111"),
                {"firstName": "Alicia"},
            )
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "NOT_FOUND"
    assert error.detail == PROFILE_NOT_FOUND


async def test_active_formation_count_covers_owned_and_group_formations(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        await create_formation(tx.conn, alice, title="La mienne")
        await create_formation(tx.conn, alice, title="En pause", status="paused")
        shared = await create_formation(tx.conn, bob, title="Partagee")
        group = await create_group(tx.conn, shared, bob, "LRN-AB23")
        await join_group(tx.conn, group, alice)
        result = await get_settings_state(deps_for(tx), actor_for(alice))
        return result

    result = await rolled_back(database, scenario)
    assert result["activeFormationCount"] == 2
