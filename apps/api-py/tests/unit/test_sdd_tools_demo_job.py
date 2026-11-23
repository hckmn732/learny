"""[SPEC-203] The demonstration job runs in the API process (ported by SPEC-2302)."""

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from learny.shared.clock import FixedClock
from learny.shared.time import parse_iso
from learny_api.special import sdd_tools
from learny_api.special.sdd_tools import DEMO_JOB_KEY, DEMO_JOB_PATH, DEMO_STORE, demo_job
from starlette.requests import Request

pytestmark = pytest.mark.spec("SPEC-203")

FIXED = parse_iso("2026-11-11T12:20:00Z")


def context(enabled: bool = True) -> Any:
    env = {"ENABLE_SDD_PAGES": "true" if enabled else "false", "APP_ENV": "test"}
    return SimpleNamespace(
        env=env,
        deps=SimpleNamespace(clock=FixedClock(FIXED)),
        catalog={},
    )


def request(body: Any) -> Request:
    payload = json.dumps(body).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "path": DEMO_JOB_PATH,
        "headers": [],
        "query_string": b"",
    }
    state = {"sent": False}

    async def receive() -> dict[str, Any]:
        if state["sent"]:
            return {"type": "http.disconnect"}
        state["sent"] = True
        return {"type": "http.request", "body": payload, "more_body": False}

    return Request(scope, receive)


async def call(body: Any, enabled: bool = True) -> tuple[int, Any, dict[str, str]]:
    response = await demo_job(request(body), context(enabled))
    return response.status_code, json.loads(response.body), dict(response.headers)


@pytest.fixture(autouse=True)
def empty_store() -> Any:
    DEMO_STORE.clear()
    yield
    DEMO_STORE.clear()


async def test_the_two_steps_run_and_return_the_doubled_value() -> None:
    status, body, headers = await call({"runId": "run-a", "value": 4})

    assert status == 200
    assert headers["cache-control"] == "no-store"
    assert body == {
        "status": "completed",
        "steps": [
            {"name": "validate-input", "status": "completed", "attempts": 1},
            {"name": "persist-result", "status": "completed", "attempts": 1},
        ],
        "result": {"runId": "run-a", "doubledValue": 8},
        "error": None,
    }
    assert DEMO_STORE.find("run-a") == {
        "runId": "run-a",
        "value": 4,
        "doubledValue": 8,
        "persistedAt": "2026-11-11T12:20:00.000Z",
    }


async def test_a_replay_returns_the_stored_result_without_a_second_write() -> None:
    first = await call({"runId": "run-a", "value": 4})
    second = await call({"runId": "run-a", "value": 4})

    assert first[1]["result"] == second[1]["result"] == {"runId": "run-a", "doubledValue": 8}
    assert second[1]["steps"][1]["status"] == "completed"


async def test_the_same_run_id_with_another_value_conflicts() -> None:
    await call({"runId": "run-a", "value": 4})
    status, body, _ = await call({"runId": "run-a", "value": 5})

    assert status == 200
    assert body["status"] == "failed"
    assert body["error"] == {"code": "IDEMPOTENCY_CONFLICT"}
    assert body["steps"] == [
        {"name": "validate-input", "status": "failed", "attempts": 1},
        {"name": "persist-result", "status": "pending", "attempts": 0},
    ]


@pytest.mark.parametrize(
    "body",
    [
        {"runId": "   ", "value": 4},
        {"runId": "x" * 65, "value": 4},
        {"runId": "run-a", "value": 1.5},
        {"runId": "run-a", "value": 1_000_001},
        {"runId": "run-a", "value": -1_000_001},
    ],
)
async def test_the_job_bounds_are_validated_before_any_step(body: dict[str, Any]) -> None:
    status, payload, _ = await call(body)

    assert status == 200
    assert payload["status"] == "failed"
    assert payload["error"] == {"code": "VALIDATION_FAILED"}
    assert [step["status"] for step in payload["steps"]] == ["pending", "pending"]


@pytest.mark.parametrize("body", [{}, {"runId": "run-a"}, {"runId": 1, "value": 4}, []])
async def test_the_route_shape_answers_the_problem_of_the_dev_tools(body: Any) -> None:
    status, payload, headers = await call(body)

    assert status == 400
    assert headers["content-type"] == "application/problem+json"
    assert payload == {
        "type": "about:blank",
        "title": "Requête invalide",
        "status": 400,
        "code": "VALIDATION_FAILED",
    }


async def test_the_route_is_closed_without_the_exact_flag() -> None:
    response = await demo_job(request({"runId": "run-a", "value": 4}), context(enabled=False))

    assert response.status_code == 404
    assert response.body == b""


def test_install_registers_the_route_when_python_owns_it() -> None:
    app = FastAPI()
    ownership = SimpleNamespace(special={DEMO_JOB_KEY: "py"})

    installed = sdd_tools.install(app, context(), ownership)

    assert DEMO_JOB_KEY in installed
    assert any(getattr(route, "path", None) == DEMO_JOB_PATH for route in app.routes)
