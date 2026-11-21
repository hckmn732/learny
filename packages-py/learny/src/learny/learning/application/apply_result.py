"""Transactional application of one corrected answer to the learning state (SPEC-411).

Port of `packages/services/src/learning/{apply-result,apply-review}.ts`. The service stays an
orchestrator: every pedagogical decision (FSRS grade, mastery, gap nature, clearance) is delegated
to `learny.learning.domain.*`; this module reads the locked rows, feeds the engine and persists its
outputs inside the caller's transaction. The journal tables are written through the security-definer
functions, so a learner never gains a direct write policy (ADR-0112 section 4).
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.learning.domain import fsrs, gaps, mastery
from learny.learning.domain.params import ENGINE
from learny.learning.domain.time import format_instant, parse_instant
from learny.learning.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round

ATTEMPT_KIND_BY_ACTIVITY: dict[str, str] = {
    "validation_quiz": "validation_quiz",
    "global_quiz_session": "global_quiz_session",
    "remediation": "remediation",
    "exercise": "exercise",
    "mock_exam": "mock_exam",
    "warmup": "warmup",
    "micro_session": "micro_session",
    "sprint": "sprint",
    "self_test": "self_test",
}

SOURCE_BY_ATTEMPT_KIND: dict[str, str] = {
    "validation_quiz": "validation",
    "global_quiz_session": "global_quiz",
    "remediation": "validation",
    "exercise": "exercise",
    "mock_exam": "exam",
    "warmup": "warmup",
    "micro_session": "micro_session",
    "sprint": "sprint",
    "self_test": "self_test",
}

REVIEWABLE_FORMATS = frozenset(
    {
        "choice_question",
        "open_question",
        "cloze",
        "matching",
        "ordering",
        "categorization",
        "recall_card",
        "instruction",
    }
)

FSRS_STATE_NAMES = ("new", "learning", "review", "relearning")
FSRS_RATINGS = frozenset({"again", "hard", "good", "easy"})


def format_of(brick_type: str) -> str | None:
    """The engine format of a brick type, `None` when the type does not feed the engine."""
    return brick_type if brick_type in REVIEWABLE_FORMATS else None


def score_value(score: Any, max_score: Any, correct: bool | None) -> float:
    """The success ratio of one answer, `1`/`0` when the scores are missing."""
    if score is not None and max_score is not None:
        maximum = float(max_score)
        value = float(score)
        if maximum > 0:
            return min(1.0, max(0.0, value / maximum))
    return 1.0 if correct is True else 0.0


def _string_field(value: Any, key: str) -> str | None:
    if not isinstance(value, Mapping):
        return None
    field = value.get(key)
    return field if isinstance(field, str) and field != "" else None


def _rating_field(value: Any) -> str | None:
    for key in ("rating", "selfRating", "self_rating"):
        candidate = _string_field(value, key)
        if candidate is not None and candidate in FSRS_RATINGS:
            return candidate
    return None


def off_topic_field(value: Any) -> bool:
    """`feedback.offTopic`, or the `off_topic` criterion marked false."""
    if not isinstance(value, Mapping):
        return False
    if value.get("offTopic") is True or value.get("off_topic") is True:
        return True
    criteria = value.get("criteria")
    if not isinstance(criteria, list):
        return False
    for entry in criteria:
        if not isinstance(entry, Mapping):
            continue
        key = entry.get("key") if isinstance(entry.get("key"), str) else ""
        if key in ("off_topic", "hors_sujet", "off-topic") and entry.get("ok") is False:
            return True
    return False


def normalized_response(value: Any) -> str | None:
    """The first readable text of a stored response."""
    if not isinstance(value, Mapping):
        return None
    for key in ("text", "answer", "value", "response"):
        candidate = _string_field(value, key)
        if candidate is not None:
            return candidate
    return None


def confused_with_field(value: Any) -> str | None:
    """`response.confusedWithNotionId` when it is a UUID."""
    if not isinstance(value, Mapping):
        return None
    for key in ("confusedWithNotionId", "confusedWith"):
        candidate = _string_field(value, key)
        if candidate is not None and _is_uuid(candidate):
            return candidate
    return None


def _is_uuid(value: str) -> bool:
    import uuid

    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def activity_kind(value: str) -> str | None:
    """The engine attempt kind of an activity kind."""
    return ATTEMPT_KIND_BY_ACTIVITY.get(value)


def diagnostic_positions_of(config: Any) -> set[int]:
    """SPEC-614 ET-5 - positions of the diagnostic questions of a mock exam."""
    if not isinstance(config, Mapping):
        return set()
    positions = config.get("diagnosticPositions")
    if not isinstance(positions, list):
        return set()
    return {position for position in positions if isinstance(position, int)}


def answer_record_of(
    row: Mapping[str, Any], diagnostic_answer_ids: frozenset[str] | set[str] = frozenset()
) -> dict[str, Any] | None:
    """One history row as the gap detector and the mastery read it (camelCase)."""
    kind = activity_kind(str(row["attempt_kind"]))
    brick_format = format_of(str(row["brick_type"]))
    if kind is None or brick_format is None:
        return None
    return {
        "answerId": str(row["answer_id"]),
        "attemptId": str(row["attempt_id"]),
        "attemptKind": kind,
        "attemptNo": int(row["attempt_no"]),
        "source": SOURCE_BY_ATTEMPT_KIND[kind],
        "notionIds": list(row["notion_ids"] or []),
        "format": brick_format,
        "correct": row["is_correct"],
        "score": None if row["score"] is None else float(row["score"]),
        "maxScore": None if row["max_score"] is None else float(row["max_score"]),
        "selfRating": _rating_field(row["response"]),
        "timeMs": float(row["time_ms"] or 0),
        "answeredAt": _iso(row["answered_at"]),
        "chosenDistractorNotionId": row["chosen_distractor_notion_id"],
        "confusedWithNotionId": confused_with_field(row["response"]),
        "normalizedResponse": normalized_response(row["response"]),
        "offTopic": off_topic_field(row["feedback"]),
        "countsForGaps": str(row["answer_id"]) not in diagnostic_answer_ids,
    }


def _iso(value: Any) -> str:
    """A database instant rendered as the UTC ISO string the engine expects."""
    import datetime as datetime_module

    if isinstance(value, str):
        return format_instant(parse_instant(value))
    if isinstance(value, datetime_module.datetime):
        return format_instant(parse_instant(value.isoformat()))
    raise TypeError(f"not an instant: {value!r}")


def to_persistence_card(card: Mapping[str, Any]) -> dict[str, Any]:
    """The engine card with the numeric `state` of `notion_states.fsrs`."""
    state = FSRS_STATE_NAMES.index(str(card["state"]))
    return {
        "due": card["due"],
        "stability": card["stability"],
        "difficulty": card["difficulty"],
        "elapsed_days": card["elapsed_days"],
        "scheduled_days": card["scheduled_days"],
        "reps": card["reps"],
        "lapses": card["lapses"],
        "state": state,
        "last_review": card["last_review"],
        "learning_steps": card.get("learning_steps", 0),
    }


def from_persistence_card(card: Mapping[str, Any]) -> dict[str, Any]:
    """The stored JSON card back to the engine shape (string `state`)."""
    return {
        "due": card["due"],
        "stability": card["stability"],
        "difficulty": card["difficulty"],
        "elapsed_days": card["elapsed_days"],
        "scheduled_days": card["scheduled_days"],
        "learning_steps": card.get("learning_steps", 0),
        "reps": card["reps"],
        "lapses": card["lapses"],
        "state": FSRS_STATE_NAMES[int(card["state"])],
        "last_review": card["last_review"],
    }


def to_gap_state(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """The `notion_states.gap_*` columns as the engine `GapState`, `None` when inactive."""
    nature = row["gap_nature"]
    detected_at = row["gap_detected_at"]
    if nature is None or detected_at is None:
        return None
    return {
        "nature": _gap_nature(nature),
        "confusedWith": row["gap_confused_with"],
        "detectedAt": _iso(detected_at),
        "evidence": row["gap_evidence"] or "",
        "clearedAt": None if row["gap_cleared_at"] is None else _iso(row["gap_cleared_at"]),
    }


def _gap_nature(value: Any) -> str | None:
    return value if value in ("forgetting", "confusion", "misunderstanding", "application") else None


def previous_state_of(row: Mapping[str, Any] | None) -> dict[str, Any]:
    """The stored state the transaction starts from; an absent row is a brand-new notion."""
    if row is None:
        return {
            "fsrs": None,
            "mastery": 0.0,
            "firstSeenAt": None,
            "lastSeenAt": None,
            "successCount": 0,
            "gap": None,
            "inReview": False,
        }
    return {
        "fsrs": from_persistence_card(row["fsrs"]),
        "mastery": float(row["mastery"]),
        "firstSeenAt": None if row["first_seen_at"] is None else _iso(row["first_seen_at"]),
        "lastSeenAt": None if row["last_seen_at"] is None else _iso(row["last_seen_at"]),
        "successCount": int(row["success_count"]),
        "gap": to_gap_state(row),
        "inReview": bool(row["in_review"]),
    }


def engine_params() -> dict[str, Any]:
    """`ENGINE.fsrs`, `ENGINE.gaps` and the mastery bounds, as `planNotionReviews` takes them."""
    fsrs_settings = dict(ENGINE["fsrs"])
    gap_bounds = dict(ENGINE["gaps"])
    gap_bounds["masteryThreshold"] = ENGINE["mastery"]["threshold"]
    return {
        "fsrs": fsrs_settings,
        "gaps": gap_bounds,
        "masteryThreshold": ENGINE["mastery"]["threshold"],
        "masteryHalfLifeDays": ENGINE["mastery"]["halfLifeDays"],
    }


def _round_mastery(value: float) -> float:
    return js_round(value * 100) / 100


def _before_current(candidate_id: str, candidate_at: str, current_id: str, current_at: str) -> bool:
    if candidate_at != current_at:
        return candidate_at < current_at
    return candidate_id <= current_id


def _attempts_up_to(answers: Sequence[Mapping[str, Any]], current: Mapping[str, Any]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for answer in answers:
        if not _before_current(
            str(answer["answerId"]),
            str(answer["answeredAt"]),
            str(current["answerId"]),
            str(current["answeredAt"]),
        ):
            continue
        attempt_id = str(answer["attemptId"])
        existing = grouped.get(attempt_id)
        if existing is None:
            grouped[attempt_id] = {
                "attemptId": attempt_id,
                "attemptKind": answer["attemptKind"],
                "answers": [dict(answer)],
            }
        else:
            existing["answers"].append(dict(answer))
    return list(grouped.values())


def _up_to(answers: Sequence[Mapping[str, Any]], current: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        dict(answer)
        for answer in answers
        if _before_current(
            str(answer["answerId"]),
            str(answer["answeredAt"]),
            str(current["answerId"]),
            str(current["answeredAt"]),
        )
    ]


def _timed_up_to(timed: Sequence[Any], current: Mapping[str, Any]) -> list[Any]:
    kept = []
    for entry in timed:
        answer_id = getattr(entry, "answer_id", None) or ""
        if _before_current(
            str(answer_id),
            str(entry.answered_at),
            str(current["answerId"]),
            str(current["answeredAt"]),
        ):
            kept.append(entry)
    return kept


def _gap_evidence(
    event: str,
    detection: Mapping[str, Any] | None,
    clearance: Mapping[str, Any] | None,
) -> dict[str, Any]:
    if event == "cleared":
        return {
            "summary": "" if clearance is None else clearance.get("evidence", ""),
            "successCount": 0 if clearance is None else clearance.get("successCount", 0),
            "intervalHours": None if clearance is None else clearance.get("intervalHours"),
        }
    return {
        "summary": "" if detection is None else detection.get("evidence", ""),
        "triggers": [] if detection is None else list(detection.get("triggers", [])),
        "repeatedErrors": [] if detection is None else list(detection.get("repeatedErrors", [])),
    }


def plan_notion_reviews(
    *,
    notion_id: str,
    state: Mapping[str, Any],
    answers: Sequence[Mapping[str, Any]],
    history: Mapping[str, Sequence[Any]],
    params: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Pure sequence of the answers of one notion: FSRS, mastery and gap lifecycle in order."""
    bounds = engine_params() if params is None else params
    fsrs_settings = bounds["fsrs"]
    gap_bounds = bounds["gaps"]
    grade_settings = fsrs.GradeSettings(
        median_window=int(fsrs_settings["medianWindow"]),
        median_min_samples=int(fsrs_settings["medianMinSamples"]),
        default_median_ms=int(fsrs_settings["defaultMedianMs"]),
        hard_factor=float(fsrs_settings["hardFactor"]),
        easy_factor=float(fsrs_settings["easyFactor"]),
    )
    retention = float(fsrs_settings["requestRetention"])
    steps: list[dict[str, Any]] = []
    current_state = dict(state)
    for answer in answers:
        timed = _timed_up_to(history["timed"], answer)
        decision = fsrs.grade_review(
            correct=answer["correct"],
            time_ms=answer["timeMs"],
            format_name=str(answer["format"]),
            settings=grade_settings,
            history=timed,
            self_rating=answer["selfRating"],
        )
        if decision.rating is None:
            continue

        card_before = current_state["fsrs"] or fsrs.create_notion_card(str(answer["answeredAt"]), retention)
        card_after, due_at = fsrs.apply_review(
            card_before, decision.rating, str(answer["answeredAt"]), retention
        )
        mastery_result = mastery.calculate_mastery(
            _mastery_answers(history["mastery"], answer),
            str(answer["answeredAt"]),
            bounds["masteryThreshold"],
            bounds["masteryHalfLifeDays"],
        )
        mastery_after = _round_mastery(mastery_result.mastery)
        success_count_after = current_state["successCount"] + (1 if answer["correct"] else 0)
        gap_before = current_state["gap"]
        gap_after = current_state["gap"]
        gap_event: dict[str, Any] | None = None

        active_gap = (
            current_state["gap"]
            if current_state["gap"] is not None and current_state["gap"]["clearedAt"] is None
            else None
        )
        if active_gap is not None:
            clearance = gaps.clear_gap(
                active_gap,
                _up_to(history["gapAnswers"], answer),
                mastery_after,
                str(answer["answeredAt"]),
                notion_id,
                gap_bounds,
            )
            if clearance["cleared"] and clearance["gap"] is not None:
                gap_after = clearance["gap"]
                gap_event = {
                    "kind": "cleared",
                    "nature": active_gap["nature"],
                    "previousNature": None,
                    "evidence": _gap_evidence("cleared", None, clearance),
                }
            else:
                detection = gaps.detect_gap(
                    notion_id,
                    _attempts_up_to(history["gapAnswers"], answer),
                    mastery_after,
                    str(answer["answeredAt"]),
                    active_gap,
                    _fsrs_lapsed(current_state["fsrs"], decision.rating),
                    gap_bounds,
                )
                gap_after = detection["gap"] or active_gap
                if detection["event"] is not None and detection["gap"] is not None:
                    gap_event = {
                        "kind": detection["event"],
                        "nature": detection["nature"],
                        "previousNature": (
                            active_gap["nature"] if detection["event"] == "nature_changed" else None
                        ),
                        "evidence": _gap_evidence(detection["event"], detection, None),
                    }
        else:
            detection = gaps.detect_gap(
                notion_id,
                _attempts_up_to(history["gapAnswers"], answer),
                mastery_after,
                str(answer["answeredAt"]),
                current_state["gap"],
                _fsrs_lapsed(current_state["fsrs"], decision.rating),
                gap_bounds,
            )
            gap_after = detection["gap"] or current_state["gap"]
            if detection["event"] is not None and detection["gap"] is not None:
                gap_event = {
                    "kind": detection["event"],
                    "nature": detection["nature"],
                    "previousNature": None,
                    "evidence": _gap_evidence(detection["event"], detection, None),
                }

        first_seen_at = current_state["firstSeenAt"] or str(answer["answeredAt"])
        steps.append(
            {
                "answerId": answer["answerId"],
                "notionId": notion_id,
                "format": answer["format"],
                "source": answer["source"],
                "rating": decision.rating,
                "correct": answer["correct"],
                "timeMs": answer["timeMs"],
                "reviewedAt": answer["answeredAt"],
                "cardBefore": card_before,
                "cardAfter": card_after,
                "dueAt": due_at,
                "masteryBefore": current_state["mastery"],
                "masteryAfter": mastery_after,
                "successCountBefore": current_state["successCount"],
                "successCountAfter": success_count_after,
                "firstSeenAt": first_seen_at,
                "lastSeenAt": answer["answeredAt"],
                "gapBefore": gap_before,
                "gapAfter": gap_after,
                "gapEvent": gap_event,
            }
        )
        current_state = {
            "fsrs": card_after,
            "mastery": mastery_after,
            "firstSeenAt": first_seen_at,
            "lastSeenAt": answer["answeredAt"],
            "successCount": success_count_after,
            "gap": gap_after,
            "inReview": True,
        }
    return steps


def _mastery_answers(
    answers: Sequence[Mapping[str, Any]], current: Mapping[str, Any]
) -> list[dict[str, Any]]:
    return [
        {
            "answerId": answer["answerId"],
            "attemptId": answer["attemptId"],
            "score": answer["score"],
            "answeredAt": answer["answeredAt"],
        }
        for answer in _up_to(answers, current)
    ]


def _fsrs_lapsed(card: Mapping[str, Any] | None, rating: str) -> bool:
    return card is not None and card["state"] != "new" and rating == "again"


async def persist_step(tx: Any, user_id: str, step: Mapping[str, Any]) -> bool:
    """Writes one planned step: the state row first, then the journal rows. `False` on a replay."""
    import json

    gap = step["gapAfter"]
    await queries.upsert_notion_state(
        tx,
        user_id=user_id,
        notion_id=str(step["notionId"]),
        fsrs=json.dumps(to_persistence_card(step["cardAfter"])),
        due_at=str(step["dueAt"]),
        mastery=str(step["masteryAfter"]),
        first_seen_at=str(step["firstSeenAt"]),
        last_seen_at=str(step["lastSeenAt"]),
        success_count=int(step["successCountAfter"]),
        gap=gap,
    )
    written = await queries.append_review_log(
        tx,
        user_id=user_id,
        notion_id=str(step["notionId"]),
        answer_id=str(step["answerId"]),
        source=str(step["source"]),
        rating=str(step["rating"]),
        correct=bool(step["correct"]),
        time_ms=float(step["timeMs"]),
        reviewed_at=str(step["reviewedAt"]),
        card_before=json.dumps(to_persistence_card(step["cardBefore"])),
        card_after=json.dumps(to_persistence_card(step["cardAfter"])),
    )
    if not written:
        return False
    if step["gapEvent"] is not None:
        await queries.append_gap_event(
            tx,
            user_id=user_id,
            notion_id=str(step["notionId"]),
            kind=str(step["gapEvent"]["kind"]),
            nature=step["gapEvent"]["nature"],
            evidence=json.dumps(step["gapEvent"]["evidence"]),
            reviewed_at=str(step["reviewedAt"]),
        )
    return True


async def load_states(tx: Any, user_id: str, notion_ids: Sequence[str]) -> dict[str, Any]:
    """The locked states of the given notions, keyed by notion."""
    rows = await queries.read_notion_states_for_update(tx, user_id, list(notion_ids))
    return {str(row["notion_id"]): row for row in rows}


async def load_history(tx: Any, user_id: str, notion_id: str) -> list[Mapping[str, Any]]:
    """Every graded answer of one notion, oldest first."""
    return await queries.read_notion_history(tx, user_id, notion_id)


async def load_timed_history(tx: Any, user_id: str) -> list[Any]:
    """The personal median windows of every format, from the 500 most recent timed answers."""
    rows = await queries.read_timed_history(tx, user_id)
    timed: list[Any] = []
    for row in rows:
        brick_format = format_of(str(row["brick_type"]))
        if brick_format is None:
            continue
        timed.append(
            fsrs.TimedResponse(
                answered_at=_iso(row["answered_at"]),
                format=brick_format,
                time_ms=float(row["time_ms"]),
                answer_id=str(row["answer_id"]),
            )
        )
    return timed


async def load_timezone(tx: Any, user_id: str) -> str:
    """The learner's zone, `Europe/Paris` by default."""
    return await queries.read_warmup_timezone(tx, user_id)


async def apply_review_result(
    tx: Any,
    *,
    user_id: str,
    notion_id: str,
    source: str,
    format_name: str,
    correct: bool | None,
    rating: str | None,
    time_ms: float,
    answer_id: str,
    attempt_id: str,
    attempt_no: int,
    reviewed_at: str,
    confused_with_notion_id: str | None = None,
    skip_fsrs_if_newer: bool = False,
) -> dict[str, Any] | None:
    """Applies one answer of one notion: FSRS grade, mastery, gaps and the review log."""
    brick_format = format_of(format_name)
    if brick_format is None:
        return None
    if skip_fsrs_if_newer:
        newer = await queries.read_newer_review_log(tx, user_id, notion_id, reviewed_at)
        if newer:
            return None
    states = await load_states(tx, user_id, [notion_id])
    state = states.get(notion_id)
    if state is None:
        return None
    rows = await load_history(tx, user_id, notion_id)
    gap_answers: list[dict[str, Any]] = []
    for row in rows:
        record = answer_record_of(row)
        if record is not None:
            gap_answers.append(record)
    mastery_history = [
        {
            "answerId": str(row["answer_id"]),
            "attemptId": str(row["attempt_id"]),
            "score": score_value(row["score"], row["max_score"], row["is_correct"]),
            "answeredAt": _iso(row["answered_at"]),
        }
        for row in rows
    ]
    timed = await load_timed_history(tx, user_id)
    effective_correct = False if correct is None else correct
    plan = plan_notion_reviews(
        notion_id=notion_id,
        state=previous_state_of(state),
        answers=[
            {
                "answerId": answer_id,
                "attemptId": attempt_id,
                "attemptKind": "global_quiz_session",
                "attemptNo": attempt_no,
                "source": source,
                "notionId": notion_id,
                "format": brick_format,
                "correct": effective_correct,
                "selfRating": rating,
                "timeMs": time_ms,
                "answeredAt": reviewed_at,
                "chosenDistractorNotionId": None,
                "confusedWithNotionId": confused_with_notion_id,
                "normalizedResponse": None,
                "offTopic": False,
                "countsForGaps": True,
            }
        ],
        history={"mastery": mastery_history, "gapAnswers": gap_answers, "timed": timed},
    )
    applied: dict[str, Any] | None = None
    for step in plan:
        await persist_step(tx, user_id, step)
        applied = {
            "rating": step["rating"],
            "dueAt": step["dueAt"],
            "cardAfter": step["cardAfter"],
        }
    return applied


def apply_error(code: str, detail: str) -> AppError:
    """A learning application error carrying an already user-facing French detail."""
    return AppError(code, detail)
