"""[SPEC-2102] Worker health endpoints: liveness always, readiness probes the database."""

from dataclasses import dataclass, field

import pytest
from fastapi.testclient import TestClient
from learny.shared.time import parse_iso
from learny_worker.health import create_health_app
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingConnection

pytestmark = pytest.mark.spec("SPEC-2102")

FIXED = parse_iso("2026-11-11T12:20:00Z")


@dataclass
class FakeDepsWithDb:
    db: FakeDatabase
    clock: FakeClock = field(default_factory=lambda: FakeClock(FIXED))
    logger: object = None
    settings: object = None


def client(database: FakeDatabase) -> TestClient:
    return TestClient(create_health_app(FakeDepsWithDb(db=database)))


def test_liveness_is_always_ok() -> None:
    response = client(FakeDatabase()).get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_probes_the_database() -> None:
    database = FakeDatabase()
    database.conn = RecordingConnection([[{"ok": 1}]])
    response = client(database).get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert database.opened == 1


def test_readiness_fails_when_the_database_is_down() -> None:
    database = FakeDatabase()
    database.conn = RecordingConnection([RuntimeError("connection lost")])
    response = client(database).get("/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded"}


def test_the_health_app_is_not_a_public_contract() -> None:
    app = create_health_app(FakeDeps(db=FakeDatabase(), clock=FakeClock(FIXED), logger=None))
    assert app.openapi_url is None
    assert app.docs_url is None
