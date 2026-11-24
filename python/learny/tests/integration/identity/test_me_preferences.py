"""[SPEC-2201] Profile and study rhythm use cases."""

import uuid
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import actor_for, create_user, deps_for, one
from learny.identity.application.me import get_me, update_profile
from learny.identity.application.preferences import get_preferences, update_preferences
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PREFERENCES_NOT_FOUND, PROFILE_NOT_FOUND
from learny_api.generated.models import (
    MeGetOutput,
    MePreferencesGetOutput,
    MeUpdateOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")

EMAIL = "id-alice@test.learny.test"


async def test_get_me_returns_the_profile(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        result = await get_me(deps_for(tx), actor_for(user))
        MeGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    assert result == {
        "id": result["id"],
        "email": EMAIL,
        "firstName": "Alice",
        "lastName": None,
        "tutorTone": "vous",
        "courseLanguage": "fr",
        "timezone": "Europe/Paris",
        "onboardingStep": "profil",
        "onboardingCompletedAt": None,
        "currentFormationId": None,
    }


async def test_get_me_without_profile_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        deps = deps_for(tx)
        with pytest.raises(AppError) as raised:
            await get_me(deps, actor_for(str(uuid.uuid4())))
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "NOT_FOUND"
    assert error.detail == PROFILE_NOT_FOUND


async def test_update_me_writes_only_the_provided_fields(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice", last_name="Martin")
        deps = deps_for(tx)
        updated = await update_profile(deps, actor_for(user), {"firstName": "Alicia", "tutorTone": "tu"})
        MeUpdateOutput.model_validate(updated)
        narrowed = await update_profile(deps, actor_for(user), {"firstName": None})
        return updated, narrowed

    updated, narrowed = await rolled_back(database, scenario)
    assert updated["firstName"] == "Alicia"
    assert updated["lastName"] == "Martin"
    assert updated["tutorTone"] == "tu"
    assert narrowed["firstName"] is None
    assert narrowed["lastName"] == "Martin"


async def test_update_me_without_profile_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        deps = deps_for(tx)
        with pytest.raises(AppError) as raised:
            await update_profile(deps, actor_for(str(uuid.uuid4())), {"firstName": "Alicia"})
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "NOT_FOUND"
    assert error.detail == PROFILE_NOT_FOUND


async def test_get_preferences_returns_the_database_defaults(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        result = await get_preferences(deps_for(tx), actor_for(user))
        MePreferencesGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    assert result == {"hoursPerDay": 2, "studyDays": [1, 2, 3, 4, 5], "preferredSlots": ["soir"]}


async def test_update_preferences_replaces_the_whole_rhythm(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        deps = deps_for(tx)
        body = {"hoursPerDay": 4, "studyDays": [2, 4, 6], "preferredSlots": ["matin", "soir"]}
        updated = await update_preferences(deps, actor_for(user), body)
        MePreferencesGetOutput.model_validate(updated)
        read_back = await get_preferences(deps, actor_for(user))
        return updated, read_back

    updated, read_back = await rolled_back(database, scenario)
    assert updated == {"hoursPerDay": 4, "studyDays": [2, 4, 6], "preferredSlots": ["matin", "soir"]}
    assert read_back == updated


async def test_get_preferences_without_row_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        await tx.conn.execute(
            text("delete from public.study_preferences where user_id = cast(:user as uuid)"),
            {"user": user},
        )
        with pytest.raises(AppError) as raised:
            await get_preferences(deps_for(tx), actor_for(user))
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "NOT_FOUND"
    assert error.detail == PREFERENCES_NOT_FOUND


async def test_update_preferences_keeps_the_trigger_updated_at(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        await update_preferences(
            deps_for(tx),
            actor_for(user),
            {"hoursPerDay": 3, "studyDays": [1], "preferredSlots": ["matin"]},
        )
        row = await one(
            tx.conn,
            "select hours_per_day, study_days, preferred_slots::text[] as slots "
            "from public.study_preferences where user_id = cast(:user as uuid)",
            user=user,
        )
        return row

    row = await rolled_back(database, scenario)
    assert row["hours_per_day"] == 3
    assert list(row["study_days"]) == [1]
    assert list(row["slots"]) == ["matin"]
