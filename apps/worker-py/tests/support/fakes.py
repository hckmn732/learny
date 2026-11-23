"""Fakes of the worker unit tests: a database that records the SQL it receives.

The worker only talks to the database through `service_tx()` and `conn.execute()`, so a recording
fake is enough to prove which statement is emitted for each delivery state, without a database.
"""

from collections.abc import Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any


class FakeResult:
    def __init__(self, rows: Sequence[Mapping[str, Any]]) -> None:
        self._rows = list(rows)

    def mappings(self) -> "FakeResult":
        return self

    def all(self) -> list[Mapping[str, Any]]:
        return list(self._rows)

    def first(self) -> Mapping[str, Any] | None:
        return self._rows[0] if self._rows else None

    def __iter__(self) -> Any:
        return iter(self._rows)

    def scalar(self) -> Any:
        return self._rows[0] if self._rows else None


class RecordingConnection:
    """Records every `(statement, parameters)` pair and replays prepared outcomes in order."""

    def __init__(self, outcomes: Sequence[Any] | None = None) -> None:
        self._outcomes = list(outcomes or [])
        self.calls: list[tuple[str, Mapping[str, Any]]] = []

    async def execute(self, statement: Any, parameters: Any = None) -> FakeResult:
        self.calls.append((str(statement), dict(parameters or {})))
        outcome = self._outcomes.pop(0) if self._outcomes else []
        if isinstance(outcome, Exception):
            raise outcome
        return FakeResult(outcome)

    def statements(self) -> list[str]:
        return [str(statement) for statement, _ in self.calls]

    def parameters(self) -> list[Mapping[str, Any]]:
        return [parameters for _, parameters in self.calls]


@dataclass
class FakeTx:
    conn: RecordingConnection
    emitted: list[tuple[str, dict[str, Any], str | None]] = field(default_factory=list)

    async def emit(
        self,
        name: str,
        data: Mapping[str, Any],
        *,
        event_id: str | None = None,
        user_id: str | None = None,
    ) -> str:
        identifier = event_id or f"{name}:generated"
        self.emitted.append((name, dict(data), user_id))
        self.conn.calls.append((f"emit {identifier}", dict(data)))
        return identifier


@dataclass
class FakeDatabase:
    conn: RecordingConnection = field(default_factory=RecordingConnection)
    opened: int = 0
    emitted: list[tuple[str, dict[str, Any], str | None]] = field(default_factory=list)
    engine: Any = None

    @asynccontextmanager
    async def service_tx(self) -> Any:
        self.opened += 1
        yield FakeTx(self.conn, self.emitted)


@dataclass
class FakeClock:
    instant: Any

    def now(self) -> Any:
        return self.instant


@dataclass
class FakeDeps:
    db: FakeDatabase
    clock: FakeClock
    logger: Any
    settings: Any = None


class RecordingLogger:
    """Captures the `(message, fields)` pairs the loops log."""

    def __init__(self) -> None:
        self.lines: list[tuple[str, Mapping[str, Any]]] = []

    def _record(self, message: str, **fields: Any) -> None:
        self.lines.append((message, fields))

    def info(self, message: str, **fields: Any) -> None:
        self._record(message, **fields)

    def warning(self, message: str, **fields: Any) -> None:
        self._record(message, **fields)

    def error(self, message: str, **fields: Any) -> None:
        self._record(message, **fields)

    def debug(self, message: str, **fields: Any) -> None:
        self._record(message, **fields)

    def messages(self) -> list[str]:
        return [message for message, _ in self.lines]
