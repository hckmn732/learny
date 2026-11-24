"""Deterministic selection of the warm-up notions (SPEC-410, BR-AUT-03, ADR-0148, ADR-0286).

Pure: the learner's local day, the notion projection (local last-seen day, mastery and FSRS
retrievability), the prerequisite links and every business bound come from the caller. Nothing
here reads the clock, the database, the network, the configuration or the AI providers.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import invalid_input, invalid_param
from learny.learning.domain.time import days_between, is_iso_date
from learny.learning.domain.types import NOTION_LINK_KINDS
from learny.shared.prng import stable_shuffle

WARMUP_SCOPES = ("yesterday_and_prerequisites", "yesterday")


@dataclass(frozen=True, slots=True)
class WarmupParams:
    """Business bounds of the warm-up, built by the service from `ENGINE.warmup`."""

    default_count: int = 3
    allowed_counts: tuple[int, ...] = (2, 3, 5)
    default_scope: str = "yesterday_and_prerequisites"
    lookback_days: int = 7

    def to_dict(self) -> dict[str, Any]:
        return {
            "defaultCount": self.default_count,
            "allowedCounts": list(self.allowed_counts),
            "defaultScope": self.default_scope,
            "lookbackDays": self.lookback_days,
        }


DEFAULT_WARMUP_PARAMS = WarmupParams()


def _resolve_params(params: WarmupParams | Mapping[str, Any] | None) -> WarmupParams:
    if params is None:
        return DEFAULT_WARMUP_PARAMS
    resolved = (
        params
        if isinstance(params, WarmupParams)
        else WarmupParams(
            default_count=int(params.get("defaultCount", 3)),
            allowed_counts=tuple(int(value) for value in params.get("allowedCounts", (2, 3, 5))),
            default_scope=str(params.get("defaultScope", "yesterday_and_prerequisites")),
            lookback_days=int(params.get("lookbackDays", 7)),
        )
    )
    if len(set(resolved.allowed_counts)) != len(resolved.allowed_counts):
        raise invalid_param("allowedCounts", "allowedCounts must not contain duplicates.")
    if resolved.default_count not in resolved.allowed_counts:
        raise invalid_param("defaultCount", "defaultCount must appear in allowedCounts.")
    return resolved


@dataclass(frozen=True, slots=True)
class _NotionState:
    notion_id: str
    formation_id: str
    chapter_id: str
    last_seen_on: str | None
    suspended: bool
    mastery: float
    retrievability: float | None


@dataclass(frozen=True, slots=True)
class _Candidate:
    notion_id: str
    reason: str
    last_seen_on: str | None
    mastery: float
    retrievability: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "notionId": self.notion_id,
            "reason": self.reason,
            "lastSeenOn": self.last_seen_on,
            "mastery": self.mastery,
            "retrievability": self.retrievability,
        }


def _sort_key(candidate: _Candidate) -> tuple[float, float, str]:
    """Increasing retrievability (weakest memory first), then mastery, then identifier."""
    return (
        math.inf if candidate.retrievability is None else candidate.retrievability,
        candidate.mastery,
        candidate.notion_id,
    )


def _read_notion(raw: Any, index: int) -> _NotionState:
    if not isinstance(raw, Mapping):
        raise invalid_input(f"seenNotions.{index}", "A notion state object is required.")
    for key in ("notionId", "formationId", "chapterId"):
        value = raw.get(key)
        if not isinstance(value, str) or not 1 <= len(value) <= 64:
            raise invalid_input(f"seenNotions.{index}.{key}", "Invalid identifier.")
    last_seen = raw.get("lastSeenOn")
    if last_seen is not None and not is_iso_date(last_seen):
        raise invalid_input(f"seenNotions.{index}.lastSeenOn", "Invalid civil day.")
    mastery = raw.get("mastery")
    if not isinstance(mastery, (int, float)) or isinstance(mastery, bool) or mastery < 0 or mastery > 100:
        raise invalid_input(f"seenNotions.{index}.mastery", "Mastery outside 0..100.")
    retrievability = raw.get("retrievability")
    if retrievability is not None and (
        not isinstance(retrievability, (int, float))
        or isinstance(retrievability, bool)
        or retrievability < 0
        or retrievability > 1
    ):
        raise invalid_input(f"seenNotions.{index}.retrievability", "Retrievability outside 0..1.")
    suspended = raw.get("suspended")
    if not isinstance(suspended, bool):
        raise invalid_input(f"seenNotions.{index}.suspended", "A boolean is required.")
    return _NotionState(
        notion_id=str(raw["notionId"]),
        formation_id=str(raw["formationId"]),
        chapter_id=str(raw["chapterId"]),
        last_seen_on=None if last_seen is None else str(last_seen),
        suspended=suspended,
        mastery=float(mastery),
        retrievability=None if retrievability is None else float(retrievability),
    )


def _read_link(raw: Any, index: int) -> dict[str, str]:
    if not isinstance(raw, Mapping):
        raise invalid_input(f"prerequisiteLinks.{index}", "A notion link object is required.")
    for key in ("fromNotionId", "toNotionId", "kind"):
        value = raw.get(key)
        if not isinstance(value, str) or not value:
            raise invalid_input(f"prerequisiteLinks.{index}.{key}", "Invalid value.")
    if raw["kind"] not in NOTION_LINK_KINDS:
        raise invalid_input(f"prerequisiteLinks.{index}.kind", "Unknown notion link kind.")
    if raw["fromNotionId"] == raw["toNotionId"]:
        raise invalid_input(f"prerequisiteLinks.{index}", "A link does not target its source.")
    return {key: str(raw[key]) for key in ("fromNotionId", "toNotionId", "kind")}


def _assert_consistency(
    accessible_chapter_ids: Sequence[str],
    next_chapter_id: str,
    notions: Sequence[_NotionState],
    local_date: str,
) -> None:
    if next_chapter_id not in accessible_chapter_ids:
        raise invalid_input("nextChapterId", "The upcoming chapter must belong to the accessible chapters.")
    seen: set[str] = set()
    for index, notion in enumerate(notions):
        if notion.notion_id in seen:
            raise invalid_input(f"seenNotions.{index}.notionId", "Duplicate notion.")
        seen.add(notion.notion_id)
        if notion.last_seen_on is not None and notion.last_seen_on > local_date:
            raise invalid_input(
                f"seenNotions.{index}.lastSeenOn",
                "A notion cannot be seen after the local day of the session.",
            )


def _to_candidate(state: _NotionState, reason: str) -> _Candidate:
    return _Candidate(
        notion_id=state.notion_id,
        reason=reason,
        last_seen_on=state.last_seen_on,
        mastery=state.mastery,
        retrievability=state.retrievability,
    )


def _build_candidates(
    notions: Sequence[_NotionState],
    links: Sequence[Mapping[str, str]],
    formation_id: str,
    next_chapter_id: str,
    accessible_chapter_ids: Sequence[str],
    local_date: str,
    lookback_days: int,
) -> dict[str, Any]:
    accessible = set(accessible_chapter_ids)
    base = [
        notion
        for notion in notions
        if notion.formation_id == formation_id
        and not notion.suspended
        and notion.chapter_id in accessible
        and notion.last_seen_on is not None
    ]

    yesterday_on: str | None = None
    for notion in base:
        day = notion.last_seen_on
        if day is None or day >= local_date:
            continue
        if days_between(day, local_date) > lookback_days:
            continue
        if yesterday_on is None or day > yesterday_on:
            yesterday_on = day
    yesterday = (
        []
        if yesterday_on is None
        else sorted(
            (_to_candidate(notion, "yesterday") for notion in base if notion.last_seen_on == yesterday_on),
            key=_sort_key,
        )
    )

    next_chapter_notions = {
        notion.notion_id
        for notion in notions
        if notion.formation_id == formation_id and notion.chapter_id == next_chapter_id
    }
    origin_ids: set[str] = set()
    for link in links:
        if link["kind"] != "prerequisite":
            continue
        if link["toNotionId"] not in next_chapter_notions:
            continue
        origin_ids.add(link["fromNotionId"])
    base_by_id = {notion.notion_id: notion for notion in base}
    prerequisites: list[_Candidate] = []
    for notion_id in origin_ids:
        origin = base_by_id.get(notion_id)
        if origin is None:
            continue
        if origin.chapter_id == next_chapter_id:
            continue
        prerequisites.append(_to_candidate(origin, "prerequisite"))
    prerequisites.sort(key=_sort_key)
    return {"yesterdayOn": yesterday_on, "yesterday": yesterday, "prerequisites": prerequisites}


def _resolve(
    formation_id: str,
    seen_notions: Sequence[Any],
    prerequisite_links: Sequence[Any],
    next_chapter_id: str,
    accessible_chapter_ids: Sequence[str],
    local_date: str,
    seed: str,
    scope: str | None = None,
    count: int | None = None,
    params: WarmupParams | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    if not is_iso_date(local_date):
        raise invalid_input("localDate", "Invalid civil day AAAA-MM-JJ.")
    notions = [_read_notion(raw, index) for index, raw in enumerate(seen_notions)]
    links = [_read_link(raw, index) for index, raw in enumerate(prerequisite_links)]
    _assert_consistency(accessible_chapter_ids, next_chapter_id, notions, local_date)
    bounds = _resolve_params(params)
    chosen_scope = scope or bounds.default_scope
    if chosen_scope not in WARMUP_SCOPES:
        raise invalid_input("scope", "Unknown warm-up scope.")
    chosen_count = bounds.default_count if count is None else count
    if chosen_count not in bounds.allowed_counts:
        raise invalid_param("count", f"{chosen_count} is not an allowed size.")
    candidates = _build_candidates(
        notions,
        links,
        formation_id,
        next_chapter_id,
        accessible_chapter_ids,
        local_date,
        bounds.lookback_days,
    )
    return {"scope": chosen_scope, "count": chosen_count, "seed": seed, "candidates": candidates}


def warmup_candidates(
    formation_id: str,
    seen_notions: Sequence[Any],
    prerequisite_links: Sequence[Any],
    next_chapter_id: str,
    accessible_chapter_ids: Sequence[str],
    local_date: str,
    seed: str,
    scope: str | None = None,
    count: int | None = None,
    params: WarmupParams | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """The reference day and the ranked candidate sets, without drawing."""
    resolved = _resolve(
        formation_id,
        seen_notions,
        prerequisite_links,
        next_chapter_id,
        accessible_chapter_ids,
        local_date,
        seed,
        scope,
        count,
        params,
    )
    candidates = resolved["candidates"]
    return {
        "yesterdayOn": candidates["yesterdayOn"],
        "yesterday": [candidate.to_dict() for candidate in candidates["yesterday"]],
        "prerequisites": [candidate.to_dict() for candidate in candidates["prerequisites"]],
    }


def select_warmup(
    formation_id: str,
    seen_notions: Sequence[Any],
    prerequisite_links: Sequence[Any],
    next_chapter_id: str,
    accessible_chapter_ids: Sequence[str],
    local_date: str,
    seed: str,
    scope: str | None = None,
    count: int | None = None,
    params: WarmupParams | Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """ET-1, EF-1 to EF-5, CL-1 to CL-5: at most `count` notions, two priority picks first."""
    resolved = _resolve(
        formation_id,
        seen_notions,
        prerequisite_links,
        next_chapter_id,
        accessible_chapter_ids,
        local_date,
        seed,
        scope,
        count,
        params,
    )
    candidates = resolved["candidates"]
    chosen_scope: str = resolved["scope"]
    limit: int = resolved["count"]
    seed_value: str = resolved["seed"]
    yesterday = candidates["yesterday"]
    prerequisites = candidates["prerequisites"]
    yesterday_ids = {candidate.notion_id for candidate in yesterday}
    choices: list[dict[str, Any]] = []
    chosen: set[str] = set()

    def add(notion_id: str, reason: str) -> None:
        if notion_id in chosen:
            return
        chosen.add(notion_id)
        choices.append({"notionId": notion_id, "reason": reason})

    if chosen_scope == "yesterday_and_prerequisites" and prerequisites:
        first = next(
            (candidate for candidate in prerequisites if candidate.notion_id not in yesterday_ids),
            prerequisites[0],
        )
        add(
            first.notion_id,
            "yesterday" if first.notion_id in yesterday_ids else "prerequisite",
        )

    if len(choices) < limit:
        first_yesterday = next(
            (candidate for candidate in yesterday if candidate.notion_id not in chosen), None
        )
        if first_yesterday is not None:
            add(first_yesterday.notion_id, "yesterday")

    if len(choices) < limit:
        pool: dict[str, _Candidate] = {}
        sources = [*yesterday, *prerequisites] if chosen_scope == "yesterday_and_prerequisites" else yesterday
        for candidate in sources:
            if candidate.notion_id in chosen:
                continue
            current = pool.get(candidate.notion_id)
            if current is None or candidate.reason == "yesterday":
                pool[candidate.notion_id] = candidate
        remaining = sorted(pool.values(), key=_sort_key)
        for candidate in stable_shuffle(remaining, seed_value, lambda item: item.notion_id):
            if len(choices) >= limit:
                break
            add(
                candidate.notion_id,
                "yesterday" if candidate.notion_id in yesterday_ids else "prerequisite",
            )
    return choices
