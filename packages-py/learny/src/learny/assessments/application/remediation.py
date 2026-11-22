"""Targeted remediation of a failed validation attempt (SPEC-612 EF-6, ET-2, ET-4, ET-5; ADR-0173).

Port of `packages/services/src/remediation/index.ts`. One activity `remediation` per failed attempt:
a tutor text per open gap, zero to two excerpts of the current course and two questions per notion
drawn from the bank (none already answered). The plan is persisted with the activity so a reload
shows the same texts and questions. The activity is archived when the learner terminates it; its
answers feed mastery and FSRS with `review_source = 'validation'`.

The tutor plan is a structured object of `learny.platform.llm` (task `gaps`, prompt
`tutor.remediation-plan`, mock scenario `remediation-plan`, same fixture as the TypeScript service).
The request emitted by `request_remediation_preparation` is consumed by the worker in SPEC-2207.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Annotated, Any
from urllib.parse import quote

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.quiz import get_attempt
from learny.assessments.application.quiz_result import nature_label_of, proposal_of
from learny.assessments.application.retry_gate import retry_gate
from learny.assessments.domain.bricks.public import project_public
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.application.apply_result import apply_learning_result
from learny.learning.domain.params import ENGINE
from learny.platform.llm.types import StepInput, SystemPart
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import to_iso

QUESTION_TYPES = ("choice_question", "cloze", "matching")
"""`questionType`: a bank brick outside the three quiz formats is skipped, never guessed."""

AI_UNAVAILABLE_CODES = ("AI_UNAVAILABLE", "AI_CAP_REACHED")
"""`onAiUnavailable: fail` of SPEC-715 CL-9."""

SYSTEM_PROMPT = texts.REMEDIATION_SYSTEM_PROMPT

REMEDIATION_TEXT = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=texts.REMEDIATION_TEXT_MAX_CHARS),
]
REMEDIATION_PROPOSAL = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=texts.REMEDIATION_PROPOSAL_MAX_CHARS),
]


class PlanItem(BaseModel):
    """One tutor entry of the plan, one per open gap (`RemediationPlanSchema`)."""

    model_config = ConfigDict(extra="forbid")

    notionId: Annotated[str, StringConstraints(min_length=1)]
    textMd: REMEDIATION_TEXT
    proposal: REMEDIATION_PROPOSAL
    excerptCitationIds: list[str] = Field(default_factory=list, max_length=5)


class RemediationPlan(BaseModel):
    """The tutor plan of `remediation/index.ts`."""

    model_config = ConfigDict(extra="forbid")

    items: list[PlanItem] = Field(min_length=1, max_length=texts.REMEDIATION_MAX_GAPS)


def escape_data(value: str) -> str:
    """`escapeData`: the entity encoding of the unreliable gap data."""
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def escape_component(value: str) -> str:
    """`encodeURIComponent`: the href escaping of the TypeScript service."""
    return quote(value, safe="-_.!~*'()")


def plan_prompt(gaps: Sequence[Mapping[str, Any]]) -> StepInput:
    """`defaultRemediationPlanGenerator`: the same system prompt and the same tagged gaps."""
    lines = [
        texts.REMEDIATION_USER_LINE,
        *(
            texts.REMEDIATION_GAP_TAG.format(
                notion_id=gap["notionId"],
                nature=gap["nature"],
                label=escape_data(str(gap["label"])),
                evidence=escape_data(str(gap["evidence"])),
            )
            for gap in gaps
        ),
        "",
        "Renvoie { items: [{ notionId, textMd, proposal, excerptCitationIds }] } avec un item par notion.",
    ]
    content = "\n".join(lines)
    return StepInput(
        system=(SystemPart(text=SYSTEM_PROMPT, cache=True),),
        messages=({"role": "user", "content": content},),
    )


async def default_remediation_plan_generator(
    deps: AssessmentDeps, gaps: Sequence[Mapping[str, Any]], scenario: str | None
) -> dict[str, Any]:
    """The structured tutor plan, validated against the plan schema by the gateway."""
    generated = await deps.llm.object(
        "gaps",
        texts.REMEDIATION_PLAN_PROMPT_ID,
        RemediationPlan,
        plan_prompt(gaps),
        scenario=texts.REMEDIATION_PLAN_SCENARIO if scenario is None else scenario,
    )
    parsed = (
        generated if isinstance(generated, RemediationPlan) else RemediationPlan.model_validate(generated)
    )
    known = {str(gap["notionId"]) for gap in gaps}
    items = [
        {
            "notionId": (item.notionId if item.notionId in known else str(gaps[index]["notionId"])),
            "textMd": item.textMd,
            "proposal": item.proposal,
            "excerptCitationIds": list(item.excerptCitationIds),
        }
        for index, item in enumerate(parsed.items)
        if index < len(gaps)
    ]
    return {"items": items}


def question_type(value: Any) -> str | None:
    """`questionType`: a stored type outside the quiz contract is skipped, never guessed."""
    return value if value in QUESTION_TYPES else None


def as_array(value: Any) -> list[str]:
    """`asArray`: the `uuid[]` column as a list, whatever the driver returns."""
    if isinstance(value, list):
        return [str(entry) for entry in value if isinstance(entry, (str, int))]
    if isinstance(value, str):
        stripped = value.strip("{}")
        return [entry.strip().strip('"') for entry in stripped.split(",") if entry.strip()]
    return []


def preference(nature: str, row: Mapping[str, Any], gap: Mapping[str, Any]) -> int:
    """`preference`: the nature of the gap decides which question format comes first."""
    type_name = question_type(row["type"])
    if type_name is None:
        return 99
    confused_with = gap["confused_with"]
    confused = (
        confused_with is not None
        and row["payload"] is not None
        and str(confused_with) in json.dumps(row["payload"], ensure_ascii=False)
    )
    if nature == "confusion":
        if type_name == "matching":
            return 0 if confused else 1
        if type_name == "choice_question":
            return 2 if confused else 3
        return 4
    if type_name == "choice_question":
        return 0
    if type_name == "cloze":
        return 1
    if type_name == "matching":
        return 2
    return 3


def select_questions(
    gaps: Sequence[Mapping[str, Any]],
    bank: Sequence[Mapping[str, Any]],
    seen: set[str],
) -> list[dict[str, Any]]:
    """`selectQuestions`: two unseen questions per notion, reused by no other gap."""
    used: set[str] = set()
    selection: list[dict[str, Any]] = []
    for gap in gaps:
        candidates = [
            row
            for row in bank
            if str(row["brick_id"]) not in used
            and not (row["fingerprint"] is not None and str(row["fingerprint"]) in seen)
            and str(gap["notion_id"]) in as_array(row["notion_ids"])
        ]
        candidates.sort(
            key=lambda row: (
                preference(str(gap["nature"]), row, gap),
                str(row["brick_id"]),
            )
        )
        for candidate in candidates[: texts.REMEDIATION_QUESTIONS_PER_NOTION]:
            used.add(str(candidate["brick_id"]))
            selection.append({"question": candidate, "gap": gap})
    return selection


def public_question(row: Mapping[str, Any], gap: Mapping[str, Any], position: int) -> dict[str, Any] | None:
    """`publicQuestion`: the stored item of one remediation question."""
    type_name = question_type(row["type"])
    if type_name is None:
        return None
    parsed, issues = parse_payload(type_name, row["payload"])
    if parsed is None or issues:
        return None
    version_id = str(row["version_id"])
    return {
        "position": position,
        "brickId": str(row["brick_id"]),
        "brickVersionId": version_id,
        "notionId": str(gap["notion_id"]),
        "notionLabel": str(gap["label"]),
        "type": type_name,
        "payload": project_public(type_name, parsed, version_id),
        "fullPayload": row["payload"],
    }


def fallback_text(gap: Mapping[str, Any]) -> str:
    """`fallbackText`: the documented sentence when the tutor is unavailable."""
    return texts.REMEDIATION_FALLBACK_TEXT.format(
        label=gap["label"],
        proposal=proposal_of(str(gap["nature"])),
        notice=texts.REMEDIATION_FALLBACK_NOTICE,
    )


def plan_items_of(gaps: Sequence[Mapping[str, Any]], plan: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """`planItemsOf`: the tutor plan aligned on the gaps, the fallback text otherwise."""
    by_notion = {} if plan is None else {str(item["notionId"]): item for item in plan.get("items", [])}
    items: list[dict[str, Any]] = []
    for gap in gaps:
        notion_id = str(gap["notion_id"])
        item = by_notion.get(notion_id)
        items.append(
            {
                "notionId": notion_id,
                "textMd": fallback_text(gap) if item is None else str(item["textMd"]),
                "proposal": proposal_of(str(gap["nature"])) if item is None else str(item["proposal"]),
                "excerptCitationIds": [] if item is None else list(item["excerptCitationIds"]),
            }
        )
    return items


def stored_plan_of(
    gaps: Sequence[Mapping[str, Any]],
    items: Sequence[Mapping[str, Any]],
    excerpts_by_notion: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    formation_id: str,
    module_id: str,
) -> list[dict[str, Any]]:
    """`prepareRemediation`: the persisted plan, excerpt links included."""
    plan: list[dict[str, Any]] = []
    for gap in gaps:
        notion_id = str(gap["notion_id"])
        item = next((entry for entry in items if str(entry["notionId"]) == notion_id), None)
        excerpts = [
            {
                "label": str(excerpt["label"]),
                "href": (
                    f"/formations/{escape_component(formation_id)}"
                    f"/modules/{escape_component(module_id)}/cours"
                    f"?chapitre={escape_component(str(excerpt['chapter_id']))}"
                    f"#{escape_component(str(excerpt['anchor']))}"
                ),
            }
            for excerpt in excerpts_by_notion.get(notion_id, [])
        ]
        plan.append(
            {
                "notionId": notion_id,
                "label": str(gap["label"]),
                "nature": str(gap["nature"]),
                "natureLabel": nature_label_of(str(gap["nature"])),
                "textMd": fallback_text(gap) if item is None else str(item["textMd"]),
                "proposal": proposal_of(str(gap["nature"])) if item is None else str(item["proposal"]),
                "excerpts": excerpts,
            }
        )
    return plan


def remediation_status_of(row: Mapping[str, Any], *, preparing_allowed: bool = True) -> str:
    """The state derived from the activity and its attempt (CL-2, CL-9)."""
    if row["attempt_status"] == "graded":
        return "completed"
    if preparing_allowed and row["preparing"] is True:
        return "preparing"
    if int(row["checked"]) > 0:
        return "in_progress"
    return "ready"


async def _retry_available_at(deps: AssessmentDeps, actor: Actor, module_id: str) -> str | None:
    """`readRetryGateInContext`: the retry instant, `None` when the gate cannot be read."""
    try:
        gate = await retry_gate(deps, actor, module_id)
    except AppError:
        return None
    available = gate.get("availableAt")
    return None if available is None else str(available)


def parse_config(value: Any) -> dict[str, Any]:
    """`parseConfig`: the stored plan and source attempt, unreadable entries dropped."""
    raw: Mapping[str, Any] = value if isinstance(value, Mapping) else {}
    plan_raw = raw.get("plan")
    entries = plan_raw if isinstance(plan_raw, list) else []
    plan: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        if not isinstance(entry.get("notionId"), str) or not isinstance(entry.get("label"), str):
            continue
        excerpts_raw = entry.get("excerpts")
        excerpts = [
            {"label": str(excerpt["label"]), "href": str(excerpt["href"])}
            for excerpt in (excerpts_raw if isinstance(excerpts_raw, list) else [])
            if isinstance(excerpt, Mapping)
            and isinstance(excerpt.get("label"), str)
            and isinstance(excerpt.get("href"), str)
        ]
        plan.append(
            {
                "notionId": str(entry["notionId"]),
                "label": str(entry["label"]),
                "nature": str(entry["nature"]) if isinstance(entry.get("nature"), str) else "forgetting",
                "natureLabel": str(entry["natureLabel"])
                if isinstance(entry.get("natureLabel"), str)
                else texts.RESULT_GAP_DEFAULT_LABEL,
                "textMd": str(entry["textMd"]) if isinstance(entry.get("textMd"), str) else "",
                "proposal": str(entry["proposal"])
                if isinstance(entry.get("proposal"), str)
                else texts.GAP_PROPOSALS["forgetting"],
                "excerpts": excerpts,
            }
        )
    return {
        "plan": plan,
        "sourceAttemptId": str(raw["sourceAttemptId"])
        if isinstance(raw.get("sourceAttemptId"), str)
        else None,
    }


def _module_info(module: Mapping[str, Any]) -> dict[str, Any]:
    """The module header of `RemediationDto`."""
    return {
        "id": str(module["id"]),
        "position": int(module["position"]),
        "title": str(module["title"]),
    }


def _none_dto(module: Mapping[str, Any], retry: str | None) -> dict[str, Any]:
    """The `none` remediation of the screen."""
    return {
        "status": "none",
        "module": _module_info(module),
        "activityId": None,
        "attemptId": None,
        "gaps": [],
        "retryAvailableAt": retry,
    }


async def prepare_remediation(
    deps: AssessmentDeps,
    actor: Actor,
    module_id: str,
    *,
    trigger: str = "manual",
    generator: Any = None,
    scenario: str | None = None,
    on_ai_unavailable: str = "fallback",
) -> dict[str, Any]:
    """ET-4 - prepares the remediation of the latest failed attempt of the module."""
    user_id = actor.user_id
    if not _is_uuid(module_id):
        raise AppError("VALIDATION_FAILED", texts.REMEDIATION_MODULE_INVALID_ID)
    none = {"status": "none", "activityId": None, "prepared": False, "fallback": False}
    async with deps.db.user_tx(actor) as tx:
        module = await queries.read_remediation_module(tx, user_id, module_id)
        if module is None:
            raise AppError("NOT_FOUND", texts.REMEDIATION_MODULE_NOT_FOUND)
        attempt = await queries.read_remediation_failed_attempt(tx, user_id, module_id)
        if attempt is None:
            if trigger == "auto":
                return none
            raise AppError("NO_FAILED_ATTEMPT", texts.REMEDIATION_NO_FAILED_ATTEMPT, status=422)
        existing = await queries.read_existing_remediation(tx, user_id, module_id, str(attempt["id"]))
        if existing is not None and existing["preparing"] is not True:
            return {
                "status": remediation_status_of(existing),
                "activityId": str(existing["id"]),
                "prepared": False,
                "fallback": False,
            }
        enabled = await queries.read_automation_enabled(tx, user_id)
        if trigger == "auto" and enabled is False:
            return none
        gaps = await queries.read_remediation_gaps(tx, user_id, module_id, texts.REMEDIATION_MAX_GAPS)
        if not gaps:
            return none
        bank = await queries.read_remediation_bank(tx, user_id, str(module["formation_id"]))
        seen = set(await queries.read_quiz_seen_fingerprints(tx, user_id))
        base: dict[str, Any] = {
            "module": module,
            "attempt": attempt,
            "gaps": gaps,
            "bank": bank,
            "seen": seen,
        }

    plan: dict[str, Any] | None = None
    fallback = False
    ai_error: AppError | None = None
    gap_input = [
        {
            "notionId": str(gap["notion_id"]),
            "label": str(gap["label"]),
            "nature": str(gap["nature"]),
            "natureLabel": nature_label_of(str(gap["nature"])),
            "evidence": (gap["evidence"] or "").strip(),
        }
        for gap in base["gaps"]
    ]
    try:
        generated = (
            await generator(deps, gap_input, scenario)
            if generator is not None
            else await default_remediation_plan_generator(deps, gap_input, scenario)
        )
        plan = generated.model_dump() if isinstance(generated, BaseModel) else dict(generated)
    except AppError as error:
        fallback = True
        ai_error = error
        deps.logger.warn("remediation.plan.failed", outcome="ai_task_failed", code=error.code)
    except Exception:
        fallback = True
        deps.logger.warn("remediation.plan.failed", outcome="ai_task_failed")
    if on_ai_unavailable == "fail" and ai_error is not None and ai_error.code in AI_UNAVAILABLE_CODES:
        raise ai_error

    formation_id = str(base["module"]["formation_id"])
    async with deps.db.user_tx(actor) as tx:
        replay = await queries.read_existing_remediation(tx, user_id, module_id, str(base["attempt"]["id"]))
        if replay is not None:
            return {
                "status": remediation_status_of(replay),
                "activityId": str(replay["id"]),
                "prepared": False,
                "fallback": fallback,
            }
        items = plan_items_of(base["gaps"], plan)
        excerpts_by_notion: dict[str, list[Mapping[str, Any]]] = {}
        for gap in base["gaps"]:
            notion_id = str(gap["notion_id"])
            item = next((entry for entry in items if entry["notionId"] == notion_id), None)
            excerpts_by_notion[notion_id] = await queries.read_remediation_excerpts(
                tx,
                user_id,
                formation_id,
                notion_id,
                [] if item is None else list(item["excerptCitationIds"]),
            )
        selected = select_questions(base["gaps"], base["bank"], base["seen"])
        questions = [
            question
            for index, entry in enumerate(selected)
            if (question := public_question(entry["question"], entry["gap"], index + 1)) is not None
        ]
        if not questions and not items:
            return {"status": "none", "activityId": None, "prepared": False, "fallback": fallback}
        points = 0.0 if not questions else 100 / len(questions)
        stored = stored_plan_of(
            base["gaps"],
            items,
            excerpts_by_notion,
            formation_id=formation_id,
            module_id=module_id,
        )
        config = {
            "sourceAttemptId": str(base["attempt"]["id"]),
            "durationMin": texts.REMEDIATION_DURATION_MIN,
            "questionCount": len(questions),
            "preparing": False,
            "fallback": fallback,
            "plan": stored,
        }
        activity_id = await queries.insert_remediation_activity(
            tx,
            user_id=user_id,
            formation_id=formation_id,
            module_id=module_id,
            config=json.dumps(config, ensure_ascii=False),
            items=json.dumps(
                [
                    {
                        "brickId": question["brickId"],
                        "brickVersionId": question["brickVersionId"],
                        "notionId": question["notionId"],
                        "notionLabel": question["notionLabel"],
                        "type": question["type"],
                        "payload": question["fullPayload"],
                    }
                    for question in questions
                ],
                ensure_ascii=False,
            ),
            status="ready",
        )
        if activity_id is None:
            raise AppError("INTERNAL_ERROR", texts.REMEDIATION_NOT_CREATED)
        await queries.archive_other_remediations(tx, user_id, module_id, activity_id)
        if questions:
            now = deps.clock.now()
            attempt_id = await queries.insert_remediation_attempt(
                tx, user_id=user_id, activity_id=activity_id, started_at=to_iso(now)
            )
            if attempt_id is None:
                raise AppError("INTERNAL_ERROR", texts.REMEDIATION_ATTEMPT_NOT_CREATED)
            for question in questions:
                await queries.insert_remediation_answer(
                    tx,
                    attempt_id=attempt_id,
                    version_id=question["brickVersionId"],
                    position=int(question["position"]),
                    max_score=points,
                    answered_at=to_iso(now),
                )
        return {
            "status": "ready",
            "activityId": activity_id,
            "prepared": True,
            "fallback": fallback,
        }


async def get_remediation(deps: AssessmentDeps, actor: Actor, module_id: str) -> dict[str, Any]:
    """ET-2 - the current remediation of the module, its questions and its state (CL-12)."""
    user_id = actor.user_id
    if not _is_uuid(module_id):
        raise AppError("VALIDATION_FAILED", texts.REMEDIATION_MODULE_INVALID_ID)
    async with deps.db.user_tx(actor) as tx:
        row = await queries.read_latest_remediation(tx, user_id, module_id)
        module = await queries.read_remediation_module(tx, user_id, module_id)
    if module is None:
        raise AppError("NOT_FOUND", texts.REMEDIATION_MODULE_NOT_FOUND)
    retry = await _retry_available_at(deps, actor, module_id)
    if row is None:
        return _none_dto(module, retry)
    config = parse_config(row["config"])
    if row["status"] == "archived" and row["attempt_status"] != "graded":
        return _none_dto(module, retry)
    questions_by_notion: dict[str, list[dict[str, Any]]] = {}
    if row["attempt_id"] is not None:
        try:
            attempt = await get_attempt(deps, actor, str(row["attempt_id"]))
        except AppError:
            attempt = None
        if attempt is not None:
            for question in attempt["questions"]:
                notion_id = str(question["notionId"])
                questions_by_notion.setdefault(notion_id, []).append(question)
    gaps = [
        {
            "notionId": item["notionId"],
            "label": item["label"],
            "nature": item["nature"],
            "natureLabel": item["natureLabel"],
            "textMd": item["textMd"],
            "excerpts": item["excerpts"],
            "questions": questions_by_notion.get(item["notionId"], []),
        }
        for item in config["plan"]
    ]
    return {
        "status": remediation_status_of(row),
        "module": _module_info(module),
        "activityId": str(row["id"]),
        "attemptId": None if row["attempt_id"] is None else str(row["attempt_id"]),
        "gaps": gaps,
        "retryAvailableAt": retry,
    }


async def request_remediation_preparation(
    deps: AssessmentDeps, actor: Actor, module_id: str
) -> dict[str, Any]:
    """ET-2 - explicit preparation: persist a draft marker and queue the job (202)."""
    user_id = actor.user_id
    if not _is_uuid(module_id):
        raise AppError("VALIDATION_FAILED", texts.REMEDIATION_MODULE_INVALID_ID)
    async with deps.db.user_tx(actor) as tx:
        module = await queries.read_remediation_module(tx, user_id, module_id)
        if module is None:
            raise AppError("NOT_FOUND", texts.REMEDIATION_MODULE_NOT_FOUND)
        attempt = await queries.read_remediation_failed_attempt(tx, user_id, module_id)
        if attempt is None:
            raise AppError("NO_FAILED_ATTEMPT", texts.REMEDIATION_NO_FAILED_ATTEMPT, status=422)
        existing = await queries.read_existing_remediation(tx, user_id, module_id, str(attempt["id"]))
        if existing is not None:
            if existing["attempt_status"] == "graded":
                raise AppError("CONFLICT", texts.REMEDIATION_ALREADY_COMPLETED, status=409)
            if existing["preparing"] is not True:
                raise AppError("CONFLICT", texts.REMEDIATION_ALREADY_READY, status=409)
            return {"status": "preparing"}
        config = {
            "sourceAttemptId": str(attempt["id"]),
            "durationMin": texts.REMEDIATION_DURATION_MIN,
            "preparing": True,
            "plan": [],
        }
        await queries.insert_remediation_activity(
            tx,
            user_id=user_id,
            formation_id=str(module["formation_id"]),
            module_id=module_id,
            config=json.dumps(config, ensure_ascii=False),
            items="[]",
            status="draft",
        )
        await tx.emit(
            "remediation/requested",
            {
                "userId": user_id,
                "formationId": str(module["formation_id"]),
                "moduleId": module_id,
                "attemptId": str(attempt["id"]),
            },
            event_id=f"remediation-requested:{attempt['id']}",
        )
        return {"status": "preparing"}


async def complete_remediation(deps: AssessmentDeps, actor: Actor, module_id: str) -> dict[str, Any]:
    """ET-2, CA-6 - finishes the remediation once every question is checked."""
    user_id = actor.user_id
    if not _is_uuid(module_id):
        raise AppError("VALIDATION_FAILED", texts.REMEDIATION_MODULE_INVALID_ID)
    already = False
    attempt_id: str | None = None
    async with deps.db.user_tx(actor) as tx:
        row = await queries.read_latest_remediation(tx, user_id, module_id)
        if row is None or row["attempt_id"] is None:
            raise AppError("NOT_FOUND", texts.REMEDIATION_NONE, status=404)
        attempt_id = str(row["attempt_id"])
        if row["attempt_status"] == "graded":
            already = True
        else:
            if row["attempt_status"] != "in_progress":
                raise AppError("CONFLICT", texts.REMEDIATION_NOT_IN_PROGRESS, status=409)
            unchecked = await queries.read_unchecked_remediation_answers(tx, attempt_id)
            if unchecked:
                raise AppError(
                    "CONFLICT",
                    texts.REMEDIATION_UNCHECKED,
                    status=409,
                    errors=[
                        {
                            "code": "QUESTION_UNCHECKED",
                            "path": f"questions.{position}",
                            "message": texts.REMEDIATION_UNCHECKED_HINT,
                        }
                        for position in unchecked
                    ],
                )
            answers = await queries.read_remediation_answer_scores(tx, attempt_id)
            earned = sum(0.0 if answer["score"] is None else float(answer["score"]) for answer in answers)
            possible = sum(
                0.0 if answer["max_score"] is None else float(answer["max_score"]) for answer in answers
            )
            score = js_round((earned / possible) * 10_000) / 100 if possible > 0 else 0.0
            now = deps.clock.now()
            await queries.update_remediation_graded_attempt(
                tx,
                attempt_id=attempt_id,
                score=score,
                passed=score >= float(ENGINE["mastery"]["threshold"]),
                now=to_iso(now),
            )
            await queries.archive_remediation_activity(tx, str(row["id"]))
    if not already and attempt_id is not None:
        await apply_learning_result(deps, actor, attempt_id)
    return {"retryAvailableAt": await _retry_available_at(deps, actor, module_id)}


def _is_uuid(value: str) -> bool:
    """`z.uuid()` of the service."""
    import uuid

    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


__all__ = [
    "AI_UNAVAILABLE_CODES",
    "SYSTEM_PROMPT",
    "PlanItem",
    "RemediationPlan",
    "complete_remediation",
    "default_remediation_plan_generator",
    "get_remediation",
    "plan_items_of",
    "plan_prompt",
    "prepare_remediation",
    "public_question",
    "request_remediation_preparation",
    "select_questions",
    "stored_plan_of",
]
