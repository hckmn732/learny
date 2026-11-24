"""Global pause and return of the automations (SPEC-721, BR-AUT-10, ADR-0016, ADR-0190).

The nightly effect that ends a due pause once, resumes the formations the global pause froze and
draws the ten-minute diagnostic. The transition itself belongs to the pause service; the definition
only decides it through `EndPause`, so the domain stays free of IO.
"""

from learny.engagement.domain.automations.definitions.labels import string_of
from learny.engagement.domain.automations.effects import EndPause
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.engagement.domain.automations.pause import pause_summary
from learny.shared.locale_fr import engagement_automations as fr

PREFIXES = {
    "undone": fr.SUMMARY_UNDONE_PREFIX,
    "declined": fr.SUMMARY_DECLINED_PREFIX,
}


def _end_date(action: ActionView) -> str:
    return string_of(action.payload.get("endDate"))


def _diagnostic_enabled(action: ActionView) -> bool:
    return action.payload.get("diagnosticEnabled") is not False


def explain(action: ActionView, tone: str, _time_zone: str) -> str:
    """EF-2 - one line, at most 160 characters, with the prefix of the final status."""
    prefix = PREFIXES.get(action.status, "")
    return f"{prefix}{pause_summary(action.kind, _end_date(action), _diagnostic_enabled(action), tone)}"


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """A start writes nothing; an end resumes the paused formations inside the transaction."""
    if action.kind == "pause_started":
        return AppliedEffect(changes={"payload": dict(action.payload)})
    if action.kind != "pause_ended":
        raise DraftError("VALIDATION_FAILED", fr.ENGINE_UNKNOWN_KEY.format(key=action.kind))
    pause_id = string_of(action.payload.get("pauseId"))
    if pause_id == "":
        raise DraftError("VALIDATION_FAILED", fr.ENGINE_UNKNOWN_KEY.format(key=action.kind))
    return AppliedEffect(
        changes={"payload": dict(action.payload), "undo_payload": None},
        effects=(EndPause(pause_id=pause_id),),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """The pause effect is never undone by the learner; the journal row keeps its history."""
    return AppliedEffect()


DEFINITION = AutomationDefinition(
    key="pause",
    triggers=({"type": "nightly"}, {"type": "direct"}),
    explain=explain,
    apply=apply,
    undo=undo,
)


__all__ = ["DEFINITION", "explain"]
