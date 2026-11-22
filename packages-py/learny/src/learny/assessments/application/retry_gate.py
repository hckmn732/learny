"""Delay and remediation gate of a new validation attempt (SPEC-612 ET-5, SPEC-715 EF-5).

Port of `packages/services/src/quiz/retry-gate.ts` and of the `checkRetryAllowed` guard. The
authoritative values come from the latest applied `remediation_ready` action of the module, whose
payload freezes the delay and the mode of the failed attempt; without an action the settings row and
the latest failed attempt keep the documented fallback. The refusal detail is rendered in the
learner zone, like `formatUserDate`.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain import retry as domain
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import format_user_date, parse_iso

FALLBACK_TIME_ZONE = "Europe/Paris"
"""EF-4 - the zone used when the profile row is not readable."""


def read_settings(row: Mapping[str, Any] | None) -> dict[str, Any]:
    """`readRetrySettings`: a missing row keeps the documented default (24 h, advised)."""
    if row is None:
        return {
            "enabled": True,
            "delayHours": domain.DEFAULT_RETRY_DELAY_HOURS,
            "mode": "advised",
        }
    params = row["params"]
    if not isinstance(params, Mapping):
        params = {}
    raw_delay = params.get("delayHours")
    if raw_delay is None:
        raw_delay = params.get("retryDelayHours")
    delay_hours = (
        raw_delay
        if isinstance(raw_delay, int)
        and not isinstance(raw_delay, bool)
        and raw_delay in domain.ALLOWED_RETRY_DELAY_HOURS
        else domain.DEFAULT_RETRY_DELAY_HOURS
    )
    mode = "mandatory" if params.get("mode") in ("mandatory", "required") else "advised"
    return {"enabled": row["enabled"] is True, "delayHours": delay_hours, "mode": mode}


async def read_retry_gate(tx: Any, user_id: str, module_id: str, now: Any) -> dict[str, Any]:
    """`readRetryGate`: everything comes from persisted rows, never from the client."""
    if await queries.read_retry_in_progress(tx, user_id, module_id) is not None:
        return {
            "allowed": True,
            "availableAt": None,
            "reason": None,
            "remediationRequired": False,
            "remediationDone": False,
        }
    latest = await queries.read_retry_latest_graded(tx, user_id, module_id)
    if latest is None or latest["passed"] is True:
        return {
            "allowed": True,
            "availableAt": None,
            "reason": None,
            "remediationRequired": False,
            "remediationDone": False,
        }
    attempt_id = str(latest["attempt_id"])
    action = await queries.read_retry_action(tx, user_id, module_id, attempt_id)
    if action is not None:
        snapshot = domain.action_snapshot(action["payload"] or {}, str(action["status"]))
        if action["status"] == "applied":
            snapshot["remediationDone"] = await queries.read_retry_remediation_done(
                tx, user_id, module_id, attempt_id
            )
        return domain.retry_availability_from_action(now=now, action=snapshot)
    settings = read_settings(await queries.read_retry_settings(tx, user_id))
    completed = await queries.read_retry_remediation_done(tx, user_id, module_id, attempt_id)
    return domain.retry_availability(
        now=now,
        latest={
            "attemptId": attempt_id,
            "passed": latest["passed"],
            "submitted_at": latest["submitted_at"],
        },
        settings=settings,
        remediation_completed=completed,
        in_progress=False,
    )


async def retry_gate(deps: AssessmentDeps, actor: Actor, module_id: str) -> dict[str, Any]:
    """ET-5 - the public read used by the result screen."""
    async with deps.db.user_tx(actor) as tx:
        return await read_retry_gate(tx, actor.user_id, module_id, deps.clock.now())


async def check_retry_allowed(deps: AssessmentDeps, actor: Actor, module_id: str) -> None:
    """ET-3, EF-5 - `ok` when the next attempt is allowed, a 422 `RETRY_NOT_YET_ALLOWED` otherwise."""
    gate = await retry_gate(deps, actor, module_id)
    if gate["allowed"] is True:
        return
    remediation_required = gate["remediationRequired"] is True
    detail = texts.RETRY_REMEDIATION_DETAIL
    if not remediation_required and gate["availableAt"] is not None:
        time_zone = await _profile_time_zone(deps, actor)
        label = format_user_date(parse_iso(str(gate["availableAt"])), time_zone)
        detail = texts.RETRY_AVAILABLE_AT.format(label=label)
    reason = gate["reason"]
    if reason is None:
        reason = "remediation_required" if remediation_required else "delay"
    raise AppError(
        "RETRY_NOT_YET_ALLOWED",
        detail,
        status=422,
        reason=reason,
        availableAt=gate["availableAt"],
        remediationRequired=remediation_required,
    )


async def _profile_time_zone(deps: AssessmentDeps, actor: Actor) -> str:
    """`profileTimeZone`: the zone of the learner, `Europe/Paris` when the row is missing."""
    async with deps.db.user_tx(actor) as tx:
        stored = await queries.read_retry_timezone(tx, actor.user_id)
    return stored if stored else FALLBACK_TIME_ZONE


__all__ = [
    "FALLBACK_TIME_ZONE",
    "check_retry_allowed",
    "read_retry_gate",
    "read_settings",
    "retry_gate",
]
