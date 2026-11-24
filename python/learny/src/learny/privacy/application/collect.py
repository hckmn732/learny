"""Collection of one learner's data under row-level security (SPEC-211 EF-3, ET-3).

Every read runs through the learner's transaction, so a shared formation contributes its programme
and the learner's own course but never another member's apports, results or settings. The returned
model is JSON-serialisable; a storage path is carried as is and read only later, in the zip step.
"""

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from learny.identity.domain.actor import Actor
from learny.privacy.application.ports import PrivacyDeps
from learny.privacy.domain.archive import (
    ArchiveApport,
    ArchiveEntry,
    ArchiveFormation,
    ArchiveModel,
    ArchiveModule,
    SettingsInput,
    build_archive_entries,
    build_settings_json,
    format_long_date,
)
from learny.privacy.infrastructure import queries
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import to_iso

DAY_MS = 24 * 60 * 60 * 1000
ARCHIVE_TTL_DAYS = 7


@dataclass(frozen=True, slots=True)
class CollectedExport:
    """The archive entries of one learner, and the zone used to render its dates."""

    timezone: str
    entries: list[ArchiveEntry]


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _scalar(value: Any) -> Any:
    """Serialises a driver value like `node-postgres` does: instants as ISO, the rest as text."""
    if isinstance(value, datetime):
        return to_iso(value)
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    return value


def _plain(row: dict[str, Any]) -> dict[str, Any]:
    """Converts every instant of a row to an ISO string so the value can cross a step boundary."""
    return {key: _scalar(value) for key, value in row.items()}


def _programme_of(
    formation: dict[str, Any],
    modules: list[dict[str, Any]],
    chapters: list[dict[str, Any]],
    notions: list[dict[str, Any]],
    links: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "formation": _plain(formation),
        "modules": [
            {
                **_plain(module),
                "chapters": [
                    {
                        **_plain(chapter),
                        "notions": [
                            _plain(notion) for notion in notions if notion["chapter_id"] == chapter["id"]
                        ],
                    }
                    for chapter in chapters
                    if chapter["module_id"] == module["id"]
                ],
            }
            for module in modules
        ],
        "links": [_plain(link) for link in links],
    }


def _course_markdown(
    module: dict[str, Any], sections: list[dict[str, Any]], citations: dict[str, list[dict[str, Any]]]
) -> str:
    lines = [f"# {_text(module['title'])}", ""]
    for section in sections:
        lines.extend([f"## {_text(section['title']) or fr.ARCHIVE_SECTION_FALLBACK}", ""])
        if _text(section["content_md"]) != "":
            lines.extend([_text(section["content_md"]), ""])
        for citation in citations.get(_text(section["id"]), []):
            label = _text(citation["label"]) or fr.ARCHIVE_SOURCE_DELETED
            quote = _text(citation["quote"])
            lines.append(f"> {label}" if quote == "" else f"> {label} - {quote}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _readme(now: datetime, timezone: str, email: str, formations: int) -> str:
    expiration = to_iso(
        datetime.fromtimestamp(now.timestamp() + ARCHIVE_TTL_DAYS * DAY_MS / 1000, tz=now.tzinfo)
    )
    return "\n".join(
        [
            fr.README_TITLE,
            "",
            fr.README_REQUESTED_AT.format(date=format_long_date(now, timezone), timezone=timezone),
            fr.README_ACCOUNT.format(email=email),
            fr.README_FORMATIONS.format(count=formations),
            "",
            fr.README_CONTENT_HEADING,
            *(f"- {line}" for line in fr.README_LINES),
            "",
            fr.README_NO_SECRET,
            fr.README_REFERENCE_DATE.format(date=format_long_date(now, timezone)),
            fr.README_EXPIRATION.format(instant=expiration),
            "",
        ]
    )


def _apport_of(resource: dict[str, Any]) -> ArchiveApport:
    storage = _text(resource["storage_path"])
    title = _text(resource["title"]) or fr.ARCHIVE_APPORT_FALLBACK
    if storage == "":
        inline = _text(resource["content_text"]) or _text(resource["url"])
        return ArchiveApport(name=f"{title}.txt", text=inline)
    return ArchiveApport(name=storage.rsplit("/", 1)[-1] or title, storage_path=storage)


async def collect_export_data(deps: PrivacyDeps, user_id: str, now: datetime) -> CollectedExport:
    """Reads and lays out one learner's export (EF-3, ET-3)."""
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    async with deps.db.user_tx(actor) as tx:
        tables = await queries.collect_tables(tx, user_id)
        profiles = tables["profile"]
        if not profiles:
            raise LookupError(fr.ARCHIVE_PROFILE_MISSING)
        profile = profiles[0]
        timezone = _text(profile["timezone"]) or "Europe/Paris"
        study = tables["study"][0] if tables["study"] else None
        notifications = tables["notifications"][0] if tables["notifications"] else None
        automations = tuple(_plain(row) for row in tables["automations"])
        formations = tables["formations"]
        modules = tables["modules"]
        chapters = tables["chapters"]
        notions = tables["notions"]
        links = tables["links"]
        courses = tables["courses"]
        sections = tables["sections"]
        resources = tables["resources"]

        citations: dict[str, list[dict[str, Any]]] = {}
        for citation in tables["citations"]:
            citations.setdefault(_text(citation["section_id"]), []).append(citation)
        module_course = {_text(course["id"]): _text(course["module_id"]) for course in courses}
        sections_of: dict[str, list[dict[str, Any]]] = {}
        for section in sections:
            module_id = module_course.get(_text(section["course_id"]), "")
            if module_id != "":
                sections_of.setdefault(module_id, []).append(section)
        chapter_module = {_text(chapter["id"]): _text(chapter["module_id"]) for chapter in chapters}

        programme: list[dict[str, Any]] = []
        archive_formations: list[ArchiveFormation] = []
        for formation in formations:
            formation_id = _text(formation["id"])
            formation_modules = [module for module in modules if module["formation_id"] == formation_id]
            programme.append(
                _programme_of(
                    formation,
                    formation_modules,
                    [chapter for chapter in chapters if chapter["formation_id"] == formation_id],
                    [notion for notion in notions if notion["formation_id"] == formation_id],
                    [link for link in links if link["formation_id"] == formation_id],
                )
            )
            archive_modules: list[ArchiveModule] = []
            for module in formation_modules:
                module_sections = sections_of.get(_text(module["id"]), [])
                markdown = (
                    None if not module_sections else _course_markdown(module, module_sections, citations)
                )
                apports: list[ArchiveApport] = []
                for resource in resources:
                    if resource["formation_id"] != formation_id:
                        continue
                    chapter_id = resource["chapter_id"]
                    module_id = "" if chapter_id is None else chapter_module.get(_text(chapter_id), "")
                    matches = (
                        formation_modules[0]["id"] == module["id"]
                        if module_id == ""
                        else module_id == module["id"]
                    )
                    if matches:
                        apports.append(_apport_of(resource))
                archive_modules.append(
                    ArchiveModule(
                        position=int(module["position"]),
                        title=_text(module["title"]),
                        course_markdown=markdown,
                        apports=tuple(apports),
                    )
                )
            if not archive_modules and any(
                resource["formation_id"] == formation_id for resource in resources
            ):
                archive_modules.append(
                    ArchiveModule(
                        position=1,
                        title=fr.ARCHIVE_APPORTS_MODULE_TITLE,
                        apports=tuple(
                            _apport_of(resource)
                            for resource in resources
                            if resource["formation_id"] == formation_id
                        ),
                    )
                )
            archive_formations.append(
                ArchiveFormation(
                    title=_text(formation["title"]) or fr.ARCHIVE_FORMATION_DEFAULT_TITLE,
                    programme=programme[-1],
                    modules=tuple(archive_modules),
                )
            )

        settings = build_settings_json(
            SettingsInput(
                profile={**_plain(profile), "exportCount": len(formations)},
                study_preferences=None if study is None else _plain(study),
                notification_settings=None if notifications is None else _plain(notifications),
                automations=automations,
            )
        )
        results = {
            "attempts": [
                {
                    **_plain(attempt),
                    "answers": [
                        _plain(answer)
                        for answer in tables["answers"]
                        if answer["attempt_id"] == attempt["id"]
                    ],
                }
                for attempt in tables["attempts"]
            ],
            "notionStates": [_plain(row) for row in tables["states"]],
            "gaps": [_plain(row) for row in tables["gaps"]],
            "dailyActivity": [_plain(row) for row in tables["days"]],
            "milestones": [_plain(row) for row in tables["milestones"]],
        }
        conversations = {
            "conversations": [
                {
                    **_plain(conversation),
                    "messages": [
                        {**_plain(message), "at": _plain(message)["created_at"]}
                        for message in tables["messages"]
                        if message["conversation_id"] == conversation["id"]
                    ],
                }
                for conversation in tables["conversations"]
            ]
        }
        model = ArchiveModel(
            readme=_readme(now, timezone, _text(profile["email"]), len(formations)),
            settings=settings,
            results=results,
            conversations=conversations,
            formations=tuple(archive_formations),
        )
        return CollectedExport(timezone=timezone, entries=build_archive_entries(model))
