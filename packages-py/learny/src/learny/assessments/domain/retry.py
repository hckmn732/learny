"""Retry gate of a validation attempt (SPEC-612 ET-5, EF-8, SPEC-715 EF-5, ADR-0173, ADR-0190).

The authoritative values come from the frozen payload of the latest applied `remediation_ready`
action; without an action the settings row and the latest failed attempt keep the documented
fallback of SPEC-612. No IO and no clock: both are passed by the caller.
"""

from collections.abc import Mapping
from typing import Any

from learny.shared.time import from_epoch_ms, parse_iso, to_epoch_ms, to_iso

HOUR_MS = 3_600_000

DEFAULT_RETRY_DELAY_HOURS = 24
"""AUTOMATION_DEFAULTS.remediation.retryDelayHours (BR-AUT-04)."""

ALLOWED_RETRY_DELAY_HOURS = (2, 6, 12, 24, 48, 72)
"""AUTOMATION_OPTIONS.remediation.retryDelayHours."""


def is_mandatory_mode(mode: str) -> bool:
    """`isMandatoryMode`: the targeted remediation is required before a new attempt."""
    return mode in ("mandatory", "required")


def _allowed(*, available_at: str | None, remediation_done: bool) -> dict[str, Any]:
    return {
        "allowed": True,
        "availableAt": available_at,
        "reason": None,
        "remediationRequired": False,
        "remediationDone": remediation_done,
    }


def retry_availability(
    *,
    now: Any,
    latest: Mapping[str, Any] | None,
    settings: Mapping[str, Any],
    remediation_completed: bool,
    in_progress: bool,
) -> dict[str, Any]:
    """`retryAvailability`: the fallback gate when no remediation action exists."""
    if in_progress or latest is None or latest["passed"] is True:
        return _allowed(available_at=None, remediation_done=remediation_completed)
    submitted_at = now if latest["submitted_at"] is None else latest["submitted_at"]
    delay_hours = int(settings["delayHours"]) if settings["enabled"] else 0
    available_at = to_iso(from_epoch_ms(to_epoch_ms(submitted_at) + delay_hours * HOUR_MS))
    mandatory = (
        bool(settings["enabled"]) and is_mandatory_mode(str(settings["mode"])) and not remediation_completed
    )
    if to_epoch_ms(now) < to_epoch_ms(parse_iso(available_at)):
        return {
            "allowed": False,
            "availableAt": available_at,
            "reason": "delay",
            "remediationRequired": mandatory,
            "remediationDone": remediation_completed,
        }
    if mandatory:
        return {
            "allowed": False,
            "availableAt": available_at,
            "reason": "remediation_required",
            "remediationRequired": True,
            "remediationDone": False,
        }
    return _allowed(available_at=available_at, remediation_done=remediation_completed)


def action_snapshot(payload: Mapping[str, Any], status: str) -> dict[str, Any]:
    """`actionSnapshot`: the frozen retry data of one `remediation` action."""
    retry_available_at = payload.get("retryAvailableAt")
    remediation_activity_id = payload.get("remediationActivityId")
    return {
        "status": status,
        "retryAvailableAt": retry_available_at if isinstance(retry_available_at, str) else None,
        "mode": "mandatory" if payload.get("mode") == "mandatory" else "advised",
        "remediationActivityId": remediation_activity_id
        if isinstance(remediation_activity_id, str)
        else None,
        "remediationDone": False,
    }


def retry_availability_from_action(*, now: Any, action: Mapping[str, Any]) -> dict[str, Any]:
    """`retryAvailabilityFromAction`: the gate computed from the frozen payload of the action."""
    done = bool(action["remediationDone"])
    if action["status"] in ("undone", "consumed"):
        return _allowed(available_at=None, remediation_done=done)
    if action["status"] != "applied":
        return _allowed(available_at=None, remediation_done=done)
    raw = action["retryAvailableAt"]
    available_at: str | None = None
    if isinstance(raw, str):
        try:
            available_at = to_iso(parse_iso(raw))
        except ValueError:
            available_at = None
    mandatory = action["mode"] == "mandatory" and action["remediationActivityId"] is not None and not done
    if available_at is not None and to_epoch_ms(now) < to_epoch_ms(parse_iso(available_at)):
        return {
            "allowed": False,
            "availableAt": available_at,
            "reason": "delay",
            "remediationRequired": mandatory,
            "remediationDone": done,
        }
    if mandatory:
        return {
            "allowed": False,
            "availableAt": available_at,
            "reason": "remediation_required",
            "remediationRequired": True,
            "remediationDone": False,
        }
    return _allowed(available_at=available_at, remediation_done=done)


__all__ = [
    "ALLOWED_RETRY_DELAY_HOURS",
    "DEFAULT_RETRY_DELAY_HOURS",
    "action_snapshot",
    "is_mandatory_mode",
    "retry_availability",
    "retry_availability_from_action",
]
