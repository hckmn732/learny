"""Global pause and return of the learner (SPEC-721, BR-AUT-10, ADR-0016, ADR-0190).

Ported from `packages/services/src/pause/index.ts`: the state (`none|active|ended`, `returnDue`),
the start and the end of the pause, the freezing and resuming of the formations, the deterministic
ten-minute diagnostic of SPEC-406 and the daily activity of SPEC-411. Every read and write of the
learner runs in ONE RLS transaction (CL-1); the journal row is written on the service role after the
commit, exactly like the TypeScript `recordPauseAction`. A read on the return day finalises the
pause once (EF-2); the diagnostic result replans the resumed formations, never before a real answer.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.engagement.application.effect_runner import apply_effects
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.automations.pause import (
    DIAGNOSTIC_MINUTES,
    pause_summary,
    validate_pause_end_date,
)
from learny.identity.domain.actor import Actor
from learny.learning.application.planning import replan_formation_in_tx
from learny.learning.domain.global_quiz import build_daily_session
from learny.learning.domain.params import ENGINE
from learny.learning.infrastructure.queries import upsert_daily_activity
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import parse_iso, to_epoch_ms, to_iso, user_local_day

PAUSE_ALREADY_ACTIVE = fr.PAUSE_ALREADY_ACTIVE
PAUSE_DIAGNOSTIC_MISSING = fr.PAUSE_DIAGNOSTIC_MISSING
PAUSE_DIAGNOSTIC_EMPTY = fr.PAUSE_DIAGNOSTIC_EMPTY
PAUSE_NOT_WRITTEN = fr.PAUSE_NOT_WRITTEN
PAUSE_ACTION_NOT_WRITTEN = fr.PAUSE_ACTION_NOT_WRITTEN

READ_PROFILE = text(
    "select timezone, tutor_tone::text as tutor_tone from public.profiles where id = cast(:user_id as uuid)"
)

READ_PAUSE_ROW = text(
    "select id::text as id, starts_on::text as starts_on, ends_on::text as ends_on, "
    "diagnostic_on_return, status::text as status, ended_at, created_at "
    "from public.pauses where user_id = cast(:user_id as uuid) "
    "order by created_at desc limit 1"
)

READ_PAUSE_ROW_FOR_UPDATE = text(
    "select id::text as id, starts_on::text as starts_on, ends_on::text as ends_on, "
    "diagnostic_on_return, status::text as status, ended_at, created_at "
    "from public.pauses where user_id = cast(:user_id as uuid) "
    "order by created_at desc limit 1 for update"
)

LOCK_PAUSE = text("select pg_advisory_xact_lock(hashtextextended('pause:' || cast(:user_id as text), 0))")

INSERT_PAUSE = text(
    "insert into public.pauses (user_id, starts_on, ends_on, diagnostic_on_return, status) "
    "values (cast(:user_id as uuid), cast(:starts_on as date), cast(:ends_on as date), "
    ":diagnostic_on_return, 'active') returning id::text as id"
)

END_PAUSE_ROW = text(
    "update public.pauses set status = 'ended', ended_at = :now, updated_at = :now "
    "where id = cast(:pause_id as uuid) and user_id = cast(:user_id as uuid)"
)

READ_ACTION = text(
    "select id::text as id, kind, payload, status::text as status from public.automation_actions "
    "where user_id = cast(:user_id as uuid) and automation = 'pause' and kind = :kind "
    "order by created_at desc limit 1"
)

READ_ACTION_FOR_UPDATE = text(
    "select id::text as id, kind, payload, status::text as status from public.automation_actions "
    "where user_id = cast(:user_id as uuid) and automation = 'pause' and kind = :kind "
    "order by created_at desc limit 1 for update"
)

INSERT_PAUSE_ACTION = text(
    "insert into public.automation_actions (user_id, formation_id, automation, kind, summary, payload, "
    "undo_payload, requires_consent, status, decided_at, created_at) values "
    "(cast(:user_id as uuid), null, 'pause', :kind, :summary, cast(:payload as jsonb), null, false, "
    "'applied', :now, :now) "
    "on conflict (user_id, automation, (payload ->> 'dedupeKey')) where payload ? 'dedupeKey' "
    "do nothing returning id::text as id"
)

SELECT_PAUSE_ACTION_BY_DEDUPE = text(
    "select id::text as id from public.automation_actions "
    "where user_id = cast(:user_id as uuid) and automation = 'pause' "
    "and payload ->> 'dedupeKey' = :dedupe_key limit 1"
)

UPDATE_ACTION_PAYLOAD = text(
    "update public.automation_actions set payload = cast(:payload as jsonb), summary = :summary "
    "where id = cast(:action_id as uuid) and user_id = cast(:user_id as uuid)"
)

READ_ACTIVE_FORMATIONS = text(
    "select id::text as id from public.formations where owner_id = cast(:user_id as uuid) "
    "and status = 'active' order by coalesce(last_opened_at, created_at) desc, id"
)

LOCK_FORMATIONS = text(
    "select id::text as id from public.formations where owner_id = cast(:user_id as uuid) for update"
)

PAUSE_FORMATION = text(
    "update public.formations set status = 'paused', paused_at = :now, updated_at = :now "
    "where id = cast(:formation_id as uuid) and owner_id = cast(:user_id as uuid)"
)

READ_FORMATION_STATUS = text(
    "select status::text as status from public.formations "
    "where id = cast(:formation_id as uuid) and owner_id = cast(:user_id as uuid) for update"
)

RESUME_FORMATION = text(
    "update public.formations set status = 'active', paused_at = null, updated_at = :now "
    "where id = cast(:formation_id as uuid) and owner_id = cast(:user_id as uuid)"
)

CANCEL_FUTURE_SLOTS = text(
    "update public.schedule_slots set status = 'cancelled', updated_at = :now "
    "where user_id = cast(:user_id as uuid) and formation_id = cast(:formation_id as uuid) "
    "and status = 'planned' and starts_at >= :now"
)

FALLBACK_CURRENT_FORMATION = text(
    "update public.profiles set current_formation_id = (select id from public.formations "
    "where owner_id = cast(:user_id as uuid) and status = 'active' "
    "and id <> cast(:formation_id as uuid) "
    "order by coalesce(last_opened_at, created_at) desc, created_at desc, id desc limit 1) "
    "where id = cast(:user_id as uuid) and current_formation_id = cast(:formation_id as uuid)"
)

SET_CURRENT_FORMATION = text(
    "update public.profiles set current_formation_id = cast(:formation_id as uuid) "
    "where id = cast(:user_id as uuid) and current_formation_id is null"
)

DIAGNOSTIC_RISK_ROWS = text(
    "select ns.notion_id::text as notion_id, n.formation_id::text as formation_id, "
    "n.module_id::text as module_id, m.position as module_position, "
    "coalesce(mp.status, m.status)::text as module_status, ns.due_at, ns.gap_nature::text as gap_nature "
    "from public.notion_states ns join public.notions n on n.id = ns.notion_id "
    "join public.modules m on m.id = n.module_id "
    "left join public.module_progress mp on mp.user_id = ns.user_id and mp.module_id = m.id "
    "where ns.user_id = cast(:user_id as uuid) "
    "and n.formation_id in (select cast(value as uuid) "
    "from jsonb_array_elements_text(cast(:formation_ids as jsonb))) "
    "and ns.in_review and not ns.suspended "
    "and (ns.gap_nature is not null or ns.due_at <= cast(:now as timestamptz)) "
    "order by m.position, ns.due_at, n.id limit 60"
)

DIAGNOSTIC_BANK_ROWS = text(
    "select distinct unnest(b.notion_ids)::text as notion_id, b.type::text as type "
    "from public.bricks b where b.notion_ids && "
    "(select array_agg(cast(value as uuid)) from jsonb_array_elements_text(cast(:notion_ids as jsonb)))"
)

DIAGNOSTIC_FORMATS = frozenset(
    {
        "recall_card",
        "choice_question",
        "cloze",
        "ordering",
        "matching",
        "categorization",
        "open_question",
    }
)


@dataclass(frozen=True, slots=True)
class _PauseRow:
    id: str
    starts_on: str
    ends_on: str
    diagnostic_on_return: bool
    status: str
    ended_at: Any
    created_at: Any


@dataclass(frozen=True, slots=True)
class _Internal:
    row: _PauseRow | None
    paused_formation_ids: list[str]
    diagnostic: dict[str, Any] | None


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return to_iso(parse_iso(value) if isinstance(value, str) else value)


def _tone(row: Mapping[str, Any]) -> str:
    return "tu" if row["tutor_tone"] == "tu" else "vous"


async def _profile(tx: Any, user_id: str) -> Mapping[str, Any]:
    result = await tx.conn.execute(READ_PROFILE, {"user_id": user_id})
    row = result.mappings().first()
    if row is None:
        raise AppError("NOT_FOUND", fr.PROFILE_NOT_FOUND)
    return dict(row)


def _row(raw: Mapping[str, Any] | None) -> _PauseRow | None:
    if raw is None:
        return None
    return _PauseRow(
        id=str(raw["id"]),
        starts_on=str(raw["starts_on"]),
        ends_on=str(raw["ends_on"]),
        diagnostic_on_return=bool(raw["diagnostic_on_return"]),
        status=str(raw["status"]),
        ended_at=raw["ended_at"],
        created_at=raw["created_at"],
    )


async def _read_pause_row(tx: Any, user_id: str, *, for_update: bool) -> _PauseRow | None:
    statement = READ_PAUSE_ROW_FOR_UPDATE if for_update else READ_PAUSE_ROW
    result = await tx.conn.execute(statement, {"user_id": user_id})
    return _row(result.mappings().first())


async def _read_action(
    tx: Any, user_id: str, kind: str, *, for_update: bool = False
) -> Mapping[str, Any] | None:
    statement = READ_ACTION_FOR_UPDATE if for_update else READ_ACTION
    result = await tx.conn.execute(statement, {"user_id": user_id, "kind": kind})
    found = result.mappings().first()
    return None if found is None else dict(found)


def _string_array(value: Any) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _diagnostic_of(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, Mapping) or not isinstance(value.get("notionIds"), list):
        return None
    minutes = value.get("minutes")
    return {
        "minutes": int(minutes) if isinstance(minutes, (int, float)) else DIAGNOSTIC_MINUTES,
        "formationId": value.get("formationId") if isinstance(value.get("formationId"), str) else None,
        "notionIds": _string_array(value.get("notionIds")),
        "answered": value.get("answered") if isinstance(value.get("answered"), (int, float)) else None,
        "correct": value.get("correct") if isinstance(value.get("correct"), (int, float)) else None,
        "completedAt": value.get("completedAt") if isinstance(value.get("completedAt"), str) else None,
    }


async def _latest(tx: Any, user_id: str) -> _Internal:
    row = await _read_pause_row(tx, user_id, for_update=False)
    started = await _read_action(tx, user_id, "pause_started")
    ended = await _read_action(tx, user_id, "pause_ended")
    paused = [] if started is None else _string_array(dict(started["payload"]).get("pausedFormationIds"))
    diagnostic = None if ended is None else _diagnostic_of(dict(ended["payload"]).get("diagnostic"))
    return _Internal(row=row, paused_formation_ids=paused, diagnostic=diagnostic)


def _state_of(internal: _Internal, local_day: str) -> dict[str, Any]:
    row = internal.row
    if row is None:
        return {
            "status": "none",
            "startsOn": None,
            "endsOn": None,
            "diagnosticOnReturn": True,
            "endedAt": None,
            "pausedFormationIds": [],
            "returnDue": False,
            "diagnostic": None,
        }
    ended = row.status != "active"
    return {
        "status": "ended" if ended else "active",
        "startsOn": row.starts_on,
        "endsOn": row.ends_on,
        "diagnosticOnReturn": row.diagnostic_on_return,
        "endedAt": _iso(row.ended_at),
        "pausedFormationIds": internal.paused_formation_ids,
        "returnDue": (not ended) and local_day > row.ends_on,
        "diagnostic": internal.diagnostic,
    }


async def _build_diagnostic_plan(
    tx: Any, user_id: str, now: datetime, time_zone: str, formation_ids: list[str]
) -> dict[str, Any]:
    """ET-4 - deterministic ten-minute diagnostic with the draw of SPEC-406."""
    if not formation_ids:
        return {"formationId": None, "notionIds": [], "minutes": DIAGNOSTIC_MINUTES}
    import json

    result = await tx.conn.execute(
        DIAGNOSTIC_RISK_ROWS,
        {"user_id": user_id, "formation_ids": json.dumps(formation_ids), "now": now},
    )
    rows = [dict(row) for row in result.mappings()]
    if not rows:
        return {"formationId": formation_ids[0], "notionIds": [], "minutes": DIAGNOSTIC_MINUTES}
    formation_id = str(rows[0]["formation_id"])
    scoped = [row for row in rows if str(row["formation_id"]) == formation_id]
    notion_ids = [str(row["notion_id"]) for row in scoped]
    bank_result = await tx.conn.execute(DIAGNOSTIC_BANK_ROWS, {"notion_ids": json.dumps(notion_ids)})
    formats: dict[str, list[str]] = {}
    for row in bank_result.mappings():
        if row["type"] not in DIAGNOSTIC_FORMATS:
            continue
        formats.setdefault(str(row["notion_id"]), []).append(str(row["type"]))
    due_notions = [
        {
            "notionId": str(row["notion_id"]),
            "moduleId": str(row["module_id"]),
            "modulePosition": int(row["module_position"]),
            "moduleStatus": row["module_status"]
            if row["module_status"] in ("validated", "locked")
            else "open",
            "evaluated": True,
            "dueAt": _iso(row["due_at"]),
        }
        for row in scoped
    ]
    gaps = [
        {"notionId": str(row["notion_id"]), "nature": row["gap_nature"]}
        for row in scoped
        if row["gap_nature"] is not None
    ]
    bank = [
        {"notionId": notion_id, "formats": formats.get(notion_id, ["choice_question"])}
        for notion_id in notion_ids
    ]
    session = build_daily_session(
        formation_id=formation_id,
        date=user_local_day(to_epoch_ms(now), time_zone),
        due_notions=due_notions,
        gaps=gaps,
        bank=bank,
        last_formats=[],
        cap_minutes=DIAGNOSTIC_MINUTES,
        mode="micro",
        seed=f"pause-diagnostic:{user_id}:{formation_id}",
        params={
            "notionCostSec": ENGINE["globalQuiz"]["notionCostSec"],
            "sessionOverheadSec": ENGINE["globalQuiz"]["sessionOverheadSec"],
            "formatSeconds": ENGINE["globalQuiz"]["formatSeconds"],
            "maintenanceMaxMinutes": ENGINE["globalQuiz"]["maintenanceMaxMinutes"],
        },
    )
    return {
        "formationId": formation_id,
        "notionIds": [str(item["notionId"]) for item in session["items"]],
        "minutes": DIAGNOSTIC_MINUTES,
    }


async def _pause_formations(tx: Any, user_id: str, now: datetime) -> list[str]:
    await tx.conn.execute(LOCK_FORMATIONS, {"user_id": user_id})
    result = await tx.conn.execute(READ_ACTIVE_FORMATIONS, {"user_id": user_id})
    ids = [str(row["id"]) for row in result.mappings()]
    for formation_id in ids:
        await tx.conn.execute(PAUSE_FORMATION, {"now": now, "formation_id": formation_id, "user_id": user_id})
        await tx.conn.execute(
            CANCEL_FUTURE_SLOTS, {"now": now, "formation_id": formation_id, "user_id": user_id}
        )
        await tx.conn.execute(
            FALLBACK_CURRENT_FORMATION,
            {"user_id": user_id, "formation_id": formation_id},
        )
    return ids


async def _resume_formations(tx: Any, user_id: str, now: datetime, formation_ids: list[str]) -> list[str]:
    resumed: list[str] = []
    for formation_id in formation_ids:
        result = await tx.conn.execute(
            READ_FORMATION_STATUS, {"formation_id": formation_id, "user_id": user_id}
        )
        row = result.mappings().first()
        if row is None or row["status"] != "paused":
            continue
        await tx.conn.execute(
            RESUME_FORMATION, {"now": now, "formation_id": formation_id, "user_id": user_id}
        )
        await replan_formation_in_tx(tx, user_id, formation_id, now)
        resumed.append(formation_id)
    if resumed:
        await tx.conn.execute(SET_CURRENT_FORMATION, {"user_id": user_id, "formation_id": resumed[0]})
    return resumed


async def end_pause_in_tx(
    tx: Any,
    *,
    user_id: str,
    now: datetime,
    time_zone: str,
    tone: str,
    force: bool = True,
) -> dict[str, Any]:
    """The transition `active -> ended` (EF-1, EF-2), idempotent on an already ended pause."""
    local_day = user_local_day(to_epoch_ms(now), time_zone)
    row = await _read_pause_row(tx, user_id, for_update=True)
    if row is None or row.status != "active" or (not force and local_day <= row.ends_on):
        internal = await _latest(tx, user_id)
        return {
            "state": _state_of(internal, local_day),
            "payload": None,
            "resumedFormationIds": [],
            "diagnosticEnabled": False if row is None else row.diagnostic_on_return,
            "localDay": local_day,
            "pauseId": None,
            "tone": tone,
        }
    await tx.conn.execute(END_PAUSE_ROW, {"now": now, "pause_id": row.id, "user_id": user_id})
    started = await _read_action(tx, user_id, "pause_started")
    paused = [] if started is None else _string_array(dict(started["payload"]).get("pausedFormationIds"))
    plan = (
        await _build_diagnostic_plan(tx, user_id, now, time_zone, paused)
        if row.diagnostic_on_return
        else None
    )
    has_diagnostic = plan is not None and len(plan["notionIds"]) > 0
    diagnostic: dict[str, Any] | None = None
    if plan is not None and has_diagnostic:
        diagnostic = {
            "minutes": plan["minutes"],
            "formationId": plan["formationId"],
            "notionIds": plan["notionIds"],
            "answered": None,
            "correct": None,
            "completedAt": None,
        }
    resumed = [] if has_diagnostic else await _resume_formations(tx, user_id, now, paused)
    payload = {
        "dedupeKey": f"pause:end:{row.id}",
        "pauseId": row.id,
        "endDate": row.ends_on,
        "startsOn": row.starts_on,
        "diagnosticEnabled": row.diagnostic_on_return,
        "diagnosticMinutes": plan["minutes"] if plan is not None else DIAGNOSTIC_MINUTES,
        "pausedFormationIds": paused,
        "resumedFormationIds": resumed,
        "diagnostic": diagnostic,
        "createdAt": to_iso(now),
    }
    return {
        "state": {
            "status": "ended",
            "startsOn": row.starts_on,
            "endsOn": row.ends_on,
            "diagnosticOnReturn": row.diagnostic_on_return,
            "endedAt": to_iso(now),
            "pausedFormationIds": paused,
            "returnDue": False,
            "diagnostic": diagnostic,
        },
        "payload": payload,
        "resumedFormationIds": resumed,
        "diagnosticEnabled": has_diagnostic,
        "localDay": local_day,
        "pauseId": row.id,
        "tone": tone,
    }


async def _record_pause_action(
    deps: EngagementDeps,
    *,
    user_id: str,
    kind: str,
    summary: str,
    payload: Mapping[str, Any],
    now: datetime,
) -> str:
    import json

    async with deps.db.service_tx() as tx:
        result = await tx.conn.execute(
            INSERT_PAUSE_ACTION,
            {
                "user_id": user_id,
                "kind": kind,
                "summary": summary,
                "payload": json.dumps(dict(payload), ensure_ascii=False),
                "now": now,
            },
        )
        row = result.mappings().first()
        if row is None:
            existing = await tx.conn.execute(
                SELECT_PAUSE_ACTION_BY_DEDUPE,
                {"user_id": user_id, "dedupe_key": str(dict(payload).get("dedupeKey", ""))},
            )
            found = existing.mappings().first()
            if found is None:
                raise AppError("INTERNAL_ERROR", PAUSE_ACTION_NOT_WRITTEN)
            return str(found["id"])
        action_id = str(row["id"])
        await tx.emit(
            "automation/action-applied",
            {"userId": user_id, "actionId": action_id, "automation": "pause"},
            event_id=f"automation-action-applied:{action_id}",
        )
        return action_id


async def _emit_resumed(deps: EngagementDeps, user_id: str, formation_ids: list[str], local_day: str) -> None:
    if not formation_ids:
        return
    async with deps.db.service_tx() as tx:
        for formation_id in formation_ids:
            await tx.emit(
                "formation/resumed",
                {"userId": user_id, "formationId": formation_id, "resumedOn": local_day},
                event_id=f"formation-resumed:{formation_id}:{local_day}",
            )


async def get_pause_state(deps: EngagementDeps, actor: Actor) -> dict[str, Any]:
    """GET /api/v1/me/pause - the state; a read on the return day finalises the pause once."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        profile = await _profile(tx, actor.user_id)
        time_zone = str(profile["timezone"])
        tone = _tone(profile)
        local_day = user_local_day(to_epoch_ms(now), time_zone)
        internal = await _latest(tx, actor.user_id)
        state = _state_of(internal, local_day)
        outcome: dict[str, Any] = {"payload": None, "resumed": [], "localDay": local_day}
        if state["status"] == "active" and state["returnDue"]:
            ended = await end_pause_in_tx(
                tx, user_id=actor.user_id, now=now, time_zone=time_zone, tone=tone, force=False
            )
            state = ended["state"]
            outcome = {
                "payload": ended["payload"],
                "resumed": ended["resumedFormationIds"],
                "localDay": ended["localDay"],
            }
    if outcome["payload"] is not None:
        payload = dict(outcome["payload"])
        await _record_pause_action(
            deps,
            user_id=actor.user_id,
            kind="pause_ended",
            summary=pause_summary(
                "pause_ended", str(payload.get("endDate", "")), state["diagnostic"] is not None, tone
            ),
            payload=payload,
            now=now,
        )
        await _emit_resumed(deps, actor.user_id, outcome["resumed"], outcome["localDay"])
    return state


async def start_pause(deps: EngagementDeps, actor: Actor, body: Mapping[str, Any]) -> dict[str, Any]:
    """POST /api/v1/me/pause - validates the end date, freezes the formations and journals."""
    now = deps.clock.now()
    end_date = str(body["endDate"])
    diagnostic = bool(body.get("diagnosticEnabled", True))
    async with deps.db.user_tx(actor) as tx:
        profile = await _profile(tx, actor.user_id)
        time_zone = str(profile["timezone"])
        tone = _tone(profile)
        local_day = user_local_day(to_epoch_ms(now), time_zone)
        reason = validate_pause_end_date(end_date, local_day)
        if reason is not None:
            raise AppError(
                "VALIDATION_FAILED",
                f"Date de fin invalide : {reason}.",
                status=422,
                errors=[{"path": "endDate", "message": reason}],
            )
        await tx.conn.execute(LOCK_PAUSE, {"user_id": actor.user_id})
        active = await _read_pause_row(tx, actor.user_id, for_update=True)
        if active is not None and active.status == "active":
            if active.ends_on != end_date or active.diagnostic_on_return != diagnostic:
                raise AppError("CONFLICT", PAUSE_ALREADY_ACTIVE)
            internal = await _latest(tx, actor.user_id)
            return _state_of(internal, local_day)
        result = await tx.conn.execute(
            INSERT_PAUSE,
            {
                "user_id": actor.user_id,
                "starts_on": local_day,
                "ends_on": end_date,
                "diagnostic_on_return": diagnostic,
            },
        )
        row = result.mappings().first()
        if row is None:
            raise AppError("INTERNAL_ERROR", PAUSE_NOT_WRITTEN)
        pause_id = str(row["id"])
        paused = await _pause_formations(tx, actor.user_id, now)
        payload = {
            "dedupeKey": f"pause:start:{pause_id}",
            "pauseId": pause_id,
            "endDate": end_date,
            "startsOn": local_day,
            "diagnosticEnabled": diagnostic,
            "diagnosticMinutes": DIAGNOSTIC_MINUTES,
            "pausedFormationIds": paused,
            "createdAt": to_iso(now),
        }
        state = {
            "status": "active",
            "startsOn": local_day,
            "endsOn": end_date,
            "diagnosticOnReturn": diagnostic,
            "endedAt": None,
            "pausedFormationIds": paused,
            "returnDue": False,
            "diagnostic": None,
        }
    await _record_pause_action(
        deps,
        user_id=actor.user_id,
        kind="pause_started",
        summary=pause_summary("pause_started", end_date, diagnostic, tone),
        payload=payload,
        now=now,
    )
    return state


async def end_pause(deps: EngagementDeps, actor: Actor) -> dict[str, Any]:
    """DELETE /api/v1/me/pause - ends the pause, resumes and replans the frozen formations."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        profile = await _profile(tx, actor.user_id)
        time_zone = str(profile["timezone"])
        tone = _tone(profile)
        await tx.conn.execute(LOCK_PAUSE, {"user_id": actor.user_id})
        outcome = await end_pause_in_tx(tx, user_id=actor.user_id, now=now, time_zone=time_zone, tone=tone)
    if outcome["payload"] is not None:
        payload = dict(outcome["payload"])
        await _record_pause_action(
            deps,
            user_id=actor.user_id,
            kind="pause_ended",
            summary=pause_summary(
                "pause_ended", str(payload.get("endDate", "")), bool(outcome["diagnosticEnabled"]), tone
            ),
            payload=payload,
            now=now,
        )
    await _emit_resumed(deps, actor.user_id, outcome["resumedFormationIds"], outcome["localDay"])
    return dict(outcome["state"])


async def complete_pause_diagnostic(
    deps: EngagementDeps, actor: Actor, body: Mapping[str, Any]
) -> dict[str, Any]:
    """POST /api/v1/me/pause/diagnostic - a real result is required before the replanification."""
    now = deps.clock.now()
    answered = int(body["answered"])
    correct = int(body["correct"])
    async with deps.db.user_tx(actor) as tx:
        profile = await _profile(tx, actor.user_id)
        time_zone = str(profile["timezone"])
        tone = _tone(profile)
        local_day = user_local_day(to_epoch_ms(now), time_zone)
        await tx.conn.execute(LOCK_PAUSE, {"user_id": actor.user_id})
        ended = await _read_action(tx, actor.user_id, "pause_ended", for_update=True)
        diagnostic = None if ended is None else _diagnostic_of(dict(ended["payload"]).get("diagnostic"))
        if ended is None or diagnostic is None:
            raise AppError("CONFLICT", PAUSE_DIAGNOSTIC_MISSING)
        if diagnostic["completedAt"] is not None:
            internal = await _latest(tx, actor.user_id)
            return _state_of(internal, local_day)
        if answered < 1:
            raise AppError(
                "VALIDATION_FAILED",
                PAUSE_DIAGNOSTIC_EMPTY,
                status=422,
                errors=[{"path": "answered", "message": fr.PAUSE_ANSWERED_REQUIRED}],
            )
        await upsert_daily_activity(
            tx,
            user_id=actor.user_id,
            day=local_day,
            minutes=int(diagnostic["minutes"]),
            qualifying=True,
            sources=[f"pause-diagnostic:{ended['id']}"],
        )
        completed = {**diagnostic, "answered": answered, "correct": correct, "completedAt": to_iso(now)}
        payload = {**dict(ended["payload"]), "diagnostic": completed}
        import json

        await tx.conn.execute(
            UPDATE_ACTION_PAYLOAD,
            {
                "action_id": ended["id"],
                "user_id": actor.user_id,
                "payload": json.dumps(payload, ensure_ascii=False),
                "summary": pause_summary("pause_ended", str(payload.get("endDate", "")), False, tone),
                "now": now,
            },
        )
        paused = _string_array(dict(ended["payload"]).get("pausedFormationIds"))
        resumed = await _resume_formations(tx, actor.user_id, now, paused)
        internal = await _latest(tx, actor.user_id)
        state = _state_of(internal, local_day)
    await _emit_resumed(deps, actor.user_id, resumed, local_day)
    return state


async def end_pause_effect(tx: Any, *, user_id: str, pause_id: str, now: datetime) -> dict[str, Any]:
    """ET-3 - the effect applied by the engine definition, in the engine transaction."""
    result = await tx.conn.execute(
        text(
            "select timezone, tutor_tone::text as tutor_tone from public.profiles "
            "where id = cast(:user_id as uuid)"
        ),
        {"user_id": user_id},
    )
    profile = result.mappings().first()
    if profile is None:
        raise AppError("NOT_FOUND", fr.PROFILE_NOT_FOUND)
    outcome = await end_pause_in_tx(
        tx,
        user_id=user_id,
        now=now,
        time_zone=str(profile["timezone"]),
        tone=_tone(profile),
    )
    diagnostic = outcome["state"]["diagnostic"]
    return {
        "payload:resumedFormationIds": outcome["resumedFormationIds"],
        "payload:diagnostic": diagnostic,
    }


__all__ = [
    "apply_effects",
    "complete_pause_diagnostic",
    "end_pause",
    "end_pause_effect",
    "end_pause_in_tx",
    "get_pause_state",
    "start_pause",
]
