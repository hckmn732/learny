"""Pure rules of simple mode (SPEC-4001 EF-4, EF-7, EF-8; ADR-4003 D4, D7).

The role of a deposited document is guessed from markers in its name and its first pages, without any
model call. A section of the course document becomes a module of two to eight hours: a shorter one is
merged with the next, a longer one is split; a module is then cut into chapters of twenty to
forty-five minutes. A fixed deadline makes the objective `exam` and ends the plan fourteen days
before it.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Literal

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import SIMPLE_DEADLINE_TOO_SOON

ResourceRole = Literal["course", "exercises", "exam_papers", "other"]

RESOURCE_ROLES: tuple[ResourceRole, ...] = ("course", "exercises", "exam_papers", "other")

# EF-4 - markers searched in the name and in the first two pages, case and accents folded.
EXAM_PAPER_MARKERS: tuple[str, ...] = ("annale", "sujet", "examen", "session 20")
EXERCISE_MARKERS: tuple[str, ...] = ("td", "exercice", "corrige", "travaux diriges")

# D7 - a module lasts two to eight hours, a chapter twenty to forty-five minutes.
MODULE_MIN_HOURS = 2.0
MODULE_MAX_HOURS = 8.0
CHAPTER_MIN_MINUTES = 20
CHAPTER_MAX_MINUTES = 45

# D7 - volume estimated from the pages of the document: twenty pages of course per hour.
PAGES_PER_HOUR = 20.0
DEFAULT_SECTION_HOURS = 1.0

# EF-8 - the plan ends fourteen days before the deadline; a closer deadline is refused (CL-8).
DEADLINE_MARGIN_DAYS = 14
MIN_DEADLINE_DAYS = 15

MAX_SIMPLE_SOURCES = 10
"""EF-2 - ten documents at most per simple-mode formation."""


def fold(value: str) -> str:
    """`normalizeMarker`: NFKD, combining marks removed, lower case, spaces collapsed."""
    decomposed = unicodedata.normalize("NFKD", value)
    without_marks = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_marks.strip().lower().split())


def _has_marker(text: str, marker: str) -> bool:
    """A marker made of one token is matched on word boundaries, a phrase as a substring."""
    if " " in marker:
        return marker in text
    # A marker made of one token also matches its plural, on word boundaries.
    return (
        re.search(rf"(?<![a-z0-9]){re.escape(marker)}s?(?![a-z0-9])", text) is not None
    )


def matches_any(text: str, markers: tuple[str, ...]) -> bool:
    folded = fold(text)
    return any(_has_marker(folded, marker) for marker in markers)


def guess_role(*, name: str, first_pages: str = "", is_first: bool = False) -> ResourceRole:
    """EF-4 - the role guessed by code, never by a model.

    `exam_papers` wins over `exercises`; otherwise the first document is the course and the following
    ones are complementary.
    """
    probe = f"{name}\n{first_pages}"
    if matches_any(probe, EXAM_PAPER_MARKERS):
        return "exam_papers"
    if matches_any(probe, EXERCISE_MARKERS):
        return "exercises"
    return "course" if is_first else "other"


def ensure_course(roles: list[ResourceRole], weights: list[int]) -> list[ResourceRole]:
    """EF-4 - when no document is the course, the longest one becomes it."""
    if "course" in roles or not roles:
        return list(roles)
    longest = max(range(len(roles)), key=lambda index: (weights[index], -index))
    updated = list(roles)
    updated[longest] = "course"
    return updated


def role_of_metadata(value: object) -> ResourceRole | None:
    """The documented role of `resources.metadata.role`, or `None` when it is absent or unknown."""
    if isinstance(value, str) and value in RESOURCE_ROLES:
        return value
    return None


@dataclass(frozen=True, slots=True)
class DetectedSection:
    """One section of the course document, with the page range it covers."""

    position: int
    title: str
    page_from: int | None = None
    page_to: int | None = None
    hours: float | None = None


@dataclass(frozen=True, slots=True)
class PlannedModule:
    """A module of the proposed programme and the pages it comes from."""

    position: int
    title: str
    hours: float
    page_from: int | None
    page_to: int | None
    chapter_count: int


def section_hours(section: DetectedSection) -> float:
    """D7 - the estimated study time of a section, from its pages or a documented default."""
    if section.hours is not None and section.hours > 0:
        return float(section.hours)
    if section.page_from is not None and section.page_to is not None:
        pages = max(1, section.page_to - section.page_from + 1)
        return pages / PAGES_PER_HOUR
    return DEFAULT_SECTION_HOURS


def chapters_for_module(hours: float) -> int:
    """D7 - the smallest number of chapters that keeps every chapter under forty-five minutes."""
    minutes = max(float(hours), MODULE_MIN_HOURS) * 60.0
    count = max(1, int(-(-minutes // CHAPTER_MAX_MINUTES)))
    while count > 1 and minutes / count < CHAPTER_MIN_MINUTES:
        count -= 1
    return count


def chapter_minutes(hours: float) -> float:
    """The length of one chapter of a module, the last one absorbing the remainder."""
    return float(hours) * 60.0 / chapters_for_module(hours)


def plan_programme(sections: list[DetectedSection]) -> list[PlannedModule]:
    """D7 - merge the short sections, split the long ones, then number the modules."""
    if not sections:
        return []
    groups: list[list[DetectedSection]] = []
    current: list[DetectedSection] = []
    current_hours = 0.0
    for section in sections:
        current.append(section)
        current_hours += section_hours(section)
        if current_hours >= MODULE_MIN_HOURS:
            groups.append(current)
            current = []
            current_hours = 0.0
    if current:
        if groups:
            groups[-1].extend(current)
        else:
            groups.append(current)

    planned: list[PlannedModule] = []
    for group in groups:
        hours = sum(section_hours(section) for section in group)
        title = group[0].title
        remaining = hours
        suffix = 1
        while remaining > MODULE_MAX_HOURS + 1e-9:
            planned.append(
                PlannedModule(
                    position=0,
                    title=title if suffix == 1 else f"{title} ({suffix})",
                    hours=MODULE_MAX_HOURS,
                    page_from=group[0].page_from,
                    page_to=group[-1].page_to,
                    chapter_count=chapters_for_module(MODULE_MAX_HOURS),
                )
            )
            remaining -= MODULE_MAX_HOURS
            suffix += 1
        chunk_hours = max(MODULE_MIN_HOURS, remaining)
        planned.append(
            PlannedModule(
                position=0,
                title=title if suffix == 1 else f"{title} ({suffix})",
                hours=chunk_hours,
                page_from=group[0].page_from,
                page_to=group[-1].page_to,
                chapter_count=chapters_for_module(chunk_hours),
            )
        )
    return [
        PlannedModule(
            position=index,
            title=module.title,
            hours=module.hours,
            page_from=module.page_from,
            page_to=module.page_to,
            chapter_count=module.chapter_count,
        )
        for index, module in enumerate(planned, start=1)
    ]


def volume_hours(modules: list[PlannedModule]) -> int:
    """The volume of a programme, rounded up to the whole hour as the contract requires."""
    return max(1, int(-(-sum(module.hours for module in modules) // 1)))


def deadline_end_date(deadline: str, today: str) -> str:
    """EF-8 - the plan ends fourteen days before the deadline, never before today."""
    end = date.fromisoformat(deadline) - timedelta(days=DEADLINE_MARGIN_DAYS)
    start = date.fromisoformat(today)
    return max(end, start).isoformat()


def deadline_objectives(deadline: str | None) -> tuple[str, ...]:
    """EF-8 - a fixed deadline makes the objective `exam`, its removal restores `operational`."""
    return ("exam",) if deadline else ("operational",)


def assert_deadline(deadline: str, today: str) -> None:
    """CL-8 - a past deadline, or one closer than fifteen days, is refused."""
    due = date.fromisoformat(deadline)
    start = date.fromisoformat(today)
    if (due - start).days < MIN_DEADLINE_DAYS:
        raise AppError("VALIDATION_FAILED", SIMPLE_DEADLINE_TOO_SOON, status=422)


def progress_after_diagnostic(module_ids: list[str], results: dict[str, list[bool]]) -> list[str]:
    """EF-10 - a module is acquired when every one of its questions is right."""
    return [module_id for module_id in module_ids if results.get(module_id) and all(results[module_id])]


def deduced_profile(
    payload: dict[str, Any],
    *,
    scope_label: str,
    beginner_label: str,
    mastery_label: str,
    volume_label: str,
    dates_label: str,
) -> dict[str, dict[str, str]]:
    """D4 / BR-FOR-02 - the scoping rubrics filled from the document, without any question."""
    modules = payload.get("modules") or []
    start = str(modules[0]["plannedStart"]) if modules else ""
    end = str(modules[-1]["plannedEnd"]) if modules else ""
    hours = payload.get("volumeHours")
    return {
        "scope": {"value": scope_label[:200], "state": "done"},
        "starting_point": {"value": beginner_label[:200], "state": "done"},
        "target_level": {"value": mastery_label[:200], "state": "done"},
        "volume": {
            "value": volume_label.format(hours=hours) if hours else volume_label.format(hours="?"),
            "state": "done",
        },
        "dates": {"value": dates_label.format(start=start, end=end), "state": "done"},
    }
