"""Database fixtures of the worker integration suite (no SDD tag: this module defines no test).

The worker owns the outbox tables, so its tests need the real local stack; the lock and the reset
helpers are the ones of the Python test suite (`learny/tests/factories/db_support.py`).
"""

from collections.abc import AsyncIterator

import pytest
from factories.db_support import open_database
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
