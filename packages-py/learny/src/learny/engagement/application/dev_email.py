"""Development demonstrations of SPEC-204: template preview, send and memory outbox.

Port of `packages/services/src/email/dev.ts`. The preview renders the real template with the sample
data of the tone; the send goes through the real service to the signed-in learner; the outbox exists
only for the `memory` transport, so a visual capture never inherits another scenario's messages.
"""

from typing import Any

from learny.engagement.application.email import send_email
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.templates import Tone
from learny.engagement.infrastructure.email_fixtures import fixture_for
from learny.engagement.infrastructure.email_templates import render_email
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.locale_fr.details import UNAUTHENTICATED

PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000204"


def tone_of(value: str) -> Tone:
    """The tone of the contract (`tu` or `vous`), defaulting to the polite one."""
    return "tu" if value == "tu" else "vous"


async def preview_email(
    deps: EngagementDeps,
    *,
    template: str,
    tone: str,
    user_id: str | None,
) -> dict[str, Any]:
    """`previewEmail`: the rendered template with the sample data of the requested tone."""
    resolved = tone_of(tone)
    rendered = render_email(
        {"template": template, "props": fixture_for(template, resolved)},
        tone=resolved,
        user_id=user_id or PREVIEW_USER_ID,
        app_url=deps.email_config.app_url,
        link_secret=deps.email_config.link_secret,
    )
    return {
        "template": template,
        "tone": tone,
        "category": rendered.category,
        "subject": rendered.subject,
        "html": rendered.html,
        "text": rendered.text,
        "headers": dict(rendered.headers),
    }


async def send_demo_email(
    deps: EngagementDeps,
    *,
    user_id: str | None,
    template: str,
    tone: str,
) -> dict[str, Any]:
    """`sendDemoEmail`: one message to the signed-in learner through the configured transport."""
    if user_id is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
    resolved = tone_of(tone)
    result = await send_email(
        deps,
        user_id=user_id,
        template=template,
        props=fixture_for(template, resolved),
        # One message per click: the wrapper's Idempotency-Key deduplicates the HTTP replays.
        idempotency_key=f"sdd-204:{template}:{new_id()}",
        tone_override=resolved,
    )
    return {"messageId": result["messageId"], "transport": deps.email.name}


def list_demo_outbox(deps: EngagementDeps) -> dict[str, Any]:
    """`listDemoOutbox`: the captured messages of the `memory` transport, oldest first."""
    entries_of = getattr(deps.email, "entries", None)
    if deps.email.name != "memory" or not callable(entries_of):
        return {"items": []}
    items: list[dict[str, Any]] = []
    for entry in entries_of():
        template = next((tag.value for tag in entry.message.tags if tag.name == "template"), "")
        items.append(
            {
                "to": entry.message.to,
                "subject": entry.message.subject,
                "headers": dict(entry.message.headers),
                "template": template,
                "at": entry.at,
            }
        )
    return {"items": items}


def purge_demo_outbox(deps: EngagementDeps) -> dict[str, Any]:
    """`purgeDemoOutbox`: empties the process-wide outbox of the demonstration transport."""
    clear = getattr(deps.email, "clear", None)
    if deps.email.name == "memory" and callable(clear):
        clear()
    return {"items": []}
