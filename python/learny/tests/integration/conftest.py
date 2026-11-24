"""Database fixtures of the Python integration suite.

The shared local stack is serialised by `flock /tmp/learny-sdd-db.lock`: the fixture takes the lock
itself so `validate.mjs`, which invokes pytest directly, stays serialised with every other database
command. Nothing is committed: tests wrap their work in `rolled_back`.
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
