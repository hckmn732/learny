"""HTTP identity resolution of the facade (SPEC-2101 step 2, ADR-2010).

The facade only forwards the request headers: Bearer first, then the relayed session cookie, an
invalid Bearer never falling back to the cookie. The use case lives in `learny.identity.public`.
"""

from collections.abc import Mapping

from learny.identity import public as identity


async def resolve_actor(deps: identity.AuthDeps, headers: Mapping[str, str]) -> identity.Actor | None:
    """Returns the caller of a request, or None for an anonymous call."""
    return await identity.authenticate(deps, headers)
