"""[SPEC-2205] Weekly review: empty state, frozen payload, computed fallback and CL-1.

The home card reads the latest `bilan` action of the learner. A complete payload is projected as
frozen, an older or partial payload is recomputed from the learner's own rows, and another learner's
identifier answers 404 without revealing whether the row exists.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import FIXED, actor_for, create_user
from learny.engagement.application.weekly_review import get_weekly_review
from learny.engagement.domain.automations import (
    format_weekly_study,
    weekly_period_label,
    weekly_received_label,
    weekly_retention_label,
)
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.time import to_iso
from learny_api.generated.models import MeWeeklyReviewGetOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

ACTION_ID = "00000000-0000-4000-8000-00000000b001"
OTHER_ACTION_ID = "00000000-0000-4000-8000-00000000b002"
NOTION_ID = "00000000-0000-4000-8000-00000000c001"

INSERT_ACTION = text(
    "insert into public.automation_actions "
    "(id, user_id, automation, kind, summary, payload, status, created_at) "
    "values (cast(:id as uuid), cast(:user as uuid), 'bilan', 'weekly_review', :summary, "
    "cast(:payload as jsonb), cast(:status as public.automation_status), "
    "cast(:created_at as timestamptz))"
)

FROZEN_PAYLOAD = {
    "dedupeKey": "weekly:user:2026-W46",
    "weekKey": "2026-W46",
    "weekStart": "2026-11-09",
    "weekEnd": "2026-11-11",
    "nextWeekStart": "2026-11-16",
    "reviewOn": "2026-11-11T12:20:00.000Z",
    "studyMinutes": 810,
    "retention": {"horizonDays": 30, "rate": 86, "reviewed": 7, "successful": 6},
    "atRiskNotions": [{"notionId": NOTION_ID, "label": "La chlorophylle", "mastery": 42}],
    "atRiskCount": 1,
    "plan": [{"date": "2026-11-17", "minutes": 75, "slots": 2}],
    "planMinutes": 75,
    "channel": "app_email",
    "availabilityHref": "/parametres#rythme",
}


async def insert_review(
    tx: Any, *, action_id: str, user_id: str, payload: dict[str, Any], summary: str = "Bilan"
) -> None:
    await tx.conn.execute(
        INSERT_ACTION,
        {
            "id": action_id,
            "user": user_id,
            "summary": summary,
            "payload": json.dumps(payload),
            "status": "applied",
            "created_at": FIXED,
        },
    )


async def test_a_learner_without_a_review_gets_an_empty_state(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Adele", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        dto = await get_weekly_review(deps, actor_for(user), None)

        assert MeWeeklyReviewGetOutput.model_validate(dto) is not None
        assert dto == {"available": False, "review": None, "timezone": "Europe/Paris"}

    await rolled_back(database, run)


async def test_a_complete_payload_is_projected_as_frozen(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Bastien", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_review(tx, action_id=ACTION_ID, user_id=user, payload=FROZEN_PAYLOAD)

        dto = await get_weekly_review(deps, actor_for(user), None)

        assert MeWeeklyReviewGetOutput.model_validate(dto) is not None
        assert dto["available"] is True
        review = dto["review"]
        assert review["actionId"] == ACTION_ID
        assert review["status"] == "applied"
        assert review["createdAt"] == to_iso(FIXED)
        assert review["weekKey"] == "2026-W46"
        assert review["periodLabel"] == weekly_period_label("2026-11-09", "2026-11-11")
        assert review["receivedLabel"] == weekly_received_label(to_iso(FIXED), "Europe/Paris")
        assert review["studyMinutes"] == 810
        assert review["studyLabel"] == format_weekly_study(810)
        assert review["retentionLabel"] == weekly_retention_label(86)
        assert review["atRiskCount"] == 1
        assert review["planMinutes"] == 75
        assert review["channel"] == "app_email"
        assert review["availabilityQuestion"] is True
        assert review["availabilityHref"] == "/parametres#rythme"
        assert review["summary"] == "Bilan"

    await rolled_back(database, run)


async def test_a_partial_payload_is_recomputed_from_the_learner_rows(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chloe", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_review(tx, action_id=ACTION_ID, user_id=user, payload={"dedupeKey": "weekly:partial"})

        dto = await get_weekly_review(deps, actor_for(user), None)

        review = dto["review"]
        assert dto["available"] is True
        assert review["weekKey"] == "2026-W46"
        assert review["weekStart"] == "2026-11-09"
        assert review["weekEnd"] == "2026-11-11"
        assert review["nextWeekStart"] == "2026-11-16"
        assert review["studyMinutes"] == 0
        assert review["retention"] == {
            "horizonDays": 30,
            "rate": None,
            "reviewed": 0,
            "successful": 0,
        }
        assert review["retentionLabel"] == weekly_retention_label(None)
        assert review["atRiskNotions"] == []
        assert review["plan"] == []
        assert review["planMinutes"] == 0
        assert review["channel"] == "app"

    await rolled_back(database, run)


async def test_a_foreign_action_identifier_is_not_found(database: Database) -> None:
    async def run(tx: Any) -> None:
        owner = await create_user(tx.conn, "Diane", timezone="Europe/Paris")
        other = await create_user(tx.conn, "Elise", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_review(tx, action_id=OTHER_ACTION_ID, user_id=owner, payload=FROZEN_PAYLOAD)

        with pytest.raises(AppError) as foreign:
            await get_weekly_review(deps, actor_for(other), OTHER_ACTION_ID)
        with pytest.raises(AppError) as unknown:
            await get_weekly_review(deps, actor_for(other), ACTION_ID)

        assert foreign.value.code == "NOT_FOUND"
        assert unknown.value.code == "NOT_FOUND"

    await rolled_back(database, run)


async def test_one_own_review_can_be_read_by_identifier(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Fanny", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        await insert_review(tx, action_id=ACTION_ID, user_id=user, payload=FROZEN_PAYLOAD)

        dto = await get_weekly_review(deps, actor_for(user), ACTION_ID)

        assert dto["review"]["actionId"] == ACTION_ID

    await rolled_back(database, run)
