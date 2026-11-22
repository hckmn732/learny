"""Daily global quiz session of one formation (SPEC-406, BR-MEM-03, BR-MEM-04).

Pure and deterministic: dates, FSRS dues, gaps, bank formats, business bounds and seed are explicit
inputs. The result is ordered, reports every deferred notion and signals a missing imposed format
to the brick bank instead of inventing an item (ET-3). The module also carries the capped and
smoothed variant of SPEC-718 and the format choice of SPEC-716.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

from learny.learning.domain.errors import invalid_input
from learny.learning.domain.time import add_days
from learny.learning.domain.types import BRICK_FORMATS, GAP_NATURES, MODULE_STATUSES
from learny.shared.prng import seeded_random, stable_shuffle

NATURE_PRIORITY = {"confusion": 0, "application": 1, "misunderstanding": 2, "forgetting": 3}
IMPOSED_GAP_FORMATS = {
    "forgetting": ("recall_card",),
    "confusion": ("matching", "categorization"),
    "application": ("open_question",),
    "misunderstanding": (),
}
MODULE_STATUS_PRIORITY = {"validated": 0, "open": 1, "locked": 2}
DEFAULT_TARGET_RETENTION = 0.9
CONFRONTATION_FORMATS = ("matching", "categorization")


def _compare_text(left: str, right: str) -> int:
    return 0 if left == right else (-1 if left < right else 1)


def _earliest(left: str, right: str) -> str:
    return left if left <= right else right


def _read_due_notion(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise invalid_input(f"dueNotions.{index}", "A due notion object is required.")
    notion_id, module_id = raw.get("notionId"), raw.get("moduleId")
    if not isinstance(notion_id, str) or not notion_id:
        raise invalid_input(f"dueNotions.{index}.notionId", "Invalid identifier.")
    if not isinstance(module_id, str) or not module_id:
        raise invalid_input(f"dueNotions.{index}.moduleId", "Invalid identifier.")
    position = raw.get("modulePosition")
    if not isinstance(position, int) or isinstance(position, bool) or position < 1:
        raise invalid_input(f"dueNotions.{index}.modulePosition", "A positive integer is required.")
    if raw.get("moduleStatus") not in MODULE_STATUSES:
        raise invalid_input(f"dueNotions.{index}.moduleStatus", "Unknown module status.")
    if not isinstance(raw.get("dueAt"), str):
        raise invalid_input(f"dueNotions.{index}.dueAt", "Invalid instant.")
    return dict(raw)


def _merge_due(existing: Mapping[str, Any], candidate: Mapping[str, Any]) -> dict[str, Any]:
    existing_rank = MODULE_STATUS_PRIORITY[str(existing["moduleStatus"])]
    candidate_rank = MODULE_STATUS_PRIORITY[str(candidate["moduleStatus"])]
    keep_candidate = candidate_rank < existing_rank or (
        candidate_rank == existing_rank
        and (
            int(candidate["modulePosition"]) < int(existing["modulePosition"])
            or (
                int(candidate["modulePosition"]) == int(existing["modulePosition"])
                and str(candidate["moduleId"]) < str(existing["moduleId"])
            )
        )
    )
    module = candidate if keep_candidate else existing
    return {
        "notionId": existing["notionId"],
        "moduleId": module["moduleId"],
        "modulePosition": module["modulePosition"],
        "moduleStatus": module["moduleStatus"],
        "evaluated": bool(existing["evaluated"]) or bool(candidate["evaluated"]),
        "dueAt": _earliest(str(existing["dueAt"]), str(candidate["dueAt"])),
    }


def _canonical_notions(notions: Sequence[Any]) -> list[dict[str, Any]]:
    """One row per notion, strongest module, earliest due date; input order never matters."""
    by_notion: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(notions):
        notion = _read_due_notion(raw, index)
        existing = by_notion.get(str(notion["notionId"]))
        by_notion[str(notion["notionId"])] = notion if existing is None else _merge_due(existing, notion)
    return [by_notion[notion_id] for notion_id in sorted(by_notion)]


def _canonical_gaps(gaps: Sequence[Any]) -> dict[str, str]:
    by_notion: dict[str, str] = {}
    for index, raw in enumerate(gaps):
        if not isinstance(raw, Mapping):
            raise invalid_input(f"gaps.{index}", "A gap object is required.")
        notion_id, nature = raw.get("notionId"), raw.get("nature")
        if not isinstance(notion_id, str) or not notion_id:
            raise invalid_input(f"gaps.{index}.notionId", "Invalid identifier.")
        if nature not in GAP_NATURES:
            raise invalid_input(f"gaps.{index}.nature", "Unknown gap nature.")
        existing = by_notion.get(notion_id)
        if existing is None or NATURE_PRIORITY[str(nature)] < NATURE_PRIORITY[existing]:
            by_notion[notion_id] = str(nature)
    return by_notion


def _canonical_bank(bank: Sequence[Any], params: Mapping[str, Any]) -> tuple[dict[str, list[str]], set[str]]:
    valid = {
        format_name for format_name in (params.get("formatSeconds") or {}) if format_name in BRICK_FORMATS
    }
    formats: dict[str, list[str]] = {}
    for index, raw in enumerate(bank):
        if not isinstance(raw, Mapping):
            raise invalid_input(f"bank.{index}", "A bank entry is required.")
        notion_id = raw.get("notionId")
        if not isinstance(notion_id, str) or not notion_id:
            raise invalid_input(f"bank.{index}.notionId", "Invalid identifier.")
        current = set(formats.get(notion_id, []))
        for format_name in raw.get("formats") or ():
            if format_name not in BRICK_FORMATS:
                raise invalid_input(f"bank.{index}.formats", f"Unknown brick format: {format_name}.")
            if format_name in valid:
                current.add(str(format_name))
        formats[notion_id] = sorted(current)
    present = {str(raw["notionId"]) for raw in bank if isinstance(raw, Mapping) and "notionId" in raw}
    return (formats, present)


def _canonical_last_formats(last_formats: Sequence[Any]) -> dict[str, str]:
    by_notion: dict[str, str] = {}
    for index, raw in enumerate(last_formats):
        if not isinstance(raw, Mapping):
            raise invalid_input(f"lastFormats.{index}", "A last format entry is required.")
        notion_id, format_name = raw.get("notionId"), raw.get("format")
        if not isinstance(notion_id, str) or not notion_id:
            raise invalid_input(f"lastFormats.{index}.notionId", "Invalid identifier.")
        if format_name not in BRICK_FORMATS:
            raise invalid_input(f"lastFormats.{index}.format", "Unknown brick format.")
        existing = by_notion.get(notion_id)
        if existing is None or str(format_name) < existing:
            by_notion[notion_id] = str(format_name)
    return by_notion


def _canonical_forced(forced: Sequence[Any] | None) -> dict[str, str]:
    by_notion: dict[str, str] = {}
    for raw in forced or ():
        if not isinstance(raw, Mapping):
            continue
        notion_id, format_name = raw.get("notionId"), raw.get("format")
        if isinstance(notion_id, str) and notion_id not in by_notion and format_name in BRICK_FORMATS:
            by_notion[notion_id] = str(format_name)
    return by_notion


def preference_targets(preference: str) -> tuple[str, ...]:
    if preference == "cards":
        return ("recall_card",)
    if preference == "matching_categorization":
        return CONFRONTATION_FORMATS
    return ()


def choose_format(
    available: Sequence[str],
    gap_nature: str | None,
    last_format: str | None,
    preference: str,
    seed: str,
    notion_id: str,
    forced_format: str | None = None,
) -> dict[str, Any] | None:
    """Gap nature first, then preference, then variation from the last presentation."""
    if forced_format is not None:
        if forced_format not in available:
            return None
        return {"format": forced_format, "reason": "gap_nature", "variantRequested": False}
    imposed = () if gap_nature is None else IMPOSED_GAP_FORMATS[gap_nature]
    pool = (
        list(available)
        if not imposed
        else [format_name for format_name in available if format_name in imposed]
    )
    if not pool:
        return None
    targets = preference_targets(preference)
    ordering_seed = f"{seed}|{notion_id}|format"
    preferred = stable_shuffle(
        [format_name for format_name in pool if format_name in targets], ordering_seed, lambda value: value
    )
    remaining = stable_shuffle(
        [format_name for format_name in pool if format_name not in targets],
        ordering_seed,
        lambda value: value,
    )
    ordered = [*preferred, *remaining]
    if last_format is not None and len(ordered) > 1:
        ordered = [format_name for format_name in ordered if format_name != last_format]
    if not ordered:
        return None
    format_name = ordered[0]
    if last_format is not None and format_name == last_format:
        return {"format": format_name, "reason": "bank_constraint", "variantRequested": True}
    if imposed:
        return {"format": format_name, "reason": "gap_nature", "variantRequested": False}
    if format_name in targets:
        return {"format": format_name, "reason": "preference", "variantRequested": False}
    if last_format is None:
        return {
            "format": format_name,
            "reason": "first_use" if len(ordered) > 1 else "only_format",
            "variantRequested": False,
        }
    return {"format": format_name, "reason": "varied", "variantRequested": False}


def _candidate_sort_key(candidate: Mapping[str, Any]) -> tuple[Any, ...]:
    gap = 0 if candidate["gapNature"] is not None else 1
    nature = NATURE_PRIORITY[str(candidate["gapNature"])] if candidate["gapNature"] is not None else 0
    return (
        gap,
        nature,
        str(candidate["dueAt"]),
        int(candidate["modulePosition"]),
        str(candidate["moduleId"]),
        str(candidate["notionId"]),
    )


def _deferred_sort_key(entry: Mapping[str, Any]) -> tuple[Any, ...]:
    gap = 0 if entry["gapNature"] is not None else 1
    nature = NATURE_PRIORITY[str(entry["gapNature"])] if entry["gapNature"] is not None else 0
    return (
        gap,
        nature,
        str(entry["dueAt"]),
        int(entry["modulePosition"]),
        str(entry["moduleId"]),
        str(entry["notionId"]),
        str(entry["reason"]),
    )


def interleave_by_module(items: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Greedy interleaving: never two adjacent notions of the same module while another remains."""
    remaining = list(items)
    result: list[dict[str, Any]] = []
    previous_module: str | None = None
    while remaining:
        index = 0
        for position, item in enumerate(remaining):
            if item["moduleId"] != previous_module:
                index = position
                break
        item = remaining.pop(index)
        result.append(item)
        previous_module = item["moduleId"]
    return result


def _deferred_record(
    notion: Mapping[str, Any], gap_nature: str | None, reason: str, next_day: str
) -> dict[str, Any]:
    return {
        "notionId": notion["notionId"],
        "moduleId": notion["moduleId"],
        "modulePosition": notion["modulePosition"],
        "dueAt": notion["dueAt"],
        "gapNature": gap_nature,
        "reason": reason,
        "proposedFor": next_day if reason in ("cap", "awaiting_variant") else None,
    }


def _eligible(notion: Mapping[str, Any], mode: str) -> str | None:
    status = notion["moduleStatus"]
    contributes = status == "validated" or (status == "open" and bool(notion["evaluated"]))
    if not contributes:
        return "module_not_eligible"
    if mode == "maintenance" and status != "validated":
        return "maintenance_validated_only"
    return None


def global_quiz_params(overrides: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """The caller's business bounds, defaulted from `ENGINE.globalQuiz`."""
    defaults: dict[str, Any] = {
        "notionCostSec": 60,
        "sessionOverheadSec": 60,
        "formatSeconds": {
            "recall_card": 30,
            "choice_question": 45,
            "cloze": 45,
            "ordering": 60,
            "matching": 40,
            "categorization": 40,
            "open_question": 90,
        },
        "maintenanceMaxMinutes": 5,
    }
    if overrides is None:
        return defaults
    merged = dict(defaults)
    merged.update(overrides)
    return merged


def build_daily_session(
    *,
    formation_id: str,
    date: str,
    due_notions: Sequence[Any],
    gaps: Sequence[Any],
    bank: Sequence[Any],
    last_formats: Sequence[Any],
    cap_minutes: int,
    mode: str,
    seed: str,
    params: Mapping[str, Any] | None = None,
    forced_formats: Sequence[Any] | None = None,
    preference: str | None = None,
    target_retention: float | None = None,
) -> dict[str, Any]:
    """ET-1: builds one formation's daily session; nothing is persisted."""
    bounds = global_quiz_params(params)
    if mode not in ("full", "micro", "maintenance"):
        raise invalid_input("mode", "Unknown global quiz mode.")
    chosen_preference = preference or "vary"
    if chosen_preference not in ("vary", "cards", "matching_categorization"):
        raise invalid_input("preference", "Unknown global quiz format preference.")
    if not isinstance(cap_minutes, int) or isinstance(cap_minutes, bool) or cap_minutes < 1:
        raise invalid_input("capMinutes", "A positive integer is required.")
    if not isinstance(date, str):
        raise invalid_input("date", "A civil day is required.")
    effective_cap = (
        min(cap_minutes, int(bounds["maintenanceMaxMinutes"])) if mode == "maintenance" else cap_minutes
    )
    cap_seconds = effective_cap * 60
    next_day = add_days(date, 1)

    gap_by_notion = _canonical_gaps(gaps)
    bank_formats, bank_present = _canonical_bank(bank, bounds)
    last_by_notion = _canonical_last_formats(last_formats)
    forced_by_notion = _canonical_forced(forced_formats)
    notions = _canonical_notions(due_notions)

    candidates: list[dict[str, Any]] = []
    deferred: list[dict[str, Any]] = []
    exhausted: list[dict[str, Any]] = []

    for notion in notions:
        notion_id = str(notion["notionId"])
        gap_nature = gap_by_notion.get(notion_id)
        refusal = _eligible(notion, mode)
        if refusal is not None:
            deferred.append(_deferred_record(notion, gap_nature, refusal, next_day))
            continue
        available = bank_formats.get(notion_id, [])
        if not available:
            exhausted.append(
                {
                    "notionId": notion_id,
                    "moduleId": notion["moduleId"],
                    "reason": "no_valid_format" if notion_id in bank_present else "missing_bank",
                    "requiredFormats": [],
                    "availableFormats": [],
                }
            )
            deferred.append(_deferred_record(notion, gap_nature, "awaiting_variant", next_day))
            continue
        decision = choose_format(
            available,
            gap_nature,
            last_by_notion.get(notion_id),
            chosen_preference,
            seed,
            notion_id,
            forced_by_notion.get(notion_id),
        )
        if decision is None:
            forced_format = forced_by_notion.get(notion_id)
            imposed = (
                (forced_format,)
                if forced_format is not None
                else (IMPOSED_GAP_FORMATS[gap_nature] if gap_nature is not None else ())
            )
            exhausted.append(
                {
                    "notionId": notion_id,
                    "moduleId": notion["moduleId"],
                    "reason": "imposed_format_unavailable",
                    "requiredFormats": list(imposed),
                    "availableFormats": available,
                }
            )
            deferred.append(_deferred_record(notion, gap_nature, "awaiting_variant", next_day))
            continue
        candidates.append(
            {
                "notionId": notion_id,
                "moduleId": notion["moduleId"],
                "modulePosition": notion["modulePosition"],
                "dueAt": notion["dueAt"],
                "gapNature": gap_nature,
                "format": decision["format"],
                "formatReason": decision["reason"],
                "variantRequested": decision["variantRequested"],
                "estimatedSeconds": (bounds.get("formatSeconds") or {}).get(
                    decision["format"], bounds["notionCostSec"]
                ),
            }
        )

    candidates.sort(key=_candidate_sort_key)
    ordered = [
        *interleave_by_module([item for item in candidates if item["gapNature"] is not None]),
        *interleave_by_module([item for item in candidates if item["gapNature"] is None]),
    ]

    selected: list[dict[str, Any]] = []
    total_seconds = int(bounds["sessionOverheadSec"])
    for candidate in ordered:
        if total_seconds + int(candidate["estimatedSeconds"]) > cap_seconds:
            break
        selected.append(candidate)
        total_seconds += int(candidate["estimatedSeconds"])
    for candidate in ordered[len(selected) :]:
        deferred.append(_deferred_record(candidate, candidate["gapNature"], "cap", next_day))

    deferred.sort(key=_deferred_sort_key)
    exhausted.sort(key=lambda entry: str(entry["notionId"]))
    return {
        "formationId": formation_id,
        "date": date,
        "mode": mode,
        "seed": seed,
        "requestedCapMinutes": cap_minutes,
        "capMinutes": effective_cap,
        "targetRetention": DEFAULT_TARGET_RETENTION if target_retention is None else target_retention,
        "items": [
            {
                "notionId": candidate["notionId"],
                "moduleId": candidate["moduleId"],
                "modulePosition": candidate["modulePosition"],
                "format": candidate["format"],
                "gapNature": candidate["gapNature"],
                "selectionReason": "due" if candidate["gapNature"] is None else "gap",
                "formatReason": candidate["formatReason"],
                "variantRequested": candidate["variantRequested"],
                "estimatedSeconds": candidate["estimatedSeconds"],
            }
            for candidate in selected
        ],
        "deferred": [
            {
                "notionId": entry["notionId"],
                "moduleId": entry["moduleId"],
                "dueAt": entry["dueAt"],
                "reason": entry["reason"],
                "proposedFor": entry["proposedFor"],
            }
            for entry in deferred
        ],
        "exhausted": exhausted,
        "estimatedMinutes": 0 if not selected else math.ceil(total_seconds / 60),
    }


def draw_smooth_quiz_session(*, max_minutes: int, target_retention: float, **kwargs: Any) -> dict[str, Any]:
    """ET-3: passes `{maxMinutes, targetRetention}` to the pure draw of SPEC-406."""
    drawn = build_daily_session(cap_minutes=max_minutes, target_retention=target_retention, **kwargs)
    selected: list[str] = []
    for item in drawn["items"]:
        notion_id = str(item["notionId"])
        if notion_id not in selected:
            selected.append(notion_id)
    return {
        "selected": selected,
        "deferred": [
            {
                "notionId": entry["notionId"],
                "reason": entry["reason"],
                "proposedFor": entry["proposedFor"],
            }
            for entry in drawn["deferred"]
        ],
        "estimatedMinutes": drawn["estimatedMinutes"],
        "maxMinutes": max_minutes,
        "targetRetention": target_retention,
        "deferredReason": ("cap" if any(entry["reason"] == "cap" for entry in drawn["deferred"]) else None),
    }


def reintroduce_deferred_notions(current: Sequence[str], deferred: Sequence[str]) -> list[str]:
    """ET-4 / CA-2: reopening is a union, so a second undo never duplicates a notion."""
    seen: list[str] = []
    for notion in [*current, *deferred]:
        if notion not in seen:
            seen.append(notion)
    return seen


def weighted_format_pick(
    preference: str,
    available: Sequence[str],
    seed: str,
    last_format: str | None = None,
) -> str | None:
    """EF-6: deterministic weighted draw; never the last format when another candidate exists."""
    deduplicated: list[str] = []
    for format_name in available:
        if format_name not in deduplicated:
            deduplicated.append(format_name)
    if not deduplicated:
        return None
    if last_format is not None and len(deduplicated) > 1:
        candidates = [format_name for format_name in deduplicated if format_name != last_format]
    else:
        candidates = deduplicated
    ordered = sorted(candidates)

    def weight_of(format_name: str) -> int:
        if preference == "cards" and format_name == "recall_card":
            return 3
        if preference in ("matching", "matching_categorization") and format_name in CONFRONTATION_FORMATS:
            return 3
        return 1

    total = sum(weight_of(format_name) for format_name in ordered)
    if total <= 0:
        return ordered[0] if ordered else None
    draw = seeded_random(seed)
    ticket = draw() * total
    for format_name in ordered:
        ticket -= weight_of(format_name)
        if ticket < 0:
            return format_name
    return ordered[-1] if ordered else None


def choose_gap_format(
    nature: str, available: Sequence[str], last_pair_format: str | None = None
) -> dict[str, Any]:
    """EF-3: the format imposed by the nature of a gap; never reads the clock or the bank."""
    if nature not in GAP_NATURES:
        raise invalid_input("nature", "Unknown gap nature.")
    if nature == "forgetting":
        return {
            "format": "recall_card" if "recall_card" in available else None,
            "pendingGeneration": False,
        }
    if nature == "confusion":
        available_pair = [f for f in CONFRONTATION_FORMATS if f in available]
        if available_pair:
            preferred = "matching" if last_pair_format == "categorization" else "categorization"
            format_name = preferred if preferred in available_pair else available_pair[0]
            return {"format": format_name, "pendingGeneration": False}
        if "choice_question" in available:
            return {"format": "choice_question", "pendingGeneration": True}
        return {"format": None, "pendingGeneration": True}
    return {"format": None, "pendingGeneration": False}
