"""[SPEC-2201] Onboarding state and advancement (port of onboarding/{state,advance}.ts)."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    assign_task,
    create_credential,
    create_user,
    deps_for,
    event_by_id,
    one,
)
from learny.identity.application.onboarding import advance_onboarding, get_onboarding_state
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import ONBOARDING_AI_REQUIRED
from learny_api.generated.models import MeOnboardingGetOutput, MeOnboardingUpdateOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")

ALL_TASKS = ("programme", "course", "gaps", "tutor", "light")


async def test_get_onboarding_state_reads_profile_rhythm_and_reminders(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        result = await get_onboarding_state(deps_for(tx), actor_for(user))
        MeOnboardingGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    assert result["profile"]["onboardingStep"] == "profil"
    assert result["preferences"] == {
        "hoursPerDay": 2,
        "studyDays": [1, 2, 3, 4, 5],
        "preferredSlots": ["soir"],
    }
    assert result["reminders"] == {"push": True, "email": True, "automations": True}


async def test_advance_moves_the_step_forward(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        result = await advance_onboarding(deps_for(tx), actor_for(user), {"step": "rythme"})
        MeOnboardingUpdateOutput.model_validate(result)
        row = await one(
            tx.conn,
            "select onboarding_step::text as step from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        return result, row

    result, row = await rolled_back(database, scenario)
    assert result == {"onboardingStep": "rythme"}
    assert row["step"] == "rythme"


async def test_advance_never_moves_the_step_backwards(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        deps = deps_for(tx)
        await advance_onboarding(deps, actor_for(user), {"step": "rythme"})
        result = await advance_onboarding(deps, actor_for(user), {"step": "profil"})
        return result

    result = await rolled_back(database, scenario)
    assert result == {"onboardingStep": "rythme"}


async def test_reminders_are_written_even_when_the_step_does_not_move(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        deps = deps_for(tx)
        result = await advance_onboarding(
            deps,
            actor_for(user),
            {
                "step": "profil",
                "reminders": {"push": False, "email": False, "automations": False},
            },
        )
        state = await get_onboarding_state(deps, actor_for(user))
        return result, state

    result, state = await rolled_back(database, scenario)
    assert result == {"onboardingStep": "profil"}
    assert state["reminders"] == {"push": False, "email": False, "automations": False}


async def test_crossing_the_ai_step_requires_five_assignments(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        with pytest.raises(AppError) as raised:
            await advance_onboarding(deps_for(tx), actor_for(user), {"step": "rappels"})
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "ONBOARDING_AI_REQUIRED"
    assert error.detail == ONBOARDING_AI_REQUIRED
    assert error.status == 422


async def test_crossing_the_ai_step_with_five_qualified_assignments(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        credential = await create_credential(tx.conn, user, ["gpt-x"])
        for task in ALL_TASKS:
            await assign_task(tx.conn, user, task, credential, "gpt-x")
        result = await advance_onboarding(deps_for(tx), actor_for(user), {"step": "rappels"})
        return result

    result = await rolled_back(database, scenario)
    assert result == {"onboardingStep": "rappels"}


async def test_an_unqualified_credential_does_not_open_the_ai_step(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        credential = await create_credential(tx.conn, user, ["gpt-x"], status="untested")
        for task in ALL_TASKS:
            await assign_task(tx.conn, user, task, credential, "gpt-x")
        with pytest.raises(AppError) as raised:
            await advance_onboarding(deps_for(tx), actor_for(user), {"step": "rappels"})
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "ONBOARDING_AI_REQUIRED"


async def test_completing_onboarding_writes_the_instant_and_emits_once(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        await tx.conn.execute(
            text("update public.profiles set onboarding_step = 'depart' where id = cast(:user as uuid)"),
            {"user": user},
        )
        deps = deps_for(tx)
        first = await advance_onboarding(deps, actor_for(user), {"step": "done"})
        second = await advance_onboarding(deps, actor_for(user), {"step": "done"})
        profile = await one(
            tx.conn,
            "select onboarding_step::text as step, onboarding_completed_at "
            "from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        event = await event_by_id(tx.conn, f"user-onboarding-completed:{user}")
        return first, second, profile, event

    first, second, profile, event = await rolled_back(database, scenario)
    assert first == {"onboardingStep": "done"}
    assert second == {"onboardingStep": "done"}
    assert profile["step"] == "done"
    assert profile["onboarding_completed_at"] is not None
    assert event is not None
    assert event["name"] == "user/onboarding-completed"
    assert event["data"]["userId"] == str(event["user_id"])
    assert event["data"]["completedAt"] == "2026-11-11T12:20:00.000Z"
