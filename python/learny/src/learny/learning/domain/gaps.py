"""Detection, nature and clearance of gaps (SPEC-404, BR-LAC-02 to BR-LAC-06, ADR-0024, ADR-0282).

Every function is pure and deterministic: the current instant, the answers and the business bounds
are explicit inputs. Nothing here reads the clock, the database, the network or the configuration;
services pass `ENGINE.gaps` and `ENGINE.mastery.threshold` as `params`.
"""

import math
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import invalid_input
from learny.learning.domain.time import parse_instant
from learny.learning.domain.types import ATTEMPT_KINDS, BRICK_FORMATS, GAP_NATURES
from learny.shared.jsmath import js_number, js_round
from learny.shared.locale_fr import learning_engine as texts

MS_PER_DAY = 86_400_000
MS_PER_HOUR = 3_600_000
MISUNDERSTANDING_MIN_FAILURES = 2
QUALIFYING_ATTEMPT_KINDS = ("validation_quiz", "exercise", "mock_exam")
DEFINITION_FORMATS = ("choice_question", "open_question", "cloze")
RECOMMENDED_ACTION_BY_NATURE = {
    "forgetting": "global_quiz",
    "confusion": "confrontation",
    "misunderstanding": "alternative_explanation",
    "application": "practice_exercise",
}
NATURE_PRIORITY = {"confusion": 0, "application": 1, "misunderstanding": 2, "forgetting": 3}


@dataclass(frozen=True, slots=True)
class GapParams:
    """Business bounds of gap detection and clearance (`ENGINE.gaps` + mastery threshold)."""

    mastery_threshold: float = 80
    failure_ratio: float = 0.5
    forgetting_min_days: float = 7
    repeated_error_attempts: int = 2
    clear_successes: int = 2
    clear_min_days_apart: float = 1

    def to_dict(self) -> dict[str, Any]:
        return {
            "masteryThreshold": self.mastery_threshold,
            "failureRatio": self.failure_ratio,
            "forgettingMinDays": self.forgetting_min_days,
            "repeatedErrorAttempts": self.repeated_error_attempts,
            "clearSuccesses": self.clear_successes,
            "clearMinDaysApart": self.clear_min_days_apart,
        }


DEFAULT_GAP_PARAMS = GapParams()


def resolve_params(params: GapParams | Mapping[str, Any] | None) -> GapParams:
    """The caller's bounds, or the normative defaults; invalid values are refused."""
    if params is None:
        return DEFAULT_GAP_PARAMS
    if isinstance(params, GapParams):
        return params
    return GapParams(
        mastery_threshold=float(params.get("masteryThreshold", 80)),
        failure_ratio=float(params.get("failureRatio", 0.5)),
        forgetting_min_days=float(params.get("forgettingMinDays", 7)),
        repeated_error_attempts=int(params.get("repeatedErrorAttempts", 2)),
        clear_successes=int(params.get("clearSuccesses", 2)),
        clear_min_days_apart=float(params.get("clearMinDaysApart", 1)),
    )


def _format_number(value: float) -> str:
    """`String(Math.round(value * 100) / 100).replace('.', ',')`, as the evidence lines write it."""
    rounded = js_round(value * 100) / 100
    return js_number(rounded).replace(".", ",")


def normalize_error(value: Any) -> str:
    """EF-2: NFKD, combining marks removed, lower case, spaces collapsed and trimmed."""
    if not isinstance(value, str):
        raise invalid_input("response", "A response to normalise must be a string.")
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(character for character in decomposed if not unicodedata.combining(character))
    return " ".join(without_marks.lower().split())


def is_gap_failure(answer: Mapping[str, Any], failure_ratio: float = 0.5) -> bool:
    """BR-LAC-02: a failed answer, explicit or graded under the failure ratio."""
    if answer.get("correct") is False:
        return True
    if answer.get("correct") is True:
        return False
    score, maximum = answer.get("score"), answer.get("maxScore")
    if score is None or maximum is None or maximum <= 0:
        return False
    return bool(float(score) / float(maximum) < failure_ratio)


def is_gap_success(answer: Mapping[str, Any], failure_ratio: float = 0.5) -> bool:
    """BR-LAC-06: the dual of `is_gap_failure` for graded answers."""
    if answer.get("correct") is True:
        return True
    if answer.get("correct") is False:
        return False
    score, maximum = answer.get("score"), answer.get("maxScore")
    if score is None or maximum is None or maximum <= 0:
        return False
    return bool(float(score) / float(maximum) >= failure_ratio)


def gap_error_key(answer: Mapping[str, Any]) -> str | None:
    """EF-2: identity of an error; two failures without identity never form a repetition."""
    distractor = answer.get("chosenDistractorNotionId")
    if distractor is not None:
        return f"distractor:{distractor}"
    confused = answer.get("confusedWithNotionId")
    if confused is not None:
        return f"confusion:{confused}"
    response = answer.get("normalizedResponse")
    if response is None or answer.get("format") == "choice_question":
        return None
    normalized = normalize_error(response)
    return None if normalized == "" else f"response:{normalized}"


def _read_answer(raw: Any, path: str) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise invalid_input(path, "An answer object is required.")
    for key in ("answerId", "attemptId", "answeredAt", "format", "attemptKind"):
        if key not in raw:
            raise invalid_input(f"{path}.{key}", f"Missing field: {key}.")
    if raw["format"] not in BRICK_FORMATS:
        raise invalid_input(f"{path}.format", "Unknown brick format.")
    if raw["attemptKind"] not in ATTEMPT_KINDS:
        raise invalid_input(f"{path}.attemptKind", "Unknown attempt kind.")
    notion_ids = raw.get("notionIds")
    if not isinstance(notion_ids, (list, tuple)) or not notion_ids:
        raise invalid_input(f"{path}.notionIds", "At least one notion identifier is required.")
    return dict(raw)


def _read_gap(raw: Any, path: str) -> dict[str, Any]:
    if not isinstance(raw, Mapping):
        raise invalid_input(path, "A gap object is required.")
    for key in ("nature", "confusedWith", "detectedAt", "evidence", "clearedAt"):
        if key not in raw:
            raise invalid_input(f"{path}.{key}", f"Missing field: {key}.")
    if raw["nature"] not in GAP_NATURES:
        raise invalid_input(f"{path}.nature", "Unknown gap nature.")
    return dict(raw)


def _assert_gap_consistency(gap: Mapping[str, Any], notion: str | None, path: str) -> None:
    confused = gap.get("confusedWith")
    if confused is None:
        return
    if gap["nature"] != "confusion":
        raise invalid_input(f"{path}.confusedWith", "A confused notion only belongs to the confusion nature.")
    if notion is not None and confused == notion:
        raise invalid_input(f"{path}.confusedWith", "A notion cannot be confused with itself.")


def _read_gap_instants(gap: Mapping[str, Any], now_ms: int, path: str) -> tuple[int, int | None]:
    detected_at = parse_instant(str(gap["detectedAt"]))
    if detected_at > now_ms:
        raise invalid_input(f"{path}.detectedAt", "The detection cannot be later than the instant.")
    cleared_at_raw = gap.get("clearedAt")
    if cleared_at_raw is None:
        return (detected_at, None)
    cleared_at = parse_instant(str(cleared_at_raw))
    if cleared_at > now_ms:
        raise invalid_input(f"{path}.clearedAt", "The clearance cannot be later than the instant.")
    if cleared_at < detected_at:
        raise invalid_input(f"{path}.clearedAt", "The clearance precedes the detection.")
    return (detected_at, cleared_at)


@dataclass(frozen=True, slots=True)
class _FlattenedAnswer:
    answer: dict[str, Any]
    answered_at_ms: int
    attempt_kind: str


@dataclass(frozen=True, slots=True)
class _FlattenedAttempt:
    attempt_id: str
    attempt_kind: str
    answers: tuple[_FlattenedAnswer, ...]
    latest_ms: int


def _flatten_attempts(attempts: Sequence[Any], notion: str, now_ms: int) -> list[_FlattenedAttempt]:
    seen: set[str] = set()
    flattened: list[_FlattenedAttempt] = []
    for attempt_index, raw_attempt in enumerate(attempts):
        if not isinstance(raw_attempt, Mapping):
            raise invalid_input(f"attempts.{attempt_index}", "An attempt object is required.")
        attempt_id = raw_attempt.get("attemptId")
        attempt_kind = raw_attempt.get("attemptKind")
        if not isinstance(attempt_id, str) or not 1 <= len(attempt_id) <= 64:
            raise invalid_input(f"attempts.{attempt_index}.attemptId", "Invalid identifier.")
        if attempt_kind not in ATTEMPT_KINDS:
            raise invalid_input(f"attempts.{attempt_index}.attemptKind", "Unknown attempt kind.")
        if attempt_id in seen:
            raise invalid_input(f"attempts.{attempt_index}.attemptId", "Duplicate attempt.")
        seen.add(attempt_id)
        raw_answers = raw_attempt.get("answers")
        if not isinstance(raw_answers, (list, tuple)) or not raw_answers:
            raise invalid_input(f"attempts.{attempt_index}.answers", "At least one answer is required.")
        answers: list[_FlattenedAnswer] = []
        for answer_index, raw_answer in enumerate(raw_answers):
            at = f"attempts.{attempt_index}.answers.{answer_index}"
            answer = _read_answer(raw_answer, at)
            if answer["attemptId"] != attempt_id:
                raise invalid_input(f"{at}.attemptId", "The answer does not belong to the attempt.")
            if answer["attemptKind"] != attempt_kind:
                raise invalid_input(f"{at}.attemptKind", "The answer kind differs from the attempt.")
            answered_at_ms = parse_instant(str(answer["answeredAt"]))
            if answered_at_ms > now_ms:
                raise invalid_input(f"{at}.answeredAt", "An answer cannot be later than the instant.")
            if notion not in answer["notionIds"] or not answer.get("countsForGaps"):
                continue
            answers.append(
                _FlattenedAnswer(
                    answer=answer,
                    answered_at_ms=answered_at_ms,
                    attempt_kind=str(attempt_kind),
                )
            )
        if not answers:
            continue
        flattened.append(
            _FlattenedAttempt(
                attempt_id=attempt_id,
                attempt_kind=str(attempt_kind),
                answers=tuple(answers),
                latest_ms=max(answer.answered_at_ms for answer in answers),
            )
        )
    flattened.sort(key=lambda attempt: (attempt.latest_ms, attempt.attempt_id))
    return flattened


def _after_clearance(
    attempts: Sequence[_FlattenedAttempt], cleared_at_ms: int | None
) -> list[_FlattenedAttempt]:
    if cleared_at_ms is None:
        return list(attempts)
    result: list[_FlattenedAttempt] = []
    for attempt in attempts:
        answers = tuple(answer for answer in attempt.answers if answer.answered_at_ms > cleared_at_ms)
        if not answers:
            continue
        result.append(
            _FlattenedAttempt(
                attempt_id=attempt.attempt_id,
                attempt_kind=attempt.attempt_kind,
                answers=answers,
                latest_ms=max(answer.answered_at_ms for answer in answers),
            )
        )
    return result


def _answer_sort_key(answer: _FlattenedAnswer) -> tuple[int, str]:
    """Stable order of two answers: instant first, then answer identifier."""
    return (answer.answered_at_ms, str(answer.answer["answerId"]))


def _latest_attempt(attempts: Sequence[_FlattenedAttempt]) -> _FlattenedAttempt | None:
    best: _FlattenedAttempt | None = None
    for attempt in attempts:
        if (
            best is None
            or attempt.latest_ms > best.latest_ms
            or (attempt.latest_ms == best.latest_ms and attempt.attempt_id < best.attempt_id)
        ):
            best = attempt
    return best


def _repeat_errors(attempts: Sequence[_FlattenedAttempt], params: GapParams) -> list[dict[str, Any]]:
    attempts_by_key: dict[str, set[str]] = {}
    for attempt in attempts:
        keys: set[str] = set()
        for answer in attempt.answers:
            if not is_gap_failure(answer.answer, params.failure_ratio):
                continue
            key = gap_error_key(answer.answer)
            if key is not None:
                keys.add(key)
        for key in keys:
            attempts_by_key.setdefault(key, set()).add(attempt.attempt_id)
    return [
        {"key": key, "attemptIds": sorted(ids)}
        for key, ids in sorted(attempts_by_key.items())
        if len(ids) >= params.repeated_error_attempts
    ]


def _confusion_signal(
    answers: Sequence[_FlattenedAnswer], notion: str, params: GapParams
) -> dict[str, Any] | None:
    entries: dict[str, dict[str, Any]] = {}
    for answer in answers:
        if not is_gap_failure(answer.answer, params.failure_ratio):
            continue
        confused_with = answer.answer.get("chosenDistractorNotionId") or answer.answer.get(
            "confusedWithNotionId"
        )
        if confused_with is None or confused_with == notion:
            continue
        current = entries.get(confused_with)
        entries[confused_with] = {
            "confusedWith": confused_with,
            "count": (current["count"] if current else 0) + 1,
            "latestMs": max(current["latestMs"] if current else -math.inf, answer.answered_at_ms),
            "latestAnswerId": (
                answer.answer["answerId"]
                if current is None or answer.answered_at_ms >= current["latestMs"]
                else current["latestAnswerId"]
            ),
        }
    if not entries:
        return None
    ranked = sorted(
        entries.values(),
        key=lambda entry: (-entry["count"], -entry["latestMs"], entry["confusedWith"]),
    )
    return ranked[0]


def _forgetting_signal(answers: Sequence[_FlattenedAnswer], params: GapParams) -> dict[str, Any] | None:
    ordered = sorted(answers, key=_answer_sort_key)
    first_success: _FlattenedAnswer | None = None
    for answer in ordered:
        if is_gap_success(answer.answer, params.failure_ratio):
            if first_success is None:
                first_success = answer
            continue
        if not is_gap_failure(answer.answer, params.failure_ratio) or first_success is None:
            continue
        elapsed_days = (answer.answered_at_ms - first_success.answered_at_ms) / MS_PER_DAY
        if elapsed_days >= params.forgetting_min_days:
            return {"success": first_success, "failure": answer, "days": elapsed_days}
    return None


@dataclass(frozen=True, slots=True)
class _Classification:
    nature: str
    explicit: bool
    confused_with: str | None
    confusion: dict[str, Any] | None
    application: bool
    misunderstanding: dict[str, int] | None
    forgetting: dict[str, Any] | None
    fsrs_lapsed: bool


def _classify_gap(
    attempts: Sequence[_FlattenedAttempt], notion: str, params: GapParams, fsrs_lapsed: bool
) -> _Classification:
    answers = [answer for attempt in attempts for answer in attempt.answers]
    failures = [answer for answer in answers if is_gap_failure(answer.answer, params.failure_ratio)]
    successes = [answer for answer in answers if is_gap_success(answer.answer, params.failure_ratio)]
    confusion = _confusion_signal(answers, notion, params)
    application = any(
        answer.attempt_kind != "exercise" and answer.answer["format"] in DEFINITION_FORMATS
        for answer in successes
    ) and any(answer.attempt_kind == "exercise" for answer in failures)
    off_topic = sum(
        1
        for answer in failures
        if answer.answer.get("offTopic") and answer.answer["format"] == "open_question"
    )
    misunderstanding = (
        {"failures": len(failures), "offTopic": off_topic}
        if len(failures) >= MISUNDERSTANDING_MIN_FAILURES and off_topic > 0
        else None
    )
    forgetting = _forgetting_signal(answers, params)
    forgetting_candidate = forgetting is not None or (fsrs_lapsed and len(failures) > 0)
    candidates: list[str] = []
    if confusion is not None:
        candidates.append("confusion")
    if application:
        candidates.append("application")
    if misunderstanding is not None:
        candidates.append("misunderstanding")
    if forgetting_candidate:
        candidates.append("forgetting")
    nature = candidates[0] if candidates else "misunderstanding"
    return _Classification(
        nature=nature,
        explicit=bool(candidates),
        confused_with=confusion["confusedWith"] if nature == "confusion" and confusion else None,
        confusion=confusion,
        application=application,
        misunderstanding=misunderstanding,
        forgetting=forgetting,
        fsrs_lapsed=fsrs_lapsed,
    )


def _nature_evidence(classification: _Classification, mastery: float, params: GapParams) -> str:
    if classification.nature == "confusion":
        signal = classification.confusion
        if signal is None:
            return texts.GAP_EVIDENCE_CONFUSION_GENERIC
        return texts.GAP_EVIDENCE_CONFUSION.format(count=signal["count"], notion=signal["confusedWith"])
    if classification.nature == "application":
        return texts.GAP_EVIDENCE_APPLICATION
    if classification.nature == "misunderstanding":
        signal = classification.misunderstanding
        if signal is None:
            return texts.GAP_EVIDENCE_MISUNDERSTANDING_THRESHOLD.format(
                mastery=_format_number(mastery),
                threshold=_format_number(params.mastery_threshold),
            )
        return texts.GAP_EVIDENCE_MISUNDERSTANDING_OFF_TOPIC.format(failures=signal["failures"])
    signal = classification.forgetting
    if signal is None:
        return texts.GAP_EVIDENCE_FORGETTING_LAPSE
    return texts.GAP_EVIDENCE_FORGETTING.format(
        day=str(signal["success"].answer["answeredAt"])[0:10],
        days=_format_number(signal["days"]),
    )


def _trigger_evidence(
    attempts: Sequence[_FlattenedAttempt],
    repeated_errors: Sequence[Mapping[str, Any]],
    mastery: float,
    params: GapParams,
) -> tuple[list[str], list[str]]:
    triggers: list[str] = []
    parts: list[str] = []
    latest = _latest_attempt(attempts)
    if (
        mastery < params.mastery_threshold
        and latest is not None
        and latest.attempt_kind in QUALIFYING_ATTEMPT_KINDS
        and any(is_gap_failure(answer.answer, params.failure_ratio) for answer in latest.answers)
    ):
        triggers.append("qualifying_attempt")
        parts.append(
            texts.GAP_TRIGGER_QUALIFYING.format(
                kind=texts.GAP_ATTEMPT_KIND_LABELS.get(latest.attempt_kind, texts.GAP_ATTEMPT_KIND_FALLBACK),
                threshold=_format_number(params.mastery_threshold),
            )
        )
    if repeated_errors:
        triggers.append("repeated_error")
        for repeated in repeated_errors:
            parts.append(
                texts.GAP_TRIGGER_REPEATED.format(key=repeated["key"], count=len(repeated["attemptIds"]))
            )
    return (triggers, parts)


def _inactive_evidence(attempts: Sequence[_FlattenedAttempt], mastery: float, params: GapParams) -> str:
    if not attempts:
        return texts.GAP_INACTIVE_NO_ATTEMPT
    if mastery >= params.mastery_threshold:
        return texts.GAP_INACTIVE_MASTERED.format(
            mastery=_format_number(mastery), threshold=_format_number(params.mastery_threshold)
        )
    return texts.GAP_INACTIVE_DEFAULT


def detect_gap(
    notion: str,
    attempts: Sequence[Any],
    mastery: float,
    now: str,
    existing_gap: Mapping[str, Any] | None = None,
    fsrs_lapsed: bool = False,
    params: GapParams | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """ET-1, EF-1 to EF-4, CL-1 to CL-5: deterministic gap detection and nature."""
    bounds = resolve_params(params)
    now_ms = parse_instant(now)
    gap = None if existing_gap is None else _read_gap(existing_gap, "existingGap")
    if gap is not None:
        _assert_gap_consistency(gap, notion, "existingGap")
    gap_instants = None if gap is None else _read_gap_instants(gap, now_ms, "existingGap")

    flattened = _flatten_attempts(attempts, notion, now_ms)
    active_gap = gap if gap is not None and gap.get("clearedAt") is None else None
    evaluated = (
        flattened
        if active_gap is not None
        else _after_clearance(flattened, gap_instants[1] if gap_instants else None)
    )
    repeated_errors = _repeat_errors(evaluated, bounds)
    classification = _classify_gap(evaluated, notion, bounds, fsrs_lapsed)
    triggers, parts = _trigger_evidence(evaluated, repeated_errors, mastery, bounds)

    if active_gap is not None:
        changed = (
            classification.explicit
            and NATURE_PRIORITY[classification.nature] < NATURE_PRIORITY[active_gap["nature"]]
        )
        if not changed:
            return {
                "active": True,
                "nature": active_gap["nature"],
                "confusedWith": active_gap["confusedWith"],
                "evidence": active_gap["evidence"],
                "recommendedAction": RECOMMENDED_ACTION_BY_NATURE[str(active_gap["nature"])],
                "event": None,
                "triggers": triggers,
                "repeatedErrors": repeated_errors,
                "gap": active_gap,
            }
        evidence = " ".join([_nature_evidence(classification, mastery, bounds), *parts])
        upgraded = {
            "nature": classification.nature,
            "confusedWith": classification.confused_with,
            "detectedAt": active_gap["detectedAt"],
            "evidence": evidence,
            "clearedAt": None,
        }
        return {
            "active": True,
            "nature": upgraded["nature"],
            "confusedWith": upgraded["confusedWith"],
            "evidence": evidence,
            "recommendedAction": RECOMMENDED_ACTION_BY_NATURE[str(upgraded["nature"])],
            "event": "nature_changed",
            "triggers": triggers,
            "repeatedErrors": repeated_errors,
            "gap": upgraded,
        }

    if not triggers:
        return {
            "active": False,
            "nature": None,
            "confusedWith": None,
            "evidence": _inactive_evidence(evaluated, mastery, bounds),
            "recommendedAction": None,
            "event": None,
            "triggers": [],
            "repeatedErrors": repeated_errors,
            "gap": gap,
        }

    nature_parts = [_nature_evidence(classification, mastery, bounds)] if classification.explicit else []
    evidence = " ".join([*nature_parts, *parts])
    detected = {
        "nature": classification.nature,
        "confusedWith": classification.confused_with,
        "detectedAt": now,
        "evidence": evidence,
        "clearedAt": None,
    }
    return {
        "active": True,
        "nature": detected["nature"],
        "confusedWith": detected["confusedWith"],
        "evidence": evidence,
        "recommendedAction": RECOMMENDED_ACTION_BY_NATURE[str(detected["nature"])],
        "event": "detected",
        "triggers": triggers,
        "repeatedErrors": repeated_errors,
        "gap": detected,
    }


def _clearance_evidence(
    cleared: bool,
    checks: Mapping[str, bool],
    success_count: int,
    interval_hours: float | None,
    mastery: float,
    params: GapParams,
) -> str:
    if not checks["activeGap"]:
        return texts.GAP_CLEARANCE_NONE
    if not checks["enoughSuccesses"]:
        return texts.GAP_CLEARANCE_NOT_ENOUGH.format(count=success_count, required=params.clear_successes)
    if not checks["spaced"]:
        minimum_hours = params.clear_min_days_apart * 24
        observed = "0" if interval_hours is None else _format_number(interval_hours)
        return texts.GAP_CLEARANCE_NOT_SPACED.format(observed=observed, minimum=_format_number(minimum_hours))
    if not checks["masteryReached"]:
        return texts.GAP_CLEARANCE_NOT_MASTERED.format(
            mastery=_format_number(mastery), threshold=_format_number(params.mastery_threshold)
        )
    if not cleared:
        return texts.GAP_CLEARANCE_KEPT
    return texts.GAP_CLEARANCE_DONE.format(
        count=success_count,
        interval=_format_number(interval_hours or 0.0),
        mastery=_format_number(mastery),
        threshold=_format_number(params.mastery_threshold),
    )


def clear_gap(
    gap: Mapping[str, Any],
    successes: Sequence[Any],
    mastery: float,
    now: str,
    notion: str | None = None,
    params: GapParams | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """ET-2, EF-5, CL-4: a gap is cleared only by spaced successes above the threshold."""
    bounds = resolve_params(params)
    now_ms = parse_instant(now)
    current = _read_gap(gap, "gap")
    _assert_gap_consistency(current, notion, "gap")
    detected_at_ms, _cleared = _read_gap_instants(current, now_ms, "gap")
    active_gap = current.get("clearedAt") is None

    candidates: list[_FlattenedAnswer] = []
    for index, raw in enumerate(successes):
        answer = _read_answer(raw, f"successes.{index}")
        answered_at_ms = parse_instant(str(answer["answeredAt"]))
        if answered_at_ms > now_ms:
            raise invalid_input(
                f"successes.{index}.answeredAt", "A success cannot be later than the instant."
            )
        if answered_at_ms < detected_at_ms:
            continue
        if notion is not None and notion not in answer["notionIds"]:
            continue
        if not is_gap_success(answer, bounds.failure_ratio):
            continue
        candidates.append(
            _FlattenedAnswer(
                answer=answer,
                answered_at_ms=answered_at_ms,
                attempt_kind=str(answer["attemptKind"]),
            )
        )
    candidates.sort(key=_answer_sort_key)
    success_count = len(candidates)
    interval_ms = candidates[-1].answered_at_ms - candidates[0].answered_at_ms if success_count >= 2 else None
    interval_hours = None if interval_ms is None else interval_ms / MS_PER_HOUR
    checks = {
        "activeGap": active_gap,
        "enoughSuccesses": success_count >= bounds.clear_successes,
        "spaced": interval_ms is not None and interval_ms >= bounds.clear_min_days_apart * MS_PER_DAY,
        "masteryReached": mastery >= bounds.mastery_threshold,
    }
    cleared = all(checks.values())
    cleared_at = now if cleared else None
    next_gap = dict(current, clearedAt=now) if cleared else current
    return {
        "cleared": cleared,
        "event": "cleared" if cleared else None,
        "clearedAt": cleared_at,
        "evidence": _clearance_evidence(cleared, checks, success_count, interval_hours, mastery, bounds),
        "gap": next_gap,
        "successCount": success_count,
        "intervalHours": interval_hours,
        "checks": checks,
    }
