"""[SPEC-2205] Automation journal: stable order, filters, cursor, weekly counter and expiry.

The journal is the learner's own history under RLS: newest first with the identifier as tie-break,
the weekly counter is the prefix of that list, the cursor is opaque and a pending action expires as
soon as its `expiresAt` instant has passed - once, and only for a pending action.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import actor_for, create_user
from learny.engagement.application.automations import (
    expire_due_automation_actions,
    list_my_automation_actions,
)
from learny.shared.db.uow import Database
from learny_api.generated.models import MeAutomationActionsListOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

INSERT_ACTION = text(
    "insert into public.automation_actions "
    "(id, user_id, automation, kind, summary, payload, requires_consent, status, decided_at, created_at) "
    "values (cast(:id as uuid), cast(:user as uuid), cast(:automation as public.automation_key), :kind, "
    ":summary, cast(:payload as jsonb), :requires_consent, cast(:status as public.automation_status), "
    "cast(:decided_at as timestamptz), cast(:created_at as timestamptz))"
)

ACTION_IDS = (
    "00000000-0000-4000-8000-00000000a001",
    "00000000-0000-4000-8000-00000000a002",
    "00000000-0000-4000-8000-00000000a003",
)


async def insert_action(
    tx: Any,
    *,
    user_id: str,
    action_id: str,
    automation: str = "micro_seance",
    kind: str = "micro_session_proposed",
    payload: dict[str, Any] | None = None,
    status: str = "applied",
    created_at: str = "2026-11-11T09:00:00.000Z",
    decided_at: str | None = None,
    requires_consent: bool = False,
) -> None:
    await tx.conn.execute(
        INSERT_ACTION,
        {
            "id": action_id,
            "user": user_id,
            "automation": automation,
            "kind": kind,
            "summary": "Resume de test",
            "payload": json.dumps(payload or {"dedupeKey": action_id}),
            "requires_consent": requires_consent,
            "status": status,
            "decided_at": decided_at,
            "created_at": created_at,
        },
    )


async def test_an_empty_journal_is_an_explicit_empty_page(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Adele", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await list_my_automation_actions(deps, actor_for(user), {})

        assert MeAutomationActionsListOutput.model_validate(dto) is not None
        assert dto == {"items": [], "weekCount": 0, "nextCursor": None}

    await rolled_back(database, run)


async def test_the_journal_is_newest_first_with_the_identifier_as_tie_break(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Bastien", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[0], created_at="2026-11-11T09:00:00.000Z")
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[2], created_at="2026-11-11T11:00:00.000Z")
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[1], created_at="2026-11-11T11:00:00.000Z")

        dto = await list_my_automation_actions(deps, actor_for(user), {})

        # The page orders `(created_at desc, id desc)`, while the settings screen sorts the same
        # rows `(created_at desc, id asc)`: both are stable, they are not the same list.
        assert [item["id"] for item in dto["items"]] == [ACTION_IDS[2], ACTION_IDS[1], ACTION_IDS[0]]
        assert dto["weekCount"] == 3
        first = dto["items"][0]
        assert first["automation"] == "micro_seance"
        assert first["status"] == "applied"
        assert first["requiresConsent"] is False
        assert first["decidedAt"] is None
        assert first["createdAt"] == "2026-11-11T11:00:00.000Z"

    await rolled_back(database, run)


async def test_the_weekly_counter_ignores_last_week(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chloe", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[0], created_at="2026-11-02T09:00:00.000Z")
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[1], created_at="2026-11-09T09:00:00.000Z")

        dto = await list_my_automation_actions(deps, actor_for(user), {})

        assert dto["weekCount"] == 1
        assert len(dto["items"]) == 2

    await rolled_back(database, run)


async def test_the_filters_and_the_cursor_walk_the_same_order(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Diane", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[0], created_at="2026-11-11T09:00:00.000Z")
        await insert_action(
            tx,
            user_id=user,
            action_id=ACTION_IDS[1],
            automation="bilan",
            kind="weekly_review",
            status="pending_consent",
            requires_consent=True,
            created_at="2026-11-11T10:00:00.000Z",
        )
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[2], created_at="2026-11-11T11:00:00.000Z")

        filtered = await list_my_automation_actions(deps, actor_for(user), {"automation": "bilan"})
        assert [item["id"] for item in filtered["items"]] == [ACTION_IDS[1]]
        assert filtered["items"][0]["requiresConsent"] is True

        pending = await list_my_automation_actions(deps, actor_for(user), {"status": "pending_consent"})
        assert [item["id"] for item in pending["items"]] == [ACTION_IDS[1]]

        first = await list_my_automation_actions(deps, actor_for(user), {"limit": 2})
        assert [item["id"] for item in first["items"]] == [ACTION_IDS[2], ACTION_IDS[1]]
        assert first["nextCursor"] is not None
        second = await list_my_automation_actions(
            deps, actor_for(user), {"limit": 2, "cursor": first["nextCursor"]}
        )
        assert [item["id"] for item in second["items"]] == [ACTION_IDS[0]]
        assert second["nextCursor"] is None

    await rolled_back(database, run)


async def test_since_only_returns_the_actions_of_the_window(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Elise", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[0], created_at="2026-11-10T09:00:00.000Z")
        await insert_action(tx, user_id=user, action_id=ACTION_IDS[1], created_at="2026-11-11T11:00:00.000Z")

        dto = await list_my_automation_actions(deps, actor_for(user), {"since": "2026-11-11T00:00:00.000Z"})

        assert [item["id"] for item in dto["items"]] == [ACTION_IDS[1]]

    await rolled_back(database, run)


async def test_another_learner_journal_is_invisible(database: Database) -> None:
    async def run(tx: Any) -> None:
        owner = await create_user(tx.conn, "Fanny", timezone="Europe/Paris")
        other = await create_user(tx.conn, "Gaspard", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_action(tx, user_id=owner, action_id=ACTION_IDS[0])

        dto = await list_my_automation_actions(deps, actor_for(other), {})

        assert dto["items"] == []
        assert dto["weekCount"] == 0

    await rolled_back(database, run)


async def test_the_tick_expires_only_the_pending_past_actions(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Hugo", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_action(
            tx,
            user_id=user,
            action_id=ACTION_IDS[0],
            status="pending_consent",
            requires_consent=True,
            payload={"dedupeKey": "past", "expiresAt": "2026-11-11T12:00:00.000Z"},
        )
        await insert_action(
            tx,
            user_id=user,
            action_id=ACTION_IDS[1],
            status="pending_consent",
            requires_consent=True,
            payload={"dedupeKey": "future", "expiresAt": "2026-11-11T13:00:00.000Z"},
        )
        await insert_action(
            tx,
            user_id=user,
            action_id=ACTION_IDS[2],
            payload={"dedupeKey": "applied", "expiresAt": "2026-11-11T12:00:00.000Z"},
        )

        expired = await expire_due_automation_actions(deps)

        statuses = await tx.conn.execute(
            text(
                "select id::text as id, status::text as status, decided_at "
                "from public.automation_actions where user_id = cast(:user as uuid) order by id"
            ),
            {"user": user},
        )
        rows = {row["id"]: row for row in statuses.mappings()}
        assert expired == 1
        assert rows[ACTION_IDS[0]]["status"] == "expired"
        assert rows[ACTION_IDS[0]]["decided_at"] is not None
        assert rows[ACTION_IDS[1]]["status"] == "pending_consent"
        assert rows[ACTION_IDS[2]]["status"] == "applied"
        assert await expire_due_automation_actions(deps) == 0

    await rolled_back(database, run)
