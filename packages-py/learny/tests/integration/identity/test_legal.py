"""[SPEC-2201] Legal acceptance (port of legal/accept.ts)."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import actor_for, count, create_user, deps_for, one
from learny.identity.application.legal import accept_legal_versions
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import LEGAL_VERSIONS_CONFLICT
from learny_api.generated.models import MeLegalAcceptOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")

ACTIVE = {"cguVersion": "2026-11-11", "privacyVersion": "2026-11-11"}


async def test_accept_records_the_active_pair(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        result = await accept_legal_versions(deps_for(tx), actor_for(user), ACTIVE)
        MeLegalAcceptOutput.model_validate(result)
        rows = await one(
            tx.conn,
            "select count(*)::int as count, "
            "count(*) filter (where document = 'cgu')::int as cgu, "
            "count(*) filter (where document = 'privacy')::int as privacy "
            "from public.legal_acceptances where user_id = cast(:user as uuid)",
            user=user,
        )
        profile = await one(
            tx.conn,
            "select terms_version, terms_accepted_at from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        return result, rows, profile

    result, rows, profile = await rolled_back(database, scenario)
    assert result == {
        "cguVersion": "2026-11-11",
        "privacyVersion": "2026-11-11",
        "acceptedAt": "2026-11-11T12:20:00.000Z",
        "complete": True,
    }
    assert rows["count"] == 2
    assert rows["cgu"] == 1
    assert rows["privacy"] == 1
    assert profile["terms_version"] == "cgu:2026-11-11;privacy:2026-11-11"
    assert profile["terms_accepted_at"] is not None


async def test_replay_keeps_the_original_instant(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        await tx.conn.execute(
            text(
                "insert into public.legal_acceptances (user_id, document, version, accepted_at) "
                "values (cast(:user as uuid), 'cgu', '2026-11-11', '2026-01-01T00:00:00Z'), "
                "(cast(:user as uuid), 'privacy', '2026-11-11', '2026-01-01T00:00:00Z')"
            ),
            {"user": user},
        )
        result = await accept_legal_versions(deps_for(tx), actor_for(user), ACTIVE)
        return result

    result = await rolled_back(database, scenario)
    assert result["acceptedAt"] == "2026-01-01T00:00:00.000Z"


async def test_stale_version_is_a_conflict_and_writes_nothing(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        with pytest.raises(AppError) as raised:
            await accept_legal_versions(
                deps_for(tx),
                actor_for(user),
                {"cguVersion": "2025-01-01", "privacyVersion": "2026-11-11"},
            )
        error = raised.value
        acceptances = await count(
            tx.conn,
            "select count(*)::int as count from public.legal_acceptances where user_id = cast(:user as uuid)",
            user=user,
        )
        profile = await one(
            tx.conn,
            "select terms_version from public.profiles where id = cast(:user as uuid)",
            user=user,
        )
        return error, acceptances, profile

    error, acceptances, profile = await rolled_back(database, scenario)
    assert error.code == "CONFLICT"
    assert error.detail == LEGAL_VERSIONS_CONFLICT
    assert [issue["path"] for issue in error.extra["errors"]] == ["cguVersion", "privacyVersion"]
    assert [issue["message"] for issue in error.extra["errors"]] == ["2026-11-11", "2026-11-11"]
    assert acceptances == 0
    assert profile["terms_version"] is None


async def test_both_versions_must_match_the_active_pair(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        with pytest.raises(AppError) as raised:
            await accept_legal_versions(
                deps_for(tx),
                actor_for(user),
                {"cguVersion": "2026-11-11", "privacyVersion": "2025-01-01"},
            )
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "CONFLICT"
