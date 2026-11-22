"""[SPEC-2205] Automation settings: defaults, partial update and RLS of the ten keys.

The service reads the stored rows of the learner only, completes the missing keys with the
canonical defaults of the contracts and upserts one row in the same RLS transaction. A parameter
outside its schema answers 400 with the zod message of the TypeScript, and another learner's row is
never read nor written.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, create_user
from learny.engagement.application.automations import (
    list_my_automations,
    update_my_automation_setting,
)
from learny.engagement.domain.automations import AUTOMATION_KEYS
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement_automations as fr
from learny_api.generated.models import MeAutomationsListOutput, MeAutomationsUpdateOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")


async def stored_params(tx: Any, user_id: str, key: str) -> dict[str, Any]:
    result = await tx.conn.execute(
        text(
            "select params from public.automation_settings "
            "where user_id = cast(:user as uuid) and key = cast(:key as public.automation_key)"
        ),
        {"user": user_id, "key": key},
    )
    row = result.mappings().first()
    return {} if row is None else dict(row["params"])


async def test_the_ten_defaults_are_canonical(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Adele", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await list_my_automations(deps, actor_for(user))

        assert MeAutomationsListOutput.model_validate(dto) is not None
        assert [item["automation"] for item in dto["items"]] == list(AUTOMATION_KEYS)
        assert all(item["enabled"] for item in dto["items"])
        assert all(item["updatedAt"].endswith("Z") for item in dto["items"])
        micro = next(item for item in dto["items"] if item["automation"] == "micro_seance")
        assert micro["params"] == {"hour": 20, "durationMin": 5}
        warmup = next(item for item in dto["items"] if item["automation"] == "echauffement")
        assert warmup["params"] == {"count": 3, "scope": "yesterday_prerequisites"}
        assert dto["paused"] is False

    await rolled_back(database, run)


async def test_a_partial_parameter_object_is_completed_by_the_schema(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Bastien", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await update_my_automation_setting(
            deps, actor_for(user), {"automation": "micro_seance", "params": {"hour": 19}}
        )

        assert MeAutomationsUpdateOutput.model_validate(dto) is not None
        assert dto["automation"] == "micro_seance"
        assert dto["enabled"] is True
        assert dto["params"] == {"hour": 19, "durationMin": 5}
        assert dto["updatedAt"].endswith("Z")
        assert await stored_params(tx, user, "micro_seance") == {"hour": 19, "durationMin": 5}

    await rolled_back(database, run)


async def test_an_enabled_switch_alone_keeps_the_stored_parameters(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chloe", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await update_my_automation_setting(
            deps, actor_for(user), {"automation": "bilan", "params": {"weekday": 5}}
        )

        dto = await update_my_automation_setting(
            deps, actor_for(user), {"automation": "bilan", "enabled": False}
        )

        assert dto["enabled"] is False
        assert dto["params"] == {"weekday": 5, "hour": 19, "channel": "app"}

    await rolled_back(database, run)


async def test_a_parameter_outside_its_schema_is_a_validation_error(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Diane", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as raised:
            await update_my_automation_setting(
                deps, actor_for(user), {"automation": "micro_seance", "params": {"durationMin": 7}}
            )

        assert raised.value.code == "VALIDATION_FAILED"
        assert raised.value.extra["errors"] == [{"path": "params.durationMin", "message": "Invalid input"}]
        assert raised.value.detail == fr.FIELD_INVALID.format(
            path="params.durationMin", message="Invalid input"
        )
        assert await stored_params(tx, user, "micro_seance") == {"hour": 20, "durationMin": 5}

    await rolled_back(database, run)


async def test_a_legacy_alias_is_canonicalised(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Elise", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await update_my_automation_setting(
            deps,
            actor_for(user),
            {"automation": "echauffement", "params": {"questionCount": 5}},
        )

        assert dto["params"] == {"count": 5, "scope": "yesterday_prerequisites"}

    await rolled_back(database, run)


async def test_another_learner_setting_is_never_read(database: Database) -> None:
    async def run(tx: Any) -> None:
        owner = await create_user(tx.conn, "Fanny", timezone="Europe/Paris")
        other = await create_user(tx.conn, "Gaspard", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await update_my_automation_setting(
            deps, actor_for(owner), {"automation": "reprise", "params": {"inactiveDays": 3}}
        )

        dto = await list_my_automations(deps, actor_for(other))

        reprise = next(item for item in dto["items"] if item["automation"] == "reprise")
        assert reprise["params"] == {"inactiveDays": 2, "lightenDays": 5, "mode": "accord"}
        assert reprise["updatedAt"] is not None
        assert await stored_params(tx, owner, "reprise") == {
            "inactiveDays": 3,
            "lightenDays": 5,
            "mode": "accord",
        }

    await rolled_back(database, run)


async def test_an_active_pause_suspends_the_automations(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Hugo", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await tx.conn.execute(
            text(
                "insert into public.pauses (user_id, starts_on, ends_on, status) "
                "values (cast(:user as uuid), date '2026-11-10', date '2026-11-14', 'active')"
            ),
            {"user": user},
        )

        dto = await list_my_automations(deps, actor_for(user))

        assert dto["paused"] is True

    await rolled_back(database, run)
