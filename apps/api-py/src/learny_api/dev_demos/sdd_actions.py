"""Action pages of the SDD demonstrations: the demonstration account, its key, a qualification run.

Port of `packages/api-routes/src/dev-sdd/spec-{501,505,506}.ts`. These pages work on the seeded
demonstration account through the real services, or on an account the request builds and removes;
the French texts live in `locale_fr/dev_sdd_fixtures.py`.
"""

import json
from typing import Any

from learny.identity import public as identity
from learny.shared.errors import AppError
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.tutor import public as tutor
from sqlalchemy import text

from learny_api.dev_demos.guard import require_dev
from learny_api.dev_demos.sdd_state import spec_505
from learny_api.dev_demos.support import DELETE_AUTH_USER, demo_email, new_user
from learny_api.pipeline import Call

SELECT_DEMO_PROFILE = text("select id::text as id, email from public.profiles where email = :email")

# SPEC-506 - the isolated account of the qualification run and its fake key, never returned.
QUALIFICATION_MODEL = "gpt-qualification-demo"
QUALIFICATION_KEY = "sk-test-0000000000a91F"
QUALIFICATION_INPUT = {"modelId": QUALIFICATION_MODEL, "task": "tutor"}
QUALIFICATION_SCENARIOS = {
    "success": "compatibility-tutor-success",
    "invalid": "compatibility-tutor-reserve",
}


async def demo_identity(call: Call) -> identity.Actor | None:
    """`demoIdentity`: the seeded demonstration account, or nothing when the seed is absent."""
    async with call.deps.db.service_tx() as tx:
        row = (
            (await tx.conn.execute(SELECT_DEMO_PROFILE, {"email": fixture.DEMO_USER_EMAIL}))
            .mappings()
            .first()
        )
    if row is None:
        return None
    return identity.Actor(
        user_id=str(row["id"]),
        email=str(row["email"]),
        email_confirmed=True,
        transport="bearer",
    )


async def spec_501(call: Call) -> dict[str, Any]:
    """`devSddSpec501Demo`: the page only announces whether the demonstration account exists."""
    require_dev(call.deps)
    try:
        found = await demo_identity(call)
    except AppError as error:
        return {"brick": None, "error": error.detail}
    if found is None:
        return {"brick": None, "error": fixture.DEMO_SEED_MISSING}
    return {"brick": None, "error": None}


async def spec_505_create(call: Call) -> dict[str, Any]:
    """`devSddSpec505Create`: one personal key created by the real service, then the page reloaded."""
    require_dev(call.deps)
    found = await demo_identity(call)
    if found is None:
        raise AppError("NOT_FOUND", fixture.DEMO_ABSENT)
    body: Any = call.body
    provider = getattr(body, "provider", None)
    model = getattr(body, "model", None)
    if provider is None or model is None:
        raise AppError("VALIDATION_FAILED", fixture.CHOOSE_PROVIDER_MODEL)
    request: dict[str, Any] = {"provider": provider, "modelIds": [model]}
    base_url = getattr(body, "baseUrl", None)
    api_key = getattr(body, "apiKey", None)
    if base_url is not None:
        request["baseUrl"] = base_url
    if api_key is not None:
        request["apiKey"] = api_key
    await tutor.create_credential(call.deps, found, request)
    return await spec_505(call)


async def spec_505_delete(call: Call) -> dict[str, Any]:
    """`devSddSpec505Delete`: the key removed by the real service, then the page reloaded."""
    require_dev(call.deps)
    body: Any = call.body
    credential_id = getattr(body, "id", None)
    if credential_id is None:
        raise AppError("VALIDATION_FAILED", fixture.KEY_ID_MISSING)
    found = await demo_identity(call)
    if found is None:
        raise AppError("NOT_FOUND", fixture.DEMO_ABSENT)
    await tutor.delete_credential(call.deps, found, str(credential_id))
    return await spec_505(call)


async def spec_506(call: Call) -> dict[str, Any]:
    """`devSddSpec506Run`: an isolated account and key, the real qualification, then removal."""
    require_dev(call.deps)
    requested = getattr(call.body, "scenario", None)
    scenario = "invalid" if requested == "invalid" else "success"
    listing = json.dumps(QUALIFICATION_INPUT, indent=2)
    email = demo_email(call.deps.clock.now(), "sdd-506-demo")
    async with call.deps.db.service_tx() as tx:
        user_id = await new_user(tx.conn, email=email, metadata={"first_name": "Alex"})
    actor = identity.Actor(
        user_id=user_id,
        email=email,
        email_confirmed=True,
        transport="bearer",
    )
    try:
        created = await tutor.create_credential(
            call.deps,
            actor,
            {"provider": "openai", "modelIds": [QUALIFICATION_MODEL], "apiKey": QUALIFICATION_KEY},
        )
        report = await tutor.qualify_credential(
            call.deps,
            actor,
            str(created["id"]),
            QUALIFICATION_MODEL,
            task="tutor",
            scenario=QUALIFICATION_SCENARIOS[scenario],
        )
        return {"scenario": scenario, "input": listing, "report": report, "error": None}
    except Exception as error:
        return {
            "scenario": scenario,
            "input": listing,
            "report": None,
            "error": error.detail if isinstance(error, AppError) else fixture.DEMO_UNAVAILABLE,
        }
    finally:
        async with call.deps.db.service_tx() as tx:
            await tx.conn.execute(DELETE_AUTH_USER, {"email": email})
