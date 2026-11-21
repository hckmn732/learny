"""Daily warm-up read model (SPEC-714 EF-7, ET-2, BR-WAR-01, BR-WAR-02).

Port of `packages/services/src/warmup/{derive,get-today}.ts`: the card is built from the exact brick
versions the activity stores, the next session comes from the day's schedule, and every read runs
in the learner's RLS transaction, so a foreign activity never appears (CA-7).
"""

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from learny.identity.domain.actor import Actor
from learny.learning.application.ports import LearningDeps
from learny.learning.domain.time import add_days, local_date_of
from learny.learning.infrastructure import queries
from learny.shared import time as shared_time
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
