"""Read model, drafts and immediate correction of one attempt (SPEC-611 EF-1 to EF-7).

Port of `packages/services/src/quiz/check.ts`. The correct answers, expected gaps and explanations
are read from the immutable brick version on the server only; a question that is not checked never
carries them. Every write runs in the caller's RLS transaction and the answer row is locked by a
consultative lock on `(attempt, position)`.
"""

import json
import math
from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.domain.bricks.public import project_public
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import parse_iso, to_iso

QUIZ_TYPES = ("choice_question", "cloze", "matching", "open_question")
"""ET-2 - the four question types a validation quiz may hold."""

OPEN_MAX_CHARS = 2000
"""ET-5 - the maximum length of an open answer."""

MAX_TIME_MS = 1_800_000
"""EF-6 - thirty minutes, the bound of the recorded elapsed time."""

DEFAULT_THRESHOLD = 80
"""EF-2 - the pass threshold when the activity config does not carry one."""


def iso_of(value: Any) -> str:
    """`isoOf`: a timestamp column as an ISO instant, whatever the driver returns."""
    return to_iso(value) if not isinstance(value, str) else to_iso(parse_iso(value))


def as_object(value: Any) -> dict[str, Any] | None:
    """`asObject`: a JSON object, parsed when the driver returns the raw text."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed: Any = json.loads(value)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return dict(parsed) if isinstance(parsed, Mapping) else None
    return dict(value) if isinstance(value, Mapping) else None


def items_of(value: Any) -> list[dict[str, Any]]:
    """`itemsOf`: the activity items, ignoring anything that is not an object."""
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def type_of(value: Any) -> str:
    """`typeOf`: an unknown stored type is read as an open question, never as a game."""
    if value in ("choice_question", "cloze", "matching"):
        return str(value)
    return "open_question"


def clamp_time(value: Any) -> int:
    """`clampTime`: whole milliseconds between zero and `MAX_TIME_MS`."""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return 0
    return int(min(max(math.trunc(value), 0), MAX_TIME_MS))


def number_or_none(value: Any) -> float | None:
    """A numeric column stored as text by the driver."""
    if value is None:
        return None
    return float(value)


def public_payload(item: Mapping[str, Any], type_name: str, version_id: str) -> Any:
    """`publicPayload`: the contract payload of one item, `None` when it cannot be read."""
    parsed, issues = parse_payload(type_name, item.get("payload"))
    if parsed is None or issues:
        return None
    return project_public(type_name, parsed, version_id)


def type_label(type_name: str, payload: Any) -> str:
    """ET-2 - the visible label of the question type."""
    data = as_object(payload)
    if type_name == "choice_question":
        multiple = data is not None and data.get("mode") == "multiple"
        return texts.QUIZ_TYPE_CHOICE_MULTIPLE if multiple else texts.QUIZ_TYPE_CHOICE_SINGLE
    if type_name == "cloze":
        return texts.QUIZ_TYPE_CLOZE
    if type_name == "matching":
        return texts.QUIZ_TYPE_MATCHING
    return texts.QUIZ_TYPE_OPEN


def is_checked(answer: Mapping[str, Any]) -> bool:
    """ET-5 - a question is checked once code or the tutor graded it, or the flag says so."""
    if answer["graded_by"] in ("code", "tutor"):
        return True
    feedback = as_object(answer["feedback"])
    return feedback is not None and feedback.get("checked") is True


def has_draft(response: Any) -> bool:
    """ET-2 - a stored response is a draft when it holds at least one visible value."""
    value = as_object(response)
    if value is None:
        return False
    text = value.get("text")
    if isinstance(text, str):
        return text.strip() != ""
    options = value.get("optionIds")
    if isinstance(options, list):
        return len(options) > 0
    gaps = as_object(value.get("gaps"))
    if gaps is not None:
        return any(isinstance(entry, str) and entry != "" for entry in gaps.values())
    pairs = as_object(value.get("pairs"))
    if pairs is not None:
        return any(isinstance(entry, str) and entry != "" for entry in pairs.values())
    return len(value) > 0


def _title_of(stored: Mapping[str, Any], is_correct: Any) -> str:
    """The stored title when it is one of the two verdicts, the derived one otherwise."""
    title = stored.get("title")
    if title in (texts.GRADE_FEEDBACK_EXACT, texts.GRADE_FEEDBACK_APPROXIMATE):
        return str(title)
    return texts.GRADE_FEEDBACK_EXACT if is_correct is True else texts.GRADE_FEEDBACK_APPROXIMATE


def pending_feedback() -> dict[str, Any]:
    """ET-5 - an open answer is recorded and waits for the tutor."""
    return {
        "isCorrect": None,
        "score": None,
        "explanation": None,
        "title": texts.QUIZ_FEEDBACK_SAVED,
        "pending": True,
    }


def feedback_of(answer: Mapping[str, Any], type_name: str) -> dict[str, Any] | None:
    """`feedbackOf`: the correction already stored for a checked question."""
    if not is_checked(answer):
        return None
    stored = as_object(answer["feedback"])
    if type_name == "open_question":
        if answer["graded_by"] == "tutor" and stored is not None:
            return {
                "isCorrect": answer["is_correct"],
                "score": number_or_none(answer["score"]),
                "explanation": stored.get("explanation")
                if isinstance(stored.get("explanation"), str)
                else None,
                "title": _title_of(stored, answer["is_correct"]),
                "correction": stored.get("correction"),
            }
        return pending_feedback()
    if stored is None:
        return {
            "isCorrect": answer["is_correct"],
            "score": number_or_none(answer["score"]),
            "explanation": None,
            "title": _title_of({}, answer["is_correct"]),
            "correction": None,
        }
    explanation = stored.get("explanation")
    return {
        "isCorrect": answer["is_correct"],
        "score": number_or_none(answer["score"]),
        "explanation": explanation if isinstance(explanation, str) else None,
        "title": _title_of(stored, answer["is_correct"]),
        "correction": stored.get("correction"),
    }


def question_of(item: Mapping[str, Any], answer: Mapping[str, Any], position: int) -> dict[str, Any]:
    """ET-2 - one question of the read model, with the correction only when checked."""
    type_name = type_of(item.get("type"))
    raw_version = item.get("brickVersionId")
    version_id = str(raw_version) if isinstance(raw_version, str) else ""
    payload = public_payload(item, type_name, version_id)
    if is_checked(answer):
        state = "checked"
    elif has_draft(answer["response"]):
        state = "draft"
    else:
        state = "unanswered"
    raw_notion = item.get("notionId")
    notion_id = str(raw_notion) if isinstance(raw_notion, str) else version_id
    raw_label = item.get("notionLabel")
    question: dict[str, Any] = {
        "position": position,
        "brickVersionId": version_id,
        "type": type_name,
        "typeLabel": type_label(type_name, payload),
        "notionId": notion_id,
        "notionLabel": str(raw_label) if isinstance(raw_label, str) else texts.QUIZ_DEFAULT_NOTION_LABEL,
        "payload": payload,
        "state": state,
        "maxScore": 0 if answer["max_score"] is None else float(answer["max_score"]),
    }
    if state != "unanswered":
        question["response"] = answer["response"]
    if state == "checked":
        question["feedback"] = feedback_of(answer, type_name)
    return question


def threshold_of(attempt: Mapping[str, Any]) -> int:
    """EF-2 - the threshold stored in the activity config, 80 by default."""
    config = as_object(attempt["config"])
    if config is None:
        return DEFAULT_THRESHOLD
    value = config.get("threshold")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    return DEFAULT_THRESHOLD


async def get_attempt(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """ET-2 - the attempt read model: questions, drafts and stored corrections."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        attempt = await queries.read_quiz_attempt(tx, actor.user_id, attempt_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
        items = items_of(attempt["items"])
        answers = await queries.read_quiz_answers(tx, attempt_id)
        questions = [
            question_of(items[index] if index < len(items) else {}, answer, int(answer["position"]))
            for index, answer in enumerate(answers)
        ]
        return {
            "id": str(attempt["id"]),
            "kind": "validation_quiz",
            "attemptNo": int(attempt["attempt_no"]),
            "status": str(attempt["status"]),
            "moduleId": str(attempt["module_id"]),
            "formationId": str(attempt["formation_id"]),
            "threshold": threshold_of(attempt),
            "total": len(questions),
            "questions": questions,
            "startedAt": iso_of(attempt["started_at"]),
            "submittedAt": None if attempt["submitted_at"] is None else iso_of(attempt["submitted_at"]),
            "score": number_or_none(attempt["score"]),
            "passed": attempt["passed"],
            "serverTime": to_iso(now),
        }


def validate_response(type_name: str, payload: Any, response: Any, version_id: str) -> dict[str, Any]:
    """`validateResponse`: an open answer is bounded, a closed one is graded to be validated."""
    parsed, issues = parse_payload(type_name, payload)
    if parsed is None or issues:
        raise AppError("INTERNAL_ERROR", texts.QUIZ_BRICK_PAYLOAD_INVALID)
    if type_name == "open_question":
        value = as_object(response)
        text = value.get("text") if value is not None else None
        answer = text.strip() if isinstance(text, str) else ""
        if answer == "":
            raise AppError(
                "VALIDATION_FAILED",
                texts.QUIZ_RESPONSE_EMPTY,
                errors=[{"path": "response.text", "message": texts.QUIZ_RESPONSE_EMPTY_HINT}],
            )
        if len(answer) > OPEN_MAX_CHARS:
            raise AppError(
                "VALIDATION_FAILED",
                texts.QUIZ_RESPONSE_TOO_LONG,
                errors=[{"path": "response.text", "message": texts.QUIZ_RESPONSE_TOO_LONG_HINT}],
            )
        return parsed
    try:
        grade_brick(type_name, parsed, response, version_id)
    except BrickGradeError as error:
        # Grading doubles as the response validator; only an unreadable response is refused here.
        if error.code == "RESPONSE_INVALID":
            raise AppError("VALIDATION_FAILED", texts.QUIZ_RESPONSE_INVALID, errors=error.issues) from error
    return parsed


async def _locked_attempt(tx: Any, user_id: str, attempt_id: str) -> Mapping[str, Any]:
    """The attempt, refusing a closed one (409) before any other check."""
    attempt = await queries.read_quiz_attempt(tx, user_id, attempt_id)
    if attempt is None:
        raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
    if attempt["status"] != "in_progress":
        raise AppError("CONFLICT", texts.QUIZ_ATTEMPT_CLOSED, status=409)
    return attempt


async def _answer_at(tx: Any, attempt_id: str, position: int) -> Mapping[str, Any]:
    answer = await queries.read_quiz_answer(tx, attempt_id, position)
    if answer is None:
        raise AppError("NOT_FOUND", texts.QUIZ_QUESTION_NOT_FOUND)
    return answer


async def save_draft(
    deps: AssessmentDeps, actor: Actor, attempt_id: str, position: int, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-6 - stores a draft answer, never grading it."""
    now = to_iso(deps.clock.now())
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_quiz_answer(tx, attempt_id, position)
        attempt = await _locked_attempt(tx, actor.user_id, attempt_id)
        answer = await _answer_at(tx, attempt_id, position)
        items = items_of(attempt["items"])
        item = items[position - 1] if position <= len(items) else {}
        if is_checked(answer):
            raise AppError("CONFLICT", texts.QUIZ_QUESTION_CHECKED, status=409)
        validate_response(
            type_of(item.get("type")),
            item.get("payload"),
            body.get("response"),
            str(answer["brick_version_id"]),
        )
        await queries.update_quiz_answer_draft(
            tx,
            answer_id=str(answer["id"]),
            response=json.dumps(body.get("response"), ensure_ascii=False),
            time_ms=clamp_time(body.get("timeMs")),
            now=now,
        )
        return {"position": position, "savedAt": now}


async def check_answer(
    deps: AssessmentDeps, actor: Actor, attempt_id: str, position: int, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-3, EF-5 - grades one answer immediately and locks the question (CL-2, CL-8)."""
    now = to_iso(deps.clock.now())
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_quiz_answer(tx, attempt_id, position)
        attempt = await _locked_attempt(tx, actor.user_id, attempt_id)
        answer = await _answer_at(tx, attempt_id, position)
        items = items_of(attempt["items"])
        item = items[position - 1] if position <= len(items) else {}
        type_name = type_of(item.get("type"))

        if is_checked(answer):
            existing = feedback_of(answer, type_name)
            if existing is None:
                raise AppError("INTERNAL_ERROR", texts.QUIZ_FEEDBACK_MISSING)
            return {"position": position, "feedback": existing, "locked": True}

        version_id = str(answer["brick_version_id"])
        parsed = validate_response(type_name, item.get("payload"), body.get("response"), version_id)
        time_ms = clamp_time(body.get("timeMs"))
        max_score = 0.0 if answer["max_score"] is None else float(answer["max_score"])

        if type_name == "open_question":
            await queries.update_quiz_answer_open_checked(
                tx,
                answer_id=str(answer["id"]),
                response=json.dumps(body.get("response"), ensure_ascii=False),
                time_ms=time_ms,
                max_score=max_score,
                now=now,
            )
            return {"position": position, "feedback": pending_feedback(), "locked": True}

        try:
            outcome = grade_brick(type_name, parsed, body.get("response"), version_id)
        except BrickGradeError as error:
            if error.code == "GRADED_BY_TUTOR":
                raise AppError("INTERNAL_ERROR", texts.QUIZ_TUTOR_GRADED) from error
            raise AppError("VALIDATION_FAILED", texts.QUIZ_RESPONSE_INVALID, errors=error.issues) from error

        # The quiz contract correction is the raw brick correction (cloze, matching, choice):
        # the game projection of `review_games` reverses the keys and is not the quiz DTO.
        correction = outcome["correction"]
        points = js_round(float(outcome["score"]) * max_score * 100) / 100
        raw_explanation = outcome["correction"].get("explanation")
        explanation = raw_explanation if isinstance(raw_explanation, str) else None
        stored = {
            "isCorrect": outcome["isCorrect"],
            "title": outcome["feedbackTitle"],
            "explanation": explanation,
            "correction": outcome["correction"],
            "scoreRatio": outcome["score"],
        }
        await queries.update_quiz_answer_checked(
            tx,
            answer_id=str(answer["id"]),
            response=json.dumps(body.get("response"), ensure_ascii=False),
            is_correct=bool(outcome["isCorrect"]),
            score=points,
            max_score=max_score,
            time_ms=time_ms,
            feedback=json.dumps(stored, ensure_ascii=False),
            chosen_distractor_notion_id=outcome["chosenDistractorNotionId"],
            now=now,
        )
        return {
            "position": position,
            "feedback": {
                "isCorrect": outcome["isCorrect"],
                "score": points,
                "explanation": explanation,
                "title": outcome["feedbackTitle"],
                "correction": correction,
            },
            "locked": True,
        }


__all__ = [
    "check_answer",
    "clamp_time",
    "feedback_of",
    "get_attempt",
    "has_draft",
    "is_checked",
    "question_of",
    "save_draft",
    "type_label",
    "type_of",
    "validate_response",
]
