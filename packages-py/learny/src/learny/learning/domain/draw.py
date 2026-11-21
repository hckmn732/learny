"""Deterministic draw of one validation attempt (SPEC-405, BR-QUI-03, ADR-0014, ADR-0143, ADR-0170).

Pure: the notions, the bank, the seen fingerprints, the gaps, the business parameters and the seed
are explicit inputs. It never reads the clock, the database, the network or the configuration;
services pass `ENGINE.draw` and the mastery threshold. No question is ever invented: exhaustion is
reported so the caller can ask for more variants.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import invalid_input
from learny.learning.domain.types import BRICK_FORMATS, GAP_NATURES
from learny.shared.jsmath import js_round
from learny.shared.prng import seeded_random, stable_shuffle

CHOICE_FORMATS = ("choice_question", "cloze", "matching")
OPEN_FORMATS = ("open_question",)
NATURE_PRIORITY = {"confusion": 0, "application": 1, "misunderstanding": 2, "forgetting": 3}
BRICK_STATUSES = ("active", "reported", "retired")
SHARES = ("choice", "open")
FINGERPRINT_LENGTH = 64


@dataclass(frozen=True, slots=True)
class DrawParams:
    """Business bounds passed by the service (`ENGINE.draw` + `ENGINE.mastery.threshold`)."""

    default_size: int = 12
    min_size: int = 10
    max_size: int = 20
    open_share: float = 0.3
    min_open: int = 1
    gap_weight: float = 3
    weak_weight: float = 2
    base_weight: float = 1
    total_points: int = 100
    mastery_threshold: float = 80

    def to_dict(self) -> dict[str, Any]:
        return {
            "defaultSize": self.default_size,
            "minSize": self.min_size,
            "maxSize": self.max_size,
            "openShare": self.open_share,
            "minOpen": self.min_open,
            "gapWeight": self.gap_weight,
            "weakWeight": self.weak_weight,
            "baseWeight": self.base_weight,
            "totalPoints": self.total_points,
            "masteryThreshold": self.mastery_threshold,
        }


DEFAULT_DRAW_PARAMS = DrawParams()


def _resolve_params(params: DrawParams | Mapping[str, Any] | None) -> DrawParams:
    if params is None:
        return DEFAULT_DRAW_PARAMS
    if isinstance(params, DrawParams):
        resolved = params
    else:
        resolved = DrawParams(
            default_size=int(params.get("defaultSize", 12)),
            min_size=int(params.get("minSize", 10)),
            max_size=int(params.get("maxSize", 20)),
            open_share=float(params.get("openShare", 0.3)),
            min_open=int(params.get("minOpen", 1)),
            gap_weight=float(params.get("gapWeight", 3)),
            weak_weight=float(params.get("weakWeight", 2)),
            base_weight=float(params.get("baseWeight", 1)),
            total_points=int(params.get("totalPoints", 100)),
            mastery_threshold=float(params.get("masteryThreshold", 80)),
        )
    if resolved.min_size > resolved.max_size:
        raise invalid_input("params.minSize", "minSize must precede maxSize.")
    if resolved.default_size < resolved.min_size or resolved.default_size > resolved.max_size:
        raise invalid_input("params.defaultSize", "defaultSize must be within the bounds.")
    if resolved.min_open > resolved.max_size:
        raise invalid_input("params.minOpen", "minOpen exceeds maxSize.")
    if resolved.gap_weight + resolved.weak_weight + resolved.base_weight <= 0:
        raise invalid_input("params", "At least one weight must be positive.")
    return resolved


def share_of(format_name: str) -> str | None:
    if format_name in CHOICE_FORMATS:
        return "choice"
    if format_name in OPEN_FORMATS:
        return "open"
    return None


def _round2(value: float) -> float:
    return js_round(value * 100) / 100


def _gap_priority(nature: str | None) -> float:
    return math.inf if nature is None else float(NATURE_PRIORITY[nature])


@dataclass(slots=True)
class _InternalNotion:
    ref: dict[str, Any]
    gap: str | None
    mastery: float | None
    weight: float
    rank: int = 0
    quota: int = 0
    served: int = 0
    open_quota: int = 0
    open_served: int = 0


@dataclass(frozen=True, slots=True, eq=False)
class _Candidate:
    brick: dict[str, Any]
    linked: tuple[str, ...]
    share: str
    fingerprint: str
    weight: float


def _read_notion(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise invalid_input(f"notions.{index}", "A notion object is required.")
    for key in ("notionId", "moduleId", "chapterId", "label"):
        value = raw.get(key)
        if not isinstance(value, str) or not value:
            raise invalid_input(f"notions.{index}.{key}", "Invalid value.")
    position = raw.get("modulePosition")
    if not isinstance(position, int) or isinstance(position, bool) or position < 1:
        raise invalid_input(f"notions.{index}.modulePosition", "A positive integer is required.")
    order = raw.get("position")
    if not isinstance(order, int) or isinstance(order, bool) or order < 0:
        raise invalid_input(f"notions.{index}.position", "A non-negative integer is required.")
    mastery = raw.get("mastery")
    if mastery is not None and (
        not isinstance(mastery, (int, float)) or isinstance(mastery, bool) or mastery < 0 or mastery > 100
    ):
        raise invalid_input(f"notions.{index}.mastery", "Mastery outside 0..100.")
    return dict(raw)


def _read_gap(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise invalid_input(f"gaps.{index}", "A gap object is required.")
    notion_id, nature = raw.get("notionId"), raw.get("nature")
    if not isinstance(notion_id, str) or not notion_id:
        raise invalid_input(f"gaps.{index}.notionId", "Invalid identifier.")
    if nature not in GAP_NATURES:
        raise invalid_input(f"gaps.{index}.nature", "Unknown gap nature.")
    return {"notionId": notion_id, "nature": str(nature)}


def _read_brick(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise invalid_input(f"bank.{index}", "A brick object is required.")
    for key in ("brickId", "brickVersionId"):
        value = raw.get(key)
        if not isinstance(value, str) or not value:
            raise invalid_input(f"bank.{index}.{key}", "Invalid identifier.")
    notion_ids = raw.get("notionIds")
    if not isinstance(notion_ids, (list, tuple)) or not 1 <= len(notion_ids) <= 50:
        raise invalid_input(f"bank.{index}.notionIds", "One to 50 identifiers are required.")
    if raw.get("format") not in BRICK_FORMATS:
        raise invalid_input(f"bank.{index}.format", "Unknown brick format.")
    if raw.get("status") not in BRICK_STATUSES:
        raise invalid_input(f"bank.{index}.status", "Unknown brick status.")
    if not isinstance(raw.get("valid"), bool) or not isinstance(raw.get("ownedByLearner"), bool):
        raise invalid_input(f"bank.{index}.valid", "A boolean is required.")
    fingerprint = raw.get("fingerprint")
    if fingerprint is not None and (
        not isinstance(fingerprint, str)
        or len(fingerprint) != FINGERPRINT_LENGTH
        or any(character not in "0123456789abcdef" for character in fingerprint)
    ):
        raise invalid_input(f"bank.{index}.fingerprint", "A SHA-256 hexadecimal fingerprint is required.")
    return dict(raw)


def _notion_sort_key(notion: _InternalNotion) -> tuple[Any, ...]:
    # Notions with an active gap come first, then the BR-LAC-03 nature order.
    gap = 0 if notion.gap is not None else 1
    nature = _gap_priority(notion.gap) if notion.gap is not None else 0
    mastery = math.inf if notion.mastery is None else notion.mastery
    ref = notion.ref
    return (
        gap,
        nature,
        mastery,
        int(ref["modulePosition"]),
        int(ref["position"]),
        str(ref["notionId"]),
    )


def _canonical_notions(
    notions: Sequence[Any], gaps: Sequence[Any], params: DrawParams
) -> list[_InternalNotion]:
    gap_by_notion: dict[str, str] = {}
    ordered_gaps = sorted(gaps, key=lambda gap: (_gap_priority(gap["nature"]), str(gap["notionId"])))
    for gap in ordered_gaps:
        if gap["notionId"] not in gap_by_notion:
            gap_by_notion[gap["notionId"]] = gap["nature"]

    unique: dict[str, dict[str, Any]] = {}
    for notion in sorted(notions, key=_raw_notion_sort_key):
        unique.setdefault(str(notion["notionId"]), notion)

    ordered_refs = list(unique.values())
    internal: list[_InternalNotion] = []
    for ref in ordered_refs:
        gap = gap_by_notion.get(str(ref["notionId"]))
        mastery = None if ref.get("mastery") is None else float(ref["mastery"])
        if gap is not None:
            weight = params.gap_weight
        elif mastery is not None and mastery < params.mastery_threshold:
            weight = params.weak_weight
        else:
            weight = params.base_weight
        internal.append(_InternalNotion(ref=ref, gap=gap, mastery=mastery, weight=weight))
    internal.sort(key=_notion_sort_key)
    for rank, notion in enumerate(internal):
        notion.rank = rank
    return internal


def _raw_notion_sort_key(raw: Mapping[str, Any]) -> tuple[Any, ...]:
    return (
        int(raw["modulePosition"]),
        int(raw["position"]),
        str(raw["notionId"]),
        str(raw["label"]),
        math.inf if raw.get("mastery") is None else float(raw["mastery"]),
    )


def _candidate_dedupe_key(candidate: _Candidate) -> tuple[Any, ...]:
    return (
        -len(candidate.linked),
        candidate.linked[0] if candidate.linked else "",
        str(candidate.brick["brickId"]),
        str(candidate.brick["brickVersionId"]),
    )


def _candidate_order_key(candidate: _Candidate) -> tuple[Any, ...]:
    return (
        candidate.linked[0] if candidate.linked else "",
        str(candidate.brick["brickId"]),
        str(candidate.brick["brickVersionId"]),
    )


@dataclass(frozen=True, slots=True)
class _CandidateSet:
    unique: tuple[_Candidate, ...]
    by_notion: dict[str, tuple[_Candidate, ...]]
    diagnostics: dict[str, int]


def _build_candidates(
    notions: Sequence[_InternalNotion],
    bank: Sequence[dict[str, Any]],
    seen_fingerprints: Sequence[str],
    params: DrawParams,
) -> _CandidateSet:
    rank_by_id = {str(notion.ref["notionId"]): notion.rank for notion in notions}
    weight_by_id = {str(notion.ref["notionId"]): notion.weight for notion in notions}
    seen = set(seen_fingerprints)
    candidates: list[_Candidate] = []
    eligible = 0
    seen_excluded = 0

    for brick in bank:
        if (
            brick["status"] != "active"
            or not brick["valid"]
            or not brick["ownedByLearner"]
            or brick["fingerprint"] is None
        ):
            continue
        share = share_of(str(brick["format"]))
        if share is None:
            continue
        linked = sorted(
            {str(notion_id) for notion_id in brick["notionIds"] if str(notion_id) in rank_by_id},
            key=lambda notion_id: rank_by_id[notion_id],
        )
        if not linked:
            continue
        eligible += 1
        if brick["fingerprint"] in seen:
            seen_excluded += 1
            continue
        weight = max(weight_by_id.get(notion_id, params.base_weight) for notion_id in linked)
        candidates.append(
            _Candidate(
                brick=brick,
                linked=tuple(linked),
                share=share,
                fingerprint=str(brick["fingerprint"]),
                weight=weight,
            )
        )

    seen_candidates = len(candidates)
    by_fingerprint: dict[str, _Candidate] = {}
    for candidate in sorted(candidates, key=_candidate_dedupe_key):
        by_fingerprint.setdefault(candidate.fingerprint, candidate)
    unique = sorted(by_fingerprint.values(), key=_candidate_order_key)
    by_notion: dict[str, list[_Candidate]] = {}
    for candidate in unique:
        for notion_id in candidate.linked:
            by_notion.setdefault(notion_id, []).append(candidate)
    return _CandidateSet(
        unique=tuple(unique),
        by_notion={notion_id: tuple(items) for notion_id, items in by_notion.items()},
        diagnostics={
            "bankSize": len(bank),
            "eligible": eligible,
            "seenExcluded": seen_excluded,
            "unseen": seen_candidates,
            "duplicateFingerprints": seen_candidates - len(unique),
            "unique": len(unique),
        },
    )


def _allocate_quotas(coverage: Sequence[_InternalNotion], target_count: int) -> None:
    extra = target_count - len(coverage)
    if not coverage:
        return
    total_weight = sum(notion.weight for notion in coverage)
    remainders: list[tuple[float, int, _InternalNotion]] = []
    for notion in coverage:
        exact = (extra * notion.weight) / total_weight if total_weight > 0 else extra / len(coverage)
        floor = math.floor(exact + 1e-9)
        notion.quota = 1 + floor
        remainders.append((exact - floor, notion.rank, notion))
    leftover = target_count - sum(notion.quota for notion in coverage)
    remainders.sort(key=lambda entry: (-entry[0], entry[1]))
    for _remainder, _rank, notion in remainders:
        if leftover <= 0:
            break
        notion.quota += 1
        leftover -= 1
    cursor = 0
    while leftover > 0 and coverage:
        coverage[cursor % len(coverage)].quota += 1
        leftover -= 1
        cursor += 1


def _allocate_open_quotas(coverage: Sequence[_InternalNotion], target_count: int, params: DrawParams) -> int:
    if not coverage:
        return 0
    total = min(target_count, max(params.min_open, js_round(params.open_share * target_count)))
    assigned = 0
    cursor = 0
    guard = len(coverage) * (total + 1)
    while assigned < total and cursor < guard:
        notion = coverage[cursor % len(coverage)]
        if notion.open_quota < notion.quota:
            notion.open_quota += 1
            assigned += 1
        cursor += 1
    return total


def _pick_uniform(pool: Sequence[_Candidate], random: Any) -> _Candidate | None:
    if not pool:
        return None
    index = min(len(pool) - 1, math.floor(random() * len(pool)))
    picked: _Candidate = pool[index]
    return picked


def _pick_weighted(pool: Sequence[_Candidate], random: Any) -> _Candidate | None:
    if not pool:
        return None
    total = sum(candidate.weight for candidate in pool)
    if total <= 0:
        return _pick_uniform(pool, random)
    threshold = random() * total
    for candidate in pool:
        threshold -= candidate.weight
        if threshold < 0:
            return candidate
    return pool[-1]


def _missing_shares(candidates: Sequence[_Candidate]) -> list[str]:
    shares: list[str] = []
    if not any(candidate.share == "choice" for candidate in candidates):
        shares.append("choice")
    if not any(candidate.share == "open" for candidate in candidates):
        shares.append("open")
    return shares


def _points_for(size: int, total_points: float) -> list[float]:
    if size == 0:
        return []
    unit = _round2(total_points / size)
    points: list[float] = []
    allocated = 0.0
    for index in range(size):
        if index == size - 1:
            points.append(_round2(total_points - allocated))
        else:
            points.append(unit)
            allocated = _round2(allocated + unit)
    return points


def draw_attempt(
    *,
    notions: Sequence[Any],
    bank: Sequence[Any],
    seen_fingerprints: Sequence[Any],
    gaps: Sequence[Any],
    seed: str,
    params: DrawParams | Mapping[str, Any] | None = None,
    target_count: int | None = None,
) -> dict[str, Any]:
    """ET-1/ET-2: deterministic references of one validation attempt plus the exhaustion report."""
    bounds = _resolve_params(params)
    if not isinstance(seed, str):
        raise invalid_input("seed", "The seed must be a string.")
    if not isinstance(seen_fingerprints, (list, tuple)):
        raise invalid_input("seenFingerprints", "seenFingerprints must be an array.")
    parsed_notions = [_read_notion(raw, index) for index, raw in enumerate(notions)]
    parsed_bank = [_read_brick(raw, index) for index, raw in enumerate(bank)]
    parsed_gaps = [_read_gap(raw, index) for index, raw in enumerate(gaps)]
    parsed_seen = [str(value) for value in seen_fingerprints]
    count = bounds.default_size if target_count is None else target_count
    if (
        not isinstance(count, int)
        or isinstance(count, bool)
        or count < bounds.min_size
        or count > bounds.max_size
    ):
        raise invalid_input(
            "targetCount",
            f"targetCount must be an integer between {bounds.min_size} and {bounds.max_size}.",
        )

    internal = _canonical_notions(parsed_notions, parsed_gaps, bounds)
    candidate_set = _build_candidates(internal, parsed_bank, parsed_seen, bounds)
    by_id = {str(notion.ref["notionId"]): notion for notion in internal}

    coverage_count = min(len(internal), count, bounds.max_size)
    coverage = internal[:coverage_count]
    coverage_limited = coverage_count < len(internal)
    _allocate_quotas(coverage, count)
    open_target = _allocate_open_quotas(coverage, count, bounds)

    random = seeded_random(seed)
    used: set[_Candidate] = set()
    selected: list[tuple[_Candidate, str]] = []
    choice_share_target = max(0, count - open_target)
    choice_question_floor = math.ceil(choice_share_target * 0.6)

    def choice_question_count() -> int:
        return sum(1 for entry in selected if entry[0].brick["format"] == "choice_question")

    shortage_by_notion: dict[str, list[str]] = {}

    def mark_shortage(notion_id: str, share: str) -> None:
        shortages = shortage_by_notion.setdefault(notion_id, [])
        if share not in shortages:
            shortages.append(share)

    def select(candidate: _Candidate, served_notion: str) -> None:
        used.add(candidate)
        selected.append((candidate, served_notion))
        for notion_id in candidate.linked:
            notion = by_id.get(notion_id)
            if notion is None:
                continue
            notion.served += 1
            if candidate.share == "open":
                notion.open_served += 1

    def pick_for(notion_id: str, share: str) -> _Candidate | None:
        pool = [
            candidate
            for candidate in candidate_set.by_notion.get(notion_id, ())
            if candidate not in used and candidate.share == share
        ]
        if share == "choice" and choice_question_count() < choice_question_floor:
            preferred = [candidate for candidate in pool if candidate.brick["format"] == "choice_question"]
            if preferred:
                return _pick_uniform(preferred, random)
        return _pick_uniform(pool, random)

    for notion in coverage:
        guard = 0
        while notion.served < notion.quota and len(selected) < count:
            guard += 1
            if guard > count * 2 + 10:
                break
            desired = "open" if notion.open_served < notion.open_quota else "choice"
            picked = pick_for(str(notion.ref["notionId"]), desired)
            if picked is None:
                mark_shortage(str(notion.ref["notionId"]), desired)
                other = "choice" if desired == "open" else "open"
                picked = pick_for(str(notion.ref["notionId"]), other)
                if picked is None:
                    mark_shortage(str(notion.ref["notionId"]), other)
                    break
                mark_shortage(str(notion.ref["notionId"]), desired)
            select(picked, str(notion.ref["notionId"]))
        if len(selected) >= count:
            break

    while len(selected) < count:
        remaining = [candidate for candidate in candidate_set.unique if candidate not in used]
        if not remaining:
            break
        opens = sum(1 for entry in selected if entry[0].share == "open")
        choices = len(selected) - opens
        choice_target = count - open_target
        pool = remaining
        if opens < open_target:
            open_pool = [candidate for candidate in remaining if candidate.share == "open"]
            if open_pool:
                pool = open_pool
        elif choices < choice_target:
            choice_pool = [candidate for candidate in remaining if candidate.share == "choice"]
            if choice_pool:
                preferred = [
                    candidate for candidate in choice_pool if candidate.brick["format"] == "choice_question"
                ]
                pool = (
                    preferred
                    if choice_question_count() < choice_question_floor and preferred
                    else choice_pool
                )
        picked = _pick_weighted(pool, random)
        if picked is None:
            break
        select(picked, picked.linked[0] if picked.linked else "")

    opens_selected = sum(1 for entry in selected if entry[0].share == "open")
    choices_selected = len(selected) - opens_selected
    exhausted_formats: list[str] = []
    if open_target > 0 and opens_selected < open_target:
        exhausted_formats.append("open")
    if count - open_target > 0 and choices_selected < count - open_target:
        exhausted_formats.append("choice")

    plan = [
        {
            "notionId": notion.ref["notionId"],
            "priority": notion.rank,
            "gap": notion.gap is not None,
            "mastery": notion.mastery,
            "weight": notion.weight,
            "quota": notion.quota,
            "selected": notion.served,
        }
        for notion in internal
    ]
    uncovered = [notion.ref["notionId"] for notion in internal if notion.served == 0]

    exhausted: list[dict[str, Any]] = []
    for notion in internal:
        notion_id = str(notion.ref["notionId"])
        if notion.quota == 0:
            if notion.served == 0:
                exhausted.append(
                    {
                        "notionId": notion_id,
                        "reason": "capacity",
                        "requested": 0,
                        "selected": 0,
                        "formats": [],
                    }
                )
            continue
        if notion.served >= notion.quota:
            continue
        unused = [
            candidate for candidate in candidate_set.by_notion.get(notion_id, ()) if candidate not in used
        ]
        formats: list[str] = []
        for share in [
            *shortage_by_notion.get(notion_id, []),
            *_missing_shares(unused),
        ]:
            if share not in formats:
                formats.append(share)
        exhausted.append(
            {
                "notionId": notion_id,
                "reason": "bank_exhausted" if not unused else "size_limit",
                "requested": notion.quota,
                "selected": notion.served,
                "formats": formats,
            }
        )

    buckets: dict[str, list[tuple[_Candidate, str]]] = {}
    for entry in selected:
        buckets.setdefault(f"{entry[0].share}|{entry[1]}", []).append(entry)
    for key, bucket in buckets.items():
        ordered_bucket = sorted(
            bucket,
            key=lambda entry: (
                str(entry[0].brick["brickId"]),
                str(entry[0].brick["brickVersionId"]),
            ),
        )
        buckets[key] = stable_shuffle(
            ordered_bucket,
            f"{seed}|{key}",
            lambda entry: f"{entry[0].brick['brickId']}|{entry[0].brick['brickVersionId']}",
        )

    ordered: list[tuple[_Candidate, str]] = []
    notion_ids = [str(notion.ref["notionId"]) for notion in internal]
    for share in SHARES:
        max_size = max([len(buckets.get(f"{share}|{notion_id}", [])) for notion_id in notion_ids] or [0])
        for index in range(max_size):
            for notion_id in notion_ids:
                bucket = buckets.get(f"{share}|{notion_id}", [])
                if index < len(bucket):
                    ordered.append(bucket[index])

    points = _points_for(len(ordered), bounds.total_points)
    questions = [
        {
            "brickId": entry[0].brick["brickId"],
            "brickVersionId": entry[0].brick["brickVersionId"],
            "notionId": entry[1],
            "notionIds": list(entry[0].linked),
            "format": entry[0].brick["format"],
            "share": entry[0].share,
            "fingerprint": entry[0].fingerprint,
            "points": points[index] if index < len(points) else 0,
        }
        for index, entry in enumerate(ordered)
    ]
    return {
        "questions": questions,
        "exhausted": exhausted,
        "uncoveredNotionIds": uncovered,
        "exhaustedFormats": exhausted_formats,
        "coverageLimited": coverage_limited,
        "minimumReached": len(questions) >= bounds.min_size,
        "targetCount": count,
        "size": len(questions),
        "pointsTotal": bounds.total_points,
        "plan": plan,
        "diagnostics": candidate_set.diagnostics,
        "seed": seed,
    }


def engine_draw_params(overrides: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """The `ENGINE.draw` bounds plus the mastery threshold, ready for `draw_attempt`."""
    defaults = DEFAULT_DRAW_PARAMS.to_dict()
    if overrides:
        defaults.update(overrides)
    return defaults


__all__ = [
    "CHOICE_FORMATS",
    "DEFAULT_DRAW_PARAMS",
    "OPEN_FORMATS",
    "DrawParams",
    "draw_attempt",
    "engine_draw_params",
    "share_of",
]
