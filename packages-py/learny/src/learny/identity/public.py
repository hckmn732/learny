"""Public surface of the identity context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.identity.application.ai_models import assign_task_model
from learny.identity.application.authenticate import (
    AuthDeps,
    assert_fresh,
    assert_legal_acceptance,
    authenticate,
    bearer_token,
    is_legal_exempt,
    parse_cookie_header,
)
from learny.identity.application.legal import accept_legal_versions, expected_versions
from learny.identity.application.me import get_me, read_me, update_profile
from learny.identity.application.onboarding import advance_onboarding, get_onboarding_state
from learny.identity.application.ports import IdentityDeps
from learny.identity.application.preferences import get_preferences, update_preferences
from learny.identity.application.profile import get_settings_state, update_settings_profile
from learny.identity.application.purge_security import purge_rows_in_tx, purge_security_rows
from learny.identity.application.sidebar import get_sidebar, read_sidebar, update_sidebar
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
    "IdentityDeps",
    "JwtVerifier",
    "Transport",
    "accept_legal_versions",
    "access_token_from_cookies",
    "advance_onboarding",
    "assert_fresh",
    "assert_legal_acceptance",
    "assign_task_model",
    "authenticate",
    "bearer_token",
    "expected_versions",
    "get_me",
    "get_onboarding_state",
    "get_preferences",
    "get_settings_state",
    "get_sidebar",
    "is_legal_exempt",
    "map_gotrue_error",
    "parse_cookie_header",
    "purge_rows_in_tx",
    "purge_security_rows",
    "read_me",
    "read_sidebar",
    "update_preferences",
    "update_profile",
    "update_settings_profile",
    "update_sidebar",
]
