"""[SPEC-2205] The four job use cases against the local stack: digest, reminders and practice.

Every write is real and wrapped in the rolled-back service transaction. The assertions read the
stored rows and the pure domain renderers, never a hand-written notification text. The e-mail
channel captures in memory (`EMAIL_MODE=memory`) and the push channel is mocked, so nothing leaves
the process.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import (
    actor_for,
    count,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    one,
)
from learny.engagement.application.digest import (
    build_digest_data,
    plan_daily_digests,
    send_daily_digest,
)
from learny.engagement.application.practice_exercises import ensure_practice_exercise
from learny.engagement.application.reminders import (
    prune_validation_quiz_reminders,
    schedule_validation_quiz_reminder,
    sync_validation_quiz_reminders,
)
from learny.engagement.domain.reminders import validation_data
from learny.engagement.domain.templates import render_notification
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import parse_iso, to_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

DIGEST_AT = parse_iso("2026-11-11T07:00:00Z")
NOW = parse_iso("2026-11-11T12:20:00Z")
TABLE_LABEL = "\u00c9quilibre d\u2019une pi\u00e8ce"
QUIZ_15 = parse_iso("2026-11-11T14:00:00Z")
QUIZ_16 = parse_iso("2026-11-11T15:00:00Z")

INSERT_SLOT = text(
    "insert into public.schedule_slots "
    "(user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at, status, created_by) "
    "values (cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid), "
    "cast(:kind as slot_kind), :title, :meta, cast(:starts as timestamptz), "
    "cast(:ends as timestamptz), cast(:status as slot_status), 'planner') "
    "returning id::text as id"
)

INSERT_COURSE = text(
    "insert into public.courses (owner_id, formation_id, module_id, version, is_current, status) "
    "values (cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid), :version, "
    ":current, 'ready')"
)

INSERT_NOTIFICATION = text(
    "insert into public.notifications "
    "(user_id, type, title, body, href, icon, dedupe_key, created_at) "
    "values (cast(:user as uuid), 'milestone', :title, 'Body', '/accueil', 'award', :key, "
    "cast(:created as timestamptz)) returning id::text as id"
)

INSERT_DELIVERY = text(
    "insert into public.notification_deliveries "
    "(notification_id, channel, status, sent_at, error) "
    "values (cast(:notification as uuid), 'email', cast(:status as delivery_status), "
    "cast(:sent_at as timestamptz), null)"
)


async def active_user(tx: Any, first_name: str, *, timezone: str = "Europe/Paris") -> str:
    user = await create_user(tx.conn, first_name, timezone=timezone)
    await tx.conn.execute(
        text(
            "update public.profiles set onboarding_step = 'done', timezone = :timezone "
            "where id = cast(:user as uuid)"
        ),
        {"user": user, "timezone": timezone},
    )
    return user


async def learner(tx: Any, first_name: str) -> dict[str, str]:
    user = await active_user(tx, first_name)
    formation = await create_formation(tx.conn, user)
    module = await create_module(tx.conn, formation, 1)
    chapter = await create_chapter(tx.conn, formation, module)
    notion = await create_notion(tx.conn, formation, module, chapter)
    return {"user": user, "formation": formation, "module": module, "notion": notion}


async def add_slot(
    tx: Any,
    fixture: dict[str, str],
    *,
    kind: str,
    starts: Any,
    ends: Any,
    title: str = "Slot",
    meta: str | None = None,
    status: str = "planned",
    module: bool = True,
) -> str:
    result = await tx.conn.execute(
        INSERT_SLOT,
        {
            "user": fixture["user"],
            "formation": fixture["formation"],
            "module": fixture["module"] if module else None,
            "kind": kind,
            "title": title,
            "meta": meta,
            "starts": starts,
            "ends": ends,
            "status": status,
        },
    )
    return str(result.mappings().one()["id"])


async def set_digest_time(tx: Any, user: str, value: str) -> None:
    await tx.conn.execute(
        text(
            "update public.notification_settings set digest_time = cast(:value as time) "
            "where user_id = cast(:user as uuid)"
        ),
        {"user": user, "value": value},
    )


async def seed_capped(tx: Any, user: str, title: str, *, created: Any) -> None:
    notification = await tx.conn.execute(
        INSERT_NOTIFICATION,
        {"user": user, "title": title, "key": f"held:{title}", "created": created},
    )
    notification_id = str(notification.mappings().one()["id"])
    await tx.conn.execute(
        INSERT_DELIVERY,
        {"notification": notification_id, "status": "capped", "sent_at": None},
    )


async def seed_sent(tx: Any, user: str, title: str, *, created: Any, sent_at: Any) -> None:
    notification = await tx.conn.execute(
        INSERT_NOTIFICATION,
        {"user": user, "title": title, "key": f"sent:{title}", "created": created},
    )
    notification_id = str(notification.mappings().one()["id"])
    await tx.conn.execute(
        INSERT_DELIVERY,
        {"notification": notification_id, "status": "sent", "sent_at": sent_at},
    )


async def isolate_profiles(tx: Any, keep: list[str]) -> None:
    """Neutralises the learners seeded by other runs, inside the transaction that rolls back."""
    await tx.conn.execute(
        text("update public.profiles set onboarding_step = 'profil' where id <> all(cast(:keep as uuid[]))"),
        {"keep": keep},
    )


async def isolate_reminders(tx: Any, keep: list[str]) -> None:
    """Neutralises the reminders and planned quizzes seeded by other runs, for this transaction."""
    await tx.conn.execute(
        text(
            "delete from public.notifications "
            "where type = 'validation_soon' and user_id <> all(cast(:keep as uuid[]))"
        ),
        {"keep": keep},
    )
    await tx.conn.execute(
        text(
            "update public.schedule_slots set status = 'cancelled' "
            "where kind = 'validation_quiz' and status = 'planned' "
            "and user_id <> all(cast(:keep as uuid[]))"
        ),
        {"keep": keep},
    )


async def test_the_practice_exercise_is_created_once_per_notion_and_course_version(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Adele")
        await tx.conn.execute(
            text("update public.notions set label = :label where id = cast(:notion as uuid)"),
            {"notion": fixture["notion"], "label": TABLE_LABEL},
        )
        await tx.conn.execute(
            INSERT_COURSE,
            {
                "owner": fixture["user"],
                "formation": fixture["formation"],
                "module": fixture["module"],
                "version": 1,
                "current": True,
            },
        )
        deps = engagement_deps(tx)
        actor = actor_for(fixture["user"])

        first = await ensure_practice_exercise(deps, actor, fixture["notion"])
        assert first["created"] is True
        assert first["courseVersion"] == 1
        assert first["formationId"] == fixture["formation"]
        assert first["moduleId"] == fixture["module"]
        assert first["notionId"] == fixture["notion"]

        replay = await ensure_practice_exercise(deps, actor, fixture["notion"])
        assert replay["created"] is False
        assert replay["exerciseId"] == first["exerciseId"]

        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.bricks where owner_id = cast(:user as uuid)",
                user=fixture["user"],
            )
            == 1
        )
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.activities where owner_id = cast(:user as uuid)",
                user=fixture["user"],
            )
            == 1
        )
        payload = await one(
            tx.conn,
            "select v.payload from public.brick_versions v "
            "join public.bricks b on b.id = v.brick_id where b.owner_id = cast(:user as uuid)",
            user=fixture["user"],
        )
        instruction = payload["payload"]
        assert instruction["production"]["kind"] == "table"
        assert len(instruction["criteria"]) == 5
        config = await one(
            tx.conn,
            "select config, items from public.activities where owner_id = cast(:user as uuid)",
            user=fixture["user"],
        )
        activity = config["config"]
        assert activity["notionId"] == fixture["notion"]
        assert activity["courseVersion"] == 1
        assert activity["hintsMax"] == 2
        assert activity["threshold"] == 8
        assert activity["scoring"] == {"total": 10}
        assert len(config["items"]) == 1

        await tx.conn.execute(
            INSERT_COURSE,
            {
                "owner": fixture["user"],
                "formation": fixture["formation"],
                "module": fixture["module"],
                "version": 2,
                "current": True,
            },
        )
        upgraded = await ensure_practice_exercise(deps, actor, fixture["notion"])
        assert upgraded["created"] is True
        assert upgraded["courseVersion"] == 2
        assert upgraded["exerciseId"] != first["exerciseId"]

    await rolled_back(database, run)


async def test_a_practice_exercise_request_is_validated_and_scoped(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Bastien")
        other = await active_user(tx, "Chloe")
        deps = engagement_deps(tx)
        actor = actor_for(fixture["user"])

        with pytest.raises(AppError) as invalid:
            await ensure_practice_exercise(deps, actor, "not-a-uuid")
        assert invalid.value.code == "VALIDATION_FAILED"
        assert invalid.value.detail == fr.PRACTICE_NOTION_INVALID

        with pytest.raises(AppError) as unknown:
            await ensure_practice_exercise(deps, actor, "00000000-0000-4000-8000-0000000000ff")
        assert unknown.value.code == "NOT_FOUND"
        assert unknown.value.detail == fr.PRACTICE_NOTION_NOT_FOUND

        with pytest.raises(AppError) as foreign:
            await ensure_practice_exercise(deps, actor_for(other), fixture["notion"])
        assert foreign.value.code == "NOT_FOUND"

        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.activities where owner_id = cast(:user as uuid)",
                user=fixture["user"],
            )
            == 0
        )

    await rolled_back(database, run)


async def test_the_daily_digest_is_created_once_with_its_email(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Diane")
        await add_slot(
            tx,
            fixture,
            kind="course",
            starts=parse_iso("2026-11-11T08:00:00Z"),
            ends=parse_iso("2026-11-11T09:00:00Z"),
            title="Cours",
            meta="Module 1",
        )
        await add_slot(
            tx,
            fixture,
            kind="validation_quiz",
            starts=parse_iso("2026-11-11T14:00:00Z"),
            ends=parse_iso("2026-11-11T14:30:00Z"),
            title="Quiz",
        )
        deps = engagement_deps(tx, now=DIGEST_AT)

        data = await build_digest_data(deps, fixture["user"], "2026-11-11", "Europe/Paris")
        assert data["activityCount"] == 2
        assert len(data["activities"]) == 2
        assert data["activities"][0]["time"] == "09:00"
        assert data["activities"][1]["time"] == "15:00"
        assert data["globalQuiz"] is None
        assert data["held"] is None
        rendered = render_notification(
            "daily_digest",
            {**data, "href": "/aujourdhui", "formationTitle": None},
            "vous",
        )

        first = await send_daily_digest(deps, user_id=fixture["user"], at=DIGEST_AT, time_zone="Europe/Paris")
        assert first["created"] is True
        assert first["heldCount"] == 0
        row = await one(
            tx.conn,
            "select type::text as type, title, body, href, dedupe_key from public.notifications "
            "where id = cast(:id as uuid)",
            id=first["notificationId"],
        )
        assert row["type"] == "daily_digest"
        assert row["title"] == rendered["title"]
        assert row["body"] == rendered["body"]
        assert row["href"] == "/aujourdhui"
        assert row["dedupe_key"] == f"digest:{fixture['user']}:2026-11-11"
        deliveries = await one(
            tx.conn,
            "select channel, status from public.notification_deliveries "
            "where notification_id = cast(:id as uuid)",
            id=first["notificationId"],
        )
        assert deliveries["channel"] == "email"
        assert deliveries["status"] == "sent"
        assert len(deps.email.entries()) == 1
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.event_outbox where user_id = cast(:user as uuid)",
                user=fixture["user"],
            )
            == 1
        )

        replay = await send_daily_digest(
            deps, user_id=fixture["user"], at=DIGEST_AT, time_zone="Europe/Paris"
        )
        assert replay["created"] is False
        assert replay["notificationId"] == first["notificationId"]
        assert len(deps.email.entries()) == 1
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications "
                "where user_id = cast(:user as uuid) and type = 'daily_digest'",
                user=fixture["user"],
            )
            == 1
        )

    await rolled_back(database, run)


async def test_the_digest_lists_the_capped_sends_and_ignores_the_daily_cap(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Elise")
        await tx.conn.execute(
            text(
                "update public.notification_settings set max_per_day = 3 where user_id = cast(:user as uuid)"
            ),
            {"user": fixture["user"]},
        )
        await seed_capped(tx, fixture["user"], "Held one", created=parse_iso("2026-11-10T10:00:00Z"))
        await seed_capped(tx, fixture["user"], "Held two", created=parse_iso("2026-11-10T11:00:00Z"))
        for index in range(3):
            await seed_sent(
                tx,
                fixture["user"],
                f"Sent {index}",
                created=parse_iso("2026-11-11T06:00:00Z"),
                sent_at=parse_iso("2026-11-11T06:00:00Z"),
            )
        deps = engagement_deps(tx, now=DIGEST_AT)

        result = await send_daily_digest(
            deps, user_id=fixture["user"], at=DIGEST_AT, time_zone="Europe/Paris"
        )
        assert result["created"] is True
        assert result["heldCount"] == 2
        assert len(deps.email.entries()) == 1
        message = deps.email.entries()[0].message
        assert "Held one" in message.html
        assert "Held two" in message.html
        deliveries = await one(
            tx.conn,
            "select status::text as status from public.notification_deliveries "
            "where notification_id = cast(:id as uuid)",
            id=result["notificationId"],
        )
        assert deliveries["status"] == "sent"

    await rolled_back(database, run)


async def test_a_missing_profile_produces_no_digest(database: Database) -> None:
    async def run(tx: Any) -> None:
        deps = engagement_deps(tx, now=DIGEST_AT)
        result = await send_daily_digest(
            deps,
            user_id="00000000-0000-4000-8000-0000000000ee",
            at=DIGEST_AT,
            time_zone="Europe/Paris",
        )
        assert result == {"notificationId": None, "created": False, "heldCount": 0}
        assert deps.email.entries() == ()

    await rolled_back(database, run)


async def test_the_plan_selects_only_the_active_learners_due_in_the_window(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        tick = parse_iso("2026-11-11T07:00:00Z")
        due = await active_user(tx, "Fanny")
        outside = await active_user(tx, "Gaspard")
        onboarding = await create_user(tx.conn, "Hugo", timezone="Europe/Paris")
        deleted = await active_user(tx, "Iris")
        invalid_zone = await active_user(tx, "Jacques", timezone="Europe/Paris")
        await set_digest_time(tx, due, "08:00:00")
        await set_digest_time(tx, outside, "12:00:00")
        await set_digest_time(tx, onboarding, "08:00:00")
        await set_digest_time(tx, deleted, "08:00:00")
        await set_digest_time(tx, invalid_zone, "08:00:00")
        await tx.conn.execute(
            text(
                "update public.profiles set deletion_requested_at = cast(:day as timestamptz), "
                "deletion_scheduled_for = cast(:day as timestamptz) "
                "where id = cast(:user as uuid)"
            ),
            {"user": deleted, "day": parse_iso("2026-11-10T00:00:00Z")},
        )
        await tx.conn.execute(
            text("update public.profiles set timezone = 'US/Pacific' where id = cast(:user as uuid)"),
            {"user": invalid_zone},
        )
        await isolate_profiles(tx, [due, outside, onboarding, deleted, invalid_zone])
        deps = engagement_deps(tx, now=tick)

        plans = await plan_daily_digests(deps, tick)

        assert plans == [{"userId": due, "at": "2026-11-11T07:00:00.000Z", "timeZone": "Europe/Paris"}]
        assert await plan_daily_digests(deps, tick) == plans
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications where user_id = any("
                "array[cast(:due as uuid), cast(:outside as uuid), cast(:onboarding as uuid), "
                "cast(:deleted as uuid), cast(:invalid as uuid)])",
                due=due,
                outside=outside,
                onboarding=onboarding,
                deleted=deleted,
                invalid=invalid_zone,
            )
            == 0
        )
        await tx.conn.execute(text("update public.profiles set onboarding_step = 'profil'"))
        assert await plan_daily_digests(deps, tick) == []

    await rolled_back(database, run)


async def test_the_hourly_sync_creates_one_reminder_and_replays_without_duplicate(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Karine")
        slot = await add_slot(
            tx,
            fixture,
            kind="validation_quiz",
            starts=QUIZ_15,
            ends=parse_iso("2026-11-11T15:00:00Z"),
            title="Quiz de validation",
            module=False,
        )
        await isolate_reminders(tx, [fixture["user"]])
        deps = engagement_deps(tx, now=NOW)

        first = await sync_validation_quiz_reminders(deps)
        assert first == {"produced": 1, "created": 1, "cancelled": 0, "expired": 0}
        dedupe = f"validation_soon:{slot}:2026-11-11T14:00:00.000Z"
        row = await one(
            tx.conn,
            "select id::text as id, title, dedupe_key from public.notifications "
            "where user_id = cast(:user as uuid) and type = 'validation_soon'",
            user=fixture["user"],
        )
        assert row["dedupe_key"] == dedupe
        expected = render_notification(
            "validation_soon",
            validation_data(
                starts_at=QUIZ_15,
                formation_id=fixture["formation"],
                module_id=fixture["module"],
                module_title="Quiz de validation",
                minutes=None,
                time_zone="Europe/Paris",
                now=NOW,
            ),
            "vous",
        )
        assert row["title"] == expected["title"]
        deliveries = await one(
            tx.conn,
            "select status::text as status, scheduled_for from public.notification_deliveries "
            "where notification_id = cast(:id as uuid) and channel = 'email'",
            id=row["id"],
        )
        assert deliveries["status"] == "scheduled"
        assert to_iso(deliveries["scheduled_for"]) == "2026-11-11T13:20:00.000Z"
        assert deps.email.entries() == ()
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.event_outbox where user_id = cast(:user as uuid)",
                user=fixture["user"],
            )
            == 0
        )

        replay = await sync_validation_quiz_reminders(deps)
        assert replay["created"] == 0
        assert replay["produced"] == 1
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications "
                "where user_id = cast(:user as uuid) and type = 'validation_soon'",
                user=fixture["user"],
            )
            == 1
        )
        assert deps.email.entries() == ()

    await rolled_back(database, run)


async def test_a_reminder_in_the_past_is_not_sent_late(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Laura")
        slot = await add_slot(
            tx,
            fixture,
            kind="validation_quiz",
            starts=parse_iso("2026-11-11T12:40:00Z"),
            ends=parse_iso("2026-11-11T13:40:00Z"),
            title="Quiz passe",
        )
        deps = engagement_deps(tx, now=NOW)

        outcome = await schedule_validation_quiz_reminder(
            deps,
            {
                "userId": fixture["user"],
                "formationId": fixture["formation"],
                "slotId": slot,
                "startsAt": "2026-11-11T12:40:00.000Z",
                "timezone": "Europe/Paris",
            },
        )

        assert outcome["expired"] is True
        assert outcome["created"] is False
        assert outcome["notificationId"] is None
        assert outcome["schedule"]["eligibleAt"] == "2026-11-11T12:00:00.000Z"
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications where user_id = cast(:user as uuid)",
                user=fixture["user"],
            )
            == 0
        )
        assert deps.email.entries() == ()

    await rolled_back(database, run)


async def test_moving_a_slot_cancels_the_previous_unsent_reminder(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Manon")
        slot = await add_slot(
            tx,
            fixture,
            kind="validation_quiz",
            starts=QUIZ_15,
            ends=parse_iso("2026-11-11T15:00:00Z"),
            title="Quiz",
        )
        await isolate_reminders(tx, [fixture["user"]])
        deps = engagement_deps(tx, now=NOW)
        first = await schedule_validation_quiz_reminder(
            deps,
            {
                "userId": fixture["user"],
                "slotId": slot,
                "startsAt": "2026-11-11T14:00:00.000Z",
                "timezone": "Europe/Paris",
            },
        )
        assert first["created"] is True

        await tx.conn.execute(
            text(
                "update public.schedule_slots set starts_at = cast(:starts as timestamptz), "
                "ends_at = cast(:ends as timestamptz) where id = cast(:slot as uuid)"
            ),
            {"slot": slot, "starts": QUIZ_16, "ends": parse_iso("2026-11-11T16:00:00Z")},
        )
        summary = await sync_validation_quiz_reminders(deps)
        assert summary["cancelled"] == 1
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications "
                "where user_id = cast(:user as uuid) and type = 'validation_soon'",
                user=fixture["user"],
            )
            == 0
        )

        moved = await schedule_validation_quiz_reminder(
            deps,
            {
                "userId": fixture["user"],
                "slotId": slot,
                "startsAt": "2026-11-11T15:00:00.000Z",
                "timezone": "Europe/Paris",
            },
        )
        assert moved["created"] is True
        assert moved["schedule"]["dedupeKey"] == (f"validation_soon:{slot}:2026-11-11T15:00:00.000Z")
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications "
                "where user_id = cast(:user as uuid) and type = 'validation_soon'",
                user=fixture["user"],
            )
            == 1
        )

    await rolled_back(database, run)


async def test_a_delivered_reminder_stays_in_the_history(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Nadia")
        slot = await add_slot(
            tx,
            fixture,
            kind="validation_quiz",
            starts=QUIZ_15,
            ends=parse_iso("2026-11-11T15:00:00Z"),
            title="Quiz",
        )
        await isolate_reminders(tx, [fixture["user"]])
        deps = engagement_deps(tx, now=NOW)
        first = await schedule_validation_quiz_reminder(
            deps,
            {
                "userId": fixture["user"],
                "slotId": slot,
                "startsAt": "2026-11-11T14:00:00.000Z",
                "timezone": "Europe/Paris",
            },
        )
        assert first["notificationId"] is not None
        await tx.conn.execute(
            text(
                "update public.notification_deliveries set status = 'sent', "
                "sent_at = cast(:at as timestamptz) where notification_id = cast(:id as uuid)"
            ),
            {"id": first["notificationId"], "at": parse_iso("2026-11-11T13:20:00Z")},
        )
        await tx.conn.execute(
            text("delete from public.schedule_slots where id = cast(:slot as uuid)"),
            {"slot": slot},
        )
        cancelled = await prune_validation_quiz_reminders(deps, fixture["user"])
        assert cancelled == 0
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.notifications where id = cast(:id as uuid)",
                id=first["notificationId"],
            )
            == 1
        )

    await rolled_back(database, run)


async def test_a_stale_start_and_an_invalid_zone_are_refused(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await learner(tx, "Olivia")
        slot = await add_slot(
            tx,
            fixture,
            kind="validation_quiz",
            starts=QUIZ_15,
            ends=parse_iso("2026-11-11T15:00:00Z"),
            title="Quiz",
        )
        deps = engagement_deps(tx, now=NOW)
        request = {
            "userId": fixture["user"],
            "slotId": slot,
            "startsAt": "2026-11-11T15:00:00.000Z",
            "timezone": "Europe/Paris",
        }

        with pytest.raises(AppError) as conflict:
            await schedule_validation_quiz_reminder(deps, request)
        assert conflict.value.code == "CONFLICT"
        assert conflict.value.detail == fr.REMINDER_SLOT_MOVED
        assert conflict.value.extra["errors"][0]["path"] == "startsAt"
        assert conflict.value.extra["errors"][0]["message"] == "2026-11-11T14:00:00.000Z"

        with pytest.raises(AppError) as invalid:
            await schedule_validation_quiz_reminder(deps, {**request, "slotId": "nope"})
        assert invalid.value.code == "VALIDATION_FAILED"
        assert invalid.value.detail == fr.REMINDER_INVALID

        await tx.conn.execute(
            text("update public.profiles set timezone = 'US/Pacific' where id = cast(:user as uuid)"),
            {"user": fixture["user"]},
        )
        with pytest.raises(AppError) as zone:
            await schedule_validation_quiz_reminder(deps, request)
        assert zone.value.code == "VALIDATION_FAILED"
        assert zone.value.detail == fr.TIMEZONE_INVALID

        with pytest.raises(AppError) as missing:
            await schedule_validation_quiz_reminder(
                deps,
                {**request, "userId": "00000000-0000-4000-8000-0000000000dd"},
            )
        assert missing.value.code == "NOT_FOUND"
        assert missing.value.detail == fr.REMINDER_PROFILE_NOT_FOUND
        assert deps.email.entries() == ()

    await rolled_back(database, run)


async def test_an_empty_hour_produces_no_reminder(database: Database) -> None:
    async def run(tx: Any) -> None:
        await isolate_reminders(tx, [])
        deps = engagement_deps(tx, now=NOW)
        summary = await sync_validation_quiz_reminders(deps)
        assert summary == {"produced": 0, "created": 0, "cancelled": 0, "expired": 0}

    await rolled_back(database, run)
