"""Public surface of the identity context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.identity.application.authenticate import (
    AuthDeps,
    assert_fresh,
    assert_legal_acceptance,
    authenticate,
    bearer_token,
    is_legal_exempt,
    parse_cookie_header,
)
from learny.identity.domain.actor import Actor, Transport
from learny.identity.infrastructure.gotrue import (
    GoTrueClient,
    GoTrueError,
    GoTrueSession,
    GoTrueUser,
    map_gotrue_error,
)
from learny.identity.infrastructure.jwt import JwtVerifier
from learny.identity.infrastructure.supabase_cookies import access_token_from_cookies

__all__ = [
    "Actor",
    "AuthDeps",
    "GoTrueClient",
    "GoTrueError",
    "GoTrueSession",
    "GoTrueUser",
    "JwtVerifier",
    "Transport",
    "access_token_from_cookies",
    "assert_fresh",
    "assert_legal_acceptance",
    "authenticate",
    "bearer_token",
    "is_legal_exempt",
    "map_gotrue_error",
    "parse_cookie_header",
]
