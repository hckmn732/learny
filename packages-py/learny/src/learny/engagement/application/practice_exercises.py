"""Idempotent creation of the practice exercise of one notion (SPEC-2205, from SPEC-613 ET-4).

Ported from `packages/services/src/exercises/ensure-practice-exercise.ts`: the use case reads the
notion and the current ready course version, serialises on an advisory lock keyed by both, then
creates one `instruction` brick, its unique version and one ready `exercise` activity per
`(owner, notion, course version)`. The tutor generation is the committed deterministic fixture of
`locale_fr.engagement_exercises`: no provider is called (ADR-0048).
"""

import json
import re
from typing import Any

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.practice import criteria_total, instruction_for
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr

_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
HINTS_MAX = 2


def _uuid_of(value: str) -> str:
    if _UUID.match(value) is None:
        raise AppError("VALIDATION_FAILED", fr.PRACTICE_NOTION_INVALID)
    return value


async def ensure_practice_exercise(
    deps: EngagementDeps,
    actor: Actor,
    notion_id: str,
) -> dict[str, Any]:
    """ET-4 - creates or returns the exercise of the notion for the current course version."""
    _uuid_of(notion_id)
    async with deps.db.user_tx(actor) as tx:
        notion = await queries.read_practice_notion(tx, notion_id)
        if notion is None:
            raise AppError("NOT_FOUND", fr.PRACTICE_NOTION_NOT_FOUND)
        formation_id = str(notion["formationId"])
        module_id = str(notion["moduleId"])
        course_version = await queries.current_course_version(tx, actor.user_id, module_id)
        await queries.lock_practice(tx, f"practice:{notion_id}:{course_version}")
        existing = await queries.find_existing_exercise(tx, actor.user_id, notion_id, course_version)
        if existing is not None:
            return {
                "exerciseId": existing,
                "formationId": formation_id,
                "moduleId": module_id,
                "notionId": notion_id,
                "courseVersion": course_version,
                "created": False,
            }

        instruction = instruction_for(str(notion["label"]), notion["shortDefinition"])
        now = deps.clock.now()
        brick_id = await queries.insert_practice_brick(
            tx,
            user_id=actor.user_id,
            formation_id=formation_id,
            notion_id=notion_id,
            created_at=now,
        )
        if brick_id is None:
            raise AppError("INTERNAL_ERROR", fr.PRACTICE_BRICK_NOT_CREATED)
        version_id = await queries.insert_practice_brick_version(
            tx,
            brick_id=brick_id,
            payload=json.dumps(instruction, ensure_ascii=False),
            created_at=now,
        )
        if version_id is None:
            raise AppError("INTERNAL_ERROR", fr.PRACTICE_VERSION_NOT_CREATED)
        config = {
            "notionId": notion_id,
            "courseVersion": course_version,
            "hintsMax": HINTS_MAX,
            "threshold": int(instruction["passPoints"]),
            "scoring": {"total": criteria_total(list(instruction["criteria"]))},
        }
        items = [{"brickId": brick_id, "brickVersionId": version_id}]
        activity_id = await queries.insert_practice_activity(
            tx,
            user_id=actor.user_id,
            formation_id=formation_id,
            module_id=module_id,
            config=json.dumps(config, ensure_ascii=False),
            items=json.dumps(items, ensure_ascii=False),
            created_at=now,
        )
        if activity_id is None:
            raise AppError("INTERNAL_ERROR", fr.PRACTICE_ACTIVITY_NOT_CREATED)
        return {
            "exerciseId": activity_id,
            "formationId": formation_id,
            "moduleId": module_id,
            "notionId": notion_id,
            "courseVersion": course_version,
            "created": True,
        }


__all__ = ["HINTS_MAX", "ensure_practice_exercise"]
