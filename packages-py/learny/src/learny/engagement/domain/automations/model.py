"""Types of the automation engine (SPEC-2205, ADR-0190 section 1).

A definition never writes: `run` drafts proposals, and `apply`/`undo` return the decision the use
case applies inside its transaction. The engine is the only writer of `automation_actions`, so the
domain stays free of IO and the same rules serve the API and the jobs.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

Trigger = Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class NotificationDraft:
    """The notification a draft announces; the engine sends it after the commit."""

    type: str
    href: str
    expires_at: str | None = None
    data: Mapping[str, Any] = field(default_factory=dict)
    channels: tuple[str, ...] | None = None


@dataclass(frozen=True, slots=True)
class ActionDraft:
    """One proposal returned by `run`; it is never applied by itself."""

    kind: str
    formation_id: str | None
    requires_consent: bool
    payload: Mapping[str, Any]
    dedupe_key: str
    undo_payload: Mapping[str, Any] | None = None
    expires_at: str | None = None
    notification: NotificationDraft | None = None


@dataclass(frozen=True, slots=True)
class ActionView:
    """A journal row projected for the definitions and the interface."""

    id: str
    automation: str
    kind: str
    summary: str
    formation_id: str | None
    payload: Mapping[str, Any]
    undo_payload: Mapping[str, Any] | None
    requires_consent: bool
    status: str
    decided_at: str | None
    created_at: str


@dataclass(frozen=True, slots=True)
class AppliedEffect:
    """The columns an `apply` or an `undo` asks the use case to write; no key means no change."""

    changes: Mapping[str, Any] = field(default_factory=dict)

    def summary_payload(self, current: Mapping[str, Any]) -> Mapping[str, Any]:
        """The payload the summary of the journal is computed on, after the effect."""
        replaced = self.changes.get("payload")
        return current if replaced is None else replaced


@dataclass(frozen=True, slots=True)
class EffectContext:
    """Everything a definition needs to decide an effect: the instant, the zone and the tone."""

    user_id: str
    time_zone: str
    tone: str
    now: datetime


@dataclass(frozen=True, slots=True)
class DraftDecision:
    """The validated draft: the one-line summary and the payload actually written."""

    summary: str
    payload: Mapping[str, Any]


class DraftError(Exception):
    """A draft the engine refuses, with the contract code and the French detail of the error."""

    def __init__(self, code: str, detail: str, errors: list[Mapping[str, str]] | None = None) -> None:
        self.code = code
        self.detail = detail
        self.errors = errors or []
        super().__init__(f"{code}: {detail}")


Explain = Callable[[ActionView, str, str], str]
Apply = Callable[[EffectContext, ActionView], AppliedEffect]
Undo = Callable[[EffectContext, ActionView], Mapping[str, Any] | None]


@dataclass(frozen=True, slots=True)
class AutomationDefinition:
    """One automation: its key, its triggers, its one-line explanation and its effects."""

    key: str
    triggers: tuple[Trigger, ...]
    explain: Explain
    apply: Apply | None = None
    undo: Undo | None = None
    repropose_after_undo: bool = False
