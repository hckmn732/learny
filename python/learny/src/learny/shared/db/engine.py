"""Async engine of the Python backend (SPEC-2101 step 1, spikes.md section B).

The Supabase transaction pooler does not support prepared statements across transactions, so
`prepare_threshold` is disabled. `pool_size` is bounded and `max_overflow` is zero: the facade must
degrade rather than open an unbounded number of connections.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from learny.shared.config import Settings


def psycopg_url(database_url: str) -> str:
    """`postgresql://...` -> `postgresql+psycopg://...` (the async driver)."""
    return database_url.replace("postgresql://", "postgresql+psycopg://", 1)


def create_engine(settings: Settings) -> AsyncEngine:
    """Engine shared by the whole process."""
    return create_async_engine(
        psycopg_url(settings.database_url),
        pool_size=settings.database_pool_max,
        max_overflow=0,
        pool_timeout=5,
        pool_recycle=1800,
        # A local stack resets its database between two test campaigns, and a restarted server
        # closes every pooled connection: the checkout pings first so the first request of a run
        # never fails on a dead connection (503) instead of opening a fresh one.
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None, "connect_timeout": 10},
    )
