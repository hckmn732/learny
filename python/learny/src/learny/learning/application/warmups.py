"""Daily warm-up read model (SPEC-714 EF-7, ET-2, BR-WAR-01, BR-WAR-02).

The card is built from the exact brick versions the activity stores, the next session comes from the
day's schedule, and every read runs in the learner's RLS transaction, so a foreign activity never
appears (CA-7).
"""

import json
import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from learny.identity.domain.actor import Actor
from learny.learning.application.apply_result import apply_review_result
from learny.learning.application.ports import LearningDeps
from learny.learning.domain.time import add_days, local_date_of
from learny.learning.infrastructure import queries
from learny.shared import time as shared_time
from learny.shared.errors import AppError
from learny.shared.locale_fr import review as texts_warmup
from learny.shared.time import to_iso

SESSION_KINDS = ("course", "exercise", "validation_quiz", "contributions", "mock_exam")
WARMUP_SCOPES = ("yesterday_prerequisites", "yesterday")


def _epoch(value: Any) -> int:
    if isinstance(value, str):
        return shared_time.to_epoch_ms(shared_time.parse_iso(value))
    if isinstance(value, datetime):
        return shared_time.to_epoch_ms(value)
    raise TypeError(f"not an instant: {value!r}")


def _iso(value: Any) -> str:
    return to_iso(shared_time.from_epoch_ms(_epoch(value)))


def parse_warmup_config(raw: Any) -> dict[str, Any]:
    """`parseWarmupConfig`: the stored config object, an empty mapping when it cannot be read."""
    return dict(raw) if isinstance(raw, Mapping) else {}


def warmup_scope_of(config: Mapping[str, Any]) -> str:
    """Canonical scope of the stored config (the legacy value is accepted, ADR-0327)."""
    return "yesterday" if config.get("scope") == "yesterday" else "yesterday_prerequisites"


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def question_of_brick(brick_type: str, payload: Any) -> dict[str, str] | None:
    """One question/answer pair read from the exact brick version shown by the activity."""
    if not isinstance(payload, Mapping):
        return None
    raw = payload
    if brick_type == "recall_card":
        question = _text(raw.get("front")) or _text(raw.get("prompt")) or _text(raw.get("question"))
        answer = _text(raw.get("back")) or _text(raw.get("answer"))
        return None if question == "" or answer == "" else {"question": question, "answer": answer}
    if brick_type == "choice_question":
        question = _text(raw.get("stem")) or _text(raw.get("question"))
        options = raw.get("options") if isinstance(raw.get("options"), list) else None
        answer = ""
        if options is not None:
            correct = [
                option for option in options if isinstance(option, Mapping) and option.get("correct") is True
            ]
            answer = ", ".join(
                value for value in (_text(option.get("text")) for option in correct) if value != ""
            )
            explanation = _text(raw.get("explanation"))
            if answer != "" and explanation != "":
                answer = f"{answer}. {explanation}"
        else:
            raw_choices = raw.get("choices")
            choices = raw_choices if isinstance(raw_choices, list) else []
            label = _text(raw.get("answer"))
            found = next((choice for choice in choices if _text(choice) == label), None)
            answer = _text(found) or label
        return None if question == "" or answer == "" else {"question": question, "answer": answer}
    question = (
        _text(raw.get("stem"))
        or _text(raw.get("question"))
        or _text(raw.get("prompt"))
        or _text(raw.get("front"))
    )
    answer = _text(raw.get("answer")) or _text(raw.get("back"))
    return None if question == "" or answer == "" else {"question": question, "answer": answer}


def next_session_href(*, kind: str, formation_id: str, module_id: str | None, activity_id: str | None) -> str:
    """EF-7 \u2014 destination of the main button, from the identifiers of the upcoming session."""
    formation = f"/formations/{formation_id}"
    module = None if module_id is None else f"{formation}/modules/{module_id}"
    if kind == "validation_quiz":
        return f"{formation}/quiz-global" if module is None else f"{module}/quiz"
    if kind == "course":
        return f"{formation}/programme" if module is None else f"{module}/cours"
    if kind == "exercise":
        if module is None:
            return f"{formation}/programme"
        return f"{module}/exercices" if activity_id is None else f"{module}/exercices/{activity_id}"
    if kind == "mock_exam":
        return f"{formation}/examen-blanc"
    if kind == "contributions":
        return module if module is not None else f"{formation}/programme"
    return f"{formation}/programme"


def warmup_status(*, item_count: int, answer_count: int, attempt_status: str | None, submitted: bool) -> str:
    """EF-7 \u2014 status of the card from the recorded first-pass answers."""
    if submitted:
        return "done"
    if item_count > 0 and answer_count >= item_count:
        return "done"
    if answer_count > 0:
        return "in_progress"
    return "todo"


def offset_iso(instant: Any, time_zone: str) -> str:
    """`2026-11-11T14:00:00+01:00` \u2014 the instant keeps the learner's offset for display."""
    milliseconds = _epoch(instant)
    wall = shared_time.from_epoch_ms(shared_time.wall_ms_of(milliseconds, time_zone))
    offset_minutes = shared_time.offset_ms_at(time_zone, milliseconds) // 60_000
    sign = "+" if offset_minutes >= 0 else "-"
    absolute = abs(offset_minutes)
    return (
        f"{wall.year:04d}-{wall.month:02d}-{wall.day:02d}"
        f"T{wall.hour:02d}:{wall.minute:02d}:{wall.second:02d}"
        f"{sign}{absolute // 60:02d}:{absolute % 60:02d}"
    )


def day_bounds(day: str, time_zone: str) -> tuple[str, str]:
    """`userDayBounds`: start included, start of the next local day excluded."""
    start = shared_time.start_of_user_day(day, time_zone)
    end = shared_time.start_of_user_day(add_days(day, 1), time_zone)
    return (
        to_iso(shared_time.from_epoch_ms(start)),
        to_iso(shared_time.from_epoch_ms(end)),
    )


def _session_kind(value: Any) -> str:
    return str(value) if value in SESSION_KINDS else "course"


def pick_next_session(
    sessions: Sequence[Mapping[str, Any]],
    now: datetime,
    slot_starts_at: Any,
    config: Mapping[str, Any],
    time_zone: str,
    formation_id: str,
) -> dict[str, Any]:
    """EF-2 \u2014 the upcoming session, then the session the warm-up slot precedes, then any."""
    now_iso = to_iso(now)
    upcoming = next((row for row in sessions if _iso(row["starts_at"]) > now_iso), None)
    after_slot = (
        None
        if slot_starts_at is None
        else next((row for row in sessions if _iso(row["starts_at"]) >= _iso(slot_starts_at)), None)
    )
    chosen = upcoming if upcoming is not None else after_slot
    if chosen is None and sessions:
        chosen = sessions[0]
    if chosen is not None:
        kind = _session_kind(chosen["kind"])
        return {
            "kind": kind,
            "startsAt": offset_iso(chosen["starts_at"], time_zone),
            "href": next_session_href(
                kind=kind,
                formation_id=formation_id,
                module_id=chosen["module_id"],
                activity_id=chosen["activity_id"],
            ),
        }
    snapshot = config.get("nextSession")
    snapshot = snapshot if isinstance(snapshot, Mapping) else {}
    kind = _session_kind(snapshot.get("kind"))
    starts_at = (
        offset_iso(now, time_zone)
        if snapshot.get("startsAt") is None
        else offset_iso(str(snapshot["startsAt"]), time_zone)
    )
    return {"kind": kind, "startsAt": starts_at, "href": "/agenda"}


def tag_of(
    config: Mapping[str, Any],
    position: int,
    notion_id: str,
    notion_module: int,
    activity_module: int | None,
) -> dict[str, Any]:
    """EF-7 \u2014 the tag stored in the config, else derived from the module positions."""
    meta_items = config.get("items")
    meta = None
    if isinstance(meta_items, list):
        meta = next(
            (
                item
                for item in meta_items
                if isinstance(item, Mapping)
                and (item.get("position") == position or item.get("notionId") == notion_id)
            ),
            None,
        )
    fallback = (
        "prerequisite" if activity_module is not None and notion_module < activity_module else "yesterday"
    )
    tag = (
        meta.get("tag")
        if isinstance(meta, Mapping) and meta.get("tag") in ("yesterday", "prerequisite")
        else fallback
    )
    module_number = None
    if tag == "prerequisite":
        module_number = (
            int(meta["moduleNumber"])
            if isinstance(meta, Mapping) and meta.get("moduleNumber") is not None
            else notion_module
        )
    return {"tag": tag, "moduleNumber": module_number}


async def load_warmup_dto(
    tx: Any,
    activity: Mapping[str, Any],
    formation_id: str,
    time_zone: str,
    now: datetime,
    sessions: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """EF-7 \u2014 the DTO of one activity, built from the exact brick versions it stores."""
    config = parse_warmup_config(activity["config"])
    items = activity["items"] if isinstance(activity["items"], list) else []
    version_ids = [
        str(item["brickVersionId"])
        for item in items
        if isinstance(item, Mapping) and item.get("brickVersionId") not in (None, "")
    ]
    versions = await queries.read_warmup_versions(tx, version_ids)
    version_by_id = {str(row["version_id"]): row for row in versions}
    notion_ids = sorted({str(notion) for row in versions for notion in (row["notion_ids"] or [])})
    notions = await queries.read_warmup_notions(tx, notion_ids)
    notion_by_id = {str(row["id"]): row for row in notions}
    answers = (
        []
        if activity["attempt_id"] is None
        else await queries.read_warmup_answers(tx, str(activity["attempt_id"]))
    )
    dto_answers = [
        {
            "position": int(row["position"]) - 1,
            "knew": (isinstance(row["response"], Mapping) and row["response"].get("knew") is True)
            or row["is_correct"] is True,
        }
        for row in answers
    ]
    dto_items = []
    activity_module = None if activity["module_position"] is None else int(activity["module_position"])
    for position, item in enumerate(items):
        if not isinstance(item, Mapping):
            continue
        version = version_by_id.get(str(item.get("brickVersionId")))
        if version is None:
            continue
        question = question_of_brick(str(version["type"]), version["payload"])
        if question is None:
            continue
        first_notion = str((version["notion_ids"] or [""])[0])
        notion = notion_by_id.get(first_notion)
        if notion is None:
            continue
        tag = tag_of(config, position, first_notion, int(notion["module_position"]), activity_module)
        dto_items.append(
            {
                "position": position,
                "notionId": first_notion,
                "notionLabel": notion["label"],
                "tag": tag["tag"],
                "moduleNumber": tag["moduleNumber"],
                "question": question["question"],
                "answer": question["answer"],
            }
        )
    submitted = activity["attempt_submitted_at"] is not None or activity["attempt_status"] in (
        "submitted",
        "graded",
    )
    return {
        "activityId": activity["id"],
        "formationId": formation_id,
        "nextSession": pick_next_session(
            sessions, now, activity["slot_starts_at"], config, time_zone, formation_id
        ),
        "scope": warmup_scope_of(config),
        "items": dto_items,
        "answers": dto_answers,
        "status": warmup_status(
            item_count=len(dto_items),
            answer_count=len(dto_answers),
            attempt_status=None if activity["attempt_status"] is None else str(activity["attempt_status"]),
            submitted=submitted,
        ),
        "reviewRemaining": activity["review_remaining"] is True,
    }


async def get_today_warmups(deps: LearningDeps, actor: Actor) -> dict[str, Any]:
    """EF-7, ET-2 \u2014 the warm-ups of the day, one per formation, sorted by session hour."""
    now = deps.clock.now()
    now_iso = to_iso(now)
    async with deps.db.user_tx(actor) as tx:
        timezone = await queries.read_warmup_timezone(tx, actor.user_id)
        today = local_date_of(now_iso, timezone)
        activities = await queries.read_warmups_today(tx, actor.user_id, today)
        sessions_by_formation: dict[str, list[Mapping[str, Any]]] = {}
        items = []
        for activity in activities:
            formation_id = str(activity["formation_id"])
            sessions = sessions_by_formation.get(formation_id)
            if sessions is None:
                start, end = day_bounds(today, timezone)
                sessions = await queries.read_warmup_day_sessions(tx, actor.user_id, formation_id, start, end)
                sessions_by_formation[formation_id] = sessions
            dto = await load_warmup_dto(tx, activity, formation_id, timezone, now, sessions)
            if dto["items"]:
                items.append(dto)
    items.sort(key=lambda item: _epoch(item["nextSession"]["startsAt"]))
    return {"items": items}


__all__ = [
    "day_bounds",
    "get_today_warmups",
    "load_warmup_dto",
    "next_session_href",
    "offset_iso",
    "parse_warmup_config",
    "pick_next_session",
    "question_of_brick",
    "tag_of",
    "warmup_scope_of",
    "warmup_status",
]


# --- EF-8, EF-9, EF-11, ET-4 - answer side of the daily warm-up --------------------------------


def next_local_day(day: str) -> str:
    """EF-8 - the local civil day after the given one."""
    return add_days(day, 1)


def warmup_minutes(started_at: Any, now: Any) -> int:
    """Duration of an answered first pass, in minutes, at least one."""
    elapsed = _epoch(now) - _epoch(started_at)
    return max(1, -(-elapsed // 60_000))


def warmup_consumed_summary(
    *, knew_count: int, count: int, review_labels: Sequence[str], next_quiz: bool
) -> str:
    """EF-10 - one-line explanation of the consumed action."""
    text = texts_warmup.WARMUP_SCORE.format(knew=knew_count, count=count)
    if review_labels:
        if len(review_labels) > 1:
            verb = texts_warmup.WARMUP_CONSUMED_REVIEW_MANY.format(count=len(review_labels))
        else:
            verb = texts_warmup.WARMUP_CONSUMED_REVIEW_ONE
        moment = (
            texts_warmup.WARMUP_CONSUMED_NEXT_QUIZ if next_quiz else texts_warmup.WARMUP_CONSUMED_EVENING_QUIZ
        )
        text = f"{text} ; {verb} {moment}"
    return f"{text}."


def item_refs(raw: Any) -> list[dict[str, str]]:
    """The `{brickId, brickVersionId}` references stored in an activity."""
    refs: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return refs
    for item in raw:
        if not isinstance(item, Mapping):
            continue
        raw_brick_id = item.get("brickId")
        raw_version_id = item.get("brickVersionId")
        brick_id: str = raw_brick_id if isinstance(raw_brick_id, str) else ""
        version_id: str = raw_version_id if isinstance(raw_version_id, str) else ""
        if brick_id == "" or version_id == "":
            continue
        refs.append({"brickId": brick_id, "brickVersionId": version_id})
    return refs


async def _reschedule_notion(
    tx: Any, user_id: str, notion_id: str, today: str, time_zone: str, due_today: bool
) -> None:
    """EF-8 - due today when the session is not played, tomorrow once it is (CL-8)."""
    day = today if due_today else next_local_day(today)
    due_at = to_iso(shared_time.from_epoch_ms(shared_time.start_of_user_day(day, time_zone)))
    await queries.reschedule_notion(tx, user_id=user_id, notion_id=notion_id, due_at=due_at)


async def _add_to_evening_quiz(
    tx: Any, user_id: str, formation_id: str, notion_id: str, today: str, time_zone: str
) -> bool:
    """EF-8 - adds the notion at the head of the day's quiz; `True` when it is due tomorrow."""
    session = await queries.read_evening_quiz(tx, user_id, formation_id, today)
    if session is None:
        await _reschedule_notion(tx, user_id, notion_id, today, time_zone, True)
        return False
    if int(session["answer_count"] or 0) > 0:
        await _reschedule_notion(tx, user_id, notion_id, today, time_zone, False)
        return True
    brick = await queries.read_quiz_brick_of_notion(tx, user_id, formation_id, notion_id)
    config = parse_warmup_config(session["config"])
    raw_items = config.get("items")
    items_meta: list[Any] = raw_items if isinstance(raw_items, list) else []
    if brick is None or not isinstance(session["config"], Mapping):
        await _reschedule_notion(tx, user_id, notion_id, today, time_zone, True)
        return False
    refs = item_refs(session["items"])
    due_count = config.get("dueCount")
    estimated_sec = config.get("estimatedSec")
    shifted = [
        {**dict(item), "position": int(item.get("position") or 0) + 1}
        for item in items_meta
        if isinstance(item, Mapping)
    ]
    next_config = {
        **dict(session["config"]),
        "dueCount": (due_count if isinstance(due_count, int) else len(items_meta)) + 1,
        "estimatedSec": (estimated_sec if isinstance(estimated_sec, int) else 0) + 45,
        "items": [
            {
                "position": 0,
                "format": brick["type"],
                "reasonKey": None,
                "displayLabel": texts_warmup.NOTE_WARMUP_ITEM,
                "moduleIds": [brick["module_id"]],
                "notionIds": [notion_id],
            },
            *shifted,
        ],
    }
    next_items: list[dict[str, Any]] = [
        {"brickId": str(brick["brick_id"]), "brickVersionId": str(brick["version_id"])},
        *refs,
    ]
    await queries.update_evening_quiz(
        tx,
        activity_id=str(session["id"]),
        config=json.dumps(next_config),
        items=json.dumps(next_items),
    )
    await _reschedule_notion(tx, user_id, notion_id, today, time_zone, True)
    return False


async def _complete_first_pass(
    tx: Any,
    user_id: str,
    activity: Mapping[str, Any],
    attempt_id: str,
    started_at: Any,
    now: datetime,
    time_zone: str,
    knew_count: int,
    total: int,
    review_notion_ids: Sequence[str],
    next_quiz: bool,
) -> None:
    """ET-4 - grades the first pass, closes its slot and consumes the automation action."""
    minutes = warmup_minutes(started_at, now)
    duration_ms = max(0, _epoch(now) - _epoch(started_at))
    score = None if total == 0 else round((knew_count / total) * 100)
    await queries.mark_attempt_graded(
        tx,
        attempt_id=attempt_id,
        submitted_at=to_iso(now),
        duration_ms=duration_ms,
        score=score,
    )
    config = parse_warmup_config(activity["config"])
    slot_id = config.get("slotId")
    if isinstance(slot_id, str) and slot_id != "":
        await queries.complete_warmup_slot(tx, user_id=user_id, slot_id=slot_id, now=to_iso(now))
    await queries.upsert_daily_activity(
        tx,
        user_id=user_id,
        day=local_date_of(to_iso(now), time_zone),
        minutes=minutes,
        qualifying=False,
        sources=[f"warmup:{activity['id']}"],
    )
    action = await queries.read_warmup_action(tx, user_id, str(activity["id"]))
    if action is None:
        return
    labels: list[str] = []
    for notion_id in review_notion_ids:
        label = await queries.read_notion_label(tx, notion_id)
        if label is not None:
            labels.append(label)
    payload = dict(action["payload"] if isinstance(action["payload"], Mapping) else {})
    payload.update(
        {
            "knewCount": knew_count,
            "reviewNotionIds": list(review_notion_ids),
            "reviewNotionLabels": labels,
            "reviewRemaining": next_quiz,
        }
    )
    await queries.update_warmup_action_payload(
        tx,
        action_id=str(action["id"]),
        user_id=user_id,
        payload=json.dumps(payload),
        summary=warmup_consumed_summary(
            knew_count=knew_count, count=total, review_labels=labels, next_quiz=next_quiz
        ),
    )
    await queries.consume_automation_action(tx, user_id, str(action["id"]))


async def answer_warmup(
    deps: LearningDeps, actor: Actor, activity_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """ET-2, EF-8 - records one first-pass answer and returns the updated DTO."""
    from learny.learning.application.final_review import is_uuid

    if not is_uuid(activity_id):
        raise AppError("VALIDATION_FAILED", texts_warmup.WARMUP_ID_INVALID)
    position = body.get("position")
    if not isinstance(position, int) or isinstance(position, bool) or position < 0:
        raise AppError(
            "VALIDATION_FAILED",
            texts_warmup.WARMUP_POSITION_INVALID,
            errors=[{"path": "position", "message": texts_warmup.WARMUP_POSITION_HINT}],
        )
    knew = body.get("knew") is True
    user_id = actor.user_id
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        time_zone = await queries.read_warmup_timezone(tx, user_id)
        today = local_date_of(to_iso(now), time_zone)
        activity = await queries.lock_warmup_activity(tx, user_id, activity_id)
        if activity is None or activity["for_date"] != today:
            raise AppError("NOT_FOUND", texts_warmup.WARMUP_NOT_FOUND)
        if activity["status"] != "ready":
            raise AppError("CONFLICT", texts_warmup.WARMUP_UNAVAILABLE)
        refs = item_refs(activity["items"])
        if position >= len(refs):
            raise AppError(
                "VALIDATION_FAILED",
                texts_warmup.WARMUP_POSITION_OUT_OF_RANGE,
                errors=[{"path": "position", "message": texts_warmup.WARMUP_POSITION_RANGE_HINT}],
            )
        attempt = await queries.ensure_warmup_attempt(tx, user_id, str(activity["id"]), to_iso(now))
        if attempt is None:
            raise AppError("INTERNAL_ERROR", texts_warmup.WARMUP_ATTEMPT_MISSING)
        attempt_id = str(attempt["id"])
        existing = await queries.read_warmup_answer_positions(tx, attempt_id)
        if position + 1 in existing:
            raise AppError("CONFLICT", texts_warmup.WARMUP_ALREADY_ANSWERED)
        brick = await queries.read_warmup_item_brick(tx, refs[position]["brickVersionId"])
        if brick is None:
            raise AppError("NOT_FOUND", texts_warmup.WARMUP_QUESTION_NOT_FOUND)
        answer_id = str(uuid.uuid4())
        await queries.insert_warmup_answer(
            tx,
            answer_id=answer_id,
            attempt_id=attempt_id,
            version_id=refs[position]["brickVersionId"],
            position=position + 1,
            response=json.dumps({"knew": knew}),
            is_correct=knew,
            answered_at=to_iso(now),
        )
        notion_ids = [str(item) for item in brick["notion_ids"] or []]
        notion_id = notion_ids[0] if notion_ids else None
        if notion_id is not None:
            await apply_review_result(
                tx,
                user_id=user_id,
                notion_id=notion_id,
                source="warmup",
                format_name=str(brick["type"]),
                correct=knew,
                rating="good" if knew else "again",
                time_ms=0,
                answer_id=answer_id,
                attempt_id=attempt_id,
                attempt_no=1,
                reviewed_at=to_iso(now),
            )
            await tx.emit(
                "review/answered",
                {
                    "userId": user_id,
                    "notionId": notion_id,
                    "source": "warmup",
                    "correct": knew,
                    "reviewedAt": to_iso(now),
                },
                event_id=f"warmup:{activity['id']}:{position}",
            )
        previous = await queries.read_warmup_action(tx, user_id, str(activity["id"]))
        previous_payload = (
            previous["payload"] if previous is not None and isinstance(previous["payload"], Mapping) else {}
        )
        previous_review = previous_payload.get("reviewNotionIds")
        review_notion_ids: list[str] = [
            str(notion) for notion in (previous_review if isinstance(previous_review, list) else [])
        ]
        next_quiz = previous_payload.get("reviewRemaining") is True
        if not knew and notion_id is not None:
            if notion_id not in review_notion_ids:
                review_notion_ids.append(notion_id)
            addition = await _add_to_evening_quiz(
                tx, user_id, str(activity["formation_id"]), notion_id, today, time_zone
            )
            next_quiz = next_quiz or addition
        answered = len(existing) + 1
        if answered >= len(refs):
            previous_answers = await queries.read_warmup_answers(tx, attempt_id)
            total_knew = len([row for row in previous_answers if row["is_correct"] is True])
            await _complete_first_pass(
                tx,
                user_id,
                activity,
                attempt_id,
                attempt["started_at"],
                now,
                time_zone,
                total_knew,
                len(refs),
                review_notion_ids,
                next_quiz,
            )
        elif previous is not None and review_notion_ids:
            payload = dict(previous_payload)
            payload["reviewNotionIds"] = review_notion_ids
            await queries.update_warmup_action_payload(
                tx,
                action_id=str(previous["id"]),
                user_id=user_id,
                payload=json.dumps(payload),
                summary=str(previous_payload.get("summary") or ""),
            )
        refreshed = await queries.lock_warmup_activity(tx, user_id, str(activity["id"]))
        if refreshed is None:
            raise AppError("NOT_FOUND", texts_warmup.WARMUP_NOT_FOUND)
        start, end = day_bounds(today, time_zone)
        sessions = await queries.read_warmup_day_sessions(
            tx, user_id, str(activity["formation_id"]), start, end
        )
        return await load_warmup_dto(tx, refreshed, str(activity["formation_id"]), time_zone, now, sessions)


__all__ += [
    "answer_warmup",
    "item_refs",
    "next_local_day",
    "warmup_consumed_summary",
    "warmup_minutes",
]
