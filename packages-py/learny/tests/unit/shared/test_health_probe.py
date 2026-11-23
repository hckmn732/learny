"""[SPEC-2207] Health probe: safe build metadata, bounded database probe and answer document.

The cases replay the ones of `packages/api-routes/src/deps/health.test.ts`: every value falls back
to a safe default, a failure is a status and never an error message, and the status is 503 only
when the database is unavailable.
"""

import asyncio

import pytest
from learny.shared.health import (
    BuildInfo,
    build_info,
    build_status,
    get_health,
    health_body,
    probe_database,
)

pytestmark = pytest.mark.spec("SPEC-2207")


async def working() -> None:
    return None


async def refusing() -> None:
    raise RuntimeError("connection refused: postgresql://owner:secret@db.internal")


async def hanging() -> None:
    await asyncio.sleep(30)


def test_a_valid_build_metadata_is_kept_and_lower_cased() -> None:
    build = build_info({"APP_VERSION": "1.4.2", "GIT_COMMIT": "ABCDEF1"})

    assert build == BuildInfo(version="1.4.2", commit="abcdef1")
    assert build_status(build) == "ok"


def test_the_safe_defaults_are_dev_and_unknown() -> None:
    build = build_info({})

    assert (build.version, build.commit) == ("dev", "unknown")
    assert build_status(build) == "not_configured"


def test_an_out_of_format_version_never_leaks() -> None:
    build = build_info({"APP_VERSION": "../../etc/passwd", "GIT_COMMIT": "not-a-commit"})

    assert (build.version, build.commit) == ("dev", "unknown")


def test_the_build_is_not_configured_when_one_identifier_falls_back() -> None:
    assert build_status(BuildInfo(version="1.0.0", commit="unknown")) == "not_configured"
    assert build_status(BuildInfo(version="dev", commit="abcdef1")) == "not_configured"


async def test_the_probe_reports_ok_unavailable_and_not_configured() -> None:
    assert await probe_database(working) == "ok"
    assert await probe_database(refusing) == "unavailable"
    assert await probe_database(None) == "not_configured"


async def test_the_probe_is_bounded_by_its_timeout() -> None:
    assert await probe_database(hanging, timeout_ms=10) == "unavailable"


def test_the_answer_document_follows_the_contract_order() -> None:
    body = health_body("ok", BuildInfo(version="1.0.0", commit="abcdef1"))

    assert list(body) == ["status", "version", "commit", "database", "components"]
    assert body == {
        "status": "ok",
        "version": "1.0.0",
        "commit": "abcdef1",
        "database": "ok",
        "components": {"database": "ok", "build": "ok"},
    }


async def test_a_healthy_probe_answers_200() -> None:
    status, body = await get_health(working, {"APP_VERSION": "1.0.0", "GIT_COMMIT": "abcdef1"})

    assert status == 200
    assert body["status"] == "ok"
    assert body["components"] == {"database": "ok", "build": "ok"}


async def test_an_unavailable_database_answers_503_without_its_message() -> None:
    status, body = await get_health(refusing, {})

    assert status == 503
    assert body == {
        "status": "degraded",
        "version": "dev",
        "commit": "unknown",
        "database": "unavailable",
        "components": {"database": "unavailable", "build": "not_configured"},
    }
    assert "secret" not in str(body)


async def test_an_unconfigured_database_answers_200_and_not_configured() -> None:
    status, body = await get_health(None, {})

    assert status == 200
    assert body["database"] == "not_configured"
    assert body["status"] == "degraded"
