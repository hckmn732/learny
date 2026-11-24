"""Rules of the three-active-formations limit and of the pause/resume/archive transitions.

The functions are pure so the limit is testable without a database; the services call them inside
the per-learner advisory lock that serialises concurrent transitions.
"""

from collections.abc import Sequence
from dataclasses import dataclass

# BR-FOR-10 - a learner never has more than three active formations (`FORMATION_RULES`).
MAX_ACTIVE_FORMATIONS = 3

FormationAction = str
ManagedStatus = str

_APPLIED = "applied"
_UNCHANGED = "unchanged"


@dataclass(frozen=True, slots=True)
class TransitionDecision:
    """`applied` changes the status; `unchanged` is the idempotent replay of the same action."""

    outcome: str
    nextStatus: str


def transition_for(status: str, action: str) -> TransitionDecision | None:
    """EF-2/EF-3/CL-2 - the only accepted transitions; anything else is refused."""
    if action == "pause":
        if status == "active":
            return TransitionDecision(_APPLIED, "paused")
        if status == "paused":
            return TransitionDecision(_UNCHANGED, "paused")
        return None
    if action == "resume":
        if status == "paused":
            return TransitionDecision(_APPLIED, "active")
        if status == "active":
            return TransitionDecision(_UNCHANGED, "active")
        return None
    if action == "archive":
        if status in ("active", "paused"):
            return TransitionDecision(_APPLIED, "archived")
        if status == "archived":
            return TransitionDecision(_UNCHANGED, "archived")
        return None
    return None


def active_limit_decision(active_count: int, pause_formation_id: str | None) -> str:
    """EF-3, ET-3 - the resume of a paused formation that is not counted yet."""
    if active_count < MAX_ACTIVE_FORMATIONS:
        return "allowed"
    if pause_formation_id is None:
        return "requires-pause"
    return "allowed-with-pause"


@dataclass(frozen=True, slots=True)
class CurrentCandidate:
    """One active formation, as the CL-5 fallback sorts it."""

    formationId: str
    lastOpenedAt: str | None
    createdAt: str


def next_current_formation(
    candidates: Sequence[CurrentCandidate],
    removed_formation_id: str,
) -> str | None:
    """CL-5 - the last active formation consulted, then the most recently created one."""
    remaining = [item for item in candidates if item.formationId != removed_formation_id]
    if not remaining:
        return None

    def key(item: CurrentCandidate) -> tuple[str, str]:
        return (item.lastOpenedAt or item.createdAt, item.formationId)

    return sorted(remaining, key=key, reverse=True)[0].formationId


def active_formations_for_limit(formations: Sequence[dict[str, str]]) -> list[dict[str, str]]:
    """EF-3 - the dialog offers every currently active formation and nothing else."""
    return [formation for formation in formations if formation.get("status") == "active"]
