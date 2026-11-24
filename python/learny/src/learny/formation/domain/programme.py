"""Rules of the proposed and of the active programme (SPEC-605, SPEC-606).

A draft has no positions (the service numbers it once, then validates the ordered payload again),
the threshold stays between 60 and 95, a chapter never carries the same notion twice and a module
never ends before it starts. The percentage keeps the exact counts and only rounds the displayed
value.
"""

import unicodedata
from collections.abc import Mapping, Sequence
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from learny.shared.errors import AppError
from learny.shared.locale_fr import validation
from learny.shared.locale_fr.details import (
    PROGRAMME_DUPLICATE_CHAPTER_POSITION,
    PROGRAMME_DUPLICATE_MODULE_POSITION,
    PROGRAMME_DUPLICATE_NOTION,
    PROGRAMME_END_BEFORE_START,
    PROGRAMME_INCOMPLETE,
)

PROGRAMME_SOURCES: tuple[str, ...] = ("generated", "imported")
PROGRAMME_MODULE_STATUSES: tuple[str, ...] = ("locked", "open", "validated")
PROGRAMME_FORMATION_STATUSES: tuple[str, ...] = (
    "cadrage",
    "programme_proposed",
    "active",
    "paused",
    "completed",
    "archived",
)
ACTIVE_FORMATION_STATUSES: tuple[str, ...] = ("active", "paused", "completed")

THRESHOLD_MIN = 60
THRESHOLD_MAX = 95
THRESHOLD_DEFAULT = 80
MAX_MODULES = 20
MAX_CHAPTERS = 40
MAX_NOTIONS = 30
MAX_OBJECTIVES = 8
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


def _fold_label(value: str) -> str:
    """`normalizeLabel`: NFKD, marks removed, trimmed, lower case, spaces collapsed."""
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_marks.strip().lower().split())


def _date(value: str) -> str:
    """`CivilDate` refuses an impossible civil date."""
    parsed = date.fromisoformat(value)
    return parsed.isoformat()


class ProgrammeNotion(BaseModel):
    """`ProgrammeNotionSchema`: a bounded label and definition, both trimmed."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    definition: str = Field(min_length=1, max_length=400)

    @field_validator("label", "definition", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class _Chapters:
    """Shared validation of a chapter, draft or ordered."""

    title: str = Field(min_length=1, max_length=160)
    notions: list[ProgrammeNotion] = Field(min_length=1, max_length=MAX_NOTIONS)
    # SPEC-4001 EF-7 - the page range of the deposited document this chapter comes from.
    pageFrom: int | None = Field(default=None, ge=1)
    pageTo: int | None = Field(default=None, ge=1)

    @field_validator("title", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class DraftChapter(BaseModel, _Chapters):
    """`ProgrammeDraftChapterSchema`: a chapter with no position."""

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _unique_notions(self) -> "DraftChapter":
        return self


class OrderedChapter(BaseModel, _Chapters):
    """`ProgrammeChapterSchema`: a stored chapter carries its position."""

    model_config = ConfigDict(extra="forbid")

    position: int = Field(ge=1, le=100)


class _Modules:
    """Shared validation of a module, draft or ordered."""

    title: str = Field(min_length=1, max_length=160)
    objectives: list[str] = Field(min_length=1, max_length=MAX_OBJECTIVES)
    plannedStart: str = Field(pattern=DATE_PATTERN)
    plannedEnd: str = Field(pattern=DATE_PATTERN)
    threshold: int = Field(default=THRESHOLD_DEFAULT, ge=THRESHOLD_MIN, le=THRESHOLD_MAX)
    chapters: list[Any]
    # SPEC-4001 EF-7 - the page range of the deposited document this module comes from.
    pageFrom: int | None = Field(default=None, ge=1)
    pageTo: int | None = Field(default=None, ge=1)

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("objectives", mode="before")
    @classmethod
    def _strip_objectives(cls, value: Any) -> Any:
        if not isinstance(value, list):
            return value
        return [item.strip() if isinstance(item, str) else item for item in value]

    @field_validator("plannedStart", "plannedEnd")
    @classmethod
    def _civil_date(cls, value: str) -> str:
        return _date(value)


class DraftModule(BaseModel, _Modules):
    """`ProgrammeDraftModuleSchema`: a module with no position, its chapters unnumbered."""

    model_config = ConfigDict(extra="forbid")

    chapters: list[DraftChapter] = Field(min_length=1, max_length=MAX_CHAPTERS)

    @model_validator(mode="after")
    def _ordered_dates(self) -> "DraftModule":
        return self


class OrderedModule(BaseModel, _Modules):
    """`ProgrammeModuleSchema`: a stored module carries its position."""

    model_config = ConfigDict(extra="forbid")

    position: int = Field(ge=1, le=100)
    chapters: list[OrderedChapter] = Field(min_length=1, max_length=MAX_CHAPTERS)


class ProgrammeDraft(BaseModel):
    """`ProgrammeDraftSchema`: the model output of one generation, import or adjustment."""

    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(default=None, max_length=2000)
    volumeHours: int | None = Field(default=None, ge=1, le=2000)
    summary: str | None = Field(default=None, max_length=1000)
    modules: list[DraftModule] = Field(min_length=1, max_length=MAX_MODULES)


class ProgrammeProposalPayload(BaseModel):
    """`ProgrammeProposalPayloadSchema`: everything needed to rebuild the stored structure."""

    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(default=None, max_length=2000)
    volumeHours: int | None = Field(default=None, ge=1, le=2000)
    summary: str | None = Field(default=None, max_length=1000)
    modules: list[OrderedModule] = Field(min_length=1, max_length=MAX_MODULES)


def _issue(path: str, message: str) -> dict[str, str]:
    return {"path": path, "message": message}


def _issues(error: ValidationError) -> list[dict[str, str]]:
    """Zod-shaped issues: `path` relative to the payload, French message."""
    issues: list[dict[str, str]] = []
    for entry in error.errors():
        path = ".".join(str(part) for part in entry["loc"])
        kind = str(entry["type"])
        context = entry.get("ctx") or {}
        if kind == "missing":
            message = validation.invalid_type("object", "undefined")
        elif kind in {"string_type", "int_type", "int_parsing", "list_type", "dict_type"}:
            message = validation.invalid_type("string", validation.parsed_type_name(entry.get("input")))
        elif kind in {"string_too_short", "too_short", "list_too_short"}:
            message = validation.too_small("string", context.get("min_length", 0) or 0, inclusive=True)
        elif kind in {"string_too_long", "too_long", "list_too_long"}:
            message = validation.too_big("string", context.get("max_length", 0) or 0, inclusive=True)
        elif kind in {"greater_than_equal", "less_than_equal"}:
            message = (
                validation.too_small("int", context.get("ge", 0), inclusive=True)
                if kind == "greater_than_equal"
                else validation.too_big("int", context.get("le", 0), inclusive=True)
            )
        elif kind == "string_pattern_mismatch":
            message = validation.invalid_format("regex", pattern="^\\d{4}-\\d{2}-\\d{2}$")
        elif kind in {"literal_error", "enum"}:
            message = validation.invalid_value(list(context.get("expected", [])))
        elif kind == "value_error":
            message = str(context.get("error", validation.generic()))
        else:
            message = validation.generic()
        issues.append(_issue(path, message))
    return issues


def incomplete(issues: Sequence[Mapping[str, str]]) -> AppError:
    """`incomplete`: the one 422 of the programme rules, carrying the issue list."""
    return AppError(
        "PROGRAMME_INCOMPLETE",
        PROGRAMME_INCOMPLETE,
        status=422,
        errors=[{"path": str(issue["path"]), "message": str(issue["message"])} for issue in issues],
    )


def _custom_issues(draft: ProgrammeDraft) -> list[dict[str, str]]:
    """`checkNotions` and `checkModuleDates`, replayed on the draft before it is numbered."""
    issues: list[dict[str, str]] = []
    for module_index, module in enumerate(draft.modules):
        if module.plannedEnd < module.plannedStart:
            issues.append(
                _issue(
                    f"modules.{module_index}.plannedEnd",
                    PROGRAMME_END_BEFORE_START,
                )
            )
        for chapter_index, chapter in enumerate(module.chapters):
            seen: set[str] = set()
            for notion in chapter.notions:
                key = _fold_label(notion.label)
                if key in seen:
                    issues.append(
                        _issue(
                            f"modules.{module_index}.chapters.{chapter_index}.notions",
                            PROGRAMME_DUPLICATE_NOTION.format(label=notion.label),
                        )
                    )
                seen.add(key)
    return issues


def _payload_issues(payload: ProgrammeProposalPayload) -> list[dict[str, str]]:
    """`checkModules`: unique positions, ordered dates, no duplicate notion."""
    issues: list[dict[str, str]] = []
    module_positions: set[int] = set()
    for module_index, module in enumerate(payload.modules):
        if module.position in module_positions:
            issues.append(_issue(f"modules.{module_index}.position", PROGRAMME_DUPLICATE_MODULE_POSITION))
        module_positions.add(module.position)
        if module.plannedEnd < module.plannedStart:
            issues.append(
                _issue(
                    f"modules.{module_index}.plannedEnd",
                    PROGRAMME_END_BEFORE_START,
                )
            )
        chapter_positions: set[int] = set()
        for chapter_index, chapter in enumerate(module.chapters):
            if chapter.position in chapter_positions:
                issues.append(
                    _issue(
                        f"modules.{module_index}.chapters.{chapter_index}.position",
                        PROGRAMME_DUPLICATE_CHAPTER_POSITION,
                    )
                )
            chapter_positions.add(chapter.position)
            seen: set[str] = set()
            for notion in chapter.notions:
                key = _fold_label(notion.label)
                if key in seen:
                    issues.append(
                        _issue(
                            f"modules.{module_index}.chapters.{chapter_index}.notions",
                            PROGRAMME_DUPLICATE_NOTION.format(label=notion.label),
                        )
                    )
                seen.add(key)
    return issues


def anchor_programme_dates(payload: dict[str, Any], reference: str) -> dict[str, Any]:
    """Moves a programme that starts before `reference` by whole weeks (hotfix QA, ADR-2038).

    The model picks the module dates without knowing today's date and may place them in the past.
    `reference` is the formation's own start date, or today when it has none; weekdays, durations
    and gaps between modules are kept.
    """
    modules = payload.get("modules") or []
    if not modules:
        return payload
    first = str(modules[0]["plannedStart"])
    if first >= reference:
        return payload
    late = (date.fromisoformat(reference) - date.fromisoformat(first)).days
    shift = timedelta(days=-(-late // 7) * 7)
    return {
        **payload,
        "modules": [
            {
                **module,
                "plannedStart": (date.fromisoformat(module["plannedStart"]) + shift).isoformat(),
                "plannedEnd": (date.fromisoformat(module["plannedEnd"]) + shift).isoformat(),
            }
            for module in modules
        ],
    }


def normalize_draft(raw: Any) -> dict[str, Any]:
    """`normalizeDraft`: validates the draft, numbers it, validates the ordered payload again."""
    try:
        draft = ProgrammeDraft.model_validate(raw)
    except ValidationError as error:
        raise incomplete(_issues(error)) from error
    custom = _custom_issues(draft)
    if custom:
        raise incomplete(custom)
    payload = {
        "description": draft.description,
        "volumeHours": draft.volumeHours,
        "summary": draft.summary,
        "modules": [
            {
                "position": module_index + 1,
                "title": module.title,
                "objectives": module.objectives,
                "plannedStart": module.plannedStart,
                "plannedEnd": module.plannedEnd,
                "threshold": module.threshold,
                "pageFrom": module.pageFrom,
                "pageTo": module.pageTo,
                "chapters": [
                    {
                        "position": chapter_index + 1,
                        "title": chapter.title,
                        "notions": [notion.model_dump() for notion in chapter.notions],
                        "pageFrom": chapter.pageFrom,
                        "pageTo": chapter.pageTo,
                    }
                    for chapter_index, chapter in enumerate(module.chapters)
                ],
            }
            for module_index, module in enumerate(draft.modules)
        ],
    }
    try:
        checked = ProgrammeProposalPayload.model_validate(payload)
    except ValidationError as error:
        raise incomplete(_issues(error)) from error
    issues = _payload_issues(checked)
    if issues:
        raise incomplete(issues)
    return checked.model_dump()


def parse_payload(value: Any) -> dict[str, Any]:
    """`parseProposalPayload`: a stored payload is validated again before any projection."""
    try:
        checked = ProgrammeProposalPayload.model_validate(value)
    except ValidationError as error:
        raise incomplete(_issues(error)) from error
    issues = _payload_issues(checked)
    if issues:
        raise incomplete(issues)
    return checked.model_dump()


def total_chapters(payload: Mapping[str, Any]) -> int:
    """Number of chapters of a payload."""
    return sum(len(module["chapters"]) for module in payload["modules"])


def total_notions(payload: Mapping[str, Any]) -> int:
    """Number of notions of a payload."""
    return sum(len(chapter["notions"]) for module in payload["modules"] for chapter in module["chapters"])


# --------------------------------------------------------------------------------------------------
# Active programme indicators (SPEC-606 ET-5, BR-PRO-01, BR-FOR-08)
# --------------------------------------------------------------------------------------------------


def formation_progress(validated: int, total: int) -> dict[str, int]:
    """BR-PRO-01 - the exact counts stay in the API, `percent` is rounded for display."""
    safe_total = max(0, int(total))
    safe_validated = min(max(0, int(validated)), safe_total)
    percent = 0 if safe_total == 0 else round(safe_validated / safe_total * 100)
    return {"validated": safe_validated, "total": safe_total, "percent": percent}


def programme_indicators(
    *,
    status: str,
    modules: Sequence[Mapping[str, Any]],
    weeks: int,
    volume_hours: int | None,
    threshold: int,
    hours_per_day: int,
    study_days_per_week: int,
) -> dict[str, Any]:
    """`programmeIndicators`: the percentage is independent of the formation status."""
    validated = sum(1 for module in modules if module.get("status") == "validated")
    return {
        "progress": formation_progress(validated, len(modules)),
        "weeks": max(1, int(weeks)),
        "volumeHours": volume_hours,
        "threshold": threshold,
        "hoursPerDay": hours_per_day,
        "studyDaysPerWeek": study_days_per_week,
    }


def calendar_weeks(start: str, end: str) -> int:
    """CL-5 - civil dates count real calendar days, never raw milliseconds across a DST change."""
    try:
        first = date.fromisoformat(start)
        last = date.fromisoformat(end)
    except ValueError:
        return 1
    if last < first:
        return 1
    days = (last - first).days + 1
    return max(1, -(-days // 7))


def programme_scenario(
    operation: Literal["generate", "adjust", "import"], title: str, detail: str = ""
) -> str:
    """`programmeScenario`: the committed fixture of the simulated programme task (ADR-0153)."""
    marker = _fold_label(f"{title} {detail}")
    if "invalide" in marker or "invalid" in marker:
        return "programme-invalid"
    if operation == "adjust":
        return "programme-adjust"
    if operation == "import":
        return "programme-import"
    if "import" in marker:
        return "programme-import"
    return "programme-sap"
