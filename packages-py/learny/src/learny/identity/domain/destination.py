"""Where a learner lands after authenticating (SPEC-202 EF-8, ADR-0121, CL-4, CL-5, CL-6).

Port of `packages/services/src/auth/destination.ts`. The destinations are paths of the application,
not translated labels: every language keeps the same URL.
"""

from collections.abc import Mapping
from typing import Any, TypeGuard

DEFAULT_DESTINATION = "/accueil"
PROFILE_DELETION_DESTINATION = "/parametres#profil"
ONBOARDING_BLOCKING_STEPS: tuple[str, ...] = ("profil", "rythme", "ia", "rappels", "depart")


def is_safe_next_path(value: str | None) -> TypeGuard[str]:
    """A relative path only: `/...`, never `//host`, never a backslash, 512 characters at most."""
    if value is None or value == "":
        return False
    if len(value) > 512:
        return False
    if not value.startswith("/") or value.startswith("//"):
        return False
    if "\\" in value:
        return False
    # Control characters are stripped by browsers and could hide a second slash.
    return not any(ord(character) < 0x20 or ord(character) == 0x7F for character in value)


def onboarding_destination(step: str) -> str | None:
    """The blocking step of the onboarding, or None once the onboarding is done."""
    return f"/premiers-pas/{step}" if step in ONBOARDING_BLOCKING_STEPS else None


def resolve_post_auth_destination(profile: Mapping[str, Any], next_path: str | None = None) -> str:
    """`resolvePostAuthDestination`: deletion first, then onboarding, then a safe `next`."""
    if profile.get("deletionScheduledFor") is not None:
        return PROFILE_DELETION_DESTINATION
    step = profile.get("onboardingStep")
    onboarding = onboarding_destination(step if isinstance(step, str) else "")
    if onboarding is not None:
        return onboarding
    return next_path if is_safe_next_path(next_path) else DEFAULT_DESTINATION


__all__ = [
    "DEFAULT_DESTINATION",
    "ONBOARDING_BLOCKING_STEPS",
    "PROFILE_DELETION_DESTINATION",
    "is_safe_next_path",
    "onboarding_destination",
    "resolve_post_auth_destination",
]
