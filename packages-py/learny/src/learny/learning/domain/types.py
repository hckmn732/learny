"""Public input/output contracts of the pure engine (SPEC-401 ET-2).

Every object produced by the engine survives a JSON round-trip without loss (CA-2): unknown
fields are refused on input, numbers are finite and never -0, and dates are real civil days.
The `to_dict` methods keep the TypeScript key order so the JSON output is byte-identical.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import EngineError, invalid_input
from learny.learning.domain.time import is_instant_iso, is_iso_date, is_local_time, is_time_zone

FSRS_RATINGS = ("again", "hard", "good", "easy")
FSRS_CARD_STATES = ("new", "learning", "review", "relearning")
BRICK_FORMATS = (
    "choice_question",
    "open_question",
    "cloze",
    "matching",
    "ordering",
    "categorization",
    "recall_card",
    "instruction",
    "scripted_dialogue",
    "timer",
)
REVIEW_SOURCES = (
    "validation",
    "global_quiz",
    "warmup",
    "exercise",
    "exam",
    "self_test",
    "micro_session",
    "sprint",
    "offline",
)
ATTEMPT_KINDS = (
    "validation_quiz",
    "global_quiz_session",
    "remediation",
    "exercise",
    "mock_exam",
    "warmup",
    "micro_session",
    "sprint",
    "self_test",
)
GAP_NATURES = ("forgetting", "confusion", "misunderstanding", "application")
STUDY_SLOTS = ("matin", "apres_midi", "soir")
MODULE_STATUSES = ("locked", "open", "validated")
SLOT_KINDS = (
    "contributions",
    "course",
    "exercise",
    "validation_quiz",
    "global_quiz",
    "revision",
    "buffer",
    "sprint",
    "mock_exam",
    "warmup",
    "micro_session",
    "weekly_review",
)
SLOT_STATUSES = ("planned", "done", "missed", "moved", "cancelled")
NOTION_LINK_KINDS = ("prerequisite", "confusion", "tutor")
SLOT_ORDER = {"matin": 0, "apres_midi": 1, "soir": 2}


def _finite(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise invalid_input(path, "A finite number is required.")
    number = float(value)
    if (
        number != number
        or number in (float("inf"), float("-inf"))
        or (number == 0 and _is_negative_zero(value))
    ):
        raise invalid_input(path, "A finite number is required, -0 refused.")
    return number


def _is_negative_zero(value: Any) -> bool:
    return isinstance(value, float) and value == 0.0 and str(value).startswith("-")


def _integer(value: Any, path: str, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise invalid_input(path, "An integer is required.")
    if minimum is not None and value < minimum:
        raise invalid_input(path, "A negative value." if minimum == 0 else "A positive integer is required.")
    return value


def _identifier(value: Any, path: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 64:
        raise invalid_input(path, "An identifier of 1 to 64 characters is required.")
    return value


def _enum(value: Any, path: str, allowed: tuple[str, ...]) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise invalid_input(path, f"Expected one of {', '.join(allowed)}.")
    return value


def _optional_instant(value: Any, path: str) -> str | None:
    if value is None:
        return None
    if not is_instant_iso(value):
        raise invalid_input(path, "Invalid ISO 8601 UTC instant.")
    return str(value)


def _strict_keys(value: Mapping[str, Any], expected: tuple[str, ...], path: str) -> None:
    for key in value:
        if key not in expected:
            raise invalid_input(f"{path}.{key}".lstrip("."), f"Unknown field: {key}.")
    for key in expected:
        if key not in value:
            raise invalid_input(f"{path}.{key}".lstrip("."), f"Missing field: {key}.")


@dataclass(frozen=True, slots=True)
class SerializedFsrsCard:
    """`ts-fsrs` 5 card, the exact shape of `notion_states.fsrs` plus `learning_steps`."""

    due: str
    stability: float
    difficulty: float
    elapsed_days: int
    scheduled_days: int
    learning_steps: int
    reps: int
    lapses: int
    state: str
    last_review: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "due": self.due,
            "stability": self.stability,
            "difficulty": self.difficulty,
            "elapsed_days": self.elapsed_days,
            "scheduled_days": self.scheduled_days,
            "learning_steps": self.learning_steps,
            "reps": self.reps,
            "lapses": self.lapses,
            "state": self.state,
            "last_review": self.last_review,
        }


CARD_FIELDS = (
    "due",
    "stability",
    "difficulty",
    "elapsed_days",
    "scheduled_days",
    "learning_steps",
    "reps",
    "lapses",
    "state",
    "last_review",
)


def validate_card(value: Any) -> SerializedFsrsCard:
    """Strict validation of a serialized card, raising `INVALID_INPUT` on the first bad field."""
    if not isinstance(value, Mapping):
        raise invalid_input("", "A card object is required.")
    _strict_keys(value, CARD_FIELDS, "")
    if not is_instant_iso(value["due"]):
        raise invalid_input("due", "Invalid ISO 8601 UTC instant.")
    stability = _finite(value["stability"], "stability")
    if stability < 0:
        raise invalid_input("stability", "A non-negative number is required.")
    difficulty = _finite(value["difficulty"], "difficulty")
    if difficulty < 0:
        raise invalid_input("difficulty", "A non-negative number is required.")
    return SerializedFsrsCard(
        due=str(value["due"]),
        stability=stability,
        difficulty=difficulty,
        elapsed_days=_integer(value["elapsed_days"], "elapsed_days", 0),
        scheduled_days=_integer(value["scheduled_days"], "scheduled_days", 0),
        learning_steps=_integer(value["learning_steps"], "learning_steps", 0),
        reps=_integer(value["reps"], "reps", 0),
        lapses=_integer(value["lapses"], "lapses", 0),
        state=_enum(value["state"], "state", FSRS_CARD_STATES),
        last_review=_optional_instant(value["last_review"], "last_review"),
    )


@dataclass(frozen=True, slots=True)
class GapState:
    """The `notion_states.gap` JSON value (BR-LAC-04)."""

    nature: str
    confused_with: str | None
    detected_at: str
    evidence: str
    cleared_at: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "nature": self.nature,
            "confusedWith": self.confused_with,
            "detectedAt": self.detected_at,
            "evidence": self.evidence,
            "clearedAt": self.cleared_at,
        }


@dataclass(frozen=True, slots=True)
class NotionState:
    """One row of `notion_states` as the engine reads it (SPEC-401 ET-2)."""

    user_id: str
    notion_id: str
    fsrs: SerializedFsrsCard | None
    due_at: str | None
    mastery: float
    first_seen_at: str | None
    last_seen_at: str | None
    success_count: int
    gap: GapState | None
    suspended: bool
    in_review: bool


@dataclass(frozen=True, slots=True)
class AnswerRecord:
    """One graded answer as the gap detector and the mastery need it."""

    answer_id: str
    attempt_id: str
    attempt_kind: str
    attempt_no: int
    source: str
    notion_ids: tuple[str, ...]
    format: str
    correct: bool | None
    score: float | None
    max_score: float | None
    self_rating: str | None
    time_ms: float
    answered_at: str
    chosen_distractor_notion_id: str | None
    confused_with_notion_id: str | None
    normalized_response: str | None
    off_topic: bool
    counts_for_gaps: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "answerId": self.answer_id,
            "attemptId": self.attempt_id,
            "attemptKind": self.attempt_kind,
            "attemptNo": self.attempt_no,
            "source": self.source,
            "notionIds": list(self.notion_ids),
            "format": self.format,
            "correct": self.correct,
            "score": self.score,
            "maxScore": self.max_score,
            "selfRating": self.self_rating,
            "timeMs": self.time_ms,
            "answeredAt": self.answered_at,
            "chosenDistractorNotionId": self.chosen_distractor_notion_id,
            "confusedWithNotionId": self.confused_with_notion_id,
            "normalizedResponse": self.normalized_response,
            "offTopic": self.off_topic,
            "countsForGaps": self.counts_for_gaps,
        }


@dataclass(frozen=True, slots=True)
class ReviewEvent:
    """One persisted review, before and after the card update (SPEC-402 ET-2)."""

    notion_id: str
    answer_id: str | None
    source: str
    rating: str
    correct: bool
    time_ms: float
    reviewed_at: str
    before: SerializedFsrsCard | None
    after: SerializedFsrsCard
    applied: bool


@dataclass(frozen=True, slots=True)
class Availability:
    """Study rhythm of the learner (BR-ACC-08)."""

    hours_per_day: int
    study_days: tuple[int, ...]
    preferred_slots: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "hoursPerDay": self.hours_per_day,
            "studyDays": list(self.study_days),
            "preferredSlots": list(self.preferred_slots),
        }


def assert_availability(value: Any) -> Availability:
    """Availability with its dedicated error code (SPEC-401 CL-6), path carried in `path`."""
    try:
        return _read_availability(value)
    except EngineError as error:
        raise EngineError("INVALID_AVAILABILITY", error.message, error.path) from error


def _read_availability(value: Any) -> Availability:
    if not isinstance(value, Mapping):
        raise invalid_input("", "An availability object is required.")
    _strict_keys(value, ("hoursPerDay", "studyDays", "preferredSlots"), "")
    hours = _integer(value["hoursPerDay"], "hoursPerDay")
    if hours < 1 or hours > 6:
        raise invalid_input("hoursPerDay", "hoursPerDay outside 1..6")
    days_raw = value["studyDays"]
    if not isinstance(days_raw, (list, tuple)) or not days_raw:
        raise invalid_input("studyDays", "studyDays must be a non-empty array")
    days = tuple(_integer(day, "studyDays") for day in days_raw)
    for index, day in enumerate(days):
        if day not in (1, 2, 3, 4, 5, 6, 7):
            raise invalid_input("studyDays", "An ISO weekday is required")
        if index > 0 and day <= days[index - 1]:
            raise invalid_input("studyDays", "studyDays must be sorted without duplicates")
    slots_raw = value["preferredSlots"]
    if not isinstance(slots_raw, (list, tuple)) or not slots_raw:
        raise invalid_input("preferredSlots", "preferredSlots must be a non-empty array")
    slots = tuple(_enum(slot, "preferredSlots", STUDY_SLOTS) for slot in slots_raw)
    if len(set(slots)) != len(slots):
        raise invalid_input("preferredSlots", "duplicate preferredSlots")
    orders = [SLOT_ORDER[slot] for slot in slots]
    for index, order in enumerate(orders):
        if index > 0 and order <= orders[index - 1]:
            raise invalid_input(
                "preferredSlots", "preferredSlots outside the matin < apres_midi < soir order"
            )
    return Availability(hours_per_day=hours, study_days=days, preferred_slots=slots)


@dataclass(frozen=True, slots=True)
class DateRange:
    """A closed civil-day range."""

    starts_on: str
    ends_on: str

    def to_dict(self) -> dict[str, Any]:
        return {"startsOn": self.starts_on, "endsOn": self.ends_on}

    @classmethod
    def read(cls, value: Any) -> "DateRange":
        if not isinstance(value, Mapping):
            raise invalid_input("", "A date range is required.")
        _strict_keys(value, ("startsOn", "endsOn"), "")
        starts, ends = value["startsOn"], value["endsOn"]
        if not is_iso_date(starts):
            raise invalid_input("startsOn", "Invalid civil day AAAA-MM-JJ.")
        if not is_iso_date(ends):
            raise invalid_input("endsOn", "Invalid civil day AAAA-MM-JJ.")
        if str(ends) < str(starts):
            raise invalid_input("endsOn", "endsOn must follow startsOn")
        return cls(starts_on=str(starts), ends_on=str(ends))


@dataclass(frozen=True, slots=True)
class NotionRef:
    """A notion as the planner and the draw order it."""

    notion_id: str
    module_id: str
    chapter_id: str
    module_position: int
    position: int
    label: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "notionId": self.notion_id,
            "moduleId": self.module_id,
            "chapterId": self.chapter_id,
            "modulePosition": self.module_position,
            "position": self.position,
            "label": self.label,
        }


@dataclass(frozen=True, slots=True)
class NotionLinkRef:
    """A directed link between two notions (BR-CAR)."""

    from_notion_id: str
    to_notion_id: str
    kind: str


def is_rating(value: object) -> bool:
    """True for one of the four FSRS grades."""
    return isinstance(value, str) and value in FSRS_RATINGS


def assert_local_time(value: object, path: str = "time") -> str:
    """A `HH:mm` local time or `INVALID_INPUT`."""
    if not is_local_time(value):
        raise invalid_input(path, "Invalid local time HH:mm.")
    return str(value)


def assert_time_zone(value: object, path: str = "tz") -> str:
    """An IANA time zone or `INVALID_INPUT`."""
    if not is_time_zone(value):
        raise invalid_input(path, "Unknown IANA time zone.")
    return str(value)
