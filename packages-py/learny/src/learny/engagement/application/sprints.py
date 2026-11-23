"""Sprint planning before the next milestones of one formation (SPEC-719, BR-AUT-08, ADR-0190).

Ported from `planSprintsBeforeMilestones` of
`packages/automations/src/automatisme-8-sprint-avant-un-jalon.ts`. The ownership checks run through
the learner client: a foreign formation or slot answers 404 without revealing its existence, an
obsolete slot answers 409 and an invalid identifier answers 400. The proposal path is the one of
`runAutomation` (`packages/automations/src/moteur-d-automatismes.ts`): the setting and the global
pause are checked first (CL-5), every draft is validated before any write (ET-3), the unique
`dedupeKey` index turns a replay into a no-op (EF-4) and a proposal written without consent is
applied and journaled in the same transaction.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

from learny.engagement.application.effect_runner import apply_effects
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.automations import (
    ActionDraft,
    ActionView,
    DraftError,
    EffectContext,
    ParamsError,
    validate_draft,
    validate_params,
)
from learny.engagement.domain.automations.definitions import product_registry
from learny.engagement.domain.automations.definitions.sprint import (
    SLOT_LOOKBACK_MS,
    SPRINT_PLANNED_KIND,
    SprintPlacement,
    place_sprint_targets,
    select_weakest_notions,
    sprint_dedupe_key,
    sprint_planner_key,
)
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.domain.planner import PlannerPreferences
from learny.learning.domain.types import Availability
from learny.shared.errors import AppError
from learny.shared.ids import is_uuid
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import from_epoch_ms, to_epoch_ms, to_iso, user_local_day

AUTOMATION_KEY: Final = "sprint"
ACTION_APPLIED_EVENT: Final = "automation/action-applied"
DEFAULT_HOURS_PER_DAY: Final = 2
DEFAULT_STUDY_DAYS: Final = (1, 2, 3, 4, 5)
DEFAULT_STUDY_SLOTS: Final = ("soir",)
STUDY_SLOTS: Final = ("matin", "apres_midi", "soir")
EXAM_KINDS: Final = ("validation_quiz", "mock_exam")


@dataclass(frozen=True, slots=True)
class RunResult:
    """`RunAutomationResult`: what this call proposed, and why it proposed nothing (CL-5)."""

    created: int
    skipped: str | None


def _validation_failed(detail: str, path: str, message: str) -> AppError:
    """`validationError`: one French detail plus its single `errors` entry."""
    return AppError("VALIDATION_FAILED", detail, errors=[{"path": path, "message": message}])


def _preferences(row: queries.PlanningRhythmRow) -> PlannerPreferences:
    """`preferencesOf`: the rhythm of the learner, with the defaults of the TypeScript engine."""
    slots = [slot for slot in (row.preferred_slots or []) if slot in STUDY_SLOTS]
    days = sorted(int(day) for day in (row.study_days or DEFAULT_STUDY_DAYS) if 1 <= int(day) <= 7)
    return PlannerPreferences(
        tz=row.timezone,
        availability=Availability(
            hours_per_day=row.hours_per_day or DEFAULT_HOURS_PER_DAY,
            study_days=tuple(days),
            preferred_slots=tuple(slots) or DEFAULT_STUDY_SLOTS,
        ),
    )


def _view(
    row: queries.AutomationActionRow,
    *,
    status: str | None = None,
    payload: Mapping[str, Any] | None = None,
    undo_payload: Mapping[str, Any] | None = None,
) -> ActionView:
    """The journal row as the definitions read it; the caller may pass the effect's own values."""
    undo = row.undo_payload if undo_payload is None else undo_payload
    return ActionView(
        id=row.id,
        automation=row.automation,
        kind=row.kind,
        summary=row.summary,
        formation_id=row.formation_id,
        payload=dict(row.payload) if payload is None else dict(payload),
        undo_payload=None if undo is None else dict(undo),
        requires_consent=row.requires_consent,
        status=status or row.status,
        decided_at=None if row.decided_at is None else to_iso(row.decided_at),
        created_at=to_iso(row.created_at),
    )


def _draft(
    row: queries.SprintMilestoneRow,
    notions: list[dict[str, Any]],
    placement: SprintPlacement,
    *,
    days_before: int,
    duration_min: int,
    time_zone: str,
) -> ActionDraft:
    """`draftFor`: the `sprint_planned` proposal of one milestone."""
    if len(placement.targets) == 0:
        raise DraftError("VALIDATION_FAILED", fr.SPRINT_NO_COMPATIBLE_SLOT)
    exam_date = user_local_day(to_epoch_ms(row.starts_at), time_zone)
    dedupe_key = sprint_dedupe_key(row.id, exam_date, days_before)
    payload = {
        "dedupeKey": dedupe_key,
        "formationId": row.formation_id,
        "examSlotId": row.id,
        "examKind": row.kind,
        "examDate": exam_date,
        "examTitle": row.title,
        "moduleId": row.module_id,
        "moduleTitle": row.module_title,
        "daysBefore": days_before,
        "durationMin": duration_min,
        "notionIds": [str(notion["notionId"]) for notion in notions],
        "notionLabels": [str(notion["label"]) for notion in notions],
        "targets": placement.targets,
        "impossible": placement.impossible,
    }
    return ActionDraft(
        kind=SPRINT_PLANNED_KIND,
        formation_id=row.formation_id,
        requires_consent=False,
        payload=payload,
        dedupe_key=dedupe_key,
    )


async def _drafts(
    tx: Any,
    *,
    user_id: str,
    formation_id: str,
    exam_slot_id: str | None,
    now: datetime,
    time_zone: str,
    preferences: PlannerPreferences,
    params: Mapping[str, Any],
) -> list[ActionDraft]:
    """`sprintDrafts`: one proposal per upcoming milestone, sharing the busy agenda of the run."""
    days_before = int(params["daysBefore"])
    duration_min = int(params["durationMin"])
    milestones = await queries.list_upcoming_milestones(
        tx, user_id=user_id, formation_id=formation_id, exam_slot_id=exam_slot_id, now=now
    )
    slots = await queries.list_planner_slots(
        tx, user_id=user_id, since=from_epoch_ms(to_epoch_ms(now) - SLOT_LOOKBACK_MS)
    )
    drafts: list[ActionDraft] = []
    for row in milestones:
        notions = await queries.list_weakest_notions(
            tx,
            user_id=user_id,
            formation_id=row.formation_id,
            module_id=None if row.kind == "mock_exam" else row.module_id,
        )
        selected = select_weakest_notions(notions)
        # CL-5 - no studied notion: no empty sprint and no action.
        if len(selected) == 0:
            continue
        placement = place_sprint_targets(
            exam_date=user_local_day(to_epoch_ms(row.starts_at), time_zone),
            exam_slot_id=row.id,
            formation_id=row.formation_id,
            module_id=row.module_id,
            days_before=days_before,
            duration_min=duration_min,
            now=now,
            time_zone=time_zone,
            preferences=preferences,
            slots=slots,
        )
        if len(placement.targets) == 0:
            continue
        slots.extend(placement.reserved)
        drafts.append(
            _draft(
                row,
                selected,
                placement,
                days_before=days_before,
                duration_min=duration_min,
                time_zone=time_zone,
            )
        )
    return drafts


async def _with_slot_ids(
    tx: Any,
    *,
    user_id: str,
    exam_slot_id: str,
    payload: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Completes the applied targets with the identifiers the executor just inserted.

    The TypeScript `apply` returns the row identifier of each insert inside the payload; the Python
    definition asks the executor for the effects instead, so the identifiers are read back from the
    stable planner key of each target (EF-3). The definition already dropped the past targets,
    exactly like `appliedTargets`.
    """
    targets = payload.get("targets")
    raw_targets = targets if isinstance(targets, list) else []
    created = await queries.list_sprint_slot_ids(
        tx, user_id=user_id, pattern=f"{sprint_planner_key(exam_slot_id, '')}%"
    )
    completed: list[dict[str, Any]] = []
    for target in raw_targets:
        if not isinstance(target, Mapping):
            continue
        filled = dict(target)
        filled["slotId"] = created.get(sprint_planner_key(exam_slot_id, str(filled.get("day"))))
        completed.append(filled)
    return completed


async def _apply(
    tx: Any,
    *,
    user_id: str,
    time_zone: str,
    tone: str,
    now: datetime,
    definition: Any,
    row: queries.AutomationActionRow,
) -> None:
    """Applies the effect of a proposal written without consent, then derives its summary."""
    effect = definition.apply(
        EffectContext(user_id=user_id, time_zone=time_zone, tone=tone, now=now), _view(row)
    )
    await apply_effects(tx, user_id=user_id, now=now, effects=effect.effects)
    changes = dict(effect.changes)
    if "payload" not in changes:
        return
    payload = dict(changes["payload"])
    exam_slot_id = str(payload.get("examSlotId") or "")
    targets = await _with_slot_ids(tx, user_id=user_id, exam_slot_id=exam_slot_id, payload=payload)
    payload["targets"] = targets
    undo_payload = dict(changes.get("undo_payload") or {})
    undo_payload["slotIds"] = [
        str(target["slotId"]) for target in targets if target.get("slotId") is not None
    ]
    summary = definition.explain(
        _view(row, status="applied", payload=payload, undo_payload=undo_payload), tone, time_zone
    )
    await queries.update_automation_action_effect(
        tx,
        user_id=user_id,
        action_id=row.id,
        summary=summary,
        payload=payload,
        undo_payload=undo_payload,
        undo_present=True,
    )


async def _run(
    tx: Any,
    *,
    user_id: str,
    formation_id: str,
    exam_slot_id: str | None,
    rhythm: queries.PlanningRhythmRow,
    time_zone: str,
    tone: str,
    now: datetime,
) -> RunResult:
    """`runAutomation` for the `sprint` key: settings, pause, drafts, then one transaction."""
    settings = await queries.read_automation_settings(tx, user_id)
    setting = next((row for row in settings if row.key == AUTOMATION_KEY), None)
    if setting is not None and not setting.enabled:
        return RunResult(created=0, skipped="disabled")
    try:
        params = validate_params(AUTOMATION_KEY, {} if setting is None else setting.params)
    except ParamsError as error:
        detail = fr.FIELD_INVALID.format(path="params", message=fr.SPRINT_PARAMS_INVALID)
        raise _validation_failed(detail, "params", fr.SPRINT_PARAMS_INVALID) from error
    local_day = user_local_day(to_epoch_ms(now), time_zone)
    if await queries.read_active_pause(tx, user_id, local_day) is not None:
        return RunResult(created=0, skipped="paused")
    definition = product_registry().require(AUTOMATION_KEY)
    drafts = await _drafts(
        tx,
        user_id=user_id,
        formation_id=formation_id,
        exam_slot_id=exam_slot_id,
        now=now,
        time_zone=time_zone,
        preferences=_preferences(rhythm),
        params=params,
    )
    created = 0
    for draft in drafts:
        decision = validate_draft(definition, draft, tone, time_zone)
        row = await queries.insert_automation_action(
            tx,
            user_id=user_id,
            formation_id=draft.formation_id,
            automation=AUTOMATION_KEY,
            kind=draft.kind,
            summary=decision.summary,
            payload=decision.payload,
            requires_consent=draft.requires_consent,
            now=now,
        )
        if row is None:  # EF-4: the same dedupe key already exists, nothing is written
            continue
        created += 1
        if not draft.requires_consent and definition.apply is not None:
            await _apply(
                tx,
                user_id=user_id,
                time_zone=time_zone,
                tone=tone,
                now=now,
                definition=definition,
                row=row,
            )
        await tx.emit(
            ACTION_APPLIED_EVENT,
            {"userId": user_id, "actionId": row.id, "automation": AUTOMATION_KEY},
            event_id=f"automation-action:{row.id}",
            user_id=user_id,
        )
    return RunResult(created=created, skipped=None)


def _plan_view(row: queries.SprintPlanRow, expected_exam_dates: Mapping[str, str]) -> dict[str, Any] | None:
    """One `SprintPlanView` of the journal, or `None` when the row is not the active plan."""
    payload = dict(row.payload)
    exam_slot_id = str(payload.get("examSlotId") or "")
    if exam_slot_id == "":
        return None
    expected = expected_exam_dates.get(exam_slot_id)
    # A moved milestone keeps its old applied action: only the plan of the current local exam date
    # is the active one, even when both rows share the frozen creation instant.
    if expected is not None and str(payload.get("examDate") or "") != expected:
        return None
    targets = payload.get("targets")
    impossible = payload.get("impossible")
    notion_ids = payload.get("notionIds")
    notion_labels = payload.get("notionLabels")
    return {
        "actionId": row.id,
        "formationId": str(payload.get("formationId") or ""),
        "examSlotId": exam_slot_id,
        "examKind": "mock_exam" if payload.get("examKind") == "mock_exam" else "validation_quiz",
        "examDate": str(payload.get("examDate") or ""),
        "examTitle": str(payload.get("examTitle") or fr.SPRINT_PLAN_EXAM_FALLBACK),
        "daysBefore": _number_or(payload.get("daysBefore"), 3),
        "durationMin": _number_or(payload.get("durationMin"), 30),
        "notionIds": list(notion_ids) if isinstance(notion_ids, list) else [],
        "notionLabels": list(notion_labels) if isinstance(notion_labels, list) else [],
        "targets": list(targets) if isinstance(targets, list) else [],
        "impossible": list(impossible) if isinstance(impossible, list) else [],
        "summary": row.summary,
    }


def _number_or(value: object, fallback: int) -> int:
    """`numberOr`: a finite number, otherwise the fallback of the view."""
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else fallback


async def _plans(
    tx: Any,
    *,
    user_id: str,
    exam_slot_ids: list[str],
    expected_exam_dates: Mapping[str, str],
) -> list[dict[str, Any]]:
    """`plansFor`: the newest active plan of every milestone, in journal order."""
    if len(exam_slot_ids) == 0:
        return []
    rows = await queries.list_sprint_plans(tx, user_id=user_id, exam_slot_ids=exam_slot_ids)
    seen: set[str] = set()
    plans: list[dict[str, Any]] = []
    for row in rows:
        view = _plan_view(row, expected_exam_dates)
        if view is None or view["examSlotId"] in seen:
            continue
        seen.add(view["examSlotId"])
        plans.append(view)
    return plans


async def plan_sprints_before_milestones(
    deps: EngagementDeps,
    actor: Actor | None,
    formation_id: str,
    exam_slot_id: str | None = None,
) -> dict[str, Any]:
    """ET-1, ET-3 - plans the sprints of one formation, or narrows the run to one milestone.

    A foreign formation or slot answers 404 without revealing its existence; a slot that is not a
    validation quiz or a mock exam answers 400; an obsolete slot answers 409.
    """
    if actor is None:
        raise AppError("UNAUTHENTICATED", fr.SPRINT_UNAUTHENTICATED)
    if not is_uuid(formation_id):
        raise _validation_failed(fr.SPRINT_INVALID_FORMATION, "formationId", fr.SPRINT_UUID_EXPECTED)
    if exam_slot_id is not None and not is_uuid(exam_slot_id):
        raise _validation_failed(fr.SPRINT_INVALID_EXAM, "examSlotId", fr.SPRINT_UUID_EXPECTED)

    async with deps.db.user_tx(actor) as user_tx:
        owned = await queries.read_owned_formation(user_tx, formation_id=formation_id, owner_id=actor.user_id)
        if not owned:
            raise AppError("NOT_FOUND", fr.SPRINT_FORMATION_NOT_FOUND)
        if exam_slot_id is not None:
            slot = await queries.read_formation_slot(user_tx, slot_id=exam_slot_id, formation_id=formation_id)
            if slot is None:
                raise AppError("NOT_FOUND", fr.SPRINT_EXAM_NOT_FOUND)
            if slot.kind not in EXAM_KINDS:
                raise _validation_failed(fr.SPRINT_NOT_AN_EXAM, "examSlotId", fr.SPRINT_EXAM_KIND_EXPECTED)
            if slot.status != "planned":
                raise AppError("CONFLICT", fr.SPRINT_EXAM_NOT_PLANNED)

    now = deps.clock.now()
    async with deps.db.service_tx() as tx:
        profile = await queries.read_planning_rhythm(tx, actor.user_id)
        if profile is None:
            raise AppError("NOT_FOUND", fr.PROFILE_NOT_FOUND)
        tone = "tu" if profile.tutor_tone == "tu" else "vous"
        run = await _run(
            tx,
            user_id=actor.user_id,
            formation_id=formation_id,
            exam_slot_id=exam_slot_id,
            rhythm=profile,
            time_zone=profile.timezone,
            tone=tone,
            now=now,
        )
        milestones = await queries.list_milestone_dates(
            tx, user_id=actor.user_id, formation_id=formation_id, exam_slot_id=exam_slot_id
        )
        expected = {
            milestone_id: user_local_day(to_epoch_ms(starts_at), profile.timezone)
            for milestone_id, starts_at in milestones
        }
        plans = await _plans(
            tx,
            user_id=actor.user_id,
            exam_slot_ids=[milestone_id for milestone_id, _ in milestones],
            expected_exam_dates=expected,
        )
    return {"created": run.created, "skipped": run.skipped, "plans": plans}


__all__ = ["RunResult", "plan_sprints_before_milestones"]
