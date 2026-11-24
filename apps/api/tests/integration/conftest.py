"""Database fixture of the facade integration suite (SPEC-4001).

The shared local stack is serialised by `flock /tmp/learny-sdd-db.lock`: `open_database` takes the
lock itself, so a pytest run stays serialised with every other database command.
"""

from collections.abc import AsyncIterator

import pytest
from factories.db_support import DatabaseLock, open_database
from learny.shared.db.uow import Database


@pytest.fixture
async def database() -> AsyncIterator[Database]:
    """A `Database` on the local stack, exclusively locked for the duration of the test."""
    instance, lock = await open_database()
    try:
        yield instance
    finally:
        await instance.close()
        lock.release()


__all__ = ["DatabaseLock", "database"]
