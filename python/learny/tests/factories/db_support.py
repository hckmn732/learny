"""Database fixtures of the Python integration suite (no SDD tag: this module defines no test).

The database is the shared local stack: every database command of the repository is serialised by
`flock /tmp/learny-sdd-db.lock` (AGENTS.md), so the `database` fixture takes that lock itself and
holds it for the duration of the test. Nothing is committed: callers wrap their work in
`rolled_back`, which raises to roll the service transaction back.
"""

import os
import re
import subprocess
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any

import pytest
from learny.identity.domain.actor import Actor
from learny.shared.config import Settings
from learny.shared.db.uow import Database, claims_json
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

LOCK_PATH = "/tmp/learny-sdd-db.lock"  # noqa: S108 - the lock path is fixed by AGENTS.md
INSTALL_HINT = "local Supabase is not reachable: run `supabase start` or export DATABASE_URL"

SET_CLAIMS = text(
    "select set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true)"
)


class RolledBack(Exception):
    """Raised on purpose to roll the enclosing transaction back."""


def database_url() -> str:
    """`DATABASE_URL`, else the `DB_URL` reported by `supabase status`."""
    explicit = os.environ.get("DATABASE_URL")
    if explicit:
        return explicit
    try:
        completed = subprocess.run(
            ["supabase", "status", "-o", "env"],  # noqa: S607 - resolved through PATH
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError):
        pytest.skip(INSTALL_HINT)
    match = re.search(r'^DB_URL="?([^"\n]+)"?$', completed.stdout, re.MULTILINE)
    if match is None:
        pytest.skip(INSTALL_HINT)
    return match.group(1)


def inherited_lock() -> bool:
    """True when the process already holds the lock file, typically through `flock <cmd>`.

    `flock` (util-linux) opens the file and runs the command with that descriptor inherited, so the
    run is already serialised. Taking the lock again on another descriptor would wait for that very
    descriptor and deadlock the suite.
    """
    try:
        entries = os.listdir("/proc/self/fd")
    except OSError:
        return False
    for entry in entries:
        try:
            if os.readlink(f"/proc/self/fd/{entry}") == LOCK_PATH:
                return True
        except OSError:
            continue
    return False


class DatabaseLock:
    """Exclusive advisory lock of the shared database, released when the test ends."""

    def __init__(self) -> None:
        self._handle: Any = None

    def acquire(self) -> None:
        try:
            import fcntl
        except ImportError:  # pragma: no cover - the suite runs on POSIX
            return
        if inherited_lock():
            return
        self._handle = open(LOCK_PATH, "a+", encoding="utf-8")  # noqa: SIM115 - held by the test
        fcntl.flock(self._handle.fileno(), fcntl.LOCK_EX)

    def release(self) -> None:
        if self._handle is None:
            return
        import fcntl

        fcntl.flock(self._handle.fileno(), fcntl.LOCK_UN)
        self._handle.close()
        self._handle = None


async def open_database() -> tuple[Database, DatabaseLock]:
    """A `Database` on the local stack, exclusively locked until `lock.release()`."""
    lock = DatabaseLock()
    lock.acquire()
    return Database.from_settings(Settings(database_url=database_url())), lock


async def rolled_back[T](database: Database, run: Callable[[Any], Awaitable[T]]) -> T:
    """Runs `run` in a service transaction that is always rolled back."""
    result: list[T] = []
    try:
        async with database.service_tx() as tx:
            result.append(await run(tx))
            raise RolledBack
    except RolledBack:
        pass
    return result[0]


def failure_code(error: BaseException) -> str:
    """The SQLSTATE of a psycopg error, or `unknown`."""
    current: BaseException | None = error
    for _ in range(8):
        if current is None:
            break
        for candidate in (current, getattr(current, "orig", None), getattr(current, "cause", None)):
            code = getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)
            if isinstance(code, str) and len(code) == 5:
                return code
        current = current.__cause__ or current.__context__
    return "unknown"


def is_refused_insert(error: BaseException) -> bool:
    """`42501` (RLS or privilege), `23505` (unique), `23514` (check): a refused forged insert."""
    return failure_code(error) in ("42501", "23505", "23514")


async def as_user[T](tx: Any, user_id: str, run: Callable[[Any], Awaitable[T]]) -> T:
    """Runs `run` as `authenticated` with the claims of `user_id`, inside a savepoint."""
    connection = tx.conn
    name = f"as_user_{abs(hash((user_id, id(run)))) % 1000003}"
    await connection.execute(_savepoint(f"savepoint {name}"))
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    await connection.execute(SET_CLAIMS, {"claims": claims_json(actor), "sub": user_id})
    await connection.execute(text("set local role authenticated"))
    try:
        result = await run(tx)
    except DBAPIError as error:
        await _best_effort(connection, "reset role")
        await _best_effort(connection, f"rollback to savepoint {name}")
        raise error
    except Exception:
        await _best_effort(connection, "reset role")
        await _best_effort(connection, f"rollback to savepoint {name}")
        raise
    await connection.execute(text("reset role"))
    await connection.execute(_savepoint(f"release savepoint {name}"))
    return result


def _savepoint(statement: str) -> Any:
    """`text()` of a savepoint statement whose name is generated here, never from a request."""
    return text(statement)


async def _best_effort(connection: Any, statement: str) -> None:
    # Restoring the role is best effort: the original error is more useful to the caller.
    with suppress(DBAPIError):
        await connection.execute(_savepoint(statement))


async def count_as(tx: Any, user_id: str, table: str, column: str, value: str) -> int:
    """`count(*)` of one table under the caller's identity, for the probe of the matrix."""

    async def run(inner: Any) -> int:
        statement = (
            f"select count(*)::int as count from public.{table}"  # noqa: S608 - names come from the matrix
            f" where {column} = cast(:value as uuid)"
        )
        found = await inner.conn.execute(text(statement), {"value": value})
        return int(found.mappings().all()[0]["count"])

    return await as_user(tx, user_id, run)


async def mutate_as(tx: Any, user_id: str, statement: str, value: str) -> int:
    """Runs an update or a delete under the caller's identity and returns the affected row count."""

    async def run(inner: Any) -> int:
        result = await inner.conn.execute(text(statement), {"value": value})
        return len(result.mappings().all())

    return await as_user(tx, user_id, run)


async def refuse_insert(tx: Any, user_id: str, statement: str, parameters: Any) -> str:
    """Runs a forged insert as `user_id` and returns the SQLSTATE (00000 when it was accepted)."""

    async def run(inner: Any) -> str:
        await inner.conn.execute(text(statement), parameters)
        return "00000"

    try:
        return await as_user(tx, user_id, run)
    except DBAPIError as error:
        return failure_code(error)
