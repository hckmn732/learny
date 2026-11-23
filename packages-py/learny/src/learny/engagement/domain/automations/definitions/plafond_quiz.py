"""Smoothed and capped global quiz of the automations (SPEC-718, BR-AUT-07, ADR-0190, ADR-0047).

Ported from `packages/automations/src/automatisme-7-quiz-global-plafonne-et-lisse.ts`: the session
is the effect and a started session already froze its snapshot, so `apply` writes nothing and there
is no undo (the service reopens the deferred notions from the deterministic draw on the next read).
Only the one-line explanation is decided here, for every status of the journal.
"""

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    number_or,
    short_date,
    string_of,
    weekday_of,
)
from learny.engagement.domain.automations.model import ActionView, AutomationDefinition
from learny.shared.locale_fr import engagement_automations as fr

DEFAULT_CAP_MINUTES = 15


def explain(action: ActionView) -> str:
    """EF-2, CL-3 - one line for every status; no notion is ever silently dropped."""
    payload = dict(action.payload)
    due = int(number_or(payload.get("dueCount"), 0))
    deferred = (
        len(payload["deferredNotionIds"])
        if isinstance(payload.get("deferredNotionIds"), list)
        else int(number_or(payload.get("deferredCount"), 0))
    )
    cap = int(number_or(payload.get("maxMinutes"), DEFAULT_CAP_MINUTES))
    local_date = string_of(payload.get("localDate"))
    deferred_to = string_of(payload.get("deferredTo"))
    if action.status == "undone":
        return clip(fr.QUIZ_SMOOTHED_UNDONE.format(day=short_date(local_date)))
    if deferred <= 0:
        return clip(fr.QUIZ_SMOOTHED_NONE.format(cap=cap))
    template = fr.QUIZ_SMOOTHED_SINGULAR if deferred == 1 else fr.QUIZ_SMOOTHED_PLURAL
    return clip(template.format(due=due, deferred=deferred, weekday=weekday_of(deferred_to), cap=cap))


DEFINITION = AutomationDefinition(
    key="plafond_quiz",
    triggers=({"type": "direct"},),
    explain=lambda action, _tone, _zone: explain(action),
)


__all__ = ["DEFINITION", "explain"]
