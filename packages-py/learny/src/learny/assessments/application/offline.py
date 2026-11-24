"""Daily offline pack (SPEC-801 ET-5, EF-4; ADR-0200).

The pack reuses the review session of the day so the offline screen shows exactly the items of the
online one, then attaches the full payload of every brick version (correct answers included) so the
browser can grade locally. It adds up to twenty recall cards of notions due tomorrow. No AI call: a
notion without an existing recall card is simply omitted (BR-IA-09).
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.application.review import get_or_create_today_session
from learny.learning.domain.time import add_days, local_date_of
from learny.shared import time as shared_time
from learny.shared.errors import AppError
from learny.shared.time import to_iso

MAX_EXTRA_CARDS = 20
"""EF-4 - the pack never carries more than twenty extra cards."""

FALLBACK_TIME_ZONE = "Europe/Paris"
"""EF-4 - the zone used when the profile row is not readable."""


def _start_of_day(day: str, time_zone: str) -> str:
    """`startOfUserDay`: the exact instant the zone's clock reads the start of `day`."""
    return to_iso(shared_time.from_epoch_ms(shared_time.start_of_user_day(day, time_zone)))


def _time_zone_of(profile: Mapping[str, Any] | None) -> str:
    """The stored zone, or the pack fallback (EF-4)."""
    if profile is None:
        return FALLBACK_TIME_ZONE
    stored = profile["timezone"]
    return str(stored) if stored else FALLBACK_TIME_ZONE


def extra_card(row: Mapping[str, Any]) -> dict[str, Any]:
    """EF-4 - one recall card of a notion due tomorrow, full payload included."""
    return {
        "brickVersionId": str(row["version_id"]),
        "notionId": str(row["notion_id"]),
        "notionLabel": str(row["label"]),
        "payload": row["payload"],
    }


def pack_of(
    formation: Mapping[str, Any],
    session: Mapping[str, Any],
    payloads: Mapping[str, Any],
    rows: list[Mapping[str, Any]],
) -> dict[str, Any]:
    """ET-5 - the session with the full payloads, plus the extra cards not already played."""
    items = [
        {**dict(item), "payload": payloads.get(item["brickVersionId"], item["payload"])}
        for item in session["items"]
    ]
    seen = {str(notion) for item in items for notion in item["notionIds"]}
    cards: list[dict[str, Any]] = []
    for row in rows:
        if str(row["notion_id"]) in seen:
            continue
        cards.append(extra_card(row))
        if len(cards) >= MAX_EXTRA_CARDS:
            break
    return {
        "formationId": str(formation["id"]),
        "formationTitle": str(formation["title"]),
        "session": {**dict(session), "items": items},
        "extraCards": cards,
    }


async def build_pack(deps: AssessmentDeps, actor: Actor) -> dict[str, Any]:
    """ET-5 - builds the pack of the day for every active formation of the learner."""
    user_id = actor.user_id
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        time_zone = _time_zone_of(await queries.read_offline_profile(tx, user_id))
        today = local_date_of(to_iso(now), time_zone)
        formations = await queries.read_offline_formations(tx, user_id)
    tomorrow = add_days(today, 1)
    start = _start_of_day(tomorrow, time_zone)
    end = _start_of_day(add_days(tomorrow, 1), time_zone)
    packs: list[dict[str, Any]] = []
    for formation in formations:
        formation_id = str(formation["id"])
        try:
            session = await get_or_create_today_session(deps, actor, formation_id, "full")
        except AppError as error:
            if error.code == "NOT_FOUND":
                continue
            raise
        async with deps.db.user_tx(actor) as tx:
            payloads = await queries.read_brick_payloads(
                tx, [str(item["brickVersionId"]) for item in session["items"]]
            )
            rows = await queries.read_offline_extra_cards(tx, user_id, formation_id, start, end)
        packs.append(pack_of(formation, session, payloads, list(rows)))
    return {
        "ownerId": user_id,
        "localDate": today,
        "generatedAt": to_iso(now),
        "expiresAt": _start_of_day(add_days(today, 2), time_zone),
        "formations": packs,
    }


__all__ = ["FALLBACK_TIME_ZONE", "MAX_EXTRA_CARDS", "build_pack", "extra_card", "pack_of"]
