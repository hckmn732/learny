"""State summaries of the SDD demonstration pages (SPEC-2207).

Port of `packages/api-routes/src/dev-sdd/spec-{101,102,109,202,505}.ts`. A page reads the
demonstration database and answers the shape of its TypeScript loader; the fixtures the TypeScript
builds inside `withRollback` are built here in a transaction that is rolled back, so no page ever
mutates the database. The French texts of the pages live in `locale_fr/dev_sdd_fixtures.py`.
"""

import json
from typing import Any

from learny.identity import public as identity
from learny.platform.llm.catalog import AI_PROVIDERS, provider_region
from learny.shared.errors import AppError
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.shared.time import to_iso
from learny.tutor import public as tutor
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from starlette.responses import Response

from learny_api.dev_demos.guard import require_dev
from learny_api.dev_demos.support import demo_email, new_user, rolled_back, sqlstate_of
from learny_api.pipeline import Call

SET_CLAIMS = text(
    "select set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true)"
)

# --- SPEC-101 -----------------------------------------------------------------------------------

EXTENSIONS = ("pgcrypto", "vector", "unaccent", "pg_trgm")
ENUM_NAMES = ("course_language", "actor", "content_origin", "job_status")

SELECT_EXTENSIONS = text(
    "select extname as name, extversion as version from pg_extension "
    "where extname = any(cast(:names as text[])) order by extname"
)
SELECT_MIGRATIONS = text("select version, name from supabase_migrations.schema_migrations order by version")
SELECT_FUNCTIONS = text(
    "select p.proname as name, null::text as value from pg_proc p "
    "join pg_namespace n on n.oid = p.pronamespace "
    "where n.nspname = 'public' and p.proname in ('set_updated_at', 'immutable_unaccent') "
    "union all select 'immutable_unaccent_sample', public.immutable_unaccent(cast(:sample as text))"
)
SELECT_ENUMS = text(
    "select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values "
    "from pg_type t join pg_enum e on e.enumtypid = t.oid "
    "join pg_namespace n on n.oid = t.typnamespace "
    "where n.nspname = 'public' and t.typname = any(cast(:names as text[])) "
    "group by t.typname order by t.typname"
)
SELECT_IDENTITY = text("select auth.uid()::text as uid, current_user as role")

# --- SPEC-102 -----------------------------------------------------------------------------------

SELECT_DEMO_USER = text(
    "select id::text as id, email from auth.users where email like :pattern order by created_at desc limit 1"
)
DELETE_DEMO_USERS = text("delete from auth.users where email like :pattern")
SELECT_102_PROFILE = text(
    "select email, course_language::text as course_language, tutor_tone::text as tutor_tone, "
    "timezone, onboarding_step::text as onboarding_step from public.profiles "
    "where id = cast(:user_id as uuid)"
)
SELECT_102_STUDY = text(
    "select hours_per_day, study_days, preferred_slots from public.study_preferences "
    "where user_id = cast(:user_id as uuid)"
)
SELECT_102_NOTIFICATIONS = text(
    "select channel_email, channel_push, type_revision, type_validation, type_course, type_gap, "
    "type_planning, type_relaunch, digest_time, quiet_start, quiet_end, weekend_quiet, "
    "max_per_day from public.notification_settings where user_id = cast(:user_id as uuid)"
)
SELECT_102_AUTOMATIONS = text(
    "select key::text as key, enabled, params from public.automation_settings "
    "where user_id = cast(:user_id as uuid) order by key"
)
UPDATE_102_TIMEZONE = text(
    "update public.profiles set timezone = 'Mars/Olympus' where id = cast(:user_id as uuid)"
)
UPDATE_102_STUDY_DAYS = text(
    "update public.study_preferences set study_days = '{1,1}'::smallint[] "
    "where user_id = cast(:user_id as uuid)"
)
UPDATE_102_NOTIFICATION_SETTINGS = text(
    "update public.notification_settings set max_per_day = 4 where user_id = cast(:user_id as uuid)"
)
INSERT_102_PAUSE = text(
    "insert into public.pauses (user_id, starts_on, ends_on) values "
    "(cast(:user_id as uuid), cast(:starts_on as date), cast(:ends_on as date))"
)

# --- SPEC-109 -----------------------------------------------------------------------------------

INSERT_NOTIFICATION = text(
    "insert into public.notifications "
    "(user_id, type, title, body, href, icon, dedupe_key, created_at) values "
    "(cast(:user_id as uuid), cast(:type as public.notification_type), :title, :body, :href, "
    ":icon, :dedupe_key, cast(:created_at as timestamptz)) returning id::text as id"
)
MARK_NOTIFICATION_READ = text(
    "update public.notifications set read_at = cast(:read_at as timestamptz) where id = cast(:id as uuid)"
)
INSERT_DELIVERY = text(
    "insert into public.notification_deliveries "
    "(notification_id, channel, status, scheduled_for, sent_at, error) values "
    "(cast(:notification_id as uuid), cast(:channel as public.delivery_channel), "
    "cast(:status as public.delivery_status), cast(:scheduled_for as timestamptz), "
    "cast(:sent_at as timestamptz), :error)"
)
SELECT_NOTIFICATIONS = text(
    "select id::text as id, type::text as type, title, body, href, icon, created_at, read_at "
    "from public.notifications where user_id = cast(:user_id as uuid) "
    "order by created_at desc limit 10"
)
COUNT_UNREAD = text(
    "select count(*)::int as count from public.notifications "
    "where user_id = cast(:user_id as uuid) and read_at is null"
)
SELECT_DELIVERIES = text(
    "select d.id::text as id, n.title as notification_title, n.type::text as notification_type, "
    "d.channel::text as channel, d.status::text as status, d.scheduled_for, d.sent_at, d.error "
    "from public.notification_deliveries d join public.notifications n on n.id = d.notification_id "
    "where n.user_id = cast(:user_id as uuid) order by n.created_at desc, d.channel"
)

# --- SPEC-505 -----------------------------------------------------------------------------------

SELECT_505_PROFILE = text("select id::text as id from public.profiles where email = :email")
SELECT_505_STORAGE = text(
    "select octet_length(encrypted_key) as bytes, "
    "encode(substring(encrypted_key from 1 for 8), 'hex') as iv_hex "
    "from public.ai_credentials where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)"
)

DESTINATIONS: tuple[dict[str, Any], ...] = (
    {"id": "profil", "profile": {"onboardingStep": "profil", "deletionScheduledFor": None}},
    {"id": "rythme", "profile": {"onboardingStep": "rythme", "deletionScheduledFor": None}},
    {"id": "ia", "profile": {"onboardingStep": "ia", "deletionScheduledFor": None}},
    {"id": "done", "profile": {"onboardingStep": "done", "deletionScheduledFor": None}},
    {
        "id": "next",
        "profile": {"onboardingStep": "done", "deletionScheduledFor": None},
        "next": "/agenda",
    },
    {
        "id": "external",
        "profile": {"onboardingStep": "done", "deletionScheduledFor": None},
        "next": "//evil.example",
    },
    {
        "id": "deletion",
        "profile": {"onboardingStep": "done", "deletionScheduledFor": "2026-12-01T00:00:00Z"},
    },
)


def nothing() -> Response:
    """A demonstration that answers nothing sends the JSON `null` of the TypeScript handler."""
    return Response(content=b"null", media_type="application/json")


async def _sqlstate(conn: Any, name: str, statement: Any, params: dict[str, Any]) -> str:
    """Runs one probe inside a savepoint and returns its SQLSTATE (`00000` when accepted)."""
    await conn.execute(text(f"savepoint {name}"))
    try:
        await conn.execute(statement, params)
    except DBAPIError as error:
        await conn.execute(text(f"rollback to savepoint {name}"))
        return sqlstate_of(error)
    finally:
        await conn.execute(text(f"release savepoint {name}"))
    return "00000"


def _claims(actor: Any) -> str:
    """The Supabase claims of a demonstration identity (`buildUserClaims`)."""
    return json.dumps(
        {"sub": actor.user_id, "role": "authenticated", "aud": "authenticated", "email": actor.email},
        ensure_ascii=False,
        separators=(",", ":"),
    )


async def _identity(conn: Any, user_id: str) -> dict[str, Any]:
    """The `auth.uid()` and the role a learner's transaction sees.

    The claims and the role are set inside a savepoint that is rolled back, so the surrounding
    transaction keeps the owner role and no claim (the TypeScript `userDb` opens its own scope).
    """
    name = f"spec101_identity_{user_id.replace('-', '')}"
    actor = identity.Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    row: Any = None
    await conn.execute(text(f"savepoint {name}"))
    try:
        await conn.execute(SET_CLAIMS, {"claims": _claims(actor), "sub": user_id})
        await conn.execute(text("set local role authenticated"))
        row = (await conn.execute(SELECT_IDENTITY)).mappings().first()
    finally:
        await conn.execute(text(f"rollback to savepoint {name}"))
        await conn.execute(text(f"release savepoint {name}"))
    return {
        "uid": None if row is None else row["uid"],
        "role": "unknown" if row is None else str(row["role"]),
    }


async def _page_user(conn: Any, metadata: dict[str, Any]) -> str:
    """A throwaway account of a page, named after its first name."""
    email = f"spec-demo-{metadata.get('first_name', 'page')}@test.learny.test"
    return await new_user(conn, email=email, metadata=metadata)


async def _constraints(conn: Any) -> list[dict[str, Any]]:
    """The four integrity probes of SPEC-102 ET-4, each in its own savepoint."""
    user_id = await _page_user(conn, {"first_name": "Alex", "timezone": "Europe/Paris"})
    probes = (
        ("cl2", "22023", UPDATE_102_TIMEZONE, {"user_id": user_id}),
        ("cl3", "23514", UPDATE_102_STUDY_DAYS, {"user_id": user_id}),
        ("cl4", "23514", UPDATE_102_NOTIFICATION_SETTINGS, {"user_id": user_id}),
    )
    checks: list[dict[str, Any]] = []
    for index, (key, expected, statement, params) in enumerate(probes):
        found = await _sqlstate(conn, f"spec102_probe_{index}", statement, params)
        checks.append({"key": key, "expected": expected, "sqlstate": found, "ok": found == expected})
    await conn.execute(
        INSERT_102_PAUSE,
        {"user_id": user_id, "starts_on": "2026-11-12", "ends_on": "2026-11-20"},
    )
    found = await _sqlstate(
        conn,
        "spec102_probe_cl5",
        INSERT_102_PAUSE,
        {"user_id": user_id, "starts_on": "2026-11-21", "ends_on": "2026-11-25"},
    )
    checks.append({"key": "cl5", "expected": "23505", "sqlstate": found, "ok": found == "23505"})
    return checks


def _time(value: Any) -> str:
    """`time`: the `HH:MM` of a time of day."""
    return "" if value is None else str(value)[:5]


async def spec_101(call: Call) -> dict[str, Any]:
    """`devSddSpec101Demo`: the schema, the extensions and the identity each role gets."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        extensions = (await conn.execute(SELECT_EXTENSIONS, {"names": list(EXTENSIONS)})).mappings().all()
        migrations = (await conn.execute(SELECT_MIGRATIONS)).mappings().all()
        functions = (
            (await conn.execute(SELECT_FUNCTIONS, {"sample": fixture.UNACCENT_SAMPLE})).mappings().all()
        )
        enums = (await conn.execute(SELECT_ENUMS, {"names": list(ENUM_NAMES)})).mappings().all()
        user_a = await _page_user(conn, {"first_name": "A"})
        user_b = await _page_user(conn, {"first_name": "B"})
        identity_a = await _identity(conn, user_a)
        identity_b = await _identity(conn, user_b)
        service = (await conn.execute(SELECT_IDENTITY)).mappings().first()
    return {
        "extensions": [dict(row) for row in extensions],
        "migrations": [dict(row) for row in migrations],
        "functions": [dict(row) for row in functions],
        "enums": [dict(row) for row in enums],
        "rls": {
            "userA": {"id": user_a, "identity": identity_a},
            "userB": {"id": user_b, "identity": identity_b},
            "service": {
                "uid": None if service is None else service["uid"],
                "role": "unknown" if service is None else str(service["role"]),
            },
        },
    }


async def spec_102(call: Call) -> Any:
    """`devSddSpec102Demo`: the profile, the settings and the four integrity probes."""
    require_dev(call.deps)
    async with call.deps.db.service_tx() as tx:
        found = (
            (await tx.conn.execute(SELECT_DEMO_USER, {"pattern": fixture.DEMO_102_EMAIL_PATTERN}))
            .mappings()
            .first()
        )
        if found is None:
            return nothing()
        user_id = str(found["id"])
        email = str(found["email"])
        profile = (await tx.conn.execute(SELECT_102_PROFILE, {"user_id": user_id})).mappings().first()
        study = (await tx.conn.execute(SELECT_102_STUDY, {"user_id": user_id})).mappings().first()
        settings = (await tx.conn.execute(SELECT_102_NOTIFICATIONS, {"user_id": user_id})).mappings().first()
        automations = (await tx.conn.execute(SELECT_102_AUTOMATIONS, {"user_id": user_id})).mappings().all()
    if profile is None or study is None or settings is None:
        return nothing()
    async with rolled_back(call.deps) as probe:
        constraints = await _constraints(probe.conn)
    return {
        "email": email,
        "profile": {
            "email": str(profile["email"]),
            "courseLanguage": str(profile["course_language"]),
            "tutorTone": str(profile["tutor_tone"]),
            "timezone": str(profile["timezone"]),
            "onboardingStep": str(profile["onboarding_step"]),
        },
        "study": {
            "hoursPerDay": int(study["hours_per_day"]),
            "studyDays": list(study["study_days"] or []),
            "preferredSlots": list(study["preferred_slots"] or []),
        },
        "notifications": {
            "channelEmail": settings["channel_email"] is True,
            "channelPush": settings["channel_push"] is True,
            "types": {
                "revision": settings["type_revision"] is True,
                "validation": settings["type_validation"] is True,
                "course": settings["type_course"] is True,
                "gap": settings["type_gap"] is True,
                "planning": settings["type_planning"] is True,
                "relaunch": settings["type_relaunch"] is True,
            },
            "digestTime": _time(settings["digest_time"]),
            "quietStart": _time(settings["quiet_start"]),
            "quietEnd": _time(settings["quiet_end"]),
            "weekendQuiet": settings["weekend_quiet"] is True,
            "maxPerDay": int(settings["max_per_day"]),
        },
        "automations": [
            {"key": str(row["key"]), "enabled": row["enabled"] is True, "params": row["params"] or {}}
            for row in automations
        ],
        "constraints": constraints,
    }


async def spec_102_create(call: Call) -> Any:
    """`devSddSpec102Create`: creates the demonstration account once (EF-1)."""
    require_dev(call.deps)
    async with call.deps.db.service_tx() as tx:
        found = (
            (await tx.conn.execute(SELECT_DEMO_USER, {"pattern": fixture.DEMO_102_EMAIL_PATTERN}))
            .mappings()
            .first()
        )
        if found is None:
            metadata = {
                "first_name": fixture.DEMO_102_FIRST_NAME,
                "last_name": fixture.DEMO_102_LAST_NAME,
                "timezone": fixture.DEMO_102_TIMEZONE,
                "course_language": "fr",
            }
            await new_user(
                tx.conn,
                email=demo_email(call.deps.clock.now(), "spec102"),
                metadata=metadata,
            )
    return nothing()


async def spec_102_remove(call: Call) -> Any:
    """`devSddSpec102Remove`: the cascade removes the six dependent rows (EF-4)."""
    require_dev(call.deps)
    async with call.deps.db.service_tx() as tx:
        await tx.conn.execute(DELETE_DEMO_USERS, {"pattern": fixture.DEMO_102_EMAIL_PATTERN})
    return nothing()


async def spec_109(call: Call) -> dict[str, Any]:
    """`devSddSpec109Demo`: three notifications and their delivery journal (EF-6)."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user_id = await _page_user(conn, {"first_name": "Alex", "timezone": "Europe/Paris"})
        identifiers: dict[str, str] = {}
        for entry in fixture.DEMO_NOTIFICATIONS:
            row = (
                (
                    await conn.execute(
                        INSERT_NOTIFICATION,
                        {
                            "user_id": user_id,
                            "type": entry["type"],
                            "title": entry["title"],
                            "body": entry["body"],
                            "href": entry["href"],
                            "icon": entry["icon"],
                            "dedupe_key": entry["dedupeKey"],
                            "created_at": entry["createdAt"],
                        },
                    )
                )
                .mappings()
                .first()
            )
            if row is None:
                raise AppError("INTERNAL_ERROR")
            identifiers[str(entry["type"])] = str(row["id"])
        digest = identifiers["daily_digest"]
        await conn.execute(MARK_NOTIFICATION_READ, {"id": digest, "read_at": fixture.DEMO_DIGEST_READ_AT})
        for delivery in (
            ("email", "sent", None, fixture.DEMO_DIGEST_SENT_AT, None),
            ("push", "skipped_pref", None, None, fixture.NO_SUBSCRIPTION),
        ):
            await conn.execute(
                INSERT_DELIVERY,
                {
                    "notification_id": digest,
                    "channel": delivery[0],
                    "status": delivery[1],
                    "scheduled_for": delivery[2],
                    "sent_at": delivery[3],
                    "error": delivery[4],
                },
            )
        await conn.execute(
            INSERT_DELIVERY,
            {
                "notification_id": identifiers["new_gap"],
                "channel": "push",
                "status": "deferred_quiet",
                "scheduled_for": fixture.DEMO_QUIET_SCHEDULED_FOR,
                "sent_at": None,
                "error": None,
            },
        )
        await conn.execute(
            INSERT_DELIVERY,
            {
                "notification_id": identifiers["weekly_review"],
                "channel": "push",
                "status": "skipped_pref",
                "scheduled_for": None,
                "sent_at": None,
                "error": fixture.NO_SUBSCRIPTION,
            },
        )
        notifications = (await conn.execute(SELECT_NOTIFICATIONS, {"user_id": user_id})).mappings().all()
        unread = (await conn.execute(COUNT_UNREAD, {"user_id": user_id})).mappings().first()
        deliveries = (await conn.execute(SELECT_DELIVERIES, {"user_id": user_id})).mappings().all()
    unread_notifications = sum(1 for row in notifications if row["read_at"] is None)
    return {
        "unreadCount": 0 if unread is None else int(unread["count"]),
        "unreadNotifications": unread_notifications,
        "notifications": [
            {
                "id": str(row["id"]),
                "type": str(row["type"]),
                "title": str(row["title"]),
                "body": str(row["body"]),
                "href": str(row["href"]),
                "icon": str(row["icon"]),
                "createdAt": to_iso(row["created_at"]),
                "readAt": None if row["read_at"] is None else to_iso(row["read_at"]),
            }
            for row in notifications
        ],
        "deliveries": [
            {
                "id": str(row["id"]),
                "notificationTitle": str(row["notification_title"]),
                "notificationType": str(row["notification_type"]),
                "channel": str(row["channel"]),
                "status": str(row["status"]),
                "scheduledFor": (None if row["scheduled_for"] is None else to_iso(row["scheduled_for"])),
                "sentAt": None if row["sent_at"] is None else to_iso(row["sent_at"]),
                "error": row["error"],
            }
            for row in deliveries
        ],
    }


async def spec_202(call: Call) -> dict[str, Any]:
    """`devSddSpec202Demo`: the destination of the seven post-authentication profiles."""
    require_dev(call.deps)
    return {
        "destinations": [
            {
                "id": entry["id"],
                "value": identity.resolve_post_auth_destination(entry["profile"], entry.get("next")),
            }
            for entry in DESTINATIONS
        ]
    }


def _providers() -> list[dict[str, Any]]:
    """`providerOptions`: the six providers and the flags of the credential form."""
    return [
        {
            "value": provider,
            "label": provider_region(provider).provider_label,
            "outsideEu": provider_region(provider).outside_eu,
            "dataNote": provider_region(provider).data_note,
            "requiresBaseUrl": provider_region(provider).requires_base_url,
            "keyOptional": provider_region(provider).key_optional,
        }
        for provider in AI_PROVIDERS
    ]


async def spec_505(call: Call) -> dict[str, Any]:
    """`devSddSpec505Demo`: the credentials of the seeded account, never a plaintext key."""
    require_dev(call.deps)
    providers = _providers()
    missing: dict[str, Any] = {
        "credentials": [],
        "providers": providers,
        "storage": None,
        "rawJson": "{}",
        "error": fixture.DEMO_SEED_MISSING,
    }
    async with call.deps.db.service_tx() as tx:
        row = (
            (await tx.conn.execute(SELECT_505_PROFILE, {"email": fixture.DEMO_USER_EMAIL})).mappings().first()
        )
    if row is None:
        return missing
    actor = identity.Actor(
        user_id=str(row["id"]),
        email=fixture.DEMO_USER_EMAIL,
        email_confirmed=True,
        transport="bearer",
    )
    try:
        credentials = await tutor.list_credentials(call.deps, actor)
    except AppError as error:
        return {**missing, "error": error.detail}
    latest = credentials[-1] if credentials else None
    storage = None
    if latest is not None:
        async with call.deps.db.service_tx() as tx:
            stored = (
                (await tx.conn.execute(SELECT_505_STORAGE, {"id": latest["id"], "user_id": actor.user_id}))
                .mappings()
                .first()
            )
        if stored is not None and stored["bytes"] is not None and stored["iv_hex"] is not None:
            storage = {"bytes": int(stored["bytes"]), "ivHex": str(stored["iv_hex"])}
    return {
        "credentials": credentials,
        "providers": providers,
        "storage": storage,
        "rawJson": "{}" if latest is None else json.dumps(latest, indent=2, ensure_ascii=False),
        "error": None,
    }
