"""Progress indicators of one formation (SPEC-408 ET-2, BR-PRO-01, ADR-0283).

Pure: modules, slots and notion states come from the caller. A slot is counted from its two
instants, so a daylight-saving change never alters its elapsed duration.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import invalid_input
from learny.learning.domain.mastery import DEFAULT_MASTERY_THRESHOLD
from learny.learning.domain.time import parse_instant
from learny.learning.domain.types import MODULE_STATUSES, SLOT_KINDS, SLOT_STATUSES

MS_PER_MINUTE = 60_000
STATUS_RANK = {"locked": 0, "open": 1, "validated": 2}


@dataclass(frozen=True, slots=True)
class ProgressModule:
    """A module of the formation; only its status drives BR-PRO-01."""

    module_id: str
    status: str


@dataclass(frozen=True, slots=True)
class ProgressSlot:
    """A schedule slot; `moved_from_id` links a replacement to the slot it replaces."""

    slot_id: str
    kind: str
    status: str
    starts_at: str
    ends_at: str
    moved_from_id: str | None = None


@dataclass(frozen=True, slots=True)
class ProgressNotionState:
    """The mastery of one notion, as persisted by SPEC-107."""

    notion_id: str
    mastery: float


@dataclass(frozen=True, slots=True)
class ProgressResult:
    """Aggregates of one formation; minutes are exact elapsed minutes in double precision."""

    validated_modules: int
    total_modules: int
    progress_percent: float
    planned_minutes: float
    completed_minutes: float
    mastered_notions: int
    status: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "validatedModules": self.validated_modules,
            "totalModules": self.total_modules,
            "progressPercent": self.progress_percent,
            "plannedMinutes": self.planned_minutes,
            "completedMinutes": self.completed_minutes,
            "masteredNotions": self.mastered_notions,
            "status": self.status,
        }


def _read_module(raw: Any, index: int) -> ProgressModule:
    if not isinstance(raw, dict):
        raise invalid_input(f"modules.{index}", "A module object is required.")
    module_id, status = raw.get("moduleId"), raw.get("status")
    if not isinstance(module_id, str) or not 1 <= len(module_id) <= 64:
        raise invalid_input(f"modules.{index}.moduleId", "Invalid identifier.")
    if status not in MODULE_STATUSES:
        raise invalid_input(f"modules.{index}.status", "Unknown module status.")
    return ProgressModule(module_id=module_id, status=str(status))


def _read_slot(raw: Any, index: int) -> ProgressSlot:
    if not isinstance(raw, dict):
        raise invalid_input(f"slots.{index}", "A slot object is required.")
    slot_id = raw.get("slotId")
    if not isinstance(slot_id, str) or not 1 <= len(slot_id) <= 64:
        raise invalid_input(f"slots.{index}.slotId", "Invalid identifier.")
    kind, status = raw.get("kind"), raw.get("status")
    if kind not in SLOT_KINDS:
        raise invalid_input(f"slots.{index}.kind", "Unknown slot kind.")
    if status not in SLOT_STATUSES:
        raise invalid_input(f"slots.{index}.status", "Unknown slot status.")
    starts_at, ends_at = raw.get("startsAt"), raw.get("endsAt")
    if not isinstance(starts_at, str) or not isinstance(ends_at, str):
        raise invalid_input(f"slots.{index}.startsAt", "Invalid instant.")
    if parse_instant(ends_at) <= parse_instant(starts_at):
        raise invalid_input(f"slots.{index}.endsAt", "A slot must end after it starts.")
    moved_from = raw.get("movedFromId")
    if moved_from is not None and not isinstance(moved_from, str):
        raise invalid_input(f"slots.{index}.movedFromId", "Invalid identifier.")
    return ProgressSlot(
        slot_id=slot_id,
        kind=str(kind),
        status=str(status),
        starts_at=starts_at,
        ends_at=ends_at,
        moved_from_id=moved_from,
    )


def _read_notion_state(raw: Any, index: int) -> ProgressNotionState:
    if not isinstance(raw, dict):
        raise invalid_input(f"notionStates.{index}", "A notion state is required.")
    notion_id, mastery = raw.get("notionId"), raw.get("mastery")
    if not isinstance(notion_id, str) or not 1 <= len(notion_id) <= 64:
        raise invalid_input(f"notionStates.{index}.notionId", "Invalid identifier.")
    if not isinstance(mastery, (int, float)) or isinstance(mastery, bool) or mastery < 0 or mastery > 100:
        raise invalid_input(f"notionStates.{index}.mastery", "Mastery outside 0..100.")
    return ProgressNotionState(notion_id=notion_id, mastery=float(mastery))


def calculate_progress(
    modules: Sequence[Any],
    slots: Sequence[Any],
    notion_states: Sequence[Any],
    mastery_threshold: float | None = None,
) -> ProgressResult:
    """BR-PRO-01: validated modules over total modules, minutes, mastered notions."""
    threshold = DEFAULT_MASTERY_THRESHOLD if mastery_threshold is None else mastery_threshold
    if (
        not isinstance(threshold, (int, float))
        or isinstance(threshold, bool)
        or threshold < 0
        or threshold > 100
    ):
        raise invalid_input("masteryThreshold", "Mastery outside 0..100.")
    parsed_modules = [_read_module(raw, index) for index, raw in enumerate(modules)]
    parsed_slots = [_read_slot(raw, index) for index, raw in enumerate(slots)]
    parsed_states = [_read_notion_state(raw, index) for index, raw in enumerate(notion_states)]

    statuses: dict[str, str] = {}
    for module in sorted(parsed_modules, key=lambda item: item.module_id):
        current = statuses.get(module.module_id)
        if current is None or STATUS_RANK[module.status] > STATUS_RANK[current]:
            statuses[module.module_id] = module.status
    total_modules = len(statuses)
    validated_modules = sum(1 for value in statuses.values() if value == "validated")

    superseded = {slot.moved_from_id for slot in parsed_slots if slot.moved_from_id is not None}
    planned_ms = 0
    completed_ms = 0
    for slot in parsed_slots:
        if slot.status in ("cancelled", "moved"):
            continue
        if slot.slot_id in superseded:
            continue
        duration_ms = parse_instant(slot.ends_at) - parse_instant(slot.starts_at)
        planned_ms += duration_ms
        if slot.status == "done":
            completed_ms += duration_ms

    best: dict[str, float] = {}
    for state in parsed_states:
        best_mastery = best.get(state.notion_id)
        if best_mastery is None or state.mastery > best_mastery:
            best[state.notion_id] = state.mastery
    mastered_notions = sum(1 for mastery in best.values() if mastery >= threshold)

    if total_modules == 0:
        progress_percent = 0.0
        status = "no_modules"
    else:
        progress_percent = min(100.0, max(0.0, (validated_modules / total_modules) * 100))
        status = "complete" if validated_modules == total_modules else "in_progress"
    return ProgressResult(
        validated_modules=validated_modules,
        total_modules=total_modules,
        progress_percent=progress_percent,
        planned_minutes=planned_ms / MS_PER_MINUTE,
        completed_minutes=completed_ms / MS_PER_MINUTE,
        mastered_notions=mastered_notions,
        status=status,
    )
