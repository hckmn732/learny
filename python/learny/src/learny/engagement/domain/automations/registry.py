"""Registry and draft validation of the automation engine (SPEC-2205, ET-3 of SPEC-711).

One definition per key at most, an unknown key is a defect, and every draft is validated before any
write (`dedupeKey`, kind, summary, `expiresAt`, notification href). The registry holds no state
beyond the definitions and performs no IO.
"""

import re
from typing import Any, Final

from learny.engagement.domain.automations.keys import is_action_kind, is_automation_key
from learny.engagement.domain.automations.model import (
    ActionDraft,
    ActionView,
    AutomationDefinition,
    DraftDecision,
    DraftError,
)
from learny.engagement.domain.automations.summary import SummaryError, normalize_summary
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import parse_iso, to_iso

DEDUPE_KEY_MAX: Final = 200
ISO_INSTANT: Final = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$"
)


def _validation_error(path: str, message: str) -> DraftError:
    """`validationError`: one French detail plus its single `errors` entry."""
    return DraftError(
        "VALIDATION_FAILED",
        fr.FIELD_INVALID.format(path=path, message=message),
        [{"path": path, "message": message}],
    )


def is_iso_instant(value: Any) -> bool:
    """`z.iso.datetime({ offset: true })`: a `T` separator and an explicit `Z` or offset."""
    if not isinstance(value, str) or ISO_INSTANT.match(value) is None:
        return False
    try:
        parse_iso(value)
    except ValueError:
        return False
    return True


def _draft_view(definition: AutomationDefinition, draft: ActionDraft) -> ActionView:
    """The ephemeral view `explain` reads while the draft is not written yet."""
    return ActionView(
        id="",
        automation=definition.key,
        kind=draft.kind,
        summary="",
        formation_id=draft.formation_id,
        payload=draft.payload,
        undo_payload=draft.undo_payload,
        requires_consent=draft.requires_consent,
        status="pending_consent",
        decided_at=None,
        created_at="",
    )


def validate_draft(
    definition: AutomationDefinition, draft: ActionDraft, tone: str, time_zone: str
) -> DraftDecision:
    """ET-3, CL-1 - validates a draft before any write and returns its summary and payload."""
    if not isinstance(draft.dedupe_key, str):
        raise _validation_error("dedupeKey", fr.DEDUPE_KEY_INVALID)
    if draft.dedupe_key.strip() == "" or len(draft.dedupe_key) > DEDUPE_KEY_MAX:
        raise _validation_error("dedupeKey", fr.DEDUPE_KEY_INVALID)
    if not is_action_kind(draft.kind):
        raise _validation_error("kind", fr.KIND_INVALID)
    summary = definition.explain(_draft_view(definition, draft), tone, time_zone)
    try:
        checked = normalize_summary(summary)
    except SummaryError as error:
        raise _validation_error("summary", fr.SUMMARY_REJECTED.format(message=error.message)) from error
    payload: dict[str, Any] = {**draft.payload, "dedupeKey": draft.dedupe_key}
    if draft.expires_at is not None:
        if not is_iso_instant(draft.expires_at):
            raise _validation_error("expiresAt", fr.EXPIRES_AT_INVALID)
        payload["expiresAt"] = to_iso(parse_iso(draft.expires_at))
    if draft.notification is not None and not draft.notification.href.startswith("/"):
        raise _validation_error("notification.href", fr.NOTIFICATION_HREF_INVALID)
    return DraftDecision(summary=checked, payload=payload)


class AutomationRegistry:
    """One definition per key at most (CA-1); an unknown key is a defect, not a silent skip."""

    def __init__(self) -> None:
        self._definitions: dict[str, AutomationDefinition] = {}

    def register(self, definition: AutomationDefinition) -> None:
        if not is_automation_key(definition.key):
            raise DraftError("VALIDATION_FAILED", fr.ENGINE_UNKNOWN_KEY.format(key=definition.key))
        if definition.key in self._definitions:
            raise DraftError("CONFLICT", fr.ENGINE_DUPLICATE_KEY.format(key=definition.key))
        self._definitions[definition.key] = definition

    def get(self, key: str) -> AutomationDefinition | None:
        return self._definitions.get(key)

    def require(self, key: str) -> AutomationDefinition:
        definition = self._definitions.get(key)
        if definition is None:
            raise DraftError("NOT_FOUND", fr.ENGINE_MISSING_KEY.format(key=key))
        return definition

    def keys(self) -> list[str]:
        return list(self._definitions)

    @property
    def size(self) -> int:
        return len(self._definitions)


def create_registry() -> AutomationRegistry:
    return AutomationRegistry()


__all__ = [
    "DEDUPE_KEY_MAX",
    "AutomationRegistry",
    "create_registry",
    "is_iso_instant",
    "validate_draft",
]
