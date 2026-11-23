"""Rules and projection of the scoping chat (SPEC-604, port of `cadrage/state.ts`,
`cadrage/apply-tutor-turn.ts`, `cadrage/scenario.ts` and `tutor/cadrage/schema.ts`).

The tutor proposes a `CadrageTurn`; `apply_turn` decides what is stored: the five questions ceiling,
the waiting rubric, bounded profile values and deduplicated objectives. Nothing here reads the
clock or touches the database, so the rules are unit-testable in isolation.
"""

import json
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    CADRAGE_AI_TASK_FAILED,
    CADRAGE_AI_UNAVAILABLE,
    CADRAGE_DONE_FALLBACK,
    CADRAGE_INVALID_SUGGESTIONS,
    CADRAGE_MULTI_NEEDS_TWO,
    CADRAGE_RATE_LIMITED,
)
from learny.shared.time import to_iso

# `CADRAGE_RUBRIC_KEYS` of `packages/contracts/src/cadrage.ts`, in display order.
RUBRIC_KEYS: tuple[str, ...] = ("scope", "starting_point", "target_level", "volume", "dates")
QUESTION_KEYS: tuple[str, ...] = (*RUBRIC_KEYS, "other")
OBJECTIVES: tuple[str, ...] = ("operational", "exam", "dialogue", "project")
PROFILE_STATES: tuple[str, ...] = ("todo", "waiting", "done")

MAX_QUESTIONS = 5
MAX_PROFILE_VALUE = 200
MAX_SUGGESTIONS = 6
MAX_CORRECTIONS = 2
DONE_FALLBACK = CADRAGE_DONE_FALLBACK

CADRAGE_ERROR_MESSAGES: Mapping[str, str] = {
    "AI_UNAVAILABLE": CADRAGE_AI_UNAVAILABLE,
    "AI_TASK_FAILED": CADRAGE_AI_TASK_FAILED,
    "RATE_LIMITED": CADRAGE_RATE_LIMITED,
    "AI_RATE_LIMITED": CADRAGE_RATE_LIMITED,
}


def cadrage_error_message(code: str) -> str:
    """`cadrageErrorMessage`: an unknown code reads as `AI_TASK_FAILED`."""
    return CADRAGE_ERROR_MESSAGES.get(code, CADRAGE_ERROR_MESSAGES["AI_TASK_FAILED"])


def empty_profile() -> dict[str, dict[str, Any]]:
    """The five rubrics, in display order, all `todo`."""
    return {key: {"value": None, "state": "todo"} for key in RUBRIC_KEYS}


def read_profile(value: Any) -> dict[str, dict[str, Any]]:
    """Stored JSON is bounded and completed with the five rubrics, in display order."""
    base = empty_profile()
    if not isinstance(value, Mapping):
        return base
    for key in RUBRIC_KEYS:
        entry = value.get(key)
        if not isinstance(entry, Mapping):
            continue
        state = entry.get("state")
        raw = entry.get("value")
        base[key] = {
            "value": raw if isinstance(raw, str) else None,
            "state": state if state in PROFILE_STATES else "todo",
        }
    return base


def read_suggestions(value: Any) -> list[dict[str, Any]] | None:
    """`readSuggestions`: bounded, never a partial suggestion, `None` when empty."""
    if not isinstance(value, list):
        return None
    suggestions: list[dict[str, Any]] = []
    for entry in value:
        if not isinstance(entry, Mapping):
            continue
        label = entry.get("label")
        choice = entry.get("value")
        if not isinstance(label, str) or not isinstance(choice, str):
            continue
        description = entry.get("description")
        suggestions.append(
            {
                "label": label,
                "value": choice,
                "description": description if isinstance(description, str) else None,
                "multi": entry.get("multi") is True,
            }
        )
    return suggestions or None


def _instant(value: Any) -> str:
    if isinstance(value, datetime):
        return to_iso(value)
    return to_iso(datetime.fromisoformat(str(value)))


def message_dto(row: Any, question_number: int | None) -> dict[str, Any]:
    """One `CadrageMessage` of the DTO; suggestions only exist on a tutor message."""
    suggestions = read_suggestions(row.suggestions) if row.role == "tutor" else None
    return {
        "id": row.id,
        "role": row.role,
        "content": row.content,
        "questionNumber": question_number,
        "suggestions": suggestions,
        "multi": any(item["multi"] for item in suggestions or ()),
        "createdAt": _instant(row.created_at),
    }


def build_state(
    formation: Any,
    rows: Sequence[Any],
    error: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    """The single state builder of the creation, the message routes and the page (SPEC-604 ET-1)."""
    question_count = 0
    messages: list[dict[str, Any]] = []
    for row in rows:
        is_question = row.role == "tutor" and row.question_key is not None
        if is_question:
            question_count = min(question_count + 1, MAX_QUESTIONS)
        messages.append(message_dto(row, question_count if is_question else None))

    last_tutor = next((row for row in reversed(rows) if row.role == "tutor"), None)
    finished = last_tutor is not None and last_tutor.question_key is None

    pending: dict[str, Any] | None = None
    last = rows[-1] if rows else None
    if last is not None and last.role == "tutor" and last.question_key is not None:
        pending = {
            "messageId": last.id,
            "questionKey": last.question_key,
            "multi": any(item["multi"] for item in read_suggestions(last.suggestions) or ()),
        }

    profile = read_profile(formation.cadrage_profile)
    interrupted = interrupted_error(rows)
    return {
        "formationId": formation.id,
        "title": formation.title,
        "messages": messages,
        "profile": profile,
        "questionsAsked": question_count,
        "finished": finished,
        "canGenerate": profile["scope"]["state"] == "done" and profile["target_level"]["state"] == "done",
        "pendingQuestion": pending,
        "error": error if error is not None else interrupted,
    }


def interrupted_error(rows: Sequence[Any]) -> dict[str, str] | None:
    """CL-1 - a learner message with no tutor answer is the interrupted turn."""
    last = rows[-1] if rows else None
    if last is None or last.role != "learner":
        return None
    return {"code": "AI_TASK_FAILED", "message": CADRAGE_ERROR_MESSAGES["AI_TASK_FAILED"]}


def to_summary(row: Any) -> dict[str, Any]:
    """`toSummary`: the three fields a formation summary carries."""
    return {"id": row.id, "title": row.title, "status": row.status}


# --------------------------------------------------------------------------------------------------
# Structured turn (contract sent to the model)
# --------------------------------------------------------------------------------------------------


def normalize_title(title: str) -> str:
    """`normalizeTitle` of the scenarios: NFD, marks removed, lower case."""
    decomposed = unicodedata.normalize("NFD", title)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).lower()


def cadrage_scenario(title: str, learner_answers: int) -> str:
    """`cadrageScenario`: the committed fixture of the simulated cadrage (ADR-0153)."""
    normalized = normalize_title(title)
    if "sixieme" in normalized or "sixth" in normalized:
        return "cadrage-sixth-question"
    if "invalide" in normalized or "invalid" in normalized:
        return "cadrage-invalid"
    if "injection" in normalized:
        return "cadrage-injection"
    sequence = (
        "cadrage-sap-q1",
        "cadrage-sap-q2",
        "cadrage-sap-q3",
        "cadrage-sap-q4",
        "cadrage-sap-q5",
        "cadrage-sap-done",
    )
    index = min(max(0, learner_answers), len(sequence) - 1)
    return sequence[index]


class ProfileUpdate(BaseModel):
    """`CadrageProfileUpdate`: one collected rubric."""

    model_config = ConfigDict(extra="forbid")

    key: Literal["scope", "starting_point", "target_level", "volume", "dates"]
    value: str = Field(min_length=1, max_length=1000)

    @field_validator("value", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class Suggestion(BaseModel):
    """`CadrageSuggestion`: a concrete answer the learner may pick."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=120)
    value: str = Field(min_length=1, max_length=60)

    @field_validator("label", "value", "description", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class Question(BaseModel):
    """`CadrageQuestion`: the next question, with its suggestions."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["question"]
    questionKey: Literal["scope", "starting_point", "target_level", "volume", "dates", "other"]
    text: str = Field(min_length=1, max_length=400)
    multi: bool
    suggestions: list[Suggestion] = Field(default_factory=list, max_length=MAX_SUGGESTIONS)

    @field_validator("text", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class Done(BaseModel):
    """`CadrageDone`: the tutor concluded."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["done"]
    text: str = Field(min_length=1, max_length=400)

    @field_validator("text", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class CadrageTurn(BaseModel):
    """`CadrageTurnSchema`: the strict object the model answers with."""

    model_config = ConfigDict(extra="forbid")

    profileUpdates: list[ProfileUpdate] = Field(default_factory=list, max_length=5)
    objectives: list[Literal["operational", "exam", "dialogue", "project"]] = Field(
        default_factory=list, max_length=4
    )
    next: Question | Done = Field(discriminator="kind")

    @model_validator(mode="after")
    def _unique_objectives(self) -> "CadrageTurn":
        return self


# --------------------------------------------------------------------------------------------------
# Application of one validated turn
# --------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ApplyConstraints:
    """What the caller knows about the conversation before this turn."""

    questions_asked: int
    done_fallback: str = DONE_FALLBACK
    finished: bool = False
    pending_question_key: str | None = None
    learner_answer: str | None = None
    max_questions: int = MAX_QUESTIONS


@dataclass(frozen=True, slots=True)
class AppliedTurn:
    """`AppliedTutorTurn`: the only state the persistence layer may write."""

    profile: dict[str, dict[str, Any]]
    objectives: list[str]
    questionsAsked: int
    finished: bool
    questionNumber: int | None
    questionKey: str | None
    multi: bool
    suggestions: list[dict[str, Any]] | None
    content: str


def _invalid(detail: str) -> AppError:
    return AppError("INVALID_OUTPUT", detail)


def _valid_question(question: Question) -> None:
    """A question must stay answerable: unique values, two suggestions for a multiple choice."""
    values = [suggestion.value for suggestion in question.suggestions]
    if len(set(values)) != len(values):
        raise _invalid(CADRAGE_INVALID_SUGGESTIONS)
    if question.multi and len(question.suggestions) < 2:
        raise _invalid(CADRAGE_MULTI_NEEDS_TWO)


def _apply_updates(
    profile: Mapping[str, Mapping[str, Any]],
    turn: CadrageTurn,
    constraints: ApplyConstraints,
) -> dict[str, dict[str, Any]]:
    """`done` overwrites only through an explicit update; the answered rubric is completed first."""
    updated = {key: dict(profile[key]) for key in RUBRIC_KEYS}
    answered = constraints.pending_question_key
    answer = (constraints.learner_answer or "").strip()
    already = {update.key for update in turn.profileUpdates}
    if answered is not None and answered in RUBRIC_KEYS and answer != "" and answered not in already:
        updated[answered] = {"value": answer[:MAX_PROFILE_VALUE], "state": "done"}
    for update in turn.profileUpdates:
        updated[update.key] = {"value": update.value[:MAX_PROFILE_VALUE], "state": "done"}
    return updated


def apply_turn(
    profile: Mapping[str, Mapping[str, Any]],
    turn: CadrageTurn,
    constraints: ApplyConstraints,
) -> AppliedTurn:
    """`applyTutorTurn`: question ceiling, waiting rubric and deduplicated objectives."""
    questions_asked = min(constraints.questions_asked, constraints.max_questions)
    next_profile = _apply_updates(profile, turn, constraints)
    objectives: list[str] = [str(item) for item in dict.fromkeys(turn.objectives)]
    question = turn.next if isinstance(turn.next, Question) else None
    if question is not None:
        _valid_question(question)
    forced_done = question is not None and (
        constraints.finished or questions_asked >= constraints.max_questions
    )
    if isinstance(turn.next, Done) or forced_done:
        content = turn.next.text if isinstance(turn.next, Done) else constraints.done_fallback
        return AppliedTurn(
            profile=next_profile,
            objectives=objectives,
            questionsAsked=questions_asked,
            finished=True,
            questionNumber=None,
            questionKey=None,
            multi=False,
            suggestions=None,
            content=content,
        )
    assert question is not None  # narrowed by `forced_done`
    number = questions_asked + 1
    if question.questionKey in RUBRIC_KEYS and next_profile[question.questionKey]["state"] != "done":
        next_profile[question.questionKey] = {
            **next_profile[question.questionKey],
            "state": "waiting",
        }
    return AppliedTurn(
        profile=next_profile,
        objectives=objectives,
        questionsAsked=number,
        finished=False,
        questionNumber=number,
        questionKey=question.questionKey,
        multi=question.multi,
        suggestions=[suggestion.model_dump() for suggestion in question.suggestions],
        content=question.text,
    )


def suggestions_json(suggestions: Sequence[Suggestion], multi: bool) -> str:
    """`suggestionsJson`: the stored JSON keeps the display order and the `multi` flag."""
    payload: list[dict[str, Any]] = []
    for suggestion in suggestions:
        entry: dict[str, Any] = {
            "label": suggestion.label,
            "value": suggestion.value,
            "multi": multi,
        }
        if suggestion.description is not None:
            entry["description"] = suggestion.description
        payload.append(entry)
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
