"""Sending of one e-mail to a learner (SPEC-2205).

The profile is read with the owner role (authorised usage: the address and the tone of the
recipient). `send_email` never checks `channel_email`: the caller does (SPEC-209), the welcome
function does it itself (EF-6). The log never carries the address.
"""

from collections.abc import Mapping
from typing import Any

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.templates import Tone
from learny.engagement.infrastructure import queries
from learny.engagement.infrastructure.email import EmailMessage
from learny.engagement.infrastructure.email_templates import (
    EMAIL_TEMPLATE_KEYS,
    build_message,
    render_email,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr

WELCOME_TEMPLATE = "welcome"


def welcome_idempotency_key(user_id: str) -> str:
    return f"welcome:{user_id}"


async def send_email(
    deps: EngagementDeps,
    *,
    user_id: str,
    template: str,
    props: Mapping[str, Any],
    idempotency_key: str,
    to_override: str | None = None,
    tone_override: str | None = None,
) -> dict[str, Any]:
    """EF-1 - renders the template for the learner, then hands it to the configured transport."""
    if template not in EMAIL_TEMPLATE_KEYS:
        raise AppError("VALIDATION_FAILED", fr.NOTIFY_INVALID)
    async with deps.db.service_tx() as tx:
        profile = await queries.read_profile(tx, user_id)
    if profile is None and to_override is None:
        raise AppError("NOT_FOUND", fr.NOTIFY_PROFILE_NOT_FOUND)
    tone = tone_override or (None if profile is None else str(profile["tutor_tone"]))
    tone_value: Tone = "tu" if tone == "tu" else "vous"
    recipient = to_override if to_override is not None else None if profile is None else str(profile["email"])
    if recipient is None:
        raise AppError("NOT_FOUND", fr.NOTIFY_PROFILE_NOT_FOUND)
    rendered = render_email(
        {"template": template, "props": dict(props)},
        tone=tone_value,
        user_id=user_id,
        app_url=deps.email_config.app_url,
        link_secret=deps.email_config.link_secret,
    )
    message: EmailMessage = build_message(
        rendered,
        recipient=recipient,
        sender=deps.email_config.sender,
        idempotency_key=idempotency_key,
    )
    message_id = await deps.email.send(message, idempotency_key=idempotency_key)
    deps.logger.info(
        "email sent",
        userId=user_id,
        template=template,
        component=deps.email.name,
        messageId=message_id,
    )
    return {"messageId": message_id, "category": rendered.category}


async def can_send_service_email(deps: EngagementDeps, user_id: str) -> bool:
    """`notification_settings.channel_email` of the learner; a missing row never allows a send."""
    async with deps.db.service_tx() as tx:
        row = await queries.select_settings(tx, user_id)
    return row is not None and row.channel_email


async def disable_email_channel(deps: EngagementDeps, user_id: str) -> bool:
    """Sets `channel_email = false` for the learner (one-click unsubscribe, ADR-0124)."""
    async with deps.db.service_tx() as tx:
        return await queries.disable_email_channel(tx, user_id=user_id, updated_at=deps.clock.now())


async def send_welcome_email(deps: EngagementDeps, user_id: str) -> dict[str, Any]:
    """EF-6 - the welcome e-mail: outside the cap and the quiet hours, only if the channel is on."""
    if not await can_send_service_email(deps, user_id):
        deps.logger.info("welcome e-mail skipped", userId=user_id, outcome="email_channel_off")
        return {"sent": False}
    async with deps.db.service_tx() as tx:
        profile = await queries.read_profile(tx, user_id)
    if profile is None:
        raise AppError("NOT_FOUND", fr.NOTIFY_PROFILE_NOT_FOUND)
    first_name = profile["first_name"]
    result = await send_email(
        deps,
        user_id=user_id,
        template=WELCOME_TEMPLATE,
        props={"firstName": None if first_name is None else str(first_name)},
        idempotency_key=welcome_idempotency_key(user_id),
    )
    return {"sent": True, "messageId": result["messageId"]}


__all__ = [
    "WELCOME_TEMPLATE",
    "can_send_service_email",
    "disable_email_channel",
    "send_email",
    "send_welcome_email",
    "welcome_idempotency_key",
]
