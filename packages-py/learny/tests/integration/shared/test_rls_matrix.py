"""[SPEC-2101] RLS matrix replayed under Python against the exported inventory (CA-1, CA-3).

The inventory comes from `api/oracles/vectors/rls-matrix.json`, exported from
`packages/db/src/rls/matrix.ts` (single source of truth). Every fixture is written by the owner role,
then every permission is proved with a real `authenticated` role and JWT claims, inside a savepoint
of a transaction that is rolled back: the local database is left unchanged.
"""

import json
from collections.abc import Awaitable, Callable
from functools import partial
from pathlib import Path
from typing import Any

import pytest
from factories.db_support import (
    as_user,
    count_as,
    failure_code,
    mutate_as,
    rolled_back,
)
from factories.rls_seed import FOREIGN_INSERTS, Seed, create_seed
from learny.shared.db.uow import Database
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2101")

ROOT = Path(__file__).resolve().parents[5]
MATRIX = json.loads((ROOT / "api" / "oracles" / "vectors" / "rls-matrix.json").read_text("utf-8"))
TABLES: list[dict[str, Any]] = MATRIX["tables"]
PERSONAL = [entry for entry in TABLES if entry["category"] == "personal"]
SERVICE = [entry for entry in TABLES if entry["category"] == "service"]

Runner = Callable[[Any, Seed], Awaitable[None]]


async def refused(tx: Any, user_id: str, run: Runner, seed: Seed) -> str:
    """Runs a forged write as `user_id` and returns the SQLSTATE (`00000` when accepted)."""

    async def execute(inner: Any) -> str:
        await run(inner.conn, seed)
        return "00000"

    try:
        return await as_user(tx, user_id, execute)
    except Exception as error:
        return failure_code(error)


def statement_runner(statement: str, parameters: dict[str, Any]) -> Runner:
    async def run(conn: Any, seed: Seed) -> None:
        await conn.execute(text(statement), {**parameters, "user": seed.a})

    return run


async def count_all(tx: Any, table: str) -> int:
    statement = f"select count(*)::int as count from public.{table}"  # noqa: S608 - matrix names
    found = await tx.conn.execute(text(statement))
    return int(found.mappings().all()[0]["count"])


async def policy_count(tx: Any, table: str) -> int:
    found = await tx.conn.execute(
        text(
            "select count(*)::int as count from pg_catalog.pg_policies"
            " where schemaname = 'public' and tablename = :table"
        ),
        {"table": table},
    )
    return int(found.mappings().all()[0]["count"])


async def module_insert(conn: Any, seed: Seed) -> None:
    await conn.execute(
        text(
            "insert into public.modules (formation_id, position, title)"
            " values (cast(:formation as uuid), 99, 'Module forge')"
        ),
        {"formation": seed.programme.formation_id},
    )


async def test_the_exported_matrix_matches_the_catalog(database: Database) -> None:
    """CA-1, CL-6: `pg_catalog` holds exactly the matrix, with RLS and FORCE RLS, and no USING(true)."""

    async def run(tx: Any) -> None:
        rows = (
            (
                await tx.conn.execute(
                    text(
                        "select c.relname as table, c.relrowsecurity as rls,"
                        " c.relforcerowsecurity as forced"
                        " from pg_catalog.pg_class c"
                        " join pg_catalog.pg_namespace n on n.oid = c.relnamespace"
                        " where n.nspname = 'public' and c.relkind = 'r'"
                        " order by c.relname"
                    )
                )
            )
            .mappings()
            .all()
        )
        names = [str(row["table"]) for row in rows]
        assert names == sorted(entry["table"] for entry in TABLES)
        for row in rows:
            assert row["rls"] is True, row["table"]
            assert row["forced"] is True, row["table"]

        policies = (
            (
                await tx.conn.execute(
                    text(
                        "select tablename as table, policyname as name from pg_catalog.pg_policies"
                        " where schemaname = 'public' order by tablename, policyname"
                    )
                )
            )
            .mappings()
            .all()
        )
        declared: dict[str, list[str]] = {}
        for row in policies:
            declared.setdefault(str(row["table"]), []).append(str(row["name"]))
        for entry in TABLES:
            assert sorted(declared.get(entry["table"], [])) == sorted(entry["policies"]), entry["table"]

        permissive = (
            (
                await tx.conn.execute(
                    text(
                        "select c.relname as table, p.polname as name,"
                        " pg_get_expr(p.polqual, p.polrelid) as using_expr,"
                        " pg_get_expr(p.polwithcheck, p.polrelid) as check_expr"
                        " from pg_catalog.pg_policy p"
                        " join pg_catalog.pg_class c on c.oid = p.polrelid"
                        " join pg_catalog.pg_namespace n on n.oid = c.relnamespace"
                        " where n.nspname = 'public'"
                    )
                )
            )
            .mappings()
            .all()
        )
        for row in permissive:
            assert (row["using_expr"] or "") != "true", f"{row['table']}.{row['name']}"
            assert (row["check_expr"] or "") != "true", f"{row['table']}.{row['name']}"

    await rolled_back(database, run)


async def test_personal_tables_refuse_every_foreign_operation(database: Database) -> None:
    """CA-1, CL-1, CL-2: the owner reads; a member and an outsider read, write and delete nothing."""

    async def run(tx: Any) -> None:
        seed = await create_seed(tx.conn)
        for entry in PERSONAL:
            table = entry["table"]
            column = entry["probeColumn"]
            value = seed.rows.get(table)
            assert value is not None, f"missing fixture for {table}"

            assert await count_as(tx, seed.a, table, column, value) >= 1, f"{table}: owner read"
            assert await count_as(tx, seed.b, table, column, value) == 0, f"{table}: member read"
            assert await count_as(tx, seed.c, table, column, value) == 0, f"{table}: outsider read"

            # The table and column names come from the exported matrix, never from a request.
            update_statement = (
                f"update public.{table} set {column} = {column}"  # noqa: S608 - matrix names
                f" where {column} = cast(:value as uuid) returning 1 as id"
            )
            update = await mutate_as(tx, seed.b, update_statement, value)
            assert update == 0, f"{table}: member update"
            delete_statement = (
                f"delete from public.{table}"  # noqa: S608 - matrix names
                f" where {column} = cast(:value as uuid) returning 1 as id"
            )
            delete = await mutate_as(tx, seed.b, delete_statement, value)
            assert delete == 0, f"{table}: member delete"

            foreign = FOREIGN_INSERTS.get(table)
            assert foreign is not None, f"no foreign insert declared for {table}"
            code = await refused(tx, seed.b, foreign, seed)
            assert code in ("42501", "23505", "23514"), f"{table}: forged insert accepted ({code})"

    await rolled_back(database, run)


async def test_the_shared_programme_is_readable_by_members_only(database: Database) -> None:
    """CA-1, CL-3, CL-4: a member reads the programme, only the owner writes it, leaving revokes."""

    async def run(tx: Any) -> None:
        seed = await create_seed(tx.conn)
        formation = seed.programme.formation_id
        for table in ("formations", "modules", "chapters", "notions"):
            column = "id" if table == "formations" else "formation_id"
            assert await count_as(tx, seed.a, table, column, formation) >= 1, f"{table}: owner"
            assert await count_as(tx, seed.b, table, column, formation) >= 1, f"{table}: member"
            assert await count_as(tx, seed.c, table, column, formation) == 0, f"{table}: outsider"

        # The programme link is shared, the personal link stays private to Alice.
        assert await count_as(tx, seed.b, "notion_links", "formation_id", formation) == 1
        assert await count_as(tx, seed.a, "notion_links", "formation_id", formation) == 2
        assert await count_as(tx, seed.c, "notion_links", "formation_id", formation) == 0

        chapter = seed.programme.chapter_ids[0]
        member_update = await mutate_as(
            tx,
            seed.b,
            "update public.chapters set title = 'Chapitre pirate'"
            " where id = cast(:value as uuid) returning 1 as id",
            chapter,
        )
        assert member_update == 0
        owner_update = await mutate_as(
            tx,
            seed.a,
            "update public.chapters set title = 'Chapitre corrige'"
            " where id = cast(:value as uuid) returning 1 as id",
            chapter,
        )
        assert owner_update == 1
        member_delete = await mutate_as(
            tx,
            seed.b,
            "delete from public.modules where id = cast(:value as uuid) returning 1 as id",
            seed.programme.module_ids[0],
        )
        assert member_delete == 0
        assert await refused(tx, seed.b, module_insert, seed) == "42501"

        # Groups: members read, only the owner writes; leaving revokes the programme immediately.
        for reader in (seed.a, seed.b):
            assert await count_as(tx, reader, "groups", "id", seed.group_id) >= 1
        assert await count_as(tx, seed.c, "groups", "id", seed.group_id) == 0
        member_group_update = await mutate_as(
            tx,
            seed.b,
            "update public.groups set invite_code = 'LRN-ZZZZ'"
            " where id = cast(:value as uuid) returning 1 as id",
            seed.group_id,
        )
        assert member_group_update == 0
        await tx.conn.execute(
            text(
                "update public.group_members set left_at = "
                "cast('2026-11-11T12:20:00.000Z' as timestamptz), member_status = 'completed'"
                " where group_id = cast(:group as uuid) and user_id = cast(:user as uuid)"
            ),
            {"group": seed.group_id, "user": seed.b},
        )
        assert await count_as(tx, seed.b, "modules", "formation_id", formation) == 0
        assert await count_as(tx, seed.b, "formations", "id", formation) == 0

    await rolled_back(database, run)


async def test_service_tables_stay_invisible_and_unwritable(database: Database) -> None:
    """CA-1, CA-3, CL-8: no service table exposes a policy or accepts a user insert."""

    forged: dict[str, tuple[str, dict[str, Any]]] = {
        "ai_budget_reservations": (
            "insert into public.ai_budget_reservations"
            " (user_id, local_day, estimated_usd, expires_at)"
            " values (cast(:user as uuid), '2026-11-11', 1,"
            " '2026-11-11T12:30:00Z'::timestamptz)",
            {},
        ),
        "event_outbox": (
            "insert into public.event_outbox (event_id, name, data)"
            " values ('rls-forged-event', 'cron/nightly', '{}'::jsonb)",
            {},
        ),
        "job_deliveries": (
            "insert into public.job_deliveries (event_id, consumer, run_after)"
            " values ('rls-forged-event', 'devtools.demo_job', now())",
            {},
        ),
        "idempotency_keys": (
            "insert into public.idempotency_keys (user_id, key, route, request_hash)"
            " values (cast(:user as uuid), 'rls-forged-01', '/api/v1/rls', :hash)",
            {"hash": "a" * 64},
        ),
        "rate_limits": (
            "insert into public.rate_limits (bucket, tokens) values (:bucket, 1)",
            {"bucket": "user:forged:/api/v1/rls"},
        ),
        "sdd_demo_runs": (
            "insert into public.sdd_demo_runs (run_id) values (gen_random_uuid())",
            {},
        ),
        "stripe_events": (
            "insert into public.stripe_events (event_id, type, created_at)"
            " values ('evt_rls_forged', 'invoice.payment_failed', now())",
            {},
        ),
    }

    async def run(tx: Any) -> None:
        seed = await create_seed(tx.conn)
        for entry in SERVICE:
            table = entry["table"]
            assert entry["policies"] == []
            read = await as_user(tx, seed.a, partial(count_all, table=table))
            assert read == 0, f"{table}: read"
            statement, parameters = forged[table]
            code = await refused(tx, seed.a, statement_runner(statement, parameters), seed)
            assert code == "42501", f"{table}: forged write ({code})"

    await rolled_back(database, run)


async def test_the_harness_detects_a_removed_policy(database: Database) -> None:
    """CA-1, CL-6: dropping a policy is visible, so the catalogue assertion can fail loudly."""

    async def run(tx: Any) -> None:
        assert await policy_count(tx, "resources") == 1
        await tx.conn.execute(text("drop policy resources_owner_all on public.resources"))
        assert await policy_count(tx, "resources") == 0
        await tx.conn.execute(
            text(
                "create policy resources_owner_all on public.resources"
                " for all to authenticated using (owner_id = (select auth.uid()))"
                " with check (owner_id = (select auth.uid()))"
            )
        )
        assert await policy_count(tx, "resources") == 1

    await rolled_back(database, run)
