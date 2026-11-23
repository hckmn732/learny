"""Proposed and active programme use cases (SPEC-605 EF-1 to EF-5, SPEC-606 EF-1 to EF-4).

Port of `programme/{state,get,generate,adjust,import,validate,get-active-programme}.ts` and of
`programme/progress.ts`. The tutor call runs outside any transaction; the write of a version and the
status transition are one transaction guarded by the programme advisory lock and the expected
version. Modules and planning rows are never touched before the validation.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.application.tutor import TutorProfile, run_programme_draft
from learny.formation.domain import programme as rules
from learny.formation.domain.active_limit import MAX_ACTIVE_FORMATIONS
from learny.formation.domain.notion_graph import encode
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    FORMATION_LIMIT_REACHED,
    FORMATION_NOT_FOUND,
    PROGRAMME_ADJUSTMENT_MISSING,
    PROGRAMME_ALREADY_ACTIVE,
    PROGRAMME_ALREADY_PROPOSED,
    PROGRAMME_ALREADY_VALIDATED,
    PROGRAMME_CHANGED,
    PROGRAMME_CHAPTER_MISSING,
    PROGRAMME_DATE_END,
    PROGRAMME_DATE_START,
    PROGRAMME_GENERATE_MESSAGE,
    PROGRAMME_IMPORT_MESSAGE,
    PROGRAMME_IMPORT_SOURCE,
    PROGRAMME_IMPORT_TITLE,
    PROGRAMME_MISSING_DATE,
    PROGRAMME_MODULE_MISSING,
    PROGRAMME_NO_MODULE,
    PROGRAMME_NO_MODULE_PLANNED,
    PROGRAMME_NOT_ACTIVATABLE,
    PROGRAMME_NOT_ACTIVE,
    PROGRAMME_NOT_ADJUSTABLE,
    PROGRAMME_PROPOSAL_MISSING,
    PROGRAMME_PROPOSAL_VERSION_TITLE,
    PROGRAMME_STALE,
    PROGRAMME_VERSION_LABEL,
    WEB_SEARCH_UNAVAILABLE,
)
from learny.shared.time import to_iso


def _iso(value: Any) -> str:
    return value if isinstance(value, str) else to_iso(value)


def _version_error(version: int) -> dict[str, str]:
    return {"path": "expectedVersion", "message": PROGRAMME_VERSION_LABEL.format(version=version)}


def _stale(version: int) -> AppError:
    return AppError("CONFLICT", PROGRAMME_STALE, status=409, errors=[_version_error(version)])


def _cadrage_summary(value: Any) -> dict[str, str]:
    """`cadrageSummary`: only the collected, non-blank rubric values."""
    if not isinstance(value, Mapping):
        return {}
    summary: dict[str, str] = {}
    for key, entry in value.items():
        if not isinstance(entry, Mapping):
            continue
        raw = entry.get("value")
        if isinstance(raw, str) and raw.strip() != "":
            summary[str(key)] = raw
    return summary


def _tutor_profile(profile: Mapping[str, Any]) -> TutorProfile:
    language = "fr" if profile["courseLanguage"] not in ("fr", "en") else profile["courseLanguage"]
    return TutorProfile(tone=str(profile["tone"]), course_language=str(language))


def _version_summaries(proposals: Sequence[Mapping[str, Any]], current: int) -> list[dict[str, Any]]:
    return [
        {
            "version": int(proposal["version"]),
            "source": proposal["source"],
            "createdAt": _iso(proposal["created_at"]),
            "current": int(proposal["version"]) == current,
        }
        for proposal in proposals
    ]


def build_proposal_dto(
    *,
    formation: Mapping[str, Any],
    proposal: Mapping[str, Any],
    proposals: Sequence[Mapping[str, Any]],
    active_count: int,
    active: Mapping[str, Sequence[Mapping[str, Any]]] | None = None,
) -> dict[str, Any]:
    """`buildProposalDto`: the stored payload, completed with the active rows when they exist."""
    payload = rules.parse_payload(proposal["payload"])
    is_active_structure = active is not None and formation["status"] in (
        "active",
        "paused",
        "completed",
    )
    module_by_position = (
        {int(row["position"]): row for row in (active or {}).get("modules", [])} if active else {}
    )
    chapters_by_module: dict[str, list[Mapping[str, Any]]] = {}
    for chapter in (active or {}).get("chapters", []):
        chapters_by_module.setdefault(str(chapter["module_id"]), []).append(chapter)
    notions_by_chapter: dict[str, list[Mapping[str, Any]]] = {}
    for notion in (active or {}).get("notions", []):
        notions_by_chapter.setdefault(str(notion["chapter_id"]), []).append(notion)

    modules: list[dict[str, Any]] = []
    for module in payload["modules"]:
        row = module_by_position.get(int(module["position"])) if is_active_structure else None
        chapters: list[dict[str, Any]] = []
        for chapter in module["chapters"]:
            chapter_row = None
            if row is not None:
                chapter_row = next(
                    (
                        entry
                        for entry in chapters_by_module.get(str(row["id"]), [])
                        if int(entry["position"]) == int(chapter["position"])
                    ),
                    None,
                )
            notions: list[dict[str, str]] = []
            if chapter_row is None:
                notions = [dict(item) for item in chapter["notions"]]
            else:
                for notion in notions_by_chapter.get(str(chapter_row["id"]), []):
                    notions.append(
                        {
                            "label": str(notion["label"]),
                            "definition": str(notion["short_definition"] or ""),
                        }
                    )
            chapters.append(
                {
                    "position": int(chapter["position"]),
                    "title": str(chapter_row["title"]) if chapter_row else chapter["title"],
                    "notions": notions or [dict(item) for item in chapter["notions"]],
                }
            )
        modules.append(
            {
                "position": int(module["position"]),
                "title": str(row["title"]) if row else module["title"],
                "objectives": list(row["objectives"]) if row else module["objectives"],
                "plannedStart": row["planned_start"] if row else module["plannedStart"],
                "plannedEnd": row["planned_end"] if row else module["plannedEnd"],
                "threshold": int(row["threshold"]) if row else module["threshold"],
                "status": row["status"] if row else None,
                "chapters": chapters,
            }
        )

    latest_version = int(proposals[0]["version"]) if proposals else int(proposal["version"])
    return {
        "formationId": formation["id"],
        "version": int(proposal["version"]),
        "source": proposal["source"],
        "proposalStatus": "active" if is_active_structure else "proposed",
        "title": formation["title"],
        "description": formation["description"] or proposal["description"] or payload["description"],
        "summary": proposal["summary"] or payload["summary"],
        "volumeHours": formation["volume_hours"] or proposal["volume_hours"] or payload["volumeHours"],
        "createdAt": _iso(proposal["created_at"]),
        "modules": modules,
        "versions": _version_summaries(proposals, latest_version),
        "activeFormationCount": active_count,
    }


async def read_programme_state(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    version: int | None = None,
    completed: bool | None = None,
) -> dict[str, Any]:
    """`readProgrammeState`: the whole page state of the GET route and of every mutation answer."""
    formation = await queries.read_programme_formation(tx, user_id, formation_id)
    if formation is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    proposals = await queries.list_proposals(tx, formation_id)
    latest = proposals[0] if proposals else None
    selected = (
        latest
        if version is None
        else next(
            (item for item in proposals if int(item["version"]) == version),
            None,
        )
    )
    cadrage_completed = await queries.cadrage_completed(tx, formation_id) if completed is None else completed
    active_count = await queries.count_active_formations(tx, user_id, formation_id)

    proposal: dict[str, Any] | None = None
    if selected is not None:
        active: dict[str, Any] | None = None
        if (
            latest is not None
            and int(selected["version"]) == int(latest["version"])
            and formation["status"] in rules.ACTIVE_FORMATION_STATUSES
        ):
            modules, chapters, notions = await queries.read_active_structure(tx, formation_id)
            active = {"modules": modules, "chapters": chapters, "notions": notions}
        proposal = build_proposal_dto(
            formation=formation,
            proposal=selected,
            proposals=proposals,
            active_count=active_count,
            active=active,
        )
    return {
        "formationId": formation["id"],
        "title": formation["title"],
        "description": formation["description"],
        "formationStatus": formation["status"],
        "cadrageCompleted": cadrage_completed,
        "proposal": proposal,
    }


def _module_status(value: str) -> str:
    if value in rules.PROGRAMME_MODULE_STATUSES:
        return value
    raise AppError("INTERNAL_ERROR", PROGRAMME_NO_MODULE_PLANNED)


def _active_status(value: str) -> str:
    if value in rules.ACTIVE_FORMATION_STATUSES:
        return value
    raise AppError("CONFLICT", PROGRAMME_NOT_ACTIVE, status=409)


def _score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _required_date(value: str | None, label: str) -> str:
    if value is None:
        raise AppError("CONFLICT", PROGRAMME_MISSING_DATE.format(label=label), status=409)
    return value


def _module_href(formation_id: str, module_id: str) -> str:
    return f"/formations/{encode(formation_id)}/modules/{encode(module_id)}"


def _chapter_href(formation_id: str, module_id: str, chapter_id: str) -> str:
    return f"{_module_href(formation_id, module_id)}/cours?chapitre={encode(chapter_id)}"


def local_day(now: Any, timezone: str) -> str:
    """`userLocalDay`: the learner's civil day, never the process time zone."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    try:
        zone = ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("UTC")
    return str(now.astimezone(zone).date().isoformat())


async def read_active_programme(
    tx: Tx,
    user_id: str,
    formation_id: str,
    today: str,
    formation: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """`readActiveProgramme`: persisted rows only, never a client-side proposal (SPEC-606 ET-3)."""
    current = formation or await queries.read_programme_formation(tx, user_id, formation_id, access="member")
    if current is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    status = _active_status(str(current["status"]))
    profile = await queries.read_programme_profile(tx, user_id)
    preference = await queries.read_study_preference(tx, user_id)
    module_rows = await queries.read_active_programme_modules(tx, user_id, formation_id)
    if not module_rows:
        raise AppError("CONFLICT", PROGRAMME_NO_MODULE_PLANNED, status=409)
    chapter_rows = await queries.read_active_programme_chapters(tx, user_id, formation_id)

    last_position = int(module_rows[-1]["position"])
    modules: list[dict[str, Any]] = []
    for row in module_rows:
        module_status = _module_status(str(row["status"]))
        locked = module_status == "locked"
        position = int(row["position"])
        modules.append(
            {
                "id": row["id"],
                "position": position,
                "title": row["title"],
                "objectives": list(row["objectives"]),
                "plannedStart": _required_date(row["planned_start"], PROGRAMME_DATE_START),
                "plannedEnd": _required_date(row["planned_end"], PROGRAMME_DATE_END),
                "threshold": int(row["threshold"]),
                "status": module_status,
                "score": _score(row["best_score"]),
                "quizOn": row["planned_end"],
                "quizKind": "exam" if position == last_position else "quiz",
                "unlockAfterPosition": position - 1 if locked and position > 1 else None,
                "href": None if locked else _module_href(formation_id, str(row["id"])),
            }
        )
    chapters = [
        {
            "id": row["id"],
            "moduleId": row["module_id"],
            "position": int(row["position"]),
            "title": row["title"],
            "contributionsStatus": ("done" if row["contributions_status"] == "done" else "in_progress"),
            "courseHref": _chapter_href(formation_id, str(row["module_id"]), str(row["id"])),
        }
        for row in chapter_rows
    ]
    first, last = modules[0], modules[-1]
    weeks = rules.calendar_weeks(str(first["plannedStart"]), str(last["plannedEnd"]))
    return {
        "formation": {
            "id": current["id"],
            "title": current["title"],
            "description": current["description"],
            "objectives": list(current["objectives"]),
            "volumeHours": current["volume_hours"],
            "startDate": current["start_date"],
            "endDate": current["end_date"],
            "threshold": int(current["default_threshold"]),
            "status": status,
        },
        "indicators": rules.programme_indicators(
            status=status,
            modules=modules,
            weeks=weeks,
            volume_hours=current["volume_hours"],
            threshold=int(current["default_threshold"]),
            hours_per_day=preference["hoursPerDay"],
            study_days_per_week=preference["studyDaysPerWeek"],
        ),
        "modules": modules,
        "chapters": chapters,
        "calendar": [
            {
                "moduleId": module["id"],
                "position": module["position"],
                "title": module["title"],
                "start": module["plannedStart"],
                "end": module["plannedEnd"],
                "status": module["status"],
                "quizOn": module["quizOn"],
                "quizKind": module["quizKind"],
            }
            for module in modules
        ],
        "today": today,
        "timeZone": profile["timezone"],
    }


async def get_programme_state(
    deps: FormationDeps, actor: Actor, formation_id: str, query: Mapping[str, Any]
) -> dict[str, Any]:
    """ET-3 - the same GET route serves the proposed programme and the active one."""
    version = query.get("version")
    # `event_outbox` is RLS-protected and has no `authenticated` policy: the completion marker is
    # read with the service role, exactly like `cadrage._already_completed` (SPEC-605, SPEC-203).
    completed = await _already_cadrage_completed(deps, formation_id)
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_programme_formation(tx, actor.user_id, formation_id, access="member")
        if formation is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if formation["status"] in rules.ACTIVE_FORMATION_STATUSES:
            profile = await queries.read_programme_profile(tx, actor.user_id)
            return await read_active_programme(
                tx,
                actor.user_id,
                formation_id,
                local_day(deps.clock.now(), str(profile["timezone"])),
                formation,
            )
        return await read_programme_state(
            tx,
            actor.user_id,
            formation_id,
            version=None if version is None else int(version),
            completed=completed,
        )


async def _already_cadrage_completed(deps: FormationDeps, formation_id: str) -> bool:
    """`cadrageAlreadyCompleted`: the outbox marker is read with the service role (RLS-protected)."""
    async with deps.db.service_tx() as tx:
        return await queries.cadrage_completed(tx, formation_id)


def search_context(title: str, scope: str | None) -> str:
    """EF-1 - web results only inform the proposal and never become raw course content (BR-IA-12)."""
    return WEB_SEARCH_UNAVAILABLE


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


async def generate_proposal(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/programme/generate` (EF-1, ET-4)."""
    expected = int(body["expectedVersion"])
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if formation["status"] in ("active", "paused"):
            raise AppError("CONFLICT", PROGRAMME_ALREADY_ACTIVE, status=409)
        if formation["status"] not in ("cadrage", "programme_proposed"):
            raise AppError("CONFLICT", PROGRAMME_NOT_ACTIVATABLE, status=409)
        version = await queries.current_version(tx, formation_id)
        if version != 0 or expected != 0:
            raise AppError(
                "CONFLICT",
                PROGRAMME_CHANGED if version == 0 else PROGRAMME_ALREADY_PROPOSED,
                status=409,
                errors=[_version_error(version)],
            )
        profile = await queries.read_programme_profile(tx, actor.user_id)

    sources = search_context(
        str(formation["title"]), _cadrage_summary(formation["cadrage_profile"]).get("scope")
    )
    result = await run_programme_draft(
        deps.llm,
        tutor=_tutor_profile(profile),
        title=str(formation["title"]),
        message=PROGRAMME_GENERATE_MESSAGE.format(title=formation["title"]),
        context=_json(
            {
                "objectifs": list(formation["objectives"]),
                "cadrage": _cadrage_summary(formation["cadrage_profile"]),
                "volumeHeures": formation["volume_hours"],
                "dateDebut": formation["start_date"],
                "dateFin": formation["end_date"],
                "sourcesWeb": sources,
            }
        ),
        scenario=rules.programme_scenario("generate", str(formation["title"])),
    )
    payload = rules.normalize_draft(result.draft)

    async with deps.db.user_tx(actor) as tx:
        await queries.lock_programme(tx, formation_id)
        current = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if current is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        version = await queries.current_version(tx, formation_id)
        if version != 0 or expected != 0:
            raise AppError("CONFLICT", PROGRAMME_CHANGED, status=409, errors=[_version_error(version)])
        await queries.insert_proposal(
            tx,
            actor.user_id,
            formation_id,
            version=1,
            source="generated",
            payload=payload,
            import_id=None,
            change_request_id=None,
            now=now,
        )
        await queries.update_formation_from_proposal(
            tx, actor.user_id, formation_id, status="programme_proposed", payload=payload, now=now
        )
        return await read_programme_state(tx, actor.user_id, formation_id, completed=True)


async def adjust_proposal(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/programme/adjust` (EF-3, ET-4)."""
    expected = int(body["expectedVersion"])
    message = str(body["message"])
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if formation["status"] != "programme_proposed":
            raise AppError("CONFLICT", PROGRAMME_NOT_ADJUSTABLE, status=409)
        version = await queries.current_version(tx, formation_id)
        if version != expected:
            raise _stale(version)
        proposal = await queries.read_proposal(tx, formation_id, version)
        if proposal is None:
            raise AppError("NOT_FOUND", PROGRAMME_PROPOSAL_MISSING)
        payload = rules.parse_payload(proposal["payload"])
        change_request_id = await queries.insert_change_request(tx, actor.user_id, formation_id, message, now)
        if change_request_id is None:
            raise AppError("INTERNAL_ERROR", PROGRAMME_ADJUSTMENT_MISSING)
        profile = await queries.read_programme_profile(tx, actor.user_id)

    try:
        result = await run_programme_draft(
            deps.llm,
            tutor=_tutor_profile(profile),
            title=str(formation["title"]),
            message=message,
            context=_json({"versionActuelle": int(proposal["version"])}),
            documents=(
                {
                    "source": "proposition-actuelle",
                    "title": PROGRAMME_PROPOSAL_VERSION_TITLE.format(version=proposal["version"]),
                    "text": _json(payload),
                },
            ),
            scenario=rules.programme_scenario("adjust", str(formation["title"]), message),
        )
    except AppError as error:
        async with deps.db.service_tx() as tx:
            await queries.fail_change_request(
                tx, actor.user_id, change_request_id, "failed", error.detail, now
            )
        raise
    payload = rules.normalize_draft(result.draft)

    async with deps.db.user_tx(actor) as tx:
        await queries.lock_programme(tx, formation_id)
        current = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if current is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        version = await queries.current_version(tx, formation_id)
        if version != expected:
            raise _stale(version)
        await queries.insert_proposal(
            tx,
            actor.user_id,
            formation_id,
            version=version + 1,
            source="generated",
            payload=payload,
            import_id=None,
            change_request_id=change_request_id,
            now=now,
        )
        await queries.update_formation_from_proposal(
            tx, actor.user_id, formation_id, status="programme_proposed", payload=payload, now=now
        )
        await queries.complete_change_request(
            tx, formation_id, change_request_id, payload.get("summary"), now
        )
        state = await read_programme_state(tx, actor.user_id, formation_id, completed=True)
        await tx.emit(
            "formation/programme-requested",
            {
                "userId": actor.user_id,
                "formationId": formation_id,
                "changeRequestId": change_request_id,
            },
            event_id=f"programme-requested:{change_request_id}",
        )
        return state


async def validate_proposal(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/programme/validate` (EF-4, ET-2, ET-4, ET-5; CA-1, CA-3, CA-4)."""
    expected = int(body["expectedVersion"])
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_programme(tx, formation_id)
        formation = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if formation["status"] in ("active", "paused"):
            raise AppError("CONFLICT", PROGRAMME_ALREADY_VALIDATED, status=409)
        if formation["status"] not in ("cadrage", "programme_proposed"):
            raise AppError("CONFLICT", PROGRAMME_NOT_ACTIVATABLE, status=409)
        version = await queries.current_version(tx, formation_id)
        if version != expected:
            raise AppError("CONFLICT", PROGRAMME_STALE, status=409, errors=[_version_error(version)])
        proposal = await queries.read_proposal(tx, formation_id, version)
        if proposal is None:
            raise AppError("NOT_FOUND", PROGRAMME_PROPOSAL_MISSING)
        payload = rules.parse_payload(proposal["payload"])
        if not payload["modules"]:
            raise AppError("PROGRAMME_INCOMPLETE", PROGRAMME_NO_MODULE, status=422)
        active_count = await queries.count_active_formations(tx, actor.user_id, formation_id)
        if active_count >= MAX_ACTIVE_FORMATIONS:
            raise AppError("FORMATION_LIMIT_REACHED", FORMATION_LIMIT_REACHED, status=422)

        created_by = "import" if proposal["source"] == "imported" else "tutor"
        for index, module in enumerate(payload["modules"]):
            module_id = await queries.insert_module(tx, formation_id, module, index=index, now=now)
            if module_id is None:
                raise AppError("INTERNAL_ERROR", PROGRAMME_MODULE_MISSING)
            await queries.insert_module_progress(tx, actor.user_id, module_id, index=index, now=now)
            for chapter in module["chapters"]:
                chapter_id = await queries.insert_chapter(tx, formation_id, module_id, chapter, now)
                if chapter_id is None:
                    raise AppError("INTERNAL_ERROR", PROGRAMME_CHAPTER_MISSING)
                for position, notion in enumerate(chapter["notions"], start=1):
                    await queries.insert_notion(
                        tx,
                        formation_id,
                        module_id,
                        chapter_id,
                        notion,
                        position=position,
                        created_by=created_by,
                        now=now,
                    )
        await queries.activate_formation(tx, actor.user_id, formation_id, payload, proposal, now)
        await tx.emit(
            "formation/programme-validated",
            {
                "userId": actor.user_id,
                "formationId": formation_id,
                "validatedAt": to_iso(now),
            },
            event_id=f"programme-validated:{formation_id}",
        )
        return await read_programme_state(tx, actor.user_id, formation_id, completed=True)


async def import_proposal(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/programme/import` (EF-2, CL-5)."""
    from learny.formation.application.import_file import extract_programme_text

    expected = int(body["expectedVersion"])
    extracted = extract_programme_text(body)
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if formation["status"] in ("active", "paused"):
            raise AppError("CONFLICT", PROGRAMME_ALREADY_ACTIVE, status=409)
        version = await queries.current_version(tx, formation_id)
        if version != expected:
            raise _stale(version)
        import_id = await queries.insert_import(
            tx,
            actor.user_id,
            formation_id,
            kind=extracted["kind"],
            raw_text=extracted["text"] if extracted["kind"] == "text" else None,
            filename=extracted["filename"],
            original_size=extracted["originalSize"],
            original_content=extracted["originalContent"],
            now=now,
        )
        profile = await queries.read_programme_profile(tx, actor.user_id)

    try:
        result = await run_programme_draft(
            deps.llm,
            tutor=_tutor_profile(profile),
            title=str(formation["title"]),
            message=PROGRAMME_IMPORT_MESSAGE,
            documents=(
                {
                    "source": extracted["filename"] or PROGRAMME_IMPORT_SOURCE,
                    "title": PROGRAMME_IMPORT_TITLE,
                    "text": extracted["text"],
                },
            ),
            scenario=rules.programme_scenario(
                "import",
                str(formation["title"]),
                f"{extracted['filename'] or ''} {extracted['text'][:500]}",
            ),
        )
    except AppError as error:
        async with deps.db.service_tx() as tx:
            await queries.fail_import(tx, actor.user_id, import_id, error.detail or "", now)
        raise
    payload = rules.normalize_draft(result.draft)

    async with deps.db.user_tx(actor) as tx:
        await queries.lock_programme(tx, formation_id)
        current = await queries.read_programme_formation(tx, actor.user_id, formation_id)
        if current is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        version = await queries.current_version(tx, formation_id)
        if version != expected:
            raise _stale(version)
        await queries.insert_proposal(
            tx,
            actor.user_id,
            formation_id,
            version=version + 1,
            source="imported",
            payload=payload,
            import_id=import_id,
            change_request_id=None,
            now=now,
        )
        await queries.update_formation_from_proposal(
            tx, actor.user_id, formation_id, status="programme_proposed", payload=payload, now=now
        )
        await queries.complete_import(tx, formation_id, import_id, payload, now)
        state = await read_programme_state(tx, actor.user_id, formation_id, completed=True)
        await tx.emit(
            "formation/programme-imported",
            {"userId": actor.user_id, "formationId": formation_id, "importId": import_id},
            event_id=f"programme-imported:{import_id}",
        )
        return state
