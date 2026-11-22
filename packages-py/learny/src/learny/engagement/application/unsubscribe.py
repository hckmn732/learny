"""One-click unsubscribe (SPEC-2205, ported from `packages/services/src/email/unsubscribe.ts`).

The only public write of the API: it accepts the signed token alone, updates
`notification_settings.channel_email` with the owner role (authorised usage) and never reveals the
address. The three HTML pages are rendered here so the HTTP handler stays a thin adapter.
"""

from learny.engagement.application.email import disable_email_channel
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.infrastructure.email import UNSUBSCRIBE_PATH
from learny.engagement.infrastructure.unsubscribe import verify_unsubscribe_token
from learny.engagement.infrastructure.unsubscribe_page import (
    HtmlPage,
    unsubscribe_done_page,
    unsubscribe_form_page,
    unsubscribe_invalid_page,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr


def read_unsubscribe_token(deps: EngagementDeps, token: str) -> str | None:
    """The learner of a valid token, `None` for an altered or forged one (CL-5)."""
    return verify_unsubscribe_token(deps.email_config.link_secret, token)


async def unsubscribe_by_token(deps: EngagementDeps, token: str) -> dict[str, bool]:
    """EF-5 - disables the e-mail channel of the learner the token names."""
    user_id = read_unsubscribe_token(deps, token)
    if user_id is None:
        raise AppError("UNSUBSCRIBE_TOKEN_INVALID", fr.UNSUBSCRIBE_TOKEN_INVALID)
    updated = await disable_email_channel(deps, user_id)
    # A deleted account has no settings row: the link is treated as expired, nothing is revealed.
    if not updated:
        raise AppError("UNSUBSCRIBE_TOKEN_INVALID", fr.UNSUBSCRIBE_TOKEN_INVALID)
    deps.logger.info("email channel disabled", userId=user_id, outcome="unsubscribed")
    return {"ok": True}


def unsubscribe_form(token: str, nonce: str = "") -> HtmlPage:
    """GET with a valid token: the form, with no state change before the confirmation (CL-6)."""
    return HtmlPage(status=200, html=unsubscribe_form_page(token, UNSUBSCRIBE_PATH, nonce))


def unsubscribe_invalid(nonce: str = "") -> HtmlPage:
    """An altered or unknown token answers 400 with its own page (CL-5)."""
    return HtmlPage(status=400, html=unsubscribe_invalid_page(nonce))


def unsubscribe_done(nonce: str = "") -> HtmlPage:
    """The confirmation page of a successful one-click unsubscribe."""
    return HtmlPage(status=200, html=unsubscribe_done_page(nonce))


__all__ = [
    "read_unsubscribe_token",
    "unsubscribe_by_token",
    "unsubscribe_done",
    "unsubscribe_form",
    "unsubscribe_invalid",
]
