"""Creation of one validation quiz attempt (SPEC-611 EF-1, EF-8, ET-3, ET-4, ET-6, BR-QUI-01).

Port of `packages/services/src/quiz/start.ts`: everything runs in the learner's RLS transaction, the
draw is pure and deterministic (hash of learner, module and attempt number) and every question is
materialised in `activities.items`, so a later threshold change never rewrites the attempt (CL-10).
The module guard and the retry gate run before any write; an exhausted bank returns `preparing` and
creates nothing (EF-8).
"""

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.retry_gate import check_retry_allowed
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.domain.draw import draw_attempt
from learny.learning.domain.params import ENGINE
from learny.learning.infrastructure.queries import consume_automation_action
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import to_iso

QUESTION_TYPES = ("choice_question", "cloze", "matching", "open_question")
"""The four question types a validation quiz may hold (ET-2)."""

PREPARING_RETRY_AFTER_SEC = 3
"""EF-8 - the client retries three seconds later while the bank is regenerated."""


def validation_quiz_size(notion_count: int) -> int:
    """BR-QUI-01 - N = min(20, max(12, nombre de notions)), bounded by the configuration."""
    draw = ENGINE["draw"]
    return int(min(draw["maxSize"], max(draw["defaultSize"], max(1, int(notion_count)))))


def quiz_attempt_seed(user_id: str, module_id: str, attempt_no: int) -> str:
    """`attemptSeed`: the deterministic seed of one attempt."""
    return hashlib.sha256(f"{user_id}:{module_id}:{attempt_no}".encode()).hexdigest()


def question_type(value: Any) -> str | None:
    """`questionType`: a stored type outside the quiz contract is skipped, never guessed."""
    return value if value in QUESTION_TYPES else None


def draw_notions_of(
    rows: Sequence[Mapping[str, Any]], module_id: str, module_position: int
) -> list[dict[str, Any]]:
    """`drawNotionsOf`: the engine view of the notions of the module."""
    notions: list[dict[str, Any]] = []
    for row in rows:
        mastery = row["mastery"]
        notions.append(
            {
                "notionId": str(row["id"]),
                "moduleId": module_id,
                "chapterId": str(row["chapter_id"]),
                "modulePosition": module_position,
                "position": int(row["position"]),
                "label": str(row["label"]),
                "mastery": None if mastery is None or mastery == "" else float(mastery),
            }
        )
    return notions


def draw_gaps_of(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """`drawGapsOf`: the open gaps of the module, the four natures of the engine only."""
    gaps: list[dict[str, Any]] = []
    for row in rows:
        nature = row["gap_nature"]
        if nature in ("forgetting", "confusion", "misunderstanding", "application"):
            gaps.append({"notionId": str(row["id"]), "nature": str(nature)})
    return gaps


def bank_of(rows: Sequence[Mapping[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """`readBank`: the readable bricks of the bank and the payload of their current version."""
    bank: list[dict[str, Any]] = []
    payloads: dict[str, Any] = {}
    for row in rows:
        type_name = question_type(row["type"])
        if type_name is None:
            continue
        parsed, issues = parse_payload(type_name, row["payload"])
        if parsed is None or issues:
            continue
        version_id = str(row["version_id"])
        payloads[version_id] = row["payload"]
        bank.append(
            {
                "brickId": str(row["brick_id"]),
                "brickVersionId": version_id,
                "notionIds": [str(notion) for notion in (row["notion_ids"] or [])],
                "format": type_name,
                "status": "active",
                "valid": True,
                "ownedByLearner": True,
                "fingerprint": row["fingerprint"],
            }
        )
    return bank, payloads


async def _module_guard(deps: AssessmentDeps, actor: Actor, module_id: str) -> Mapping[str, Any]:
    """BR-FOR-08, CL-7 - a locked module never opens, even from a hand-written URL."""
    async with deps.db.user_tx(actor) as tx:
        module = await queries.read_quiz_module(tx, actor.user_id, module_id)
    if module is None:
        raise AppError("NOT_FOUND", texts.QUIZ_MODULE_NOT_FOUND)
    if module["status"] == "locked":
        raise AppError("MODULE_LOCKED", texts.QUIZ_MODULE_LOCKED, status=422)
    return module


async def start_validation_attempt(deps: AssessmentDeps, actor: Actor, module_id: str) -> dict[str, Any]:
    """ET-2 - starts the quiz of one module, or resumes the attempt already in progress."""
    user_id = actor.user_id
    await _module_guard(deps, actor, module_id)
    await check_retry_allowed(deps, actor, module_id)
    async with deps.db.user_tx(actor) as tx:
        existing = await queries.read_in_progress_quiz_attempt(tx, user_id, module_id)
    if existing is not None:
        return {"attemptId": existing, "resumed": True}
    started_at = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_quiz_start(tx, user_id, module_id)
        replay = await queries.read_in_progress_quiz_attempt(tx, user_id, module_id)
        if replay is not None:
            return {"attemptId": replay, "resumed": True}
        module = await queries.read_quiz_module(tx, user_id, module_id)
        if module is None:
            raise AppError("NOT_FOUND", texts.QUIZ_MODULE_NOT_FOUND)
        if module["status"] == "locked":
            raise AppError("MODULE_LOCKED", texts.QUIZ_MODULE_LOCKED, status=422)
        notion_rows = await queries.read_quiz_notions(tx, user_id, module_id)
        if not notion_rows:
            raise AppError("CONFLICT", texts.QUIZ_MODULE_WITHOUT_NOTIONS, status=409)
        formation_id = str(module["formation_id"])
        size = validation_quiz_size(len(notion_rows))
        attempt_no = await queries.read_next_quiz_attempt_no(tx, user_id, module_id)
        bank, payloads = bank_of(await queries.read_quiz_bank(tx, user_id, formation_id))
        seen = await queries.read_quiz_seen_fingerprints(tx, user_id)
        draw_params = dict(ENGINE["draw"])
        draw_params["masteryThreshold"] = ENGINE["mastery"]["threshold"]
        draw = draw_attempt(
            notions=draw_notions_of(notion_rows, module_id, int(module["position"])),
            bank=bank,
            seen_fingerprints=seen,
            gaps=draw_gaps_of(notion_rows),
            params=draw_params,
            target_count=size,
            seed=quiz_attempt_seed(user_id, module_id, attempt_no),
        )
        exhausted = {
            str(entry["notionId"]) for entry in draw["exhausted"] if entry.get("reason") == "bank_exhausted"
        }
        if exhausted:
            # EF-8, CL-5 - the regeneration of the bank belongs to SPEC-513: the request is the
            # documented debt of this port, the `preparing` answer and the retry window are the
            # same and no attempt is created.
            return {"preparing": True, "retryAfterSec": PREPARING_RETRY_AFTER_SEC}
        if not draw["questions"]:
            raise AppError("CONFLICT", texts.QUIZ_NO_QUESTION_FOR_MODULE, status=409)
        labels = {str(notion["id"]): str(notion["label"]) for notion in notion_rows}
        items = [
            {
                "brickId": question["brickId"],
                "brickVersionId": question["brickVersionId"],
                "points": question["points"],
                "notionId": question["notionId"],
                "notionLabel": labels.get(str(question["notionId"]), ""),
                "type": question["format"],
                "payload": payloads.get(str(question["brickVersionId"])),
            }
            for question in draw["questions"]
        ]
        config = {
            "threshold": int(module["threshold"]),
            "questionCount": len(draw["questions"]),
            "scoring": "equal",
        }
        activity_id = await queries.insert_quiz_activity(
            tx,
            user_id=user_id,
            formation_id=formation_id,
            module_id=module_id,
            config=json.dumps(config, ensure_ascii=False),
            items=json.dumps(
                [
                    {
                        "brickId": item["brickId"],
                        "brickVersionId": item["brickVersionId"],
                        "points": item["points"],
                    }
                    for item in items
                ],
                ensure_ascii=False,
            ),
        )
        if activity_id is None:
            raise AppError("INTERNAL_ERROR", texts.QUIZ_ACTIVITY_NOT_CREATED)
        await queries.update_quiz_activity_items(tx, activity_id, json.dumps(items, ensure_ascii=False))
        attempt_id = await queries.insert_quiz_attempt(
            tx,
            user_id=user_id,
            activity_id=activity_id,
            attempt_no=attempt_no,
            started_at=to_iso(started_at),
        )
        if attempt_id is None:
            raise AppError("INTERNAL_ERROR", texts.QUIZ_ATTEMPT_NOT_CREATED)
        # SPEC-715 EF-7 - the next attempt consumes the applied remediation action of the module.
        applied_action = await queries.read_applied_remediation_action(tx, user_id, module_id)
        if applied_action is not None:
            await consume_automation_action(tx, user_id, applied_action)
        for index, question in enumerate(draw["questions"]):
            await queries.insert_quiz_answer(
                tx,
                attempt_id=attempt_id,
                version_id=str(question["brickVersionId"]),
                position=index + 1,
                max_score=float(question["points"]),
                answered_at=to_iso(started_at),
            )
        return {"attemptId": attempt_id}


__all__ = [
    "PREPARING_RETRY_AFTER_SEC",
    "QUESTION_TYPES",
    "bank_of",
    "draw_gaps_of",
    "draw_notions_of",
    "question_type",
    "quiz_attempt_seed",
    "start_validation_attempt",
    "validation_quiz_size",
]
