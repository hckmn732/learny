"""Development demonstration of the upload limits (SPEC-206 EF-7)."""

from typing import Any

from learny.content.public import simulate_upload

from learny_api.pipeline import Call


async def uploads(call: Call) -> dict[str, Any]:
    body: Any = call.body
    return await simulate_upload(str(body.case))
