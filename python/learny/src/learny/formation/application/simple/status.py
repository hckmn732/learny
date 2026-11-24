"""Read model of the simple-mode preparation (SPEC-4001 EF-6, EF-12).

The four steps are always returned in display order, padded from the initial shape when the analysis
has not written them yet. Every user-facing label comes from `locale_fr.simple`.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.formation.infrastructure import queries
from learny.shared.db.uow import Tx
from learny.shared.locale_fr import simple as texts

STEP_KEYS: tuple[str, ...] = ("read", "structure", "practice", "programme")

STEP_DETAILS: dict[str, str] = {
    "read": texts.STEP_READ_DETAIL,
    "structure": texts.STEP_STRUCTURE_DETAIL,
    "practice": texts.STEP_PRACTICE_DETAIL,
    "programme": texts.STEP_PROGRAMME_DETAIL,
}


def initial_steps() -> list[dict[str, Any]]:
    """EF-1 - the four steps of a fresh analysis, all `todo`."""
    return [{"key": key, "state": "todo", "detail": STEP_DETAILS[key]} for key in STEP_KEYS]


def steps_json() -> str:
    """The initial steps as the JSONB value stored on the analysis row."""
    return json.dumps(initial_steps(), ensure_ascii=False)


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return []
        return parsed if isinstance(parsed, list) else []
    return list(value) if isinstance(value, list) else []


def normalize_steps(value: Any) -> list[dict[str, Any]]:
    """EF-6 - exactly four ordered steps, completed with the initial shape when missing."""
    stored = {
        str(entry.get("key")): entry
        for entry in _as_list(value)
        if isinstance(entry, Mapping) and entry.get("key") in STEP_KEYS
    }
    steps: list[dict[str, Any]] = []
    for key in STEP_KEYS:
        entry = stored.get(key)
        state = str(entry.get("state")) if entry is not None else "todo"
        if state not in ("todo", "running", "done"):
            state = "todo"
        detail = entry.get("detail") if entry is not None else None
        steps.append(
            {
                "key": key,
                "state": state,
                "detail": str(detail) if isinstance(detail, str) and detail != "" else STEP_DETAILS[key],
            }
        )
    return steps


def chapters_found(value: Any) -> list[dict[str, Any]]:
    """EF-6 - `[{position, title}]`, bounded by the contract."""
    chapters: list[dict[str, Any]] = []
    for index, entry in enumerate(_as_list(value), start=1):
        if not isinstance(entry, Mapping):
            continue
        title = str(entry.get("title") or "").strip()
        if title == "":
            continue
        position = entry.get("position")
        chapters.append(
            {
                "position": int(position) if isinstance(position, int) and position >= 1 else index,
                "title": title[:160],
            }
        )
    return chapters[:100]


def source_role(metadata: Any) -> str:
    """The documented `metadata.role` of a source, `other` when it is absent."""
    if isinstance(metadata, Mapping):
        role = metadata.get("role")
        if isinstance(role, str) and role in ("course", "exercises", "exam_papers", "other"):
            return role
    return "other"


def source_pages(metadata: Any) -> int | None:
    """EF-6 - the page count of a document when the extraction measured one."""
    if isinstance(metadata, Mapping):
        pages = metadata.get("pages")
        if isinstance(pages, int) and pages >= 1:
            return pages
    return None


def sources_dto(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """EF-6 - the deposited sources, oldest first."""
    return [
        {
            "resourceId": str(row["id"]),
            "title": str(row["title"])[:200],
            "kind": str(row["kind"]) if str(row["kind"]) in ("pdf", "image", "web", "youtube") else "pdf",
            "role": source_role(row.get("metadata")),
            "pages": source_pages(row.get("metadata")),
            "status": str(row["status"]),
        }
        for row in rows
    ]


def generation_dto(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """EF-12 - a validated module is `acquired`, otherwise the current course state decides."""
    modules: list[dict[str, Any]] = []
    for row in rows:
        if str(row["status"]) == "validated":
            state = "acquired"
        elif str(row.get("course_status") or "") == "ready":
            state = "ready"
        elif str(row.get("course_status") or "") == "generating":
            state = "generating"
        else:
            state = "queued"
        modules.append(
            {
                "moduleId": str(row["id"]),
                "position": int(row["position"]),
                "title": str(row["title"])[:160],
                "state": state,
            }
        )
    return modules


def build_simple_state(
    formation: Mapping[str, Any],
    sources: Sequence[Mapping[str, Any]],
    proposal_version: int,
    generation: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """EF-6 - the whole preparation state, without any client-derived value."""
    status = str(formation.get("analysis_status") or "collecting")
    error_code = formation.get("error_code")
    error_message = formation.get("error_message")
    error = None
    if status == "failed" or (error_code is not None and error_message is not None):
        error = {
            "code": str(error_code or "AI_TASK_FAILED"),
            "message": str(error_message or texts.STEP_READ_TIMEOUT),
        }
    state: dict[str, Any] = {
        "formationId": str(formation["id"]),
        "title": str(formation["title"])[:120],
        "status": status,
        "motivation": formation.get("simple_motivation"),
        "steps": normalize_steps(formation.get("steps")),
        "chaptersFound": chapters_found(formation.get("chapters_found")),
        "sources": sources_dto(sources),
        "error": error,
        "proposalVersion": proposal_version if proposal_version > 0 else None,
    }
    if generation is not None:
        state["generation"] = generation_dto(generation)
    return state


async def read_simple_state(tx: Tx, user_id: str, formation_id: str) -> dict[str, Any]:
    """EF-6 - the state of one formation, read under the caller's RLS transaction."""
    from learny.formation.application.simple.create import require_simple_formation

    formation = await require_simple_formation(tx, user_id, formation_id)
    sources = await queries.list_simple_sources(tx, formation_id)
    version = await queries.latest_proposal_version(tx, formation_id)
    generation: Sequence[Mapping[str, Any]] | None = None
    if str(formation["status"]) in ("active", "paused", "completed"):
        generation = await queries.read_generation_modules(tx, formation_id)
    return build_simple_state(formation, sources, version, generation)
