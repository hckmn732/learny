"""Daily global quiz session of one formation (SPEC-701, BR-MEM-03/08/09/10, ADR-0180, ADR-0319).

One activity per (owner, formation, local day, mode): the first `GET` of the day creates the session
under a consultative lock, the following ones replay the same DTO. The pure engine draws one item
per notion; this service groups the notions served by the same brick into one game item, records
each answer in its transaction and closes the session idempotently. Every read goes through the
learner's RLS transaction.
"""

import uuid
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from learny.assessments.domain.bricks.grade import BrickGradeError, grade_brick
from learny.assessments.domain.bricks.public_brick import to_public_brick
from learny.assessments.domain.bricks.validate import BrickInvalid, parse_brick_payload
from learny.identity.domain.actor import Actor
from learny.learning.application.apply_result import (
    apply_review_result,
    from_persistence_card,
)
from learny.learning.application.ports import LearningDeps
from learny.learning.application.review_games import (
    brick_format_response,
    correction_explanation,
    split_result_by_notion,
    to_game_correction,
)
from learny.learning.application.series import reconcile_milestones
from learny.learning.domain import fsrs, global_quiz
from learny.learning.domain.params import ENGINE
from learny.learning.domain.time import (
    add_days,
    format_instant,
    iso_weekday_of_ms,
    local_date_of,
)
from learny.learning.infrastructure import queries
from learny.shared import time as shared_time
from learny.shared.errors import AppError
from learny.shared.locale_fr import review as texts
from learny.shared.locale_fr.review import (
    MONTH_LABELS,
    MONTH_SHORT_LABELS,
    WEEKDAY_LABELS,
)
from learny.shared.time import to_iso

REVIEW_ACTIVITY_KIND = "global_quiz_session"
GAMES_ENABLED = False
REVIEW_FORMAT_SECONDS: dict[str, int] = {
    "recall_card": 30,
    "cloze": 45,
    "choice_question": 40,
    "ordering": 60,
    "matching": 90,
    "categorization": 90,
}
REVIEW_EXTRA_NOTION_SECONDS = 30
MICRO_SESSION_COMPOSITION: dict[int, int] = {3: 1, 5: 1, 10: 2}
MICRO_QUESTION_FORMATS = ("cloze", "matching", "categorization", "choice_question")
GAME_FORMATS = ("matching", "ordering", "categorization", "cloze")
SESSION_ITEM_KEYS = (
    "position",
    "format",
    "reasonKey",
    "displayLabel",
    "moduleIds",
    "notionIds",
)


def _epoch(value: Any) -> int:
    if isinstance(value, str):
        return shared_time.to_epoch_ms(shared_time.parse_iso(value))
    if isinstance(value, datetime):
        return shared_time.to_epoch_ms(value)
    raise TypeError(f"not an instant: {value!r}")


def _iso(value: Any) -> str:
    return format_instant(_epoch(value))


def _instant_text(value: Any) -> str:
    """A database instant as the UTC ISO string the browser receives."""
    return to_iso(shared_time.from_epoch_ms(_epoch(value)))


def _round2(value: float) -> float:
    from learny.shared.jsmath import js_round

    return js_round(value * 100) / 100


def parse_session_config(raw: Any) -> dict[str, Any] | None:
    """The stored session config, `None` when it cannot be read (CL-7)."""
    if not isinstance(raw, Mapping):
        return None
    if raw.get("mode") not in ("full", "micro"):
        return None
    for key in ("dueCount", "deferredCount", "capMinutes", "estimatedSec"):
        if not isinstance(raw.get(key), int) or isinstance(raw.get(key), bool):
            return None
    if not isinstance(raw.get("forDate"), str) or not isinstance(raw.get("deferredTo"), str):
        return None
    items = raw.get("items")
    if not isinstance(items, list) or not all(isinstance(item, Mapping) for item in items):
        return None
    parsed = dict(raw)
    parsed["items"] = [dict(item) for item in items]
    parsed["rationale"] = [dict(entry) for entry in raw.get("rationale") or []]
    parsed["tuned"] = [dict(entry) for entry in raw.get("tuned") or []]
    return parsed


def weekday_label(day: str) -> str:
    """Lowercase weekday name of a civil day (EF-4 note, ADR-0319 section 8)."""
    try:
        milliseconds = shared_time.civil_day_ms(day)
    except ValueError:
        return day
    return WEEKDAY_LABELS[iso_weekday_of_ms(milliseconds) % 7]


def day_month_label(day: str, time_zone: str) -> str:
    """`11 novembre` of a civil day, for the session subtitle."""
    try:
        shared_time.civil_day_ms(day)
    except ValueError:
        return day
    day_text = shared_time.user_local_day(shared_time.civil_day_ms(day), time_zone)
    parts = day_text.split("-")
    month = int(parts[1])
    return f"{int(parts[2])} {MONTH_LABELS[month - 1]}"


def short_day_label(instant: str, time_zone: str) -> str:
    """`11 nov.` of one instant, in the learner's zone."""
    try:
        milliseconds = shared_time.to_epoch_ms(shared_time.parse_iso(instant))
    except ValueError:
        return ""
    day = shared_time.user_local_day(milliseconds, time_zone)
    parts = day.split("-")
    return f"{int(parts[2])} {MONTH_SHORT_LABELS[int(parts[1]) - 1]}"


def deferred_day_label(day: str) -> str:
    """Lowercase weekday name of the deferral day (EF-4: never abbreviated)."""
    return weekday_label(day)


def reason_of(reason_key: str | None) -> dict[str, str] | None:
    """SPEC-716 ET-3, SPEC-717 ET-5, ADR-0193 - the contract reason of an item."""
    if reason_key == "gap_forgetting":
        return {"code": "gap_forgetting", "label": texts.REASON_TEXTS["gap_forgetting"]}
    if reason_key == "gap_confusion":
        return {"code": "gap_confusion", "label": texts.REASON_TEXTS["gap_confusion"]}
    if reason_key == texts.QUESTION_CARD_REASON_CODE:
        return {"code": "question_card", "label": texts.QUESTION_CARD_REASON_LABEL}
    return None


def item_scope_label(positions: Sequence[int]) -> str:
    """Item scope label (EF-8): "Module 2" or "Modules 1 et 2"."""
    ordered = sorted({position for position in positions if position > 0})
    if not ordered:
        return ""
    if len(ordered) == 1:
        return texts.SCOPE_MODULE.format(position=ordered[0])
    if len(ordered) == 2:
        return texts.SCOPE_TWO_MODULES.format(first=ordered[0], second=ordered[1])
    return texts.SCOPE_MODULES.format(positions=", ".join(str(position) for position in ordered))


def modules_label(positions: Sequence[int]) -> str:
    """Header pill (EF-3): like the item scope, mixed from two modules on."""
    ordered = sorted({position for position in positions if position > 0})
    if not ordered:
        return ""
    if len(ordered) == 1:
        return texts.SCOPE_MODULE.format(position=ordered[0])
    if len(ordered) == 2:
        return texts.SCOPE_TWO_MODULES_MIXED.format(first=ordered[0], second=ordered[1])
    head = ", ".join(str(position) for position in ordered[:-1])
    return texts.SCOPE_MODULES_MIXED.format(head=head, last=ordered[-1])


def item_cost_sec(format_name: str, notion_count: int) -> int:
    """ET-8 + ADR-0319 section 4 - cost of one game: its price plus 30 s per extra notion."""
    return REVIEW_FORMAT_SECONDS.get(format_name, 60) + REVIEW_EXTRA_NOTION_SECONDS * max(0, notion_count - 1)


def micro_card_count(duration_min: int) -> int:
    """EF-2 - number of recall cards of a D-minute micro-session (ADR-0182 section 1)."""
    return MICRO_SESSION_COMPOSITION.get(duration_min, 1)


def notion_word(count: int) -> str:
    return texts.NOTION_ONE if count == 1 else texts.NOTION_MANY.format(count=count)


def was_due_word(count: int) -> str:
    return texts.WAS_DUE_ONE if count == 1 else texts.WAS_DUE_MANY.format(count=count)


def schema_candidate(payload: Any) -> Any:
    """CL-7 - `title` is display metadata of the demonstration cloze, outside the strict schema."""
    if not isinstance(payload, Mapping) or "title" not in payload:
        return payload
    rest = dict(payload)
    rest.pop("title", None)
    return rest


async def load_profile_timezone(tx: Any, user_id: str) -> str:
    """The learner's zone, `Europe/Paris` when the profile has none."""
    return await queries.read_warmup_timezone(tx, user_id)


async def load_automation_params(tx: Any, user_id: str) -> dict[str, Any]:
    """The cap, the target retention, the game preference and the micro duration."""
    rows = await queries.read_quiz_automation_params(tx, user_id)
    global_quiz = ENGINE["globalQuiz"]
    cap_minutes = int(global_quiz["maxMinutesDefault"])
    target_retention = float(ENGINE["fsrs"]["requestRetention"])
    preference = "vary"
    micro_minutes = int(global_quiz["microMinutesDefault"])
    for row in rows:
        params = row["params"] if isinstance(row["params"], Mapping) else {}
        if row["key"] == "plafond_quiz" and isinstance(params.get("maxMinutes"), (int, float)):
            cap_minutes = int(_round2(float(params["maxMinutes"])))
        if row["key"] == "plafond_quiz" and params.get("targetRetention") in (0.85, 0.9, 0.95):
            target_retention = float(params["targetRetention"])
        if row["key"] == "jeu_lacune" and params.get("preference") in (
            "vary",
            "cards",
            "matching_categorization",
        ):
            preference = str(params["preference"])
        if row["key"] == "micro_seance" and row["enabled"] and params.get("durationMin") in (3, 5, 10):
            micro_minutes = int(params["durationMin"])
    return {
        "capMinutes": cap_minutes,
        "targetRetention": target_retention,
        "preference": preference,
        "microMinutes": micro_minutes,
    }


def smoothing_day(row: Mapping[str, Any], time_zone: str) -> str | None:
    """ET-4 - the local day of one `quiz_smoothed` action."""
    payload = row["payload"] if isinstance(row["payload"], Mapping) else {}
    local_date = payload.get("localDate", payload.get("date"))
    if isinstance(local_date, str) and _is_civil_day(local_date):
        return local_date
    return local_date_of(_iso(row["created_at"]), time_zone)


def _is_civil_day(value: str) -> bool:
    try:
        shared_time.civil_day_ms(value)
    except ValueError:
        return False
    return len(value) == 10


async def read_smoothing_action(
    tx: Any, user_id: str, formation_id: str, today: str, time_zone: str
) -> dict[str, Any] | None:
    """ET-4 - the `quiz_smoothed` action of the local day, applied, undone or absent."""
    rows = await queries.read_quiz_smoothing_actions(tx, user_id, formation_id)
    for row in rows:
        if smoothing_day(row, time_zone) == today:
            return dict(row)
    return None


def smoothing_notice_of(config: Mapping[str, Any], action: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """SPEC-718 ET-5 - cap, deferral and undo of the smoothed day."""
    if config["mode"] != "full" or int(config["deferredCount"]) <= 0:
        return None
    return {
        "actionId": action["id"] if action is not None and action["status"] == "applied" else None,
        "capMinutes": int(config["capMinutes"]),
        "targetRetention": float(config.get("targetRetention", ENGINE["fsrs"]["requestRetention"])),
        "deferredCount": int(config["deferredCount"]),
        "deferredTo": config["deferredTo"],
        "estimatedMinutes": max(1, -(-int(config["estimatedSec"]) // 60)),
    }


def smoothing_summary(candidate: Mapping[str, Any]) -> str:
    """ET-4 - the journal line of the day, same wording as the automation definition."""
    deferred = len(candidate["deferredNotionIds"])
    verb = texts.SMOOTHING_VERB_ONE if deferred == 1 else texts.SMOOTHING_VERB_MANY
    return texts.SMOOTHING_SUMMARY.format(
        due=candidate["dueCount"],
        deferred=deferred,
        verb=verb,
        day=weekday_label(candidate["deferredTo"]),
        cap=candidate["maxMinutes"],
    )


async def record_smoothing_action(
    deps: LearningDeps, candidate: Mapping[str, Any], time_zone: str
) -> dict[str, Any] | None:
    """ET-2, ET-4 - the journal row is created after the session commit."""
    if not candidate["deferredNotionIds"]:
        return None
    user_id = candidate["userId"]
    existing = await read_smoothing_action(
        deps, user_id, candidate["formationId"], candidate["localDate"], time_zone
    )
    if existing is not None:
        return existing
    dedupe_key = f"quiz-smoothing:{candidate['formationId']}:{candidate['localDate']}"
    now_iso = to_iso(deps.clock.now())
    action_id: str | None = None
    created = False
    async with deps.db.service_tx() as tx:
        row = await queries.insert_automation_action_quiet(
            tx,
            user_id=user_id,
            formation_id=str(candidate["formationId"]),
            automation="plafond_quiz",
            kind="quiz_smoothed",
            summary=smoothing_summary(candidate),
            payload={
                "dedupeKey": dedupe_key,
                "formationId": candidate["formationId"],
                "localDate": candidate["localDate"],
                "deferredTo": candidate["deferredTo"],
                "dueCount": candidate["dueCount"],
                "selectedCount": candidate["selectedCount"],
                "deferredNotionIds": candidate["deferredNotionIds"],
                "estimatedMinutes": candidate["estimatedMinutes"],
                "maxMinutes": candidate["maxMinutes"],
                "targetRetention": candidate["targetRetention"],
                "reason": "cap",
            },
            created_at=now_iso,
        )
        if row is not None:
            action_id = str(row["id"])
            created = True
    if not created or action_id is None:
        async with deps.db.service_tx() as tx:
            found = await queries.read_automation_action_by_dedupe(tx, user_id, "plafond_quiz", dedupe_key)
        return None if found is None else dict(found)
    async with deps.db.service_tx() as tx:
        await tx.emit(
            "automation/action-applied",
            {"userId": user_id, "actionId": action_id, "automation": "plafond_quiz"},
            event_id=f"automation-action:{action_id}",
        )
    async with deps.db.service_tx() as tx:
        rows = await queries.read_quiz_smoothing_actions(tx, user_id, str(candidate["formationId"]))
    for row in rows:
        if str(row["id"]) == action_id:
            return dict(row)
    return None


def question_card_forced_game(action: Mapping[str, Any]) -> dict[str, Any] | None:
    """SPEC-717 - only an applied action whose brick was really created imposes the card."""
    if action.get("automation") != texts.QUESTION_CARD_AUTOMATION:
        return None
    if action.get("kind") != texts.QUESTION_CARD_KIND or action.get("status") != "applied":
        return None
    raw_payload = action.get("payload")
    payload: Mapping[str, Any] = dict(raw_payload) if isinstance(raw_payload, Mapping) else {}
    notion_id = payload.get("notionId")
    brick_id = payload.get("brickId")
    if not isinstance(notion_id, str) or notion_id == "":
        return None
    if not isinstance(brick_id, str) or brick_id == "":
        return None
    resolved_notion: str = notion_id
    return {
        "notionId": resolved_notion,
        "format": texts.QUESTION_CARD_FORMAT,
        "actionId": str(action["id"]),
        "questionCard": True,
    }


async def load_forced_games(
    tx: Any, user_id: str, formation_id: str, due_rows: Sequence[Mapping[str, Any]]
) -> dict[str, dict[str, Any]]:
    """SPEC-716 EF-6, SPEC-717 ET-5 - the applied actions imposing a format on the next quiz."""
    gap_by_notion = {
        str(row["notion_id"]): str(row["gap_nature"])
        for row in due_rows
        if row["gap_nature"] is not None and row["gap_cleared_at"] is None
    }
    rows = await queries.read_quiz_forced_actions(
        tx,
        user_id,
        formation_id,
        question_card_automation=texts.QUESTION_CARD_AUTOMATION,
        question_card_kind=texts.QUESTION_CARD_KIND,
    )
    forced: dict[str, dict[str, Any]] = {}
    gap_rows = [row for row in rows if row["automation"] == "jeu_lacune"]
    card_rows = [row for row in rows if row["automation"] == texts.QUESTION_CARD_AUTOMATION]
    for row in gap_rows:
        raw_payload = row["payload"]
        payload: Mapping[str, Any] = dict(raw_payload) if isinstance(raw_payload, Mapping) else {}
        raw_notion = payload.get("notionId")
        notion_id: str = raw_notion if isinstance(raw_notion, str) else ""
        if notion_id == "" or notion_id in forced:
            continue
        nature = gap_by_notion.get(notion_id)
        if nature is None or nature in ("misunderstanding", "application"):
            continue
        raw_format = payload.get("format")
        format_name: str | None = raw_format if isinstance(raw_format, str) else None
        pending = payload.get("pendingGeneration") is True
        if format_name is None or (pending and format_name != "choice_question"):
            continue
        forced[notion_id] = {
            "notionId": notion_id,
            "nature": nature,
            "format": format_name,
            "confusedWithLabel": (
                payload.get("confusedWithLabel")
                if isinstance(payload.get("confusedWithLabel"), str)
                else None
            ),
            "actionId": str(row["id"]),
            "questionCard": False,
        }
    for row in card_rows:
        card = question_card_forced_game(row)
        if card is None or card["notionId"] in forced:
            continue
        forced[card["notionId"]] = {
            "notionId": card["notionId"],
            "nature": None,
            "format": card["format"],
            "confusedWithLabel": None,
            "actionId": card["actionId"],
            "questionCard": True,
        }
    return forced


def build_tuned(
    forced: Mapping[str, Mapping[str, Any]],
    due_rows: Sequence[Mapping[str, Any]],
    time_zone: str,
) -> list[dict[str, str]]:
    """SPEC-716 EF-7 - tutor box lines of the imposed gaps."""
    label_by_notion = {str(row["notion_id"]): str(row["label"]) for row in due_rows}
    month_day = {}
    for row in due_rows:
        month_day[str(row["notion_id"])] = (
            texts.TUNED_RECENT
            if row["gap_detected_at"] is None
            else short_day_label(_iso(row["gap_detected_at"]), time_zone) or texts.TUNED_RECENT
        )
    lines: list[dict[str, str]] = []
    for game in forced.values():
        notion = label_by_notion.get(str(game["notionId"]), texts.TUNED_DEFAULT_NOTION)
        day = month_day.get(str(game["notionId"]), texts.TUNED_RECENT)
        if game["nature"] == "forgetting":
            lines.append(
                {
                    "label": texts.TUNED_LABEL,
                    "text": texts.TUNED_FORGETTING.format(notion=notion, day=day),
                }
            )
        elif game["nature"] == "confusion" and game["confusedWithLabel"] is not None:
            format_text = (
                texts.TUNED_FORMAT_ORDER if game["format"] == "categorization" else texts.TUNED_FORMAT_PAIR
            )
            lines.append(
                {
                    "label": texts.TUNED_LABEL,
                    "text": texts.TUNED_CONFUSION.format(
                        notion=notion, confused=game["confusedWithLabel"], format=format_text
                    ),
                }
            )
    return lines


def display_label_of(
    brick: Mapping[str, Any],
    notion_ids: Sequence[str],
    notion_by_id: Mapping[str, Mapping[str, Any]],
) -> str:
    """Rail label of an item (EF-6): the notion label, else the brick title or instruction."""
    if len(notion_ids) == 1:
        notion = notion_by_id.get(notion_ids[0])
        return "Notion" if notion is None else str(notion["label"])
    payload = brick["payload"]
    title = payload.get("title") if isinstance(payload, Mapping) else None
    if isinstance(title, str) and title.strip() != "":
        return title.strip()
    instruction = payload.get("instruction") if isinstance(payload, Mapping) else None
    if isinstance(instruction, str) and instruction.strip() != "":
        head = instruction.split(" : ")[0]
        return head.strip() or instruction.strip()
    labels = [str(notion_by_id[notion_id]["label"]) for notion_id in notion_ids if notion_id in notion_by_id]
    return ", ".join(labels[:1])


def group_by_bricks(
    engine_items: Sequence[Mapping[str, Any]],
    notion_by_id: Mapping[str, Mapping[str, Any]],
    selected_notions: frozenset[str] | set[str],
    bricks: Sequence[Mapping[str, Any]],
    seen_fingerprints: frozenset[str] | set[str],
    forced_games: Mapping[str, Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """ADR-0319 section 1 - groups the drawn notions into game items served by one brick each."""
    forced = {} if forced_games is None else forced_games
    items: list[dict[str, Any]] = []
    exhausted: list[dict[str, str]] = []
    used_bricks: set[str] = set()
    covered: set[str] = set()
    for engine_item in engine_items:
        notion_id = str(engine_item["notionId"])
        if notion_id in covered:
            continue
        candidates = [
            brick
            for brick in bricks
            if brick["type"] == engine_item["format"]
            and brick["brick_id"] not in used_bricks
            and notion_id in [str(item) for item in brick["notion_ids"] or []]
            and all(str(item) in selected_notions for item in brick["notion_ids"] or [])
            and (brick["fingerprint"] is None or brick["fingerprint"] not in seen_fingerprints)
        ]
        candidates.sort(
            key=lambda brick: (
                -len(brick["notion_ids"] or []),
                str(brick["brick_id"]),
            )
        )
        if not candidates:
            exhausted.append({"notionId": notion_id, "format": str(engine_item["format"])})
            continue
        brick = candidates[0]
        used_bricks.add(str(brick["brick_id"]))
        notion_ids = [str(item) for item in brick["notion_ids"] or [] if str(item) in selected_notions]
        covered.update(notion_ids)
        game = forced.get(notion_id)
        if game is not None:
            if game["questionCard"]:
                reason_key: str | None = texts.QUESTION_CARD_REASON_CODE
            elif game["nature"] is None:
                reason_key = None
            else:
                reason_key = f"gap_{game['nature']}"
        else:
            reason_key = None if engine_item.get("gapNature") is None else f"gap_{engine_item['gapNature']}"
        module_ids = sorted(
            {
                str(notion_by_id[item]["module_id"])
                for item in notion_ids
                if item in notion_by_id and notion_by_id[item].get("module_id")
            }
        )
        items.append(
            {
                "brickId": str(brick["brick_id"]),
                "brickVersionId": str(brick["version_id"]),
                "format": str(brick["type"]),
                "notionIds": notion_ids,
                "displayLabel": display_label_of(brick, notion_ids, notion_by_id),
                "moduleIds": module_ids,
                "reasonKey": reason_key,
                "actionId": None if game is None else game["actionId"],
            }
        )
    return {"items": items, "exhausted": exhausted}


def rank_notions(engine_order: Sequence[str], review_rows: Sequence[Mapping[str, Any]]) -> list[str]:
    """Ranks the due notions: engine order first, then gaps before plain delays (ADR-0182)."""
    ranked: list[str] = []
    seen: set[str] = set()
    for notion_id in engine_order:
        if notion_id == "" or notion_id in seen:
            continue
        seen.add(notion_id)
        ranked.append(notion_id)
    rest = sorted(
        (row for row in review_rows if str(row["notion_id"]) not in seen),
        key=lambda row: (
            -(1 if row["gap_nature"] is not None else 0),
            _epoch(row["due_at"]),
            int(row["module_position"]),
            str(row["notion_id"]),
        ),
    )
    ranked.extend(str(row["notion_id"]) for row in rest)
    return ranked


def compose_micro(
    engine_order: Sequence[str],
    review_rows: Sequence[Mapping[str, Any]],
    bricks: Sequence[Mapping[str, Any]],
    notion_by_id: Mapping[str, Mapping[str, Any]],
    seen_fingerprints: frozenset[str] | set[str],
    duration_min: int,
) -> dict[str, Any]:
    """SPEC-703 EF-2, ET-2, ET-3 - micro-session of D minutes from the ranked due notions."""
    priority = rank_notions(engine_order, review_rows)
    priority_set = set(priority)
    priority_index = {notion_id: index for index, notion_id in enumerate(priority)}
    candidates: list[dict[str, Any]] = []
    for brick in bricks:
        notion_ids = [str(item) for item in brick["notion_ids"] or [] if str(item) in notion_by_id]
        if not notion_ids:
            continue
        gap_nature = notion_by_id[notion_ids[0]].get("gap_nature")
        candidates.append(
            {
                "brickId": str(brick["brick_id"]),
                "brickVersionId": str(brick["version_id"]),
                "type": str(brick["type"]),
                "notionIds": notion_ids,
                "displayLabel": display_label_of(brick, notion_ids, notion_by_id),
                "moduleIds": sorted(
                    {
                        str(notion_by_id[item]["module_id"])
                        for item in notion_ids
                        if notion_by_id[item].get("module_id")
                    }
                ),
                "reasonKey": None if gap_nature is None else f"gap_{gap_nature}",
                "fingerprint": brick["fingerprint"],
            }
        )
    used: set[str] = set()
    covered: set[str] = set()
    items: list[dict[str, Any]] = []

    def available(brick: Mapping[str, Any]) -> bool:
        return (
            brick["brickId"] not in used
            and all(notion_id in priority_set for notion_id in brick["notionIds"])
            and not (brick["fingerprint"] is not None and brick["fingerprint"] in seen_fingerprints)
        )

    card_wanted = micro_card_count(duration_min)
    for notion_id in priority:
        if len(items) >= card_wanted:
            break
        if notion_id in covered:
            continue
        pool = [
            brick
            for brick in candidates
            if brick["type"] == "recall_card" and notion_id in brick["notionIds"] and available(brick)
        ]
        pool.sort(key=lambda brick: (len(brick["notionIds"]), brick["brickId"]))
        if not pool:
            continue
        candidate = pool[0]
        used.add(candidate["brickId"])
        covered.update(candidate["notionIds"])
        items.append(candidate)
    preferred = MICRO_QUESTION_FORMATS if GAMES_ENABLED else ("choice_question",)
    question = None
    for format_name in preferred:
        pool = [
            brick
            for brick in candidates
            if brick["type"] == format_name
            and available(brick)
            and len(brick["notionIds"]) <= 4
            and any(notion_id not in covered for notion_id in brick["notionIds"])
        ]
        pool.sort(
            key=lambda brick: (
                -len(brick["notionIds"]),
                min(priority_index.get(item, 2**53) for item in brick["notionIds"]),
                brick["brickId"],
            )
        )
        if pool:
            question = pool[0]
            break
    if question is not None:
        used.add(question["brickId"])
        items.append(question)
    return {
        "items": [
            {
                "brickId": brick["brickId"],
                "brickVersionId": brick["brickVersionId"],
                "format": brick["type"],
                "notionIds": brick["notionIds"],
                "displayLabel": brick["displayLabel"],
                "moduleIds": brick["moduleIds"],
                "reasonKey": brick["reasonKey"],
                "actionId": None,
            }
            for brick in items
        ],
        "exhausted": (
            []
            if question is not None
            else [{"notionId": priority[0] if priority else "", "format": preferred[0]}]
        ),
    }


def build_micro_note(*, cards: int, has_question: bool) -> str:
    """SPEC-703 EF-3 - explanatory note of the duration switch, adapted to the composition."""
    cards = max(0, int(cards))
    if has_question:
        if cards >= 2:
            return texts.MICRO_NOTE_MANY_CARDS
        if cards == 1:
            return texts.MICRO_NOTE_ONE_CARD
        return texts.MICRO_NOTE_QUESTION
    if cards >= 2:
        return texts.MICRO_NOTE_TWO_CARDS
    return texts.MICRO_NOTE_ONE_CARD_ONLY


def _lowercase_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def _with_article(label: str) -> str:
    """Article of a notion label, needed by the gap bullet (no gender in the database)."""
    lower = _lowercase_first(label)
    if (
        lower[:1]
        in "a\u00e0\u00e2\u00e4e\u00e9\u00e8\u00ea\u00ebi\u00ee\u00efo\u00f4\u00f6u\u00f9\u00fb\u00fc"
    ):
        return "l\u2019" + lower
    head = lower.split(" ")[0].split("\u2019")[0].split("'")[0]
    feminine = head.endswith(
        ("e", "\u00e9", "ion", "it\u00e9", "ude", "ance", "ence", "ette", "esse", "ure", "ise", "ie")
    )
    return f"{'la' if feminine else 'le'} {lower}"


def build_rationale(
    *,
    time_zone: str,
    due_count: int,
    deferred_count: int,
    deferred_to: str,
    cap_minutes: int,
    gap_items: Sequence[Mapping[str, Any]],
    module_positions: Sequence[int],
    mode: str = "full",
    micro_cards: int = 0,
    micro_has_question: bool = True,
) -> list[dict[str, str]]:
    """EF-7 - pure bullets of the tutor section, at most three."""
    bullets: list[dict[str, str]] = []
    gap = gap_items[0] if gap_items else None
    if mode == "micro":
        if not micro_has_question:
            text = (
                texts.RATIONALE_MICRO_NO_QUESTION_MANY
                if micro_cards >= 2
                else texts.RATIONALE_MICRO_NO_QUESTION_ONE
            )
        elif micro_cards == 0:
            text = texts.RATIONALE_MICRO_QUESTION_ONLY
        elif micro_cards >= 2:
            text = texts.RATIONALE_MICRO_MANY_THEN_QUESTION
        else:
            text = texts.RATIONALE_MICRO_ONE_THEN_QUESTION
        bullets.append({"label": texts.RATIONALE_MICRO_LABEL, "text": text})
        if gap is not None and gap["gapDetectedAt"] is not None:
            bullets.append(_gap_bullet(gap, time_zone))
        return bullets
    if gap is not None and gap["gapDetectedAt"] is not None:
        bullets.append(_gap_bullet(gap, time_zone))
    if deferred_count > 0:
        bullets.append(
            {
                "label": texts.RATIONALE_LOAD_LABEL,
                "text": texts.RATIONALE_LOAD_TEXT.format(
                    deferred=deferred_count,
                    plural="" if deferred_count == 1 else "s",
                    due=due_count,
                    day=deferred_day_label(deferred_to),
                    cap=cap_minutes,
                ),
            }
        )
    if len(set(module_positions)) >= 2:
        bullets.append({"label": texts.RATIONALE_MODULES_LABEL, "text": texts.RATIONALE_MODULES_TEXT})
    return bullets


def _gap_bullet(gap: Mapping[str, Any], time_zone: str) -> dict[str, str]:
    game = texts.GAME_LABELS.get(str(gap["format"]), {"name": str(gap["format"])})
    return {
        "label": texts.RATIONALE_GAP_LABEL,
        "text": texts.RATIONALE_GAP_TEXT.format(
            notion=_with_article(str(gap["notionLabel"])),
            day=short_day_label(str(gap["gapDetectedAt"]), time_zone),
            game=_lowercase_first(game["name"]),
        ),
    }


def empty_dto(today: str, formation_id: str, status: str) -> dict[str, Any]:
    """CL-1, EF-12 - the `empty` and `paused` states carry no activity and no attempt."""
    return {
        "sessionId": None,
        "attemptId": None,
        "formationId": formation_id,
        "forDate": today,
        "mode": "full",
        "status": status,
        "header": {"notionCount": 0, "modulesLabel": "", "estimatedMinutes": 0, "subtitle": ""},
        "modeOptions": {
            "fullMinutes": 0,
            "microMinutes": int(ENGINE["globalQuiz"]["microMinutesDefault"]),
        },
        "note": "",
        "rationale": [],
        "tuned": [],
        "smoothing": None,
        "items": [],
        "currentPosition": 0,
        "summary": None,
    }


async def load_mode_options(
    tx: Any, user_id: str, formation_id: str, today: str, config: Mapping[str, Any]
) -> dict[str, int]:
    """SPEC-703 EF-1, CL-6 - durations shown by the two-mode switch."""
    rows = await queries.read_mode_options(tx, user_id, formation_id, today)
    full_minutes: int | None = None
    micro_minutes: int | None = None
    for row in rows:
        parsed = parse_session_config(row["config"])
        if parsed is None:
            continue
        if parsed["mode"] == "full":
            full_minutes = max(1, -(-int(parsed["estimatedSec"]) // 60))
        if parsed["mode"] == "micro":
            micro_minutes = parsed.get("microMinutes") or max(1, -(-int(parsed["estimatedSec"]) // 60))
    if full_minutes is None and config["mode"] == "full":
        full_minutes = max(1, -(-int(config["estimatedSec"]) // 60))
    if micro_minutes is None and config["mode"] == "micro":
        micro_minutes = config.get("microMinutes") or max(1, -(-int(config["estimatedSec"]) // 60))
    if micro_minutes is None:
        automation = await load_automation_params(tx, user_id)
        micro_minutes = automation["microMinutes"]
    return {
        "fullMinutes": full_minutes
        if full_minutes is not None
        else int(ENGINE["globalQuiz"]["maxMinutesDefault"]),
        "microMinutes": micro_minutes,
    }


def state_of(item: Mapping[str, Any], answer: Mapping[str, Any] | None) -> str:
    """BR-MEM-09 - client state of one game item."""
    if item.get("withdrawn") is True:
        return "withdrawn"
    if answer is None:
        return "todo"
    response = answer["response"]
    if isinstance(response, Mapping) and response.get("skipped") is True:
        return "skipped"
    return "answered"


def result_of(
    item: Mapping[str, Any],
    answer: Mapping[str, Any] | None,
    notions: Sequence[Mapping[str, Any]] | None,
) -> Any:
    """The result already recorded for one item, replayed read-only after a reload."""
    if answer is None:
        return None
    feedback = answer["feedback"] if isinstance(answer["feedback"], Mapping) else {}
    response = answer["response"]
    skipped = isinstance(response, Mapping) and response.get("skipped") is True
    return {
        "position": item["position"],
        "skipped": skipped,
        "isCorrect": answer["is_correct"],
        "correction": feedback.get("correction"),
        "explanation": feedback.get("explanation"),
        "notions": list(notions or []),
    }


def parse_summary(raw: Any) -> dict[str, Any] | None:
    """The stored end-screen summary of a closed session, `None` when unreadable."""
    candidate = raw.get("summary") if isinstance(raw, Mapping) and "summary" in raw else raw
    if not isinstance(candidate, Mapping):
        return None
    for key in ("reviewedCount", "minutes", "okCount", "soonCount", "streakDays"):
        if not isinstance(candidate.get(key), int) or isinstance(candidate.get(key), bool):
            return None
    return {
        "reviewedCount": int(candidate["reviewedCount"]),
        "minutes": int(candidate["minutes"]),
        "okCount": int(candidate["okCount"]),
        "soonCount": int(candidate["soonCount"]),
        "streakDays": int(candidate["streakDays"]),
        "nextSessionAt": candidate.get("nextSessionAt"),
    }


def resolve_response(type_name: str, response: Any) -> Any:
    """Maps the contract input to the brick response schema (recall-card self-assessment)."""
    if type_name == "recall_card" and isinstance(response, Mapping):
        self_rating = response.get("selfRating")
        if isinstance(self_rating, str):
            return {"selfGrade": self_rating}
    return response


async def load_answer_outcomes(tx: Any, user_id: str, attempt_id: str) -> dict[str, list[dict[str, Any]]]:
    """FSRS outcomes of one attempt's answers: answer id to notion outcomes."""
    if attempt_id == "":
        return {}
    rows = await queries.read_answer_outcomes(tx, user_id, attempt_id)
    by_answer: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_answer.setdefault(str(row["answer_id"]), []).append(
            {
                "notionId": str(row["notion_id"]),
                "rating": str(row["grade"]),
                "nextDueAt": None if row["due_at"] is None else _instant_text(row["due_at"]),
            }
        )
    return by_answer


async def build_dto(
    deps: LearningDeps,
    tx: Any,
    user_id: str,
    time_zone: str,
    today: str,
    formation: Mapping[str, Any],
    activity: Mapping[str, Any],
    attempt: Mapping[str, Any],
) -> dict[str, Any]:
    """Builds the DTO of an existing session from the frozen config and the stored bricks."""
    config = parse_session_config(activity["config"])
    if config is None:
        raise AppError("INTERNAL_ERROR", texts.SESSION_CONFIG_UNREADABLE)
    activity_items = list(activity["items"] or [])
    version_ids = [
        str(activity_items[item["position"]]["brickVersionId"])
        for item in config["items"]
        if item["position"] < len(activity_items) and activity_items[item["position"]].get("brickVersionId")
    ]
    brick_rows = await queries.read_session_bricks(tx, version_ids)
    brick_by_version = {str(row["version_id"]): row for row in brick_rows}
    answer_rows = [] if attempt["id"] == "" else await queries.read_session_answers(tx, str(attempt["id"]))
    answer_by_position = {int(row["position"]): row for row in answer_rows}
    answered_positions = set(answer_by_position)

    for item in config["items"]:
        if item.get("invalid") is True:
            continue
        item_ref = activity_items[item["position"]] if item["position"] < len(activity_items) else None
        version_id = "" if item_ref is None else str(item_ref.get("brickVersionId") or "")
        brick = brick_by_version.get(version_id)
        if brick is None:
            continue
        invalid = False
        if brick["status"] == "active":
            try:
                parse_brick_payload(str(brick["type"]), schema_candidate(brick["payload"]))
            except BrickInvalid:
                invalid = True
        if brick["status"] == "active" and not invalid:
            continue
        item["invalid"] = invalid
        if item["position"] + 1 not in answered_positions:
            item["withdrawn"] = True
        await queries.update_session_item_flags(
            tx,
            activity_id=str(activity["id"]),
            position=int(item["position"]),
            withdrawn=item.get("withdrawn") is True,
            invalid=invalid,
        )
        if invalid:
            await queries.retire_brick(tx, str(brick["brick_id"]))

    notion_ids = sorted({str(notion) for item in config["items"] for notion in item["notionIds"]})
    notion_rows = await queries.read_session_notions(tx, notion_ids)
    notion_by_id = {str(row["id"]): row for row in notion_rows}
    recall_notion_ids = [
        str(notion)
        for item in config["items"]
        if item["format"] == "recall_card" and item.get("withdrawn") is not True
        for notion in item["notionIds"]
    ]
    card_rows = await queries.read_session_cards(tx, user_id, recall_notion_ids)
    card_by_notion = {str(row["notion_id"]): from_persistence_card(row["fsrs"]) for row in card_rows}
    logs_by_answer = await load_answer_outcomes(tx, user_id, str(attempt["id"]))
    now = deps.clock.now()
    now_iso = to_iso(now)

    dto_items: list[dict[str, Any]] = []
    for item in config["items"]:
        item_ref = activity_items[item["position"]] if item["position"] < len(activity_items) else None
        version_id = "" if item_ref is None else str(item_ref.get("brickVersionId") or "")
        brick = brick_by_version.get(version_id)
        if brick is None:
            continue
        if item.get("withdrawn") is True and item.get("invalid") is not True:
            continue
        game = texts.GAME_LABELS.get(str(brick["type"]))
        public_brick = (
            None
            if item.get("invalid") is True
            else to_public_brick(
                brick_id=str(brick["brick_id"]),
                version_id=str(brick["version_id"]),
                type_name=str(brick["type"]),
                notion_ids=list(brick["notion_ids"] or []),
                payload=brick["payload"],
            )
        )
        intervals: dict[str, str] | None = None
        if item["format"] == "recall_card" and item.get("invalid") is not True:
            first_notion = str(item["notionIds"][0]) if item["notionIds"] else ""
            card = card_by_notion.get(first_notion)
            intervals = (
                None
                if card is None
                else fsrs.preview_grades(card, now_iso, float(ENGINE["fsrs"]["requestRetention"]))
            )
        answer = answer_by_position.get(int(item["position"]) + 1)
        dto_items.append(
            {
                "position": int(item["position"]),
                "brickId": str(brick["brick_id"]),
                "brickVersionId": str(brick["version_id"]),
                "type": str(brick["type"]),
                "name": str(brick["type"]) if game is None else game["name"],
                "tech": "" if game is None else game["tech"],
                "displayLabel": str(item["displayLabel"]),
                "scopeLabel": item_scope_label(
                    [
                        0
                        if str(notion) not in notion_by_id
                        else int(notion_by_id[str(notion)]["module_position"])
                        for notion in item["notionIds"]
                    ]
                ),
                "reason": reason_of(item.get("reasonKey")),
                "notionIds": list(item["notionIds"]),
                "payload": {} if public_brick is None else public_brick["publicPayload"],
                "intervals": intervals,
                "state": "withdrawn" if item.get("invalid") is True else state_of(item, answer),
                "result": (
                    None
                    if item.get("invalid") is True
                    else result_of(
                        item,
                        answer,
                        None if answer is None else logs_by_answer.get(str(answer["id"])),
                    )
                ),
            }
        )

    notion_count = len({str(notion) for item in dto_items for notion in item["notionIds"]})
    module_positions = sorted(
        {
            0 if str(notion) not in notion_by_id else int(notion_by_id[str(notion)]["module_position"])
            for item in dto_items
            for notion in item["notionIds"]
        }
    )
    current_position = len(config["items"])
    for item in config["items"]:
        if item.get("withdrawn") is True:
            continue
        if state_of(item, answer_by_position.get(int(item["position"]) + 1)) == "todo":
            current_position = int(item["position"])
            break
    if str(attempt["status"]) == "in_progress":
        status = "empty" if not dto_items else "in_progress"
    else:
        status = "completed"
    mode_options = await load_mode_options(tx, user_id, str(activity["formation_id"]), today, config)
    smoothing_action = await read_smoothing_action(
        tx, user_id, str(activity["formation_id"]), today, time_zone
    )
    smoothing = smoothing_notice_of(config, smoothing_action)
    if config["mode"] == "micro":
        note = str(config.get("note") or "")
    elif int(config["deferredCount"]) > 0:
        note = texts.NOTE_DEFERRED.format(
            due=was_due_word(int(config["dueCount"])),
            deferred=config["deferredCount"],
            verb=(
                texts.SMOOTHING_VERB_ONE if int(config["deferredCount"]) == 1 else texts.SMOOTHING_VERB_MANY
            ),
            day=weekday_label(str(config["deferredTo"])),
            cap=config["capMinutes"],
        )
    else:
        note = texts.NOTE_DEFAULT.format(notions=notion_word(int(config["dueCount"])))
    return {
        "sessionId": str(activity["id"]),
        "attemptId": str(attempt["id"]),
        "formationId": str(formation["id"]),
        "forDate": today,
        "mode": config["mode"],
        "status": status,
        "header": {
            "notionCount": notion_count,
            "modulesLabel": modules_label(module_positions),
            "estimatedMinutes": max(1, -(-int(config["estimatedSec"]) // 60)),
            "subtitle": texts.HEADER_SUBTITLE.format(
                title=formation["title"],
                weekday=weekday_label(today),
                day=day_month_label(today, time_zone),
            ),
        },
        "modeOptions": mode_options,
        "note": note,
        "rationale": config["rationale"],
        "tuned": config["tuned"],
        "smoothing": smoothing,
        "items": dto_items,
        "currentPosition": current_position,
        "summary": parse_summary(attempt["review_feedback"]) if status == "completed" else None,
    }


def refill_of(exhausted: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    """Formats the engine reported as exhausted, mapped to the refill request (CL-7)."""
    entries: list[dict[str, str]] = []
    for entry in exhausted:
        required = list(entry.get("requiredFormats") or [])
        available = list(entry.get("availableFormats") or [])
        format_name = required[0] if required else (available[0] if available else None)
        if format_name is None:
            continue
        entries.append({"notionId": str(entry["notionId"]), "format": str(format_name)})
    return entries


def gap_items_of(
    items: Sequence[Mapping[str, Any]], notion_by_id: Mapping[str, Mapping[str, Any]]
) -> list[dict[str, Any]]:
    """The items of the session that answer an active gap."""
    gap_items: list[dict[str, Any]] = []
    for item in items:
        reason_key = item.get("reasonKey")
        if reason_key is None:
            continue
        first_notion = str(item["notionIds"][0]) if item["notionIds"] else ""
        row = notion_by_id.get(first_notion)
        if row is None:
            continue
        gap_items.append(
            {
                "notionLabel": str(row["label"]),
                "gapNature": str(reason_key).replace("gap_", ""),
                "gapDetectedAt": (
                    None if row["gap_detected_at"] is None else _instant_text(row["gap_detected_at"])
                ),
                "format": str(item["format"]),
            }
        )
    return gap_items


async def close_attempt(deps: LearningDeps, tx: Any, user_id: str, attempt_id: str) -> None:
    """Marks the untraited items of one in-progress review attempt as skipped (EF-10)."""
    import json

    row = await queries.read_quiz_attempt_for_closure(tx, user_id, attempt_id)
    if row is None:
        return
    config = parse_session_config(row["config"])
    if config is None:
        return
    items = list(row["items"] or [])
    answered = await queries.read_attempt_positions(tx, attempt_id)
    now_iso = to_iso(deps.clock.now())
    for item in config["items"]:
        if item.get("withdrawn") is True or int(item["position"]) + 1 in answered:
            continue
        item_ref = items[item["position"]] if int(item["position"]) < len(items) else None
        version_id = (
            str(uuid.uuid4())
            if item_ref is None or not item_ref.get("brickVersionId")
            else str(item_ref["brickVersionId"])
        )
        await queries.insert_skipped_answer(
            tx,
            attempt_id=attempt_id,
            brick_version_id=version_id,
            position=int(item["position"]) + 1,
            response=json.dumps({"skipped": True}),
            feedback=json.dumps({"clientAnswerId": str(uuid.uuid4()), "skippedAtClosure": True}),
            answered_at=now_iso,
        )


async def close_stale_sessions(deps: LearningDeps, tx: Any, user_id: str, today: str) -> None:
    """CL-2 - a session left in progress on a previous local day is closed at the first load."""
    now = deps.clock.now()
    for row in await queries.read_quiz_stale_sessions(tx, user_id, today):
        await close_attempt(deps, tx, user_id, str(row["attempt_id"]))
        await queries.close_stale_attempt(
            tx, str(row["attempt_id"]), to_iso(now), shared_time.to_epoch_ms(now)
        )


async def reopen_deferred_notions(
    deps: LearningDeps,
    tx: Any,
    user_id: str,
    time_zone: str,
    today: str,
    formation_id: str,
    activity: dict[str, Any],
    config: dict[str, Any],
) -> None:
    """ET-4 / CA-2 - after the undo of the smoothing the session reopens every deferred notion."""
    if config["mode"] != "full" or int(config["deferredCount"]) <= 0:
        return
    action = await read_smoothing_action(tx, user_id, formation_id, today, time_zone)
    if action is None or action["status"] != "undone":
        return
    now = deps.clock.now()
    _, day_end = _day_bounds(today, time_zone)
    due_rows = await queries.read_quiz_due_rows(tx, user_id, formation_id, day_end)
    review_rows = [row for row in due_rows if row["in_review"]]
    if not review_rows:
        return
    due = await read_due_notions(deps, tx, user_id, formation_id, now)
    engine_notions = {str(notion["notionId"]): notion for notion in due["notions"]}
    bricks = await queries.read_quiz_active_bricks(tx, user_id, formation_id)
    bank = [
        {
            "notionId": str(row["notion_id"]),
            "formats": sorted(
                {
                    str(brick["type"])
                    for brick in bricks
                    if str(row["notion_id"]) in [str(item) for item in brick["notion_ids"] or []]
                }
            ),
        }
        for row in review_rows
    ]
    automation = await load_automation_params(tx, user_id)
    last_formats = await load_last_formats(tx, user_id, formation_id)
    forced_games = await load_forced_games(tx, user_id, formation_id, due_rows)
    drawn = global_quiz.build_daily_session(
        formation_id=formation_id,
        date=today,
        due_notions=[_due_notion(row, engine_notions) for row in review_rows],
        gaps=due["gaps"],
        bank=bank,
        last_formats=last_formats,
        forced_formats=[
            {"notionId": game["notionId"], "format": game["format"]}
            for game in forced_games.values()
            if game["format"] is not None
        ],
        cap_minutes=max(automation["capMinutes"], len(review_rows) * 2 + 10),
        mode="full",
        seed=f"global-quiz:{user_id}:{formation_id}:{today}:full",
        preference=automation["preference"],
        target_retention=automation["targetRetention"],
        params=_engine_quiz_params(),
    )
    notion_by_id = {str(row["notion_id"]): row for row in due_rows}
    existing_notions = {str(notion) for item in config["items"] for notion in item["notionIds"]}
    new_engine_items = [
        {
            "notionId": str(item["notionId"]),
            "format": str(item["format"]),
            "gapNature": item.get("gapNature"),
        }
        for item in drawn["items"]
        if str(item["notionId"]) not in existing_notions
    ]
    if not new_engine_items:
        return
    new_selected = {item["notionId"] for item in new_engine_items}
    activity_items = list(activity["items"] or [])
    used_bricks = {str(item["brickId"]) for item in activity_items}
    seen = await queries.read_quiz_seen_fingerprints(tx, user_id)
    grouped = group_by_bricks(
        new_engine_items,
        notion_by_id,
        new_selected,
        [brick for brick in bricks if str(brick["brick_id"]) not in used_bricks],
        seen,
        forced_games,
    )
    if not grouped["items"]:
        return
    appended = [
        {
            "position": len(config["items"]) + index,
            "format": item["format"],
            "reasonKey": item["reasonKey"],
            "displayLabel": item["displayLabel"],
            "moduleIds": item["moduleIds"],
            "notionIds": item["notionIds"],
            "actionId": item["actionId"],
        }
        for index, item in enumerate(grouped["items"])
    ]
    next_items = [
        *activity_items,
        *[
            {"brickId": item["brickId"], "brickVersionId": item["brickVersionId"]}
            for item in grouped["items"]
        ],
    ]
    covered = set(existing_notions) | {
        str(notion) for item in grouped["items"] for notion in item["notionIds"]
    }
    remaining = len([row for row in review_rows if str(row["notion_id"]) not in covered])
    added_seconds = sum(
        item_cost_sec(str(item["format"]), len(item["notionIds"])) for item in grouped["items"]
    )
    next_config = dict(config)
    next_config["deferredCount"] = remaining
    next_config["estimatedSec"] = int(config["estimatedSec"]) + added_seconds
    next_config["rationale"] = [
        entry for entry in config["rationale"] if entry.get("label") != texts.RATIONALE_LOAD_LABEL
    ]
    next_config["items"] = [*config["items"], *appended]
    await queries.update_evening_quiz(
        tx,
        activity_id=str(activity["id"]),
        config=_json(next_config),
        items=_json(next_items),
    )
    activity["config"] = next_config
    activity["items"] = next_items


def _json(value: Any) -> str:
    import json

    return json.dumps(value)


def _day_bounds(day: str, time_zone: str) -> tuple[str, str]:
    start = shared_time.start_of_user_day(day, time_zone)
    end = shared_time.start_of_user_day(add_days(day, 1), time_zone)
    return (
        to_iso(shared_time.from_epoch_ms(start)),
        to_iso(shared_time.from_epoch_ms(end)),
    )


def _engine_quiz_params() -> dict[str, Any]:
    global_quiz = ENGINE["globalQuiz"]
    return {
        "notionCostSec": global_quiz["notionCostSec"],
        "sessionOverheadSec": global_quiz["sessionOverheadSec"],
        "formatSeconds": global_quiz["formatSeconds"],
        "maintenanceMaxMinutes": global_quiz["maintenanceMaxMinutes"],
    }


async def read_due_notions(
    deps: LearningDeps, tx: Any, user_id: str, formation_id: str, now: datetime
) -> dict[str, Any]:
    """The due notions of the formation."""
    rows = await queries.read_due_notions_rows(tx, user_id, formation_id, to_iso(now))
    notions: list[dict[str, Any]] = []
    for row in rows:
        module_status = str(row["module_status"])
        if module_status not in ("locked", "open", "validated"):
            raise AppError("INTERNAL_ERROR", texts.SESSION_CONFIG_UNREADABLE)
        gap_nature = row["gap_nature"]
        if gap_nature is not None and gap_nature not in (
            "forgetting",
            "confusion",
            "misunderstanding",
            "application",
        ):
            raise AppError("INTERNAL_ERROR", "Nature de lacune inconnue.")
        notions.append(
            {
                "notionId": str(row["notion_id"]),
                "label": str(row["label"]),
                "chapterId": str(row["chapter_id"]),
                "moduleId": str(row["module_id"]),
                "modulePosition": int(row["module_position"]),
                "moduleStatus": module_status,
                "evaluated": bool(row["evaluated"]),
                "dueAt": _instant_text(row["due_at"]),
                "mastery": float(row["mastery"]),
                "gapNature": gap_nature,
            }
        )
    return {
        "formationId": formation_id,
        "at": to_iso(now),
        "notions": notions,
        "gaps": [
            {"notionId": notion["notionId"], "nature": notion["gapNature"]}
            for notion in notions
            if notion["gapNature"] is not None
        ],
    }


def _due_notion(row: Mapping[str, Any], engine_notions: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    notion_id = str(row["notion_id"])
    engine = engine_notions.get(notion_id)
    return {
        "notionId": notion_id,
        "moduleId": str(row["module_id"]),
        "modulePosition": int(row["module_position"]),
        "moduleStatus": "validated" if engine is None else engine["moduleStatus"],
        "evaluated": True if engine is None else engine["evaluated"],
        "dueAt": _instant_text(row["due_at"]),
    }


async def load_last_formats(tx: Any, user_id: str, formation_id: str) -> list[dict[str, str]]:
    """`loadLastFormats`: the format of the latest answer of each notion, newest answers first."""
    last_by_notion: dict[str, dict[str, str]] = {}
    for row in await queries.read_quiz_last_formats(tx, user_id, formation_id):
        for notion_id in row["notion_ids"] or []:
            last_by_notion.setdefault(
                str(notion_id), {"notionId": str(notion_id), "format": str(row["type"])}
            )
    return list(last_by_notion.values())


async def get_or_create_today_session(
    deps: LearningDeps, actor: Actor, formation_id: str, mode: str
) -> dict[str, Any]:
    """EF-2, EF-1, CL-1 to CL-4 - reads, and creates on the first load, the session of the day."""
    from learny.learning.application.final_review import is_uuid

    if not is_uuid(formation_id):
        raise AppError("VALIDATION_FAILED", texts.SESSION_FORMATION_INVALID)
    user_id = actor.user_id
    if mode not in ("full", "micro"):
        raise AppError("VALIDATION_FAILED", texts.SESSION_FORMATION_INVALID)
    now = deps.clock.now()
    smoothing_candidate: dict[str, Any] | None = None
    async with deps.db.user_tx(actor) as tx:
        time_zone = await load_profile_timezone(tx, user_id)
        today = local_date_of(to_iso(now), time_zone)
        formation = await queries.read_quiz_formation(tx, user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.SESSION_FORMATION_NOT_FOUND)
        if formation["status"] == "paused":
            return empty_dto(today, formation_id, "paused")
        if formation["status"] == "completed":
            raise AppError("NOT_FOUND", texts.SESSION_FORMATION_NOT_FOUND)

        await close_stale_sessions(deps, tx, user_id, today)

        existing = await queries.read_quiz_today_activity(tx, user_id, formation_id, today, mode)
        if existing is not None:
            activity = dict(existing)
            parsed_existing = parse_session_config(activity["config"])
            if parsed_existing is not None:
                await reopen_deferred_notions(
                    deps, tx, user_id, time_zone, today, formation_id, activity, parsed_existing
                )
            attempt = _attempt_of(existing)
            return await build_dto(deps, tx, user_id, time_zone, today, formation, activity, attempt)

        _, day_end = _day_bounds(today, time_zone)
        due_rows = await queries.read_quiz_due_rows(tx, user_id, formation_id, day_end)
        due_count = len(due_rows)
        if due_count == 0:
            return empty_dto(today, formation_id, "empty")
        review_rows = [row for row in due_rows if row["in_review"]]
        due = await read_due_notions(deps, tx, user_id, formation_id, now)
        engine_notions = {str(notion["notionId"]): notion for notion in due["notions"]}
        bricks = await queries.read_quiz_active_bricks(tx, user_id, formation_id)
        bank = [
            {
                "notionId": str(row["notion_id"]),
                "formats": sorted(
                    {
                        str(brick["type"])
                        for brick in bricks
                        if str(row["notion_id"]) in [str(item) for item in brick["notion_ids"] or []]
                    }
                ),
            }
            for row in review_rows
        ]
        last_formats = await load_last_formats(tx, user_id, formation_id)
        forced_games = await load_forced_games(tx, user_id, formation_id, due_rows)
        automation = await load_automation_params(tx, user_id)
        micro_minutes = automation["microMinutes"]
        cap_minutes = micro_minutes if mode == "micro" else automation["capMinutes"]
        drawn = global_quiz.build_daily_session(
            formation_id=formation_id,
            date=today,
            due_notions=[_due_notion(row, engine_notions) for row in review_rows],
            gaps=due["gaps"],
            bank=bank,
            last_formats=last_formats,
            forced_formats=[
                {"notionId": game["notionId"], "format": game["format"]}
                for game in forced_games.values()
                if game["format"] is not None
            ],
            cap_minutes=cap_minutes,
            mode=mode,
            seed=f"global-quiz:{user_id}:{formation_id}:{today}:{mode}",
            preference=automation["preference"],
            target_retention=automation["targetRetention"],
            params=_engine_quiz_params(),
        )
        notion_by_id = {str(row["notion_id"]): row for row in due_rows}
        selected_notions = {str(item["notionId"]) for item in drawn["items"]}
        seen = await queries.read_quiz_seen_fingerprints(tx, user_id)
        if mode == "micro":
            grouped = compose_micro(
                [str(item["notionId"]) for item in drawn["items"]],
                review_rows,
                bricks,
                notion_by_id,
                seen,
                micro_minutes,
            )
        else:
            grouped = group_by_bricks(
                [
                    {
                        "notionId": str(item["notionId"]),
                        "format": str(item["format"]),
                        "gapNature": item.get("gapNature"),
                    }
                    for item in drawn["items"]
                ],
                notion_by_id,
                selected_notions,
                bricks,
                seen,
                forced_games,
            )
        if not grouped["items"]:
            return empty_dto(today, formation_id, "empty")

        selected_count = len({str(notion) for item in grouped["items"] for notion in item["notionIds"]})
        deferred_count = max(0, due_count - selected_count)
        deferred_to = add_days(today, 1)
        estimated_sec = (
            micro_minutes * 60
            if mode == "micro"
            else sum(item_cost_sec(str(item["format"]), len(item["notionIds"])) for item in grouped["items"])
        )
        micro_card_count_value = len([item for item in grouped["items"] if item["format"] == "recall_card"])
        micro_has_question = any(item["format"] != "recall_card" for item in grouped["items"])
        rationale = build_rationale(
            time_zone=time_zone,
            due_count=due_count,
            deferred_count=deferred_count,
            deferred_to=deferred_to,
            cap_minutes=cap_minutes,
            gap_items=gap_items_of(grouped["items"], notion_by_id),
            module_positions=[
                int(notion_by_id[str(notion)]["module_position"]) if str(notion) in notion_by_id else 0
                for item in grouped["items"]
                for notion in item["notionIds"]
            ],
            mode=mode,
            micro_cards=micro_card_count_value,
            micro_has_question=micro_has_question,
        )
        config: dict[str, Any] = {
            "mode": mode,
            "forDate": today,
            "dueCount": due_count,
            "deferredCount": deferred_count,
            "deferredTo": deferred_to,
            "capMinutes": cap_minutes,
            "estimatedSec": estimated_sec,
            "targetRetention": (
                float(ENGINE["fsrs"]["requestRetention"])
                if mode == "micro"
                else automation["targetRetention"]
            ),
            "rationale": rationale,
            "tuned": [] if mode == "micro" else build_tuned(forced_games, due_rows, time_zone),
            "items": [
                {
                    "position": index,
                    "format": item["format"],
                    "reasonKey": item["reasonKey"],
                    "displayLabel": item["displayLabel"],
                    "moduleIds": item["moduleIds"],
                    "notionIds": item["notionIds"],
                    "actionId": item["actionId"],
                }
                for index, item in enumerate(grouped["items"])
            ],
        }
        if mode == "micro":
            config["note"] = build_micro_note(cards=micro_card_count_value, has_question=micro_has_question)
            config["microMinutes"] = micro_minutes

        lock_key = f"{user_id}:{formation_id}:{today}:{mode}"
        await queries.lock_quiz_session(tx, lock_key)
        replay = await queries.read_quiz_today_activity(tx, user_id, formation_id, today, mode)
        if replay is not None:
            return await build_dto(
                deps,
                tx,
                user_id,
                time_zone,
                today,
                formation,
                dict(replay),
                _attempt_of(replay),
            )

        activity_id = str(uuid.uuid4())
        attempt_id = str(uuid.uuid4())
        created_at = to_iso(now)
        items_json = [
            {"brickId": item["brickId"], "brickVersionId": item["brickVersionId"]}
            for item in grouped["items"]
        ]
        await queries.install_quiz_activity(
            tx,
            activity_id=activity_id,
            user_id=user_id,
            formation_id=formation_id,
            config=_json(config),
            items=_json(items_json),
            today=today,
            created_at=created_at,
        )
        await queries.install_quiz_attempt(
            tx, attempt_id=attempt_id, user_id=user_id, activity_id=activity_id, created_at=created_at
        )
        activity = {
            "id": activity_id,
            "formation_id": formation_id,
            "config": config,
            "items": items_json,
            "status": "ready",
            "for_date": today,
        }
        attempt = {
            "id": attempt_id,
            "attempt_no": 1,
            "status": "in_progress",
            "started_at": created_at,
            "review_feedback": None,
        }
        covered_notions = {str(notion) for item in grouped["items"] for notion in item["notionIds"]}
        deferred_notion_ids = [
            str(row["notion_id"]) for row in review_rows if str(row["notion_id"]) not in covered_notions
        ]
        dto = await build_dto(deps, tx, user_id, time_zone, today, formation, activity, attempt)
        if mode == "full" and deferred_notion_ids:
            smoothing_candidate = {
                "userId": user_id,
                "formationId": formation_id,
                "localDate": today,
                "deferredTo": deferred_to,
                "dueCount": due_count,
                "selectedCount": selected_count,
                "deferredNotionIds": deferred_notion_ids,
                "estimatedMinutes": max(1, -(-estimated_sec // 60)),
                "maxMinutes": cap_minutes,
                "targetRetention": automation["targetRetention"],
                "timeZone": time_zone,
            }
    if smoothing_candidate is None:
        return dto
    recorded = await record_smoothing_action(deps, smoothing_candidate, time_zone)
    if recorded is not None and recorded["status"] == "applied":
        dto["smoothing"] = {
            "actionId": str(recorded["id"]),
            "capMinutes": smoothing_candidate["maxMinutes"],
            "targetRetention": smoothing_candidate["targetRetention"],
            "deferredCount": len(smoothing_candidate["deferredNotionIds"]),
            "deferredTo": smoothing_candidate["deferredTo"],
            "estimatedMinutes": smoothing_candidate["estimatedMinutes"],
        }
    return dto


def _attempt_of(row: Mapping[str, Any]) -> dict[str, Any]:
    """The attempt joined to one session row, with the defaults `findTodayActivity` uses."""
    return {
        "id": "" if row["attempt_id"] is None else str(row["attempt_id"]),
        "attempt_no": 1 if row["attempt_no"] is None else int(row["attempt_no"]),
        "status": "in_progress" if row["attempt_status"] is None else str(row["attempt_status"]),
        "started_at": ("1970-01-01T00:00:00.000Z" if row["started_at"] is None else _iso(row["started_at"])),
        "review_feedback": row["review_feedback"],
    }


def validate_game_response(type_name: str, response: Any) -> list[dict[str, str]]:
    """ET-1 - the contract shape of a game response is validated before grading."""
    issues: list[dict[str, str]] = []

    def invalid(path: str, message: str) -> None:
        issues.append({"path": path, "message": message})

    if not isinstance(response, Mapping):
        return [{"path": "response", "message": "An object is required."}]
    allowed = {
        "matching": ("pairs",),
        "ordering": ("order",),
        "categorization": ("assignments",),
        "cloze": ("gaps",),
    }[type_name]
    for key in response:
        if key not in allowed:
            invalid(f"response.{key}", "Unrecognized key in this response.")
    if type_name == "matching":
        pairs = response.get("pairs")
        if not isinstance(pairs, list) or not 1 <= len(pairs) <= 8:
            invalid("response.pairs", "Between 1 and 8 pairs are required.")
            return issues
        for index, pair in enumerate(pairs):
            if not isinstance(pair, Mapping):
                invalid(f"response.pairs.{index}", "A pair object is required.")
                continue
            for key in pair:
                if key not in ("leftId", "rightId"):
                    invalid(f"response.pairs.{index}.{key}", "Unrecognized key in a pair.")
            for key in ("leftId", "rightId"):
                value = pair.get(key)
                if not isinstance(value, str) or not 1 <= len(value) <= 32:
                    invalid(f"response.pairs.{index}.{key}", "A string of 1 to 32 characters is required.")
        return issues
    if type_name == "ordering":
        order = response.get("order")
        if not isinstance(order, list) or not 1 <= len(order) <= 10:
            invalid("response.order", "Between 1 and 10 items are required.")
            return issues
        for index, value in enumerate(order):
            if not isinstance(value, str) or not 1 <= len(value) <= 32:
                invalid(f"response.order.{index}", "A string of 1 to 32 characters is required.")
        if len({value for value in order if isinstance(value, str)}) != len(order):
            invalid("response.order", "The order identifiers must be unique.")
        return issues
    if type_name == "categorization":
        assignments = response.get("assignments")
        if not isinstance(assignments, list) or not 1 <= len(assignments) <= 12:
            invalid("response.assignments", "Between 1 and 12 assignments are required.")
            return issues
        for index, assignment in enumerate(assignments):
            if not isinstance(assignment, Mapping):
                invalid(f"response.assignments.{index}", "An assignment object is required.")
                continue
            for key in assignment:
                if key not in ("itemId", "categoryId"):
                    invalid(f"response.assignments.{index}.{key}", "Unrecognized key in an assignment.")
            for key in ("itemId", "categoryId"):
                value = assignment.get(key)
                if not isinstance(value, str) or not 1 <= len(value) <= 32:
                    invalid(
                        f"response.assignments.{index}.{key}",
                        "A string of 1 to 32 characters is required.",
                    )
        return issues
    gaps = response.get("gaps")
    if not isinstance(gaps, list) or not 1 <= len(gaps) <= 10:
        invalid("response.gaps", "Between 1 and 10 gaps are required.")
        return issues
    for index, gap in enumerate(gaps):
        if not isinstance(gap, Mapping):
            invalid(f"response.gaps.{index}", "A gap object is required.")
            continue
        for key in gap:
            if key not in ("gapId", "value"):
                invalid(f"response.gaps.{index}.{key}", "Unrecognized key in a gap.")
        gap_id = gap.get("gapId")
        if not isinstance(gap_id, str) or not gap_id.isdigit():
            invalid(f"response.gaps.{index}.gapId", "A numeric gap identifier is required.")
        value = gap.get("value")
        if not isinstance(value, str) or len(value) > 120:
            invalid(f"response.gaps.{index}.value", "A string of at most 120 characters is required.")
    return issues


async def answer_review_item(
    deps: LearningDeps, actor: Actor, session_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-9, EF-10, ET-3 - records one answer of the session, idempotent by `clientAnswerId`."""
    user_id = actor.user_id
    position = int(body["position"])
    client_answer_id = str(body["clientAnswerId"])
    skipped = body.get("skipped") is True
    async with deps.db.user_tx(actor) as tx:
        row = await queries.read_quiz_answer_activity(tx, session_id)
        if row is None or str(row["owner_id"]) != user_id:
            raise AppError("NOT_FOUND", texts.SESSION_NOT_FOUND)
        if row["attempt_status"] != "in_progress":
            raise AppError("SESSION_CLOSED", texts.SESSION_CLOSED, status=422)
        config = parse_session_config(row["config"])
        if config is None:
            raise AppError("INTERNAL_ERROR", texts.SESSION_CONFIG_UNREADABLE)
        item_config = next((item for item in config["items"] if int(item["position"]) == position), None)
        activity_items = list(row["items"] or [])
        version_id = (
            ""
            if position >= len(activity_items)
            else str(activity_items[position].get("brickVersionId") or "")
        )
        if item_config is None or version_id == "":
            raise AppError("VALIDATION_FAILED", texts.SESSION_ITEM_NOT_FOUND)
        if item_config.get("withdrawn") is True:
            raise AppError("CONFLICT", texts.SESSION_ITEM_WITHDRAWN, status=409)

        replay = await queries.read_replay_answer(tx, str(row["attempt_id"]), client_answer_id)
        if replay is not None:
            return await replay_result_dto(tx, user_id, replay)
        conflict = await queries.read_position_answer(tx, str(row["attempt_id"]), position + 1)
        if conflict is not None:
            raise AppError("CONFLICT", texts.SESSION_ITEM_ALREADY_ANSWERED, status=409)

        now = deps.clock.now()
        reviewed_at = to_iso(now)
        time_ms = min(3_600_000, max(0, round(float(body["timeMs"]))))
        is_correct: bool | None = None
        correction: Any = None
        explanation: str | None = None
        rating: str | None = None
        response_to_store: Any = {"skipped": True}
        brick_type: str | None = None
        brick_notion_ids: list[str] = []
        score_ratio: float | None = None
        is_game = False
        game_confusions: list[dict[str, str]] = []
        game_notions: list[dict[str, Any]] = []
        if not skipped:
            brick = await queries.read_answer_brick(tx, version_id)
            if brick is None:
                raise AppError("INTERNAL_ERROR", texts.SESSION_BRICK_NOT_FOUND)
            brick_type = str(brick["type"])
            brick_notion_ids = [str(item) for item in brick["notion_ids"] or []]
            is_game = brick_type in GAME_FORMATS
            response = resolve_response(brick_type, body.get("response"))
            if is_game:
                issues = validate_game_response(brick_type, body.get("response"))
                if issues:
                    raise AppError("VALIDATION_FAILED", texts.SESSION_GAME_INCOMPLETE, errors=issues)
                response = brick_format_response(brick_type, body.get("response"))
            try:
                graded = grade_brick(brick_type, brick["payload"], response, version_id)
            except BrickGradeError as error:
                if is_game:
                    raise AppError(
                        "VALIDATION_FAILED", texts.SESSION_GAME_UNKNOWN_ID, errors=error.issues
                    ) from error
                raise AppError(
                    "RESPONSE_INVALID", texts.SESSION_RESPONSE_INVALID, status=422, errors=error.issues
                ) from error
            is_correct = bool(graded["isCorrect"])
            score_ratio = float(graded["score"])
            if is_game:
                correction = to_game_correction(brick_type, brick["payload"], graded, version_id)
                explanation = correction_explanation(graded)
                game_notions = split_result_by_notion(
                    brick_type,
                    brick["payload"],
                    correction,
                    {
                        "notionIds": brick_notion_ids,
                        "isCorrect": is_correct,
                        "confusions": graded["confusions"],
                    },
                )
                game_confusions = [
                    {
                        "notionId": str(confusion["notionId"]),
                        "withNotionId": str(confusion["confusedWithNotionId"]),
                    }
                    for confusion in graded["confusions"]
                ]
            else:
                correction = graded["correction"]
                candidate = correction.get("explanation") if isinstance(correction, Mapping) else None
                explanation = candidate if isinstance(candidate, str) else None
            if brick_type == "recall_card":
                raw_grade = response.get("selfGrade") if isinstance(response, Mapping) else None
                rating = raw_grade if isinstance(raw_grade, str) else None
                response_to_store = {"selfGrade": rating}
            else:
                response_to_store = body.get("response") or {}

        answer_id = str(uuid.uuid4())
        graded_by_code = not skipped and is_correct is not None
        if graded_by_code:
            if is_game and score_ratio is not None:
                score: float | int | None = round(score_ratio * 10_000) / 10_000
            else:
                score = 100 if is_correct else 0
        else:
            score = None
        max_score: int | None = (1 if is_game else 100) if graded_by_code else None
        await queries.insert_review_answer(
            tx,
            answer_id=answer_id,
            attempt_id=str(row["attempt_id"]),
            version_id=version_id,
            position=position + 1,
            response=_json(response_to_store),
            is_correct=is_correct,
            score=score,
            max_score=max_score,
            time_ms=time_ms,
            feedback=_json(
                {
                    "clientAnswerId": client_answer_id,
                    "correction": correction,
                    "explanation": explanation,
                    "confusions": game_confusions,
                }
            ),
            answered_at=reviewed_at,
        )

        notions: list[dict[str, Any]] = []
        if not skipped and brick_type is not None:
            source = "micro_session" if config["mode"] == "micro" else "global_quiz"
            if game_notions:
                per_notion_ms = max(1, round(time_ms / max(1, len(game_notions))))
                for notion in game_notions:
                    applied = await apply_review_result(
                        tx,
                        user_id=user_id,
                        notion_id=str(notion["notionId"]),
                        source=source,
                        format_name=brick_type,
                        correct=bool(notion["correct"]),
                        rating=None,
                        time_ms=per_notion_ms,
                        answer_id=answer_id,
                        attempt_id=str(row["attempt_id"]),
                        attempt_no=int(row["attempt_no"]),
                        reviewed_at=reviewed_at,
                        confused_with_notion_id=notion.get("confusedWithNotionId"),
                    )
                    if applied is not None:
                        notions.append(
                            {
                                "notionId": str(notion["notionId"]),
                                "rating": applied["rating"],
                                "nextDueAt": applied["dueAt"],
                            }
                        )
            else:
                per_notion_ms = max(1, round(time_ms / max(1, len(brick_notion_ids))))
                for notion_id in brick_notion_ids:
                    applied = await apply_review_result(
                        tx,
                        user_id=user_id,
                        notion_id=notion_id,
                        source=source,
                        format_name=brick_type,
                        correct=is_correct,
                        rating=rating,
                        time_ms=time_ms if brick_type == "recall_card" else per_notion_ms,
                        answer_id=answer_id,
                        attempt_id=str(row["attempt_id"]),
                        attempt_no=int(row["attempt_no"]),
                        reviewed_at=reviewed_at,
                    )
                    if applied is not None:
                        notions.append(
                            {
                                "notionId": notion_id,
                                "rating": applied["rating"],
                                "nextDueAt": applied["dueAt"],
                            }
                        )

        if not skipped and isinstance(item_config.get("actionId"), str) and item_config["actionId"]:
            await queries.consume_quiz_item_action(
                tx,
                user_id=user_id,
                action_id=str(item_config["actionId"]),
                question_card_automation=texts.QUESTION_CARD_AUTOMATION,
            )
        return {
            "position": position,
            "skipped": skipped,
            "isCorrect": is_correct,
            "correction": correction,
            "explanation": explanation,
            "notions": notions,
        }


async def replay_result_dto(tx: Any, user_id: str, row: Mapping[str, Any]) -> dict[str, Any]:
    """Rebuilds the result of an already-recorded answer (idempotent replay, CL-5)."""
    feedback = row["feedback"] if isinstance(row["feedback"], Mapping) else {}
    response = row["response"]
    skipped = isinstance(response, Mapping) and response.get("skipped") is True
    logs = await queries.read_answer_logs(tx, user_id, str(row["id"]))
    return {
        "position": int(row["position"]) - 1,
        "skipped": skipped,
        "isCorrect": row["is_correct"],
        "correction": feedback.get("correction"),
        "explanation": feedback.get("explanation"),
        "notions": [
            {
                "notionId": str(log["notion_id"]),
                "rating": str(log["grade"]),
                "nextDueAt": None if log["due_at"] is None else _instant_text(log["due_at"]),
            }
            for log in logs
        ],
    }


async def complete_review_session(deps: LearningDeps, actor: Actor, session_id: str) -> dict[str, Any]:
    """EF-10, EF-11, EF-13, ET-3 - closes the session and returns its summary, idempotently."""
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        activity = await queries.read_quiz_activity_for_update(tx, session_id)
        if activity is None or str(activity["owner_id"]) != user_id:
            raise AppError("NOT_FOUND", texts.SESSION_NOT_FOUND)
        config = parse_session_config(activity["config"])
        if config is None:
            raise AppError("INTERNAL_ERROR", texts.SESSION_CONFIG_UNREADABLE)
        attempt = await queries.read_latest_attempt(tx, session_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.SESSION_NOT_FOUND)
        if attempt["status"] != "in_progress":
            stored = parse_summary(attempt["review_feedback"])
            if stored is not None:
                return stored
            raise AppError("SESSION_CLOSED", texts.SESSION_CLOSED, status=422)

        time_zone = await load_profile_timezone(tx, user_id)
        now = deps.clock.now()
        day = local_date_of(to_iso(now), time_zone)
        await close_attempt(deps, tx, user_id, str(attempt["id"]))

        answer_rows = await queries.read_attempt_answer_rows(tx, str(attempt["id"]))
        answer_by_position = {int(row["position"]): row for row in answer_rows}
        reviewed_count = 0
        ok_notions: set[str] = set()
        soon_notions: set[str] = set()
        answered_count = 0
        correct_count = 0
        for item in config["items"]:
            if item.get("withdrawn") is True:
                continue
            answer = answer_by_position.get(int(item["position"]) + 1)
            if answer is None:
                continue
            reviewed_count += len(item["notionIds"])
            response = answer["response"]
            if isinstance(response, Mapping) and response.get("skipped") is True:
                for notion_id in item["notionIds"]:
                    soon_notions.add(str(notion_id))
                continue
            answered_count += 1
            if answer["is_correct"] is True:
                correct_count += 1
                for notion_id in item["notionIds"]:
                    ok_notions.add(str(notion_id))
            else:
                for notion_id in item["notionIds"]:
                    soon_notions.add(str(notion_id))

        started_at = _epoch(attempt["started_at"])
        clock_ms = max(0, shared_time.to_epoch_ms(now) - started_at)
        answered_ms = sum(int(row["time_ms"] or 0) for row in answer_rows)
        duration_ms = max(clock_ms, answered_ms)
        minutes = max(1, -(-duration_ms // 60_000))
        score = None if answered_count == 0 else round((correct_count / answered_count) * 100)
        await queries.mark_attempt_graded(
            tx,
            attempt_id=str(attempt["id"]),
            submitted_at=to_iso(now),
            duration_ms=duration_ms,
            score=score,
        )
        has_answer = reviewed_count > 0
        sources = (
            ["micro_session", f"review-session:{session_id}"]
            if config["mode"] == "micro"
            else [f"review-session:{session_id}"]
        )
        await queries.upsert_daily_activity(
            tx, user_id=user_id, day=day, minutes=minutes, qualifying=has_answer, sources=sources
        )
        if has_answer:
            await queries.consume_automation_actions_of_day(
                tx,
                user_id=user_id,
                automation="micro_seance",
                day=day,
                complete_slots=config["mode"] == "micro",
            )
        if has_answer and config["mode"] == "full":
            await queries.complete_quiz_slots(
                tx,
                user_id=user_id,
                formation_id=str(activity["formation_id"]),
                day=day,
                timezone=time_zone,
                now=to_iso(now),
            )
        streak_days = await bump_streak(tx, user_id, day) if has_answer else await current_streak(tx, user_id)
        next_session_at = await next_planned_slot(tx, str(activity["formation_id"]), now, day, time_zone)
        summary = {
            "reviewedCount": reviewed_count,
            "minutes": minutes,
            "okCount": len(ok_notions),
            "soonCount": len(soon_notions),
            "streakDays": streak_days,
            "nextSessionAt": next_session_at,
        }
        await queries.store_attempt_summary(tx, str(attempt["id"]), _json({"summary": summary}))
        await tx.emit(
            "review/session-completed",
            {
                "userId": user_id,
                "formationId": str(activity["formation_id"]),
                "sessionId": session_id,
                "mode": config["mode"],
                "forDate": config["forDate"],
                "reviewedCount": reviewed_count,
            },
            event_id=f"review-session-completed:{session_id}",
        )

    # SPEC-723 consumes `review/session-completed` to reconcile the milestones; the notification
    # of a new milestone (SPEC-2205 `notify`) is produced here, after the commit of the closure, and
    # a failure of the channel never fails the closure itself.
    try:
        await reconcile_milestones(deps, actor)
    except Exception:
        deps.logger.warn("review.milestones.failed", outcome="reconcile_failed")
    return summary


async def bump_streak(tx: Any, user_id: str, day: str) -> int:
    """BR-GAM-01 - a qualifying day not yet counted extends the streak by one."""
    profile = await queries.read_profile_streak_for_update(tx, user_id)
    if profile is None:
        return 0
    computed_on = profile["streak_computed_on"]
    if computed_on is not None and str(computed_on) >= day:
        return int(profile["streak_days"])
    previous_qualifying = await queries.read_yesterday_qualifying(tx, user_id, add_days(day, -1))
    streak = int(profile["streak_days"]) + 1 if previous_qualifying and int(profile["streak_days"]) > 0 else 1
    await queries.update_profile_streak(tx, user_id, streak, day)
    return streak


async def current_streak(tx: Any, user_id: str) -> int:
    """The stored streak of the learner."""
    return await queries.read_profile_streak(tx, user_id)


async def next_planned_slot(
    tx: Any, formation_id: str, now: datetime, day: str, time_zone: str
) -> str | None:
    """First planned global-quiz slot after `now` and after the civil day of the closure (EF-11)."""
    found = await queries.read_next_quiz_slot(tx, formation_id, to_iso(now), day, time_zone)
    return None if found is None else _instant_text(found)


__all__ = [
    "answer_review_item",
    "build_dto",
    "build_micro_note",
    "build_rationale",
    "build_tuned",
    "complete_review_session",
    "compose_micro",
    "empty_dto",
    "get_or_create_today_session",
    "group_by_bricks",
    "item_scope_label",
    "load_automation_params",
    "modules_label",
    "parse_session_config",
    "rank_notions",
    "reason_of",
    "reopen_deferred_notions",
    "replay_result_dto",
    "validate_game_response",
    "weekday_label",
]
