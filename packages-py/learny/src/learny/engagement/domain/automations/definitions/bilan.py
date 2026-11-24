"""Weekly review of the automations (SPEC-720, BR-AUT-09, ADR-0190, ADR-0047).

The review needs no consent, the notification is the effect and the journal row is the durable
trace, so `apply` and `undo` are absent. The one line is deterministic and every number comes from
the payload the producer wrote; a missing measure stays `null` and reads "Non disponible", never a
fake 0.
"""

from learny.engagement.domain.automations.definitions.labels import clip, number_or, string_of
from learny.engagement.domain.automations.model import ActionView, AutomationDefinition
from learny.engagement.domain.automations.weekly import (
    format_weekly_study,
    weekly_received_label,
    weekly_retention_label,
)
from learny.shared.locale_fr import engagement_automations as fr

PREFIXES = {
    "declined": fr.SUMMARY_DECLINED_PREFIX,
    "expired": fr.SUMMARY_EXPIRED_PREFIX,
    "undone": fr.SUMMARY_UNDONE_PREFIX,
}


def _count_label(count: int) -> str:
    if count == 0:
        return fr.WEEKLY_REVIEW_NO_RISK
    if count == 1:
        return fr.WEEKLY_REVIEW_ONE_RISK
    return fr.WEEKLY_REVIEW_MANY_RISK.format(count=count)


def explain(action: ActionView, _tone: str, time_zone: str) -> str:
    """EF-2, ET-5 - one line, at most 160 characters, with the prefix of a final status."""
    payload = dict(action.payload)
    minutes = int(number_or(payload.get("studyMinutes"), 0))
    retention = payload.get("retention")
    rate = None
    if isinstance(retention, dict):
        raw = retention.get("rate")
        rate = float(raw) if isinstance(raw, (int, float)) else None
    at_risk = int(number_or(payload.get("atRiskCount"), 0))
    retention_part = (
        fr.WEEKLY_REVIEW_RETENTION_UNAVAILABLE
        if rate is None
        else fr.WEEKLY_REVIEW_RETENTION.format(label=weekly_retention_label(rate))
    )
    day = string_of(payload.get("reviewOn"), action.created_at)
    received = "" if day == "" else f" ({weekly_received_label(day, time_zone)})"
    return clip(
        fr.WEEKLY_REVIEW_SENTENCE.format(
            prefix=PREFIXES.get(action.status, ""),
            received=received,
            study=format_weekly_study(minutes),
            retention=retention_part,
            at_risk=_count_label(at_risk),
        )
    )


DEFINITION = AutomationDefinition(
    key="bilan",
    triggers=({"type": "hourly", "localHour": 19},),
    explain=explain,
)


__all__ = ["DEFINITION", "explain"]
