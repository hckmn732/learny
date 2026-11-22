"""[SPEC-2207] Thin adapters of the `dev.*` operations (no logic).

Each handler forwards to the development use case of its family. The special registry wraps these
same handlers with the development guard, so a call is served exactly like `devRoute` in
`packages/api-routes/src/special/dev-routes.ts`.
"""

from typing import Any

from learny_api.pipeline import Call, handler
from learny_api.special import dev_echo


@handler("dev.echo")
async def echo(call: Call) -> dict[str, Any]:
    return await dev_echo.echo(call)


@handler("dev.items")
async def items(call: Call) -> dict[str, Any]:
    return await dev_echo.items(call)
