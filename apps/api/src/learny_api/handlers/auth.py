"""HTTP handlers of the authentication operations (SPEC-2207).

One `@handler` per operation, no logic: the request-scoped values come from the URL and the
settings, and the use case appends its `Set-Cookie` headers through the pipeline's header bag.
"""

from collections.abc import Callable
from typing import Any, cast

from learny.identity import public as identity

from learny_api.pipeline import Call, handler
from learny_api.special.auth_callback import auth_request, callback_response


def _body(call: Call) -> dict[str, Any]:
    """The validated body as a plain mapping, the union member of the magic link included."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump())


def _emit(call: Call) -> Callable[[str], None]:
    """The sink the use case appends its serialised cookies to."""

    def emit(header: str) -> None:
        call.response_headers.append("set-cookie", header)

    return emit


@handler("auth.magicLink")
async def auth_magic_link(call: Call) -> Any:
    await identity.request_magic_link(
        call.deps, auth_request(call.request, call.deps.settings), _body(call), _emit(call)
    )
    return None


@handler("auth.resend")
async def auth_resend(call: Call) -> Any:
    await identity.resend_link(call.deps, auth_request(call.request, call.deps.settings), _body(call))
    return None


@handler("auth.signIn")
async def auth_sign_in(call: Call) -> Any:
    return await identity.sign_in(
        call.deps, auth_request(call.request, call.deps.settings), _body(call), _emit(call)
    )


@handler("auth.signOut")
async def auth_sign_out(call: Call) -> Any:
    auth = auth_request(call.request, call.deps.settings)
    await identity.sign_out(
        call.deps,
        auth,
        identity.access_token_from_cookies(auth.cookies),
        _emit(call),
    )
    return None


@handler("auth.signUp")
async def auth_sign_up(call: Call) -> Any:
    return await identity.sign_up(
        call.deps, auth_request(call.request, call.deps.settings), _body(call), _emit(call)
    )


@handler("auth.callback")
async def auth_callback(call: Call) -> Any:
    """Registered for completeness: the special registry serves the route with its own query."""
    return await callback_response(call.request, call.deps, call.request_id)


__all__ = [
    "auth_callback",
    "auth_magic_link",
    "auth_resend",
    "auth_sign_in",
    "auth_sign_out",
    "auth_sign_up",
]
