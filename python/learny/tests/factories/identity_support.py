"""Test support of the identity use cases (SPEC-2201).

The integration suite runs against the shared local stack. Every test seeds rows with the owner role
inside a service transaction that `rolled_back` always reverts; the use cases then run under the
caller's `authenticated` role, inside a savepoint so a refusal leaves the seed usable. This mirrors
`python/learny/tests/factories/db_support.as_user` without opening a second connection.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from learny.identity.domain.actor import Actor
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx, claims_json
from learny.shared.time import parse_iso
from sqlalchemy import text

FIXED = parse_iso("2026-11-11T12:20:00Z")

SET_CLAIMS = text(
    "select set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true)"
)

FSRS_CARD = json.dumps(
    {
        "due": "2026-11-12T12:20:00.000Z",
        "stability": 1.5,
        "difficulty": 4.2,
        "elapsed_days": 0,
        "scheduled_days": 1,
        "reps": 1,
        "lapses": 0,
        "state": 2,
        "last_review": "2026-11-11T12:20:00.000Z",
    }
)


class SavepointTransactions:
    """`user_tx` over the seed transaction: RLS claims plus a savepoint, never a commit."""

    def __init__(self, tx: Tx) -> None:
        self._tx = tx
        self._counter = 0

    @asynccontextmanager
    async def user_tx(self, actor: Actor) -> AsyncIterator[Tx]:
        self._counter += 1
        name = f"identity_{self._counter}"
        conn = self._tx.conn
        await conn.execute(text(f"savepoint {name}"))
        await conn.execute(SET_CLAIMS, {"claims": claims_json(actor), "sub": actor.user_id})
        await conn.execute(text("set local role authenticated"))
        try:
            yield Tx(conn=conn, actor=actor)
        except Exception:
            with suppress(Exception):
                await conn.execute(text(f"rollback to savepoint {name}"))
            raise
        await conn.execute(text("reset role"))
        await conn.execute(text(f"release savepoint {name}"))


@dataclass
class IdentityTestDeps:
    """The dependency bundle the identity use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: SavepointTransactions


def deps_for(tx: Tx, *, now: datetime = FIXED) -> IdentityTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    return IdentityTestDeps(
        settings=Settings(),
        clock=FixedClock(now),
        db=SavepointTransactions(tx),
    )


def actor_for(user_id: str, email: str = "learner@test.learny.test") -> Actor:
    """The `Actor` the authentication layer would resolve for `user_id`."""
    return Actor(user_id=user_id, email=email, email_confirmed=True, transport="bearer")


async def one(conn: Any, statement: str, **parameters: Any) -> Any:
    result = await conn.execute(text(statement), parameters)
    found = result.mappings().all()
    if not found:
        raise AssertionError(f"no row returned by: {statement.strip()[:80]}")
    return found[0]


async def identifier(conn: Any, statement: str, **parameters: Any) -> str:
    return str((await one(conn, statement, **parameters))["id"])


async def create_user(
    conn: Any,
    first_name: str,
    *,
    last_name: str | None = None,
    timezone: str | None = None,
) -> str:
    """Inserts the Auth user; the database trigger creates the profile and the default settings."""
    email = f"id-{first_name.lower()}@test.learny.test"
    metadata = {"first_name": first_name, "last_name": last_name, "timezone": timezone}
    return await identifier(
        conn,
        """
        insert into auth.users (
          id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
          created_at, updated_at
        )
        values (
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', :email, cast(:metadata as jsonb), cast(:app_metadata as jsonb),
          now(), now()
        )
        returning id::text as id
        """,
        email=email,
        metadata=json.dumps(metadata),
        app_metadata=json.dumps({"provider": "email", "providers": ["email"]}),
    )


async def create_formation(
    conn: Any,
    owner_id: str,
    *,
    title: str = "Formation de test",
    status: str = "active",
    last_opened_at: datetime | None = None,
    monogram: str | None = None,
    accent_color: str = "indigo",
) -> str:
    return await identifier(
        conn,
        """
        insert into public.formations (
          owner_id, title, objectives, status, last_opened_at, monogram, accent_color
        )
        values (
          cast(:owner as uuid), :title, '{operational}'::public.formation_objective[],
          cast(:status as public.formation_status), cast(:opened as timestamptz), :monogram,
          cast(:accent as public.formation_accent)
        )
        returning id::text as id
        """,
        owner=owner_id,
        title=title,
        status=status,
        opened=last_opened_at,
        monogram=monogram or "",
        accent=accent_color,
    )


async def create_module(
    conn: Any,
    formation_id: str,
    position: int,
    *,
    title: str = "Partie",
    status: str = "open",
) -> str:
    return await identifier(
        conn,
        """
        insert into public.modules (formation_id, position, title, status)
        values (cast(:formation as uuid), :position, :title, cast(:status as public.module_status))
        returning id::text as id
        """,
        formation=formation_id,
        position=position,
        title=title,
        status=status,
    )


async def create_chapter(conn: Any, formation_id: str, module_id: str, position: int = 1) -> str:
    return await identifier(
        conn,
        """
        insert into public.chapters (module_id, formation_id, position, title)
        values (cast(:module as uuid), cast(:formation as uuid), :position, :title)
        returning id::text as id
        """,
        module=module_id,
        formation=formation_id,
        position=position,
        title=f"Chapitre {position}",
    )


async def create_notion(
    conn: Any,
    formation_id: str,
    module_id: str,
    chapter_id: str,
    position: int = 1,
) -> str:
    return await identifier(
        conn,
        """
        insert into public.notions (
          formation_id, module_id, chapter_id, label, short_definition, position
        )
        values (
          cast(:formation as uuid), cast(:module as uuid), cast(:chapter as uuid),
          :label, 'Definition courte', :position
        )
        returning id::text as id
        """,
        formation=formation_id,
        module=module_id,
        chapter=chapter_id,
        label=f"Notion {position}",
        position=position,
    )


async def create_notion_state(
    conn: Any,
    user_id: str,
    notion_id: str,
    *,
    due_at: datetime | None = None,
    in_review: bool = False,
    gap_nature: str | None = None,
    gap_cleared: bool = False,
) -> None:
    await conn.execute(
        text(
            """
            insert into public.notion_states (
              user_id, notion_id, fsrs, due_at, in_review, gap_nature,
              gap_detected_at, gap_cleared_at
            )
            values (
              cast(:user as uuid), cast(:notion as uuid), cast(:fsrs as jsonb),
              cast(:due as timestamptz), :in_review,
              cast(:gap as public.gap_nature), cast(:detected as timestamptz),
              cast(:cleared as timestamptz)
            )
            """
        ),
        {
            "user": user_id,
            "notion": notion_id,
            "fsrs": FSRS_CARD,
            "due": due_at,
            "in_review": in_review,
            "gap": gap_nature,
            "detected": FIXED if gap_nature is not None else None,
            "cleared": FIXED if gap_cleared else None,
        },
    )


async def create_daily_activity(
    conn: Any,
    user_id: str,
    day: str,
    *,
    minutes: int = 0,
    qualifying: bool = False,
) -> None:
    await conn.execute(
        text(
            """
            insert into public.daily_activity (user_id, day, minutes, qualifying)
            values (cast(:user as uuid), cast(:day as date), :minutes, :qualifying)
            """
        ),
        {"user": user_id, "day": day, "minutes": minutes, "qualifying": qualifying},
    )


async def create_notification(conn: Any, user_id: str, *, read_at: datetime | None = None) -> str:
    return await identifier(
        conn,
        """
        insert into public.notifications (
          user_id, type, title, body, href, icon, read_at, dedupe_key
        )
        values (
          cast(:user as uuid), 'course_ready', 'Course ready', 'Your course is ready.',
          '/formations', 'book', cast(:read_at as timestamptz), gen_random_uuid()::text
        )
        returning id::text as id
        """,
        user=user_id,
        read_at=read_at,
    )


async def create_credential(
    conn: Any,
    user_id: str,
    model_ids: list[str],
    *,
    status: str = "qualified",
) -> str:
    return await identifier(
        conn,
        """
        insert into public.ai_credentials (user_id, provider, label, model_ids, status)
        values (
          cast(:user as uuid), 'local', 'Cle personnelle', cast(:models as text[]),
          cast(:status as public.credential_status)
        )
        returning id::text as id
        """,
        user=user_id,
        models=model_ids,
        status=status,
    )


async def assign_task(
    conn: Any,
    user_id: str,
    task: str,
    credential_id: str,
    model_id: str,
) -> None:
    await conn.execute(
        text(
            """
            insert into public.ai_task_models (user_id, task, credential_id, model_id)
            values (
              cast(:user as uuid), cast(:task as public.ai_task),
              cast(:credential as uuid), :model
            )
            """
        ),
        {"user": user_id, "task": task, "credential": credential_id, "model": model_id},
    )


async def create_export(
    conn: Any,
    user_id: str,
    *,
    status: str = "done",
    size_bytes: int | None = 1024,
    created_at: datetime = FIXED,
    expires_at: datetime | None = None,
) -> str:
    return await identifier(
        conn,
        """
        insert into public.data_exports (user_id, status, size_bytes, created_at, expires_at)
        values (
          cast(:user as uuid), cast(:status as public.job_status), :size,
          cast(:created as timestamptz), cast(:expires as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        status=status,
        size=size_bytes,
        created=created_at,
        expires=expires_at,
    )


async def create_group(conn: Any, formation_id: str, owner_id: str, invite_code: str) -> str:
    group_id = await identifier(
        conn,
        """
        insert into public.groups (formation_id, owner_id, invite_code)
        values (cast(:formation as uuid), cast(:owner as uuid), :code)
        returning id::text as id
        """,
        formation=formation_id,
        owner=owner_id,
        code=invite_code,
    )
    await conn.execute(
        text("update public.formations set group_id = cast(:group as uuid) where id = cast(:id as uuid)"),
        {"group": group_id, "id": formation_id},
    )
    return group_id


async def join_group(conn: Any, group_id: str, user_id: str) -> None:
    await conn.execute(
        text(
            """
            insert into public.group_members (group_id, user_id, role, joined_at)
            values (cast(:group as uuid), cast(:user as uuid), 'member', cast(:joined as timestamptz))
            """
        ),
        {"group": group_id, "user": user_id, "joined": FIXED},
    )


async def event_by_id(conn: Any, event_id: str) -> Any:
    result = await conn.execute(
        text("select event_id, name, data, user_id from public.event_outbox where event_id = :id"),
        {"id": event_id},
    )
    found = result.mappings().all()
    return found[0] if found else None


async def count(conn: Any, statement: str, **parameters: Any) -> int:
    result = await conn.execute(text(statement), parameters)
    return int(result.mappings().all()[0]["count"])
