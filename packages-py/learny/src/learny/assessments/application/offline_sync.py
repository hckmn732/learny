"""Server side of the offline synchronisation (SPEC-801 ET-6 to ET-8, ADR-0200).

Port of `packages/services/src/offline/sync.ts`. Each entry is handled in its own transaction, in
`answeredAt` order: the server regrades the answer with `learny.assessments.domain.bricks` (the
client verdict is ignored), applies FSRS with the response instant, and records an
`offline_sync_receipts` row so a replay is a `duplicate` with no effect. The most recent revision
always wins: an answer older than an existing `review_logs` row is stored but never regresses the
current FSRS state (`skip_fsrs_if_newer`).
"""

import json
import uuid
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.application.apply_result import apply_review_result
from learny.learning.application.review import (
    GAME_FORMATS,
    complete_review_session,
    validate_game_response,
)
from learny.learning.application.review_games import (
    brick_format_response,
    correction_explanation,
    to_game_correction,
)
from learny.learning.domain.time import local_date_of
from learny.learning.infrastructure.queries import upsert_daily_activity
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.time import parse_iso, start_of_user_day, to_epoch_ms, to_iso

RETENTION_MS = 7 * 24 * 60 * 60 * 1000
"""ET-7 - older than seven days is `EXPIRED`."""

MAX_TIME_MS = 3_600_000
"""ET-7 - the client elapsed time is clamped to one hour."""

MAX_DUE_NOTIONS = 1
"""The first applied notion carries the `nextDueAt` of the result."""

FALLBACK_TIME_ZONE = "Europe/Paris"
"""`timeZoneOf`: the zone used when the profile row is unreadable."""

FSRS_RATINGS = ("again", "hard", "good", "easy")
"""The four FSRS ratings a recall card may carry."""


def order_entries(entries: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """ET-7 - entries are applied in `answeredAt` order."""
    ordered = sorted((dict(entry) for entry in entries), key=lambda entry: str(entry["answeredAt"]))
    return ordered


def clamp_answered_at(answered_at: str, now: Any) -> str:
    """ET-7 - an answer can never be in the future: the server clamps it to `now`."""
    try:
        instant = parse_iso(answered_at)
    except ValueError:
        return to_iso(now)
    epoch = to_epoch_ms(instant)
    return to_iso(now) if epoch > to_epoch_ms(now) else to_iso(instant)


def is_expired(answered_at: str, for_date: str, time_zone: str, now: Any) -> bool:
    """ET-7 - older than the local day of the activity or seven days is `EXPIRED`."""
    try:
        instant = to_epoch_ms(parse_iso(answered_at))
    except ValueError:
        return True
    day_start = start_of_user_day(for_date, time_zone)
    return instant < day_start or instant < to_epoch_ms(now) - RETENTION_MS


def _time_ms_of(entry: Mapping[str, Any]) -> int:
    """`Math.min(3_600_000, Math.max(0, Math.round(entry.timeMs ?? 0)))`."""
    raw = entry.get("timeMs")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return 0
    return min(MAX_TIME_MS, max(0, js_round(float(raw))))


def _items_of(row: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The activity items, ignoring anything that is not an object."""
    items = row["items"]
    if not isinstance(items, list):
        return []
    return [dict(item) for item in items if isinstance(item, Mapping)]


def _version_id_of(entry: Mapping[str, Any], items: Sequence[Mapping[str, Any]]) -> str:
    """`loadBrick`: the version recorded by the entry, else the one of its position."""
    configured = entry.get("brickVersionId")
    if isinstance(configured, str) and configured != "":
        return configured
    if entry.get("kind") != "answer":
        return str(items[0].get("brickVersionId") or "") if items else ""
    position = int(entry["position"])
    if position < len(items):
        return str(items[position].get("brickVersionId") or "")
    return ""


def graded_response(
    entry: Mapping[str, Any], brick: Mapping[str, Any], version_id: str
) -> dict[str, Any] | None:
    """`grade`: grades the offline answer with the same code as the online route (BR-MEM-05)."""
    type_name = str(brick["type"])
    is_game = type_name in GAME_FORMATS
    response: Any = entry.get("response")
    rating: str | None = None
    self_grade: str | None = None
    if type_name == "recall_card":
        candidate = entry.get("selfGrade")
        if candidate is None and isinstance(response, Mapping):
            candidate = response.get("selfRating", response.get("selfGrade"))
        if candidate not in FSRS_RATINGS:
            return None
        self_grade = str(candidate)
        rating = self_grade
        response = {"selfGrade": self_grade}
    elif is_game:
        issues = validate_game_response(type_name, response)
        if issues:
            return None
        response = brick_format_response(type_name, response)
    try:
        outcome = grade_brick(type_name, brick["payload"], response, version_id)
    except BrickGradeError:
        return None
    correction: Any = outcome["correction"]
    explanation: str | None = None
    if is_game:
        correction = to_game_correction(type_name, brick["payload"], outcome, version_id)
        explanation = correction_explanation(outcome)
    elif isinstance(correction, Mapping):
        candidate = correction.get("explanation")
        explanation = candidate if isinstance(candidate, str) else None
    score = (
        (100 if outcome["isCorrect"] else 0)
        if not is_game
        else js_round(float(outcome["score"]) * 10_000) / 10_000
    )
    return {
        "responseToStore": {"selfGrade": self_grade} if type_name == "recall_card" else response,
        "isCorrect": bool(outcome["isCorrect"]),
        "correction": correction,
        "explanation": explanation,
        "rating": rating,
        "score": float(score),
        "maxScore": 1.0 if is_game else 100.0,
    }


async def _session_of(tx: Any, entry: Mapping[str, Any], user_id: str) -> dict[str, Any] | None:
    """`sessionOf`: the session row visible to the learner, `None` when RLS hides it."""
    row = await queries.read_sync_session(tx, str(entry["sessionId"]))
    if row is None:
        return None
    if str(row["owner_id"]) != user_id or str(row["formation_id"]) != str(entry["formationId"]):
        return {"forbidden": True}
    return {"row": row}


async def _session_owner(deps: AssessmentDeps, session_id: str) -> str | None:
    """`sessionOf`: the owner read with the service role, only to answer `FORBIDDEN` (ET-7)."""
    async with deps.db.service_tx() as tx:
        return await queries.read_sync_activity_owner(tx, session_id)


async def _apply_answer(
    deps: AssessmentDeps,
    tx: Any,
    actor: Actor,
    entry: Mapping[str, Any],
    row: Mapping[str, Any],
    reviewed_at: str,
    time_zone: str,
) -> dict[str, Any]:
    """`applyAnswer`: one answer, its daily activity and its FSRS application."""
    user_id = actor.user_id
    attempt_id = str(row["attempt_id"])
    position = int(entry["position"]) + 1
    existing = await queries.read_sync_answer_position(tx, attempt_id, position)
    if existing is not None:
        return {"kind": "conflict"}
    items = _items_of(row)
    version_id = _version_id_of(entry, items)
    if version_id == "":
        return {"kind": "rejected", "code": "INVALID_RESPONSE"}
    brick = await queries.read_sync_brick(tx, version_id)
    if brick is None:
        return {"kind": "rejected", "code": "INVALID_RESPONSE"}
    time_ms = _time_ms_of(entry)
    if entry.get("skipped") is True:
        await queries.insert_sync_answer(
            tx,
            answer_id=str(uuid.uuid4()),
            attempt_id=attempt_id,
            version_id=version_id,
            position=position,
            response=json.dumps({"skipped": True}),
            is_correct=None,
            score=None,
            max_score=None,
            time_ms=time_ms,
            feedback=json.dumps(
                {
                    "clientAnswerId": entry["clientId"],
                    "correction": None,
                    "explanation": None,
                    "offline": True,
                }
            ),
            answered_at=reviewed_at,
        )
        return {"kind": "ok", "value": {"correct": None, "nextDueAt": None}}
    if entry.get("response") is None and entry.get("selfGrade") is None:
        return {"kind": "rejected", "code": "INVALID_RESPONSE"}
    graded = graded_response(entry, brick, version_id)
    if graded is None:
        return {"kind": "rejected", "code": "INVALID_RESPONSE"}

    answer_id = str(uuid.uuid4())
    await queries.insert_sync_answer(
        tx,
        answer_id=answer_id,
        attempt_id=attempt_id,
        version_id=version_id,
        position=position,
        response=json.dumps(graded["responseToStore"], ensure_ascii=False),
        is_correct=graded["isCorrect"],
        score=graded["score"],
        max_score=graded["maxScore"],
        time_ms=time_ms,
        feedback=json.dumps(
            {
                "clientAnswerId": entry["clientId"],
                "correction": graded["correction"],
                "explanation": graded["explanation"],
                "offline": True,
            },
            ensure_ascii=False,
        ),
        answered_at=reviewed_at,
    )
    await upsert_daily_activity(
        tx,
        user_id=user_id,
        day=local_date_of(reviewed_at, time_zone),
        minutes=max(1, -(-time_ms // 60_000)),
        qualifying=True,
        sources=[f"offline:{entry['clientId']}"],
    )
    next_due_at: str | None = None
    type_name = str(brick["type"])
    notion_ids = [str(notion) for notion in (brick["notion_ids"] or [])]
    reported = brick["status"] in ("reported", "retired")
    if not reported:
        per_notion_ms = max(1, js_round(time_ms / max(1, len(notion_ids))))
        for notion_id in notion_ids:
            applied = await apply_review_result(
                tx,
                user_id=user_id,
                notion_id=notion_id,
                source="offline",
                format_name=type_name,
                correct=graded["isCorrect"],
                rating=graded["rating"],
                time_ms=float(time_ms if type_name == "recall_card" else per_notion_ms),
                answer_id=answer_id,
                attempt_id=attempt_id,
                attempt_no=1,
                reviewed_at=reviewed_at,
                skip_fsrs_if_newer=True,
            )
            if applied is not None and next_due_at is None:
                next_due_at = str(applied["dueAt"])
    return {
        "kind": "ok",
        "value": {
            "correct": None if reported else graded["isCorrect"],
            "nextDueAt": next_due_at,
        },
    }


async def _receipt(
    deps: AssessmentDeps,
    actor: Actor,
    entry: Mapping[str, Any],
    *,
    status: str,
    answer_id: str | None,
) -> None:
    """`insertReceipt` outside the reading transaction (a rejected entry has no write)."""
    async with deps.db.user_tx(actor) as tx:
        await queries.insert_sync_receipt(
            tx,
            user_id=actor.user_id,
            client_id=str(entry["clientId"]),
            status=status,
            answer_id=answer_id,
        )


async def process_answer(
    deps: AssessmentDeps,
    actor: Actor,
    entry: Mapping[str, Any],
    time_zone: str,
    now: Any,
) -> dict[str, Any]:
    """`processAnswer`: one queued answer, idempotent by `clientId`."""
    user_id = actor.user_id
    client_id = str(entry["clientId"])
    owner = await _session_owner(deps, str(entry["sessionId"]))
    async with deps.db.user_tx(actor) as tx:
        if await queries.sync_receipt_exists(tx, user_id, client_id):
            return {"clientId": client_id, "status": "duplicate"}
        found = await _session_of(tx, entry, user_id)
        if found is None:
            code = "FORBIDDEN" if owner is not None and owner != user_id else "SESSION_NOT_FOUND"
            await queries.insert_sync_receipt(
                tx, user_id=user_id, client_id=client_id, status="rejected", answer_id=None
            )
            return {"clientId": client_id, "status": "rejected", "code": code}
        if found.get("forbidden") is True:
            await queries.insert_sync_receipt(
                tx, user_id=user_id, client_id=client_id, status="rejected", answer_id=None
            )
            return {"clientId": client_id, "status": "rejected", "code": "FORBIDDEN"}
        row = found["row"]
        reviewed_at = clamp_answered_at(str(entry["answeredAt"]), now)
        if is_expired(reviewed_at, str(row["for_date"]), time_zone, now):
            await queries.insert_sync_receipt(
                tx, user_id=user_id, client_id=client_id, status="rejected", answer_id=None
            )
            return {"clientId": client_id, "status": "rejected", "code": "EXPIRED"}
        applied = await _apply_answer(deps, tx, actor, entry, row, reviewed_at, time_zone)
        if applied["kind"] == "conflict":
            await queries.insert_sync_receipt(
                tx, user_id=user_id, client_id=client_id, status="conflict", answer_id=None
            )
            return {"clientId": client_id, "status": "conflict"}
        if applied["kind"] == "rejected":
            await queries.insert_sync_receipt(
                tx, user_id=user_id, client_id=client_id, status="rejected", answer_id=None
            )
            return {"clientId": client_id, "status": "rejected", "code": applied["code"]}
        answer_id = await queries.read_sync_answer_position(
            tx, str(row["attempt_id"]), int(entry["position"]) + 1
        )
        await queries.insert_sync_receipt(
            tx, user_id=user_id, client_id=client_id, status="applied", answer_id=answer_id
        )
        result: dict[str, Any] = {"clientId": client_id, "status": "applied"}
        if applied["value"]["correct"] is not None:
            result["correct"] = applied["value"]["correct"]
        if applied["value"]["nextDueAt"] is not None:
            result["nextDueAt"] = applied["value"]["nextDueAt"]
        return result


async def process_complete(
    deps: AssessmentDeps,
    actor: Actor,
    entry: Mapping[str, Any],
    time_zone: str,
    now: Any,
) -> dict[str, Any]:
    """`processComplete`: the completion of a session queued offline."""
    user_id = actor.user_id
    client_id = str(entry["clientId"])
    owner = await _session_owner(deps, str(entry["sessionId"]))
    async with deps.db.user_tx(actor) as tx:
        if await queries.sync_receipt_exists(tx, user_id, client_id):
            return {"clientId": client_id, "status": "duplicate"}
        found = await _session_of(tx, entry, user_id)
    if found is None:
        code = "FORBIDDEN" if owner is not None and owner != user_id else "SESSION_NOT_FOUND"
        await _receipt(deps, actor, entry, status="rejected", answer_id=None)
        return {"clientId": client_id, "status": "rejected", "code": code}
    if found.get("forbidden") is True:
        await _receipt(deps, actor, entry, status="rejected", answer_id=None)
        return {"clientId": client_id, "status": "rejected", "code": "FORBIDDEN"}
    row = found["row"]
    reviewed_at = clamp_answered_at(str(entry["answeredAt"]), now)
    if is_expired(reviewed_at, str(row["for_date"]), time_zone, now):
        await _receipt(deps, actor, entry, status="rejected", answer_id=None)
        return {"clientId": client_id, "status": "rejected", "code": "EXPIRED"}
    try:
        await complete_review_session(deps, actor, str(entry["sessionId"]))
    except AppError as error:
        await _receipt(deps, actor, entry, status="rejected", answer_id=None)
        return {
            "clientId": client_id,
            "status": "rejected",
            "code": "SESSION_NOT_FOUND" if error.code == "NOT_FOUND" else "INVALID_RESPONSE",
        }
    await _receipt(deps, actor, entry, status="applied", answer_id=None)
    return {"clientId": client_id, "status": "applied"}


async def time_zone_of(deps: AssessmentDeps, actor: Actor) -> str:
    """`timeZoneOf`: the learner zone, `Europe/Paris` when the profile row is unreadable."""
    async with deps.db.user_tx(actor) as tx:
        stored = await queries.read_sync_profile_timezone(tx, actor.user_id)
    return stored if stored else FALLBACK_TIME_ZONE


async def sync_offline_answers(
    deps: AssessmentDeps, actor: Actor, entries: Sequence[Mapping[str, Any]]
) -> dict[str, Any]:
    """ET-6, ET-7 - applies a batch of at most 50 entries, one result per entry."""
    now = deps.clock.now()
    time_zone = await time_zone_of(deps, actor)
    results: list[dict[str, Any]] = []
    for entry in order_entries(entries):
        if entry["kind"] == "complete":
            results.append(await process_complete(deps, actor, entry, time_zone, now))
        else:
            results.append(await process_answer(deps, actor, entry, time_zone, now))
    by_client: dict[str, dict[str, Any]] = {}
    for result in results:
        by_client[str(result["clientId"])] = result
    return {"results": list(by_client.values())}


def local_day_of(answered_at: str, time_zone: str) -> str:
    """Re-exported for the integration tests: local day of a synchronised answer."""
    return local_date_of(answered_at, time_zone)


__all__ = [
    "FALLBACK_TIME_ZONE",
    "MAX_TIME_MS",
    "RETENTION_MS",
    "clamp_answered_at",
    "graded_response",
    "is_expired",
    "local_day_of",
    "order_entries",
    "sync_offline_answers",
    "time_zone_of",
]
