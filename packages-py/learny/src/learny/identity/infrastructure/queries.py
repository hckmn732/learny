"""SQL of the identity context (SPEC-2201).

Nothing here reads the clock: an instant is always a parameter.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

# --------------------------------------------------------------------------------------------------
# profiles
# --------------------------------------------------------------------------------------------------

READ_ME = text(
    """
    select id::text as id,
           email,
           first_name,
           last_name,
           tutor_tone::text as tutor_tone,
           course_language::text as course_language,
           timezone,
           onboarding_step::text as onboarding_step,
           onboarding_completed_at,
           current_formation_id::text as current_formation_id
      from public.profiles
     where id = cast(:user_id as uuid)
    """
)

READ_PROFILE_STATE = text(
    """
    select p.updated_at as updated_at,
           p.created_at as created_at,
           p.deletion_scheduled_for as deletion_scheduled_for,
           (select count(*)::int from public.formations f
             where (f.owner_id = cast(:user_id as uuid)
                    or (f.group_id is not null and public.is_group_member(f.group_id)))
               and f.status = 'active') as active_formation_count
      from public.profiles p
     where p.id = cast(:user_id as uuid)
    """
)

READ_PROFILE_FOR_UPDATE = text(
    """
    select onboarding_step::text as onboarding_step,
           onboarding_completed_at,
           updated_at
      from public.profiles
     where id = cast(:user_id as uuid)
       for update
    """
)

READ_SIDEBAR_PROFILE = text(
    """
    select current_formation_id::text as current_formation_id,
           sidebar_collapsed,
           timezone,
           streak_days
    from public.profiles
    where id = cast(:user_id as uuid)
    """
)

UPDATE_PROFILE_STEP = text(
    """
    update public.profiles
    set onboarding_step = cast(:step as public.onboarding_step),
        onboarding_completed_at = cast(:completed_at as timestamptz),
        updated_at = cast(:now as timestamptz)
    where id = cast(:user_id as uuid)
    """
)

UPDATE_SIDEBAR_COLLAPSED = text(
    """
    update public.profiles
    set sidebar_collapsed = :collapsed
    where id = cast(:user_id as uuid)
    """
)

UPDATE_CURRENT_FORMATION = text(
    """
    update public.profiles
    set current_formation_id = cast(:formation_id as uuid)
    where id = cast(:user_id as uuid)
    """
)

UPDATE_TERMS = text(
    """
    update public.profiles
    set terms_version = :terms_version,
        terms_accepted_at = cast(:accepted_at as timestamptz),
        updated_at = cast(:accepted_at as timestamptz)
    where id = cast(:user_id as uuid)
    """
)

# `PATCH /me` column map of `updateProfile`: only the provided fields are written.
PROFILE_COLUMNS: Mapping[str, tuple[str, str]] = {
    "firstName": ("first_name", "text"),
    "lastName": ("last_name", "text"),
    "tutorTone": ("tutor_tone", "public.tutor_tone"),
    "courseLanguage": ("course_language", "public.course_language"),
    "timezone": ("timezone", "text"),
}


@dataclass(frozen=True, slots=True)
class MeRow:
    """One `public.profiles` row, as the `MeDto` reads it."""

    id: str
    email: str
    first_name: str | None
    last_name: str | None
    tutor_tone: str
    course_language: str
    timezone: str
    onboarding_step: str
    onboarding_completed_at: datetime | None
    current_formation_id: str | None


@dataclass(frozen=True, slots=True)
class ProfileStateRow:
    """Version, creation, pending deletion and active formations of the settings screen."""

    updated_at: datetime
    created_at: datetime
    deletion_scheduled_for: datetime | None
    active_formation_count: int


@dataclass(frozen=True, slots=True)
class LockedProfileRow:
    """The profile row locked by `for update` before a monotone onboarding step."""

    onboarding_step: str
    onboarding_completed_at: datetime | None
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class SidebarProfileRow:
    """Fields of `profiles` the sidebar renders."""

    current_formation_id: str | None
    sidebar_collapsed: bool
    timezone: str
    streak_days: int


def _row(mapping: Mapping[str, Any] | None) -> Mapping[str, Any] | None:
    return mapping


async def read_me(tx: Tx, user_id: str) -> MeRow | None:
    result = await tx.conn.execute(READ_ME, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return MeRow(
        id=str(row["id"]),
        email=str(row["email"]),
        first_name=row["first_name"],
        last_name=row["last_name"],
        tutor_tone=str(row["tutor_tone"]),
        course_language=str(row["course_language"]),
        timezone=str(row["timezone"]),
        onboarding_step=str(row["onboarding_step"]),
        onboarding_completed_at=row["onboarding_completed_at"],
        current_formation_id=row["current_formation_id"],
    )


async def read_profile_state(tx: Tx, user_id: str) -> ProfileStateRow | None:
    result = await tx.conn.execute(READ_PROFILE_STATE, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return ProfileStateRow(
        updated_at=row["updated_at"],
        created_at=row["created_at"],
        deletion_scheduled_for=row["deletion_scheduled_for"],
        active_formation_count=int(row["active_formation_count"]),
    )


async def lock_profile(tx: Tx, user_id: str) -> LockedProfileRow | None:
    result = await tx.conn.execute(READ_PROFILE_FOR_UPDATE, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return LockedProfileRow(
        onboarding_step=str(row["onboarding_step"]),
        onboarding_completed_at=row["onboarding_completed_at"],
        updated_at=row["updated_at"],
    )


async def read_sidebar_profile(tx: Tx, user_id: str) -> SidebarProfileRow | None:
    result = await tx.conn.execute(READ_SIDEBAR_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return SidebarProfileRow(
        current_formation_id=row["current_formation_id"],
        sidebar_collapsed=bool(row["sidebar_collapsed"]),
        timezone=str(row["timezone"]),
        streak_days=int(row["streak_days"]),
    )


async def update_profile_fields(
    tx: Tx,
    user_id: str,
    values: Mapping[str, Any],
    updated_at: datetime,
) -> bool:
    """`updateProfile`: writes only the provided fields; False when the profile does not exist."""
    assignments = ["updated_at = cast(:updated_at as timestamptz)"]
    parameters: dict[str, Any] = {"user_id": user_id, "updated_at": updated_at}
    for key, value in values.items():
        entry = PROFILE_COLUMNS.get(key)
        if entry is None:
            continue
        column, sql_type = entry
        assignments.append(f"{column} = cast(:{key} as {sql_type})")
        parameters[key] = value
    statement = text(
        "update public.profiles set "  # noqa: S608 - columns come from the fixed PROFILE_COLUMNS map
        + ", ".join(assignments)
        + " where id = cast(:user_id as uuid)"
    )
    result = await tx.conn.execute(statement, parameters)
    return result.rowcount > 0


async def update_onboarding_step(
    tx: Tx,
    user_id: str,
    step: str,
    completed_at: datetime | None,
    now: datetime,
) -> None:
    await tx.conn.execute(
        UPDATE_PROFILE_STEP,
        {"user_id": user_id, "step": step, "completed_at": completed_at, "now": now},
    )


async def update_sidebar_collapsed(tx: Tx, user_id: str, collapsed: bool) -> None:
    await tx.conn.execute(UPDATE_SIDEBAR_COLLAPSED, {"user_id": user_id, "collapsed": collapsed})


async def update_current_formation(tx: Tx, user_id: str, formation_id: str) -> None:
    await tx.conn.execute(UPDATE_CURRENT_FORMATION, {"user_id": user_id, "formation_id": formation_id})


async def update_terms(tx: Tx, user_id: str, terms_version: str, accepted_at: datetime) -> None:
    await tx.conn.execute(
        UPDATE_TERMS,
        {"user_id": user_id, "terms_version": terms_version, "accepted_at": accepted_at},
    )


# --------------------------------------------------------------------------------------------------
# study preferences
# --------------------------------------------------------------------------------------------------

READ_PREFERENCES = text(
    """
    select hours_per_day, study_days, preferred_slots::text[] as preferred_slots
    from public.study_preferences
    where user_id = cast(:user_id as uuid)
    """
)

UPSERT_PREFERENCES = text(
    """
    insert into public.study_preferences (
      user_id, hours_per_day, study_days, preferred_slots, updated_at
    )
    values (
      cast(:user_id as uuid), :hours_per_day, cast(:study_days as smallint[]),
      cast(:preferred_slots as public.study_slot[]), cast(:now as timestamptz)
    )
    on conflict (user_id) do update
    set hours_per_day = excluded.hours_per_day,
        study_days = excluded.study_days,
        preferred_slots = excluded.preferred_slots,
        updated_at = excluded.updated_at
    returning hours_per_day, study_days, preferred_slots::text[] as preferred_slots
    """
)


@dataclass(frozen=True, slots=True)
class PreferenceRow:
    """The learner's study rhythm."""

    hours_per_day: int
    study_days: list[int]
    preferred_slots: list[str]


async def read_preferences(tx: Tx, user_id: str) -> PreferenceRow | None:
    result = await tx.conn.execute(READ_PREFERENCES, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return PreferenceRow(
        hours_per_day=int(row["hours_per_day"]),
        study_days=[int(day) for day in row["study_days"]],
        preferred_slots=[str(slot) for slot in row["preferred_slots"]],
    )


async def upsert_preferences(
    tx: Tx,
    user_id: str,
    hours_per_day: int,
    study_days: list[int],
    preferred_slots: list[str],
    now: datetime,
) -> PreferenceRow | None:
    result = await tx.conn.execute(
        UPSERT_PREFERENCES,
        {
            "user_id": user_id,
            "hours_per_day": hours_per_day,
            "study_days": study_days,
            "preferred_slots": preferred_slots,
            "now": now,
        },
    )
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return PreferenceRow(
        hours_per_day=int(row["hours_per_day"]),
        study_days=[int(day) for day in row["study_days"]],
        preferred_slots=[str(slot) for slot in row["preferred_slots"]],
    )


# --------------------------------------------------------------------------------------------------
# notification settings and automations (onboarding reminders)
# --------------------------------------------------------------------------------------------------

READ_NOTIFICATION_SETTINGS = text(
    """
    select channel_email, channel_push
    from public.notification_settings
    where user_id = cast(:user_id as uuid)
    """
)

READ_AUTOMATION_SETTINGS = text(
    """
    select key::text as key, enabled
    from public.automation_settings
    where user_id = cast(:user_id as uuid)
      and key = any(cast(:keys as public.automation_key[]))
    """
)

UPSERT_NOTIFICATION_SETTINGS = text(
    """
    insert into public.notification_settings (user_id, channel_push, channel_email, updated_at)
    values (cast(:user_id as uuid), :push, :email, cast(:now as timestamptz))
    on conflict (user_id) do update
    set channel_push = excluded.channel_push,
        channel_email = excluded.channel_email,
        updated_at = excluded.updated_at
    """
)

UPSERT_AUTOMATION_SETTING = text(
    """
    insert into public.automation_settings (user_id, key, enabled, params, updated_at)
    values (
      cast(:user_id as uuid), cast(:key as public.automation_key), :enabled,
      cast(:params as jsonb), cast(:now as timestamptz)
    )
    on conflict (user_id, key) do update
    set enabled = excluded.enabled,
        updated_at = excluded.updated_at
    """
)


@dataclass(frozen=True, slots=True)
class NotificationSettingsRow:
    """The two reminder channels of the onboarding screen."""

    channel_email: bool
    channel_push: bool


async def read_notification_settings(tx: Tx, user_id: str) -> NotificationSettingsRow | None:
    result = await tx.conn.execute(READ_NOTIFICATION_SETTINGS, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return NotificationSettingsRow(
        channel_email=bool(row["channel_email"]),
        channel_push=bool(row["channel_push"]),
    )


async def read_automation_settings(tx: Tx, user_id: str, keys: list[str]) -> dict[str, bool]:
    result = await tx.conn.execute(READ_AUTOMATION_SETTINGS, {"user_id": user_id, "keys": keys})
    return {str(row["key"]): bool(row["enabled"]) for row in result.mappings().all()}


async def upsert_notification_settings(
    tx: Tx,
    user_id: str,
    push: bool,
    email: bool,
    now: datetime,
) -> None:
    await tx.conn.execute(
        UPSERT_NOTIFICATION_SETTINGS,
        {"user_id": user_id, "push": push, "email": email, "now": now},
    )


async def upsert_automation_setting(
    tx: Tx,
    user_id: str,
    key: str,
    enabled: bool,
    params: Mapping[str, Any],
    now: datetime,
) -> None:
    await tx.conn.execute(
        UPSERT_AUTOMATION_SETTING,
        {
            "user_id": user_id,
            "key": key,
            "enabled": enabled,
            "params": json.dumps(dict(params), ensure_ascii=False),
            "now": now,
        },
    )


# --------------------------------------------------------------------------------------------------
# AI credentials and task assignments
# --------------------------------------------------------------------------------------------------

READ_CREDENTIAL_MODELS = text(
    """
    select model_ids
    from public.ai_credentials
    where id = cast(:credential_id as uuid)
      and user_id = cast(:user_id as uuid)
    limit 1
    """
)

UPSERT_TASK_MODEL = text(
    """
    insert into public.ai_task_models (user_id, task, credential_id, model_id)
    values (
      cast(:user_id as uuid), cast(:task as public.ai_task),
      cast(:credential_id as uuid), :model_id
    )
    on conflict (user_id, task) do update
    set credential_id = excluded.credential_id,
        model_id = excluded.model_id
    """
)

COUNT_QUALIFIED_TASKS = text(
    """
    select count(distinct tm.task)::int as tasks
    from public.ai_task_models tm
    join public.ai_credentials c
      on c.id = tm.credential_id
     and c.user_id = cast(:user_id as uuid)
     and c.status = 'qualified'
    where tm.user_id = cast(:user_id as uuid)
    """
)


async def read_credential_models(tx: Tx, user_id: str, credential_id: str) -> list[str] | None:
    result = await tx.conn.execute(
        READ_CREDENTIAL_MODELS, {"user_id": user_id, "credential_id": credential_id}
    )
    found = result.mappings().all()
    if not found:
        return None
    return [str(model) for model in found[0]["model_ids"]]


async def upsert_task_model(
    tx: Tx,
    user_id: str,
    task: str,
    credential_id: str,
    model_id: str,
) -> None:
    await tx.conn.execute(
        UPSERT_TASK_MODEL,
        {"user_id": user_id, "task": task, "credential_id": credential_id, "model_id": model_id},
    )


async def count_qualified_tasks(tx: Tx, user_id: str) -> int:
    result = await tx.conn.execute(COUNT_QUALIFIED_TASKS, {"user_id": user_id})
    return int(result.mappings().all()[0]["tasks"])


# --------------------------------------------------------------------------------------------------
# legal acceptances
# --------------------------------------------------------------------------------------------------

INSERT_LEGAL_ACCEPTANCE = text(
    """
    insert into public.legal_acceptances (user_id, document, version, accepted_at)
    values (
      cast(:user_id as uuid), cast(:document as public.legal_document), :version,
      cast(:accepted_at as timestamptz)
    )
    on conflict (user_id, document, version) do nothing
    returning accepted_at
    """
)

READ_LEGAL_ACCEPTANCE = text(
    """
    select accepted_at
    from public.legal_acceptances
    where user_id = cast(:user_id as uuid)
      and document = cast(:document as public.legal_document)
      and version = :version
    """
)


@dataclass(frozen=True, slots=True)
class LegalAcceptanceRow:
    """The traceable instant of one accepted document version."""

    accepted_at: datetime


async def insert_legal_acceptance(
    tx: Tx,
    user_id: str,
    document: str,
    version: str,
    accepted_at: datetime,
) -> LegalAcceptanceRow | None:
    """Inserts once; None when the pair already exists (the caller then reads the original row)."""
    result = await tx.conn.execute(
        INSERT_LEGAL_ACCEPTANCE,
        {
            "user_id": user_id,
            "document": document,
            "version": version,
            "accepted_at": accepted_at,
        },
    )
    found = result.mappings().all()
    if not found:
        return None
    return LegalAcceptanceRow(accepted_at=found[0]["accepted_at"])


async def read_legal_acceptance(
    tx: Tx,
    user_id: str,
    document: str,
    version: str,
) -> LegalAcceptanceRow | None:
    result = await tx.conn.execute(
        READ_LEGAL_ACCEPTANCE, {"user_id": user_id, "document": document, "version": version}
    )
    found = result.mappings().all()
    if not found:
        return None
    return LegalAcceptanceRow(accepted_at=found[0]["accepted_at"])


# --------------------------------------------------------------------------------------------------
# data exports
# --------------------------------------------------------------------------------------------------

READ_DESTINATION_PROFILE = text(
    """
    select onboarding_step::text as onboarding_step,
           deletion_scheduled_for
      from public.profiles
     where id = cast(:user_id as uuid)
    """
)

COUNT_LEGAL_ACCEPTANCES = text(
    """
    select count(*)::int as count
      from public.legal_acceptances
     where user_id = cast(:user_id as uuid)
    """
)

READ_SIGNUP_METADATA = text(
    """
    select raw_user_meta_data as meta
      from auth.users
     where id = cast(:user_id as uuid)
    """
)

KNOWN_TIME_ZONE = text(
    """
    select exists (select 1 from pg_catalog.pg_timezone_names where name = :name) as ok
    """
)

UPDATE_TERMS_AND_TIMEZONE = text(
    """
    update public.profiles
       set terms_version = :terms_version,
           terms_accepted_at = cast(:accepted_at as timestamptz),
           timezone = coalesce(:time_zone, timezone)
     where id = cast(:user_id as uuid)
    """
)


READ_LATEST_EXPORT = text(
    """
    select id::text as id,
           status::text as status,
           size_bytes,
           created_at,
           expires_at
    from public.data_exports
    where user_id = cast(:user_id as uuid)
    order by created_at desc
    limit 1
    """
)


@dataclass(frozen=True, slots=True)
class ExportRow:
    """The latest data export of the settings screen."""

    id: str
    status: str
    size_bytes: int | None
    created_at: datetime
    expires_at: datetime | None


async def read_latest_export(tx: Tx, user_id: str) -> ExportRow | None:
    result = await tx.conn.execute(READ_LATEST_EXPORT, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    row = found[0]
    return ExportRow(
        id=str(row["id"]),
        status=str(row["status"]),
        size_bytes=int(row["size_bytes"]) if row["size_bytes"] is not None else None,
        created_at=row["created_at"],
        expires_at=row["expires_at"],
    )


# --------------------------------------------------------------------------------------------------
# sidebar formations and counters
# --------------------------------------------------------------------------------------------------

READ_SIDEBAR_FORMATIONS = text(
    """
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent_color,
           f.status::text as status,
           count(m.id)::int as module_count,
           count(m.id) filter (where m.status = 'validated')::int as validated_count,
           max(m.position) filter (where m.status = 'open')::int as open_position
    from public.formations f
    left join public.modules m on m.formation_id = f.id
    where (
        f.owner_id = cast(:user_id as uuid)
        or (f.group_id is not null and public.is_group_member(f.group_id))
      )
      and f.status in ('active', 'paused')
    group by f.id, f.title, f.monogram, f.accent_color, f.status, f.last_opened_at, f.created_at
    order by f.last_opened_at desc nulls last, f.created_at desc
    """
)

READ_SIDEBAR_COUNTERS = text(
    """
    select count(*) filter (
             where ns.in_review and ns.due_at is not null
               and ns.due_at <= cast(:now as timestamptz)
           )::int as due_count,
           count(*) filter (
             where ns.gap_nature is not null and ns.gap_cleared_at is null
           )::int as gap_count
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = cast(:user_id as uuid)
      and n.formation_id = cast(:formation_id as uuid)
    """
)

READ_DAILY_ACTIVITY = text(
    """
    select day::text as day, minutes, qualifying
    from public.daily_activity
    where user_id = cast(:user_id as uuid)
      and day between cast(:first as date) and cast(:today as date)
    """
)

READ_SELECTABLE_FORMATION = text(
    """
    select f.id::text as id
    from public.formations f
    where f.id = cast(:formation_id as uuid)
      and (
        f.owner_id = cast(:user_id as uuid)
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = cast(:user_id as uuid)
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
      and f.status in ('active', 'paused', 'completed')
    """
)


@dataclass(frozen=True, slots=True)
class SidebarFormationRow:
    """One formation of the sidebar switcher."""

    id: str
    title: str
    monogram: str | None
    accent_color: str
    status: str
    module_count: int
    validated_count: int
    open_position: int | None


@dataclass(frozen=True, slots=True)
class SidebarCounterRow:
    """Due reviews and open gaps of the current formation."""

    due_count: int
    gap_count: int


@dataclass(frozen=True, slots=True)
class ActivityRow:
    """One civil day of the regularity strip."""

    day: str
    minutes: int
    qualifying: bool


async def read_sidebar_formations(tx: Tx, user_id: str) -> list[SidebarFormationRow]:
    result = await tx.conn.execute(READ_SIDEBAR_FORMATIONS, {"user_id": user_id})
    return [
        SidebarFormationRow(
            id=str(row["id"]),
            title=str(row["title"]),
            monogram=row["monogram"],
            accent_color=str(row["accent_color"]),
            status=str(row["status"]),
            module_count=int(row["module_count"]),
            validated_count=int(row["validated_count"]),
            open_position=int(row["open_position"]) if row["open_position"] is not None else None,
        )
        for row in result.mappings().all()
    ]


async def read_sidebar_counters(tx: Tx, user_id: str, formation_id: str, now: datetime) -> SidebarCounterRow:
    result = await tx.conn.execute(
        READ_SIDEBAR_COUNTERS,
        {"user_id": user_id, "formation_id": formation_id, "now": now},
    )
    found = result.mappings().all()
    if not found:
        return SidebarCounterRow(due_count=0, gap_count=0)
    row = found[0]
    return SidebarCounterRow(
        due_count=int(row["due_count"]),
        gap_count=int(row["gap_count"]),
    )


async def read_daily_activity(tx: Tx, user_id: str, first: str, today: str) -> list[ActivityRow]:
    result = await tx.conn.execute(READ_DAILY_ACTIVITY, {"user_id": user_id, "first": first, "today": today})
    return [
        ActivityRow(day=str(row["day"]), minutes=int(row["minutes"]), qualifying=bool(row["qualifying"]))
        for row in result.mappings().all()
    ]


async def read_selectable_formation(tx: Tx, user_id: str, formation_id: str | None) -> str | None:
    result = await tx.conn.execute(
        READ_SELECTABLE_FORMATION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return str(found[0]["id"]) if found else None


async def read_destination_profile(tx: Tx, user_id: str) -> dict[str, Any]:
    """`loadDestinationProfile`: the two fields `resolvePostAuthDestination` reads."""
    result = await tx.conn.execute(READ_DESTINATION_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    row = None if not found else found[0]
    return {
        "onboardingStep": "profil" if row is None else str(row["onboarding_step"]),
        "deletionScheduledFor": None if row is None else row["deletion_scheduled_for"],
    }


async def count_legal_acceptances(tx: Tx, user_id: str) -> int:
    """The number of acceptances already recorded for the account."""
    result = await tx.conn.execute(COUNT_LEGAL_ACCEPTANCES, {"user_id": user_id})
    return int(result.mappings().all()[0]["count"])


async def read_signup_metadata(tx: Tx, user_id: str) -> Any:
    """`raw_user_meta_data` of the Auth account, `None` when the account is missing."""
    result = await tx.conn.execute(READ_SIGNUP_METADATA, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else found[0]["meta"]


async def time_zone_is_known(tx: Tx, name: str) -> bool:
    """`pg_timezone_names` probe: an unknown zone is never written to the profile."""
    result = await tx.conn.execute(KNOWN_TIME_ZONE, {"name": name})
    return bool(result.mappings().all()[0]["ok"])


async def update_terms_and_timezone(
    tx: Tx,
    user_id: str,
    terms_version: str,
    accepted_at: datetime,
    time_zone: str | None,
) -> None:
    """`finalizeFirstVerification` - the terms pair and the time zone given at sign-up."""
    await tx.conn.execute(
        UPDATE_TERMS_AND_TIMEZONE,
        {
            "user_id": user_id,
            "terms_version": terms_version,
            "accepted_at": accepted_at,
            "time_zone": time_zone,
        },
    )
