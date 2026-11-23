"""Seeding of a practice exercise for the integration suite (SPEC-613).

One formation, one module, one notion, the immutable `instruction` brick version and the ready
`exercise` activity the route reads. The instruction is the same shape as the tutor generation of
`ensure-practice-exercise.ts`; the content stays English test data.
"""

import json
from typing import Any

from factories.identity_support import (
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    identifier,
)

EXERCISE_INSTRUCTION: dict[str, Any] = {
    "title": "Balance a simple entry",
    "taskMd": "Record the purchase of office supplies paid by bank transfer.",
    "data": ["Company FR01", "Currency: EUR"],
    "deliverable": "A short justified answer.",
    "production": {"kind": "text", "minChars": 20, "maxChars": 2000},
    "explanationPrompt": "Explain why the entry stays balanced.",
    "hints": [
        "Which account increases when supplies are bought?",
        "The charge goes to debit, the bank to credit.",
    ],
    "criteria": [
        {"key": "application", "label": "Application", "points": 4, "description": "Rule applied."},
        {"key": "exactitude", "label": "Exactitude", "points": 4, "description": "Result exact."},
        {
            "key": "explication",
            "label": "Explanation",
            "points": 2,
            "description": "Rule explained.",
        },
    ],
    "estimatedMinutes": 10,
    "passPoints": 9,
    "sources": [],
}
"""One valid exercise instruction, the shape of the generated payload."""

VALID_EXPLANATION = "The debit and the credit must stay equal in every entry."
"""A production sentence the deterministic tutor accepts as the written explanation."""

WEAK_EXPLANATION = "I cannot remember how this entry works at all."
"""A long enough but hollow explanation: its own criterion is lost, the others pass."""


async def seed_exercise(
    conn: Any,
    user_id: str,
    *,
    module_position: int = 1,
    notion_position: int = 1,
) -> dict[str, Any]:
    """One ready practice exercise of the learner, with its immutable instruction version."""
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(
        conn, formation_id, module_position, title="Double entry", status="validated"
    )
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id, position=notion_position)
    brick_id = await identifier(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:owner as uuid), cast(:formation as uuid), 'instruction',
          array[cast(:notion as uuid)], 'exercise', 'active'
        )
        returning id::text as id
        """,
        owner=user_id,
        formation=formation_id,
        notion=notion_id,
    )
    version_id = await identifier(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=brick_id,
        payload=json.dumps(EXERCISE_INSTRUCTION),
    )
    config = {
        "notionId": notion_id,
        "courseVersion": 1,
        "hintsMax": 2,
        "threshold": EXERCISE_INSTRUCTION["passPoints"],
        "scoring": {"total": 10},
    }
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status
        ) values (
          cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid),
          'exercise', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        owner=user_id,
        formation=formation_id,
        module=module_id,
        config=json.dumps(config),
        items=json.dumps([{"brickId": brick_id, "brickVersionId": version_id}]),
    )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "moduleId": module_id,
        "notionId": notion_id,
        "notionLabel": "Notion 1",
        "brickId": brick_id,
        "versionId": version_id,
        "activityId": activity_id,
    }


def valid_submission(explanation: str = VALID_EXPLANATION) -> dict[str, Any]:
    """A complete text production of the seeded instruction."""
    return {
        "kind": "text",
        "text": "The supplies expense account is debited and the bank account is credited.",
        "explanation": explanation,
    }
