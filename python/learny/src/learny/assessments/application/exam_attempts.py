"""Start, read, submit and result of a mock exam (SPEC-614 EF-1 to EF-4, ET-4, ET-5, ADR-0172).

The deadline is an absolute instant computed once at the creation of the attempt, an answer is
refused five seconds after it, and the advisory lock plus the row lock make the button, the deadline
job and a lazy read converge on a single graded attempt. The questions are materialised in
`activities.items`, so a later bank change never rewrites an attempt in progress.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.application.exam_format import guide_of
from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain import exam_format as format_domain
from learny.assessments.domain import exam_grade as domain
from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import from_epoch_ms, to_epoch_ms, to_iso

EXAM_GRACE_SECONDS = 5
"""ADR-0172 section 2 - the tolerance window after the deadline."""


def exam_deadline(started_at: Any, duration_sec: float) -> Any:
    """`examDeadline`: `deadline_at = started_at + duration` (ADR-0172 section 1)."""
    return from_epoch_ms(to_epoch_ms(started_at) + int(max(0, duration_sec) * 1000))


def exam_remaining_ms(deadline_at: Any, now: Any) -> int:
    """`examRemainingMs`: `max(0, deadlineAt - now)`, never negative (ET-4)."""
    return max(0, to_epoch_ms(deadline_at) - to_epoch_ms(now))


def exam_expired(deadline_at: Any, now: Any) -> bool:
    """`examExpired`: true once the five-second tolerance window is over."""
    return to_epoch_ms(now) > to_epoch_ms(deadline_at) + EXAM_GRACE_SECONDS * 1000


async def _read_attempt(tx: Any, user_id: str, attempt_id: str, *, lock: bool = False) -> Mapping[str, Any]:
    """`readAttempt`: the exam attempt of this learner, refused when it does not exist."""
    attempt = await queries.read_exam_attempt(tx, user_id, attempt_id, lock=lock)
    if attempt is None:
        raise AppError("NOT_FOUND", texts.EXAM_ATTEMPT_NOT_FOUND)
    return attempt


def _feedback_of(answer: Mapping[str, Any]) -> dict[str, Any] | None:
    """`feedbackOf`: the correction stored on an answer of a graded attempt."""
    return domain.as_object(answer["feedback"])


def build_questions(
    items: Sequence[Mapping[str, Any]],
    answers: Sequence[Mapping[str, Any]],
    marked: set[int],
    graded: bool,
) -> list[dict[str, Any]]:
    """`buildQuestions`: the attempt read model, with the correction only once graded."""
    by_position = {int(answer["position"]): answer for answer in answers}
    questions: list[dict[str, Any]] = []
    for index, item in enumerate(items):
        position = index + 1
        answer = by_position.get(position)
        type_name = domain.text_field(item.get("type"))
        version_id = domain.text_field(item.get("brickVersionId"))
        feedback = _feedback_of(answer) if graded and answer is not None else None
        question: dict[str, Any] = {
            "position": position,
            "brickVersionId": version_id,
            "type": domain.text_field(item.get("type")),
            "typeLabel": domain.type_label_of(type_name, item.get("payload")),
            "notionId": domain.text_field(item.get("notionId")),
            "notionLabel": domain.text_field(item.get("notionLabel")),
            "moduleId": domain.text_field(item.get("moduleId")),
            "modulePosition": domain.number_field(item.get("modulePosition")),
            "moduleLabel": domain.text_field(item.get("moduleLabel")),
            "payload": domain.public_payload_of(type_name, item.get("payload"), version_id),
            "marked": position in marked,
            "maxScore": float(domain.number_field(item.get("points"), 0)),
        }
        if answer is not None and domain.has_response(type_name, answer["response"]):
            question["response"] = answer["response"]
        if feedback is not None:
            question["feedback"] = feedback
        questions.append(question)
    return questions


def grade_item(item: Mapping[str, Any], answer: Mapping[str, Any], studied: bool) -> dict[str, Any]:
    """`gradeItem`: the code correction, the contract feedback and the review row of one answer."""
    type_name = domain.text_field(item.get("type"))
    payload = item.get("payload")
    max_score = float(
        answer["max_score"] if answer["max_score"] is not None else domain.number_field(item.get("points"), 0)
    )
    response = answer["response"]
    answered = domain.has_response(type_name, response)
    outcome: dict[str, Any] | None = None
    if answered and type_name in domain.EXAM_GRADED_TYPES:
        parsed, issues = parse_payload(type_name, payload)
        if parsed is not None and not issues:
            try:
                outcome = grade_brick(
                    type_name,
                    parsed,
                    response,
                    domain.text_field(answer["brick_version_id"]),
                )
            except BrickGradeError:
                outcome = None
    correction = outcome["correction"] if outcome is not None else None
    labels = domain.correction_labels(correction)
    ratio = float(outcome["score"]) if outcome is not None else 0.0
    is_correct = bool(outcome["isCorrect"]) if outcome is not None else False
    payload_object = domain.as_object(payload)
    explanation = labels["explanation"]
    if explanation is None and payload_object is not None:
        raw_explanation = payload_object.get("explanation")
        explanation = raw_explanation if isinstance(raw_explanation, str) else None
    points = js_round(ratio * max_score * 100) / 100
    feedback: dict[str, Any] = {
        "isCorrect": is_correct,
        "title": texts.GRADE_FEEDBACK_EXACT if is_correct else texts.GRADE_FEEDBACK_APPROXIMATE,
        "score": points,
        "explanation": explanation,
    }
    if correction is not None and correction.get("kind") not in (None, "none"):
        feedback["correction"] = correction
    given = labels["given"]
    if given == texts.EXAM_GIVEN_NONE and answered:
        given = texts.EXAM_GIVEN_INCOMPLETE
    return {
        "answerId": str(answer["id"]),
        "feedback": feedback,
        "question": {
            "position": int(answer["position"]),
            "brickVersionId": str(answer["brick_version_id"]),
            "typeLabel": domain.type_label_of(type_name, payload),
            "question": domain.question_stem(type_name, payload),
            "notionId": domain.text_field(item.get("notionId")),
            "notionLabel": domain.text_field(item.get("notionLabel")),
            "moduleId": domain.text_field(item.get("moduleId")),
            "modulePosition": domain.number_field(item.get("modulePosition")),
            "moduleLabel": domain.text_field(item.get("moduleLabel")),
            "studied": studied,
            "isCorrect": is_correct,
            "score": points,
            "maxScore": max_score,
            "given": given,
            "expected": labels["expected"]
            if labels["expected"] is not None
            else domain.expected_from_payload(type_name, payload),
            "explanation": explanation,
        },
    }


def _study_of(module: Mapping[str, Any]) -> bool:
    """A module is studied when it is open/validated or when one of its notions was seen."""
    return format_domain.is_studied_module(str(module["status"]), int(module["seen_count"]))


async def start_exam_attempt(deps: AssessmentDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """EF-1, EF-2 - starts, or resumes, the single running exam of the formation."""
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        existing = await queries.read_in_progress_exam_attempt(tx, user_id, formation_id)
    if existing is not None:
        return {"attemptId": existing, "resumed": True}
    started_at = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_exam_start(tx, user_id, formation_id)
        replay = await queries.read_in_progress_exam_attempt(tx, user_id, formation_id)
        if replay is not None:
            return {"attemptId": replay, "resumed": True}
        formation = await queries.read_exam_formation(tx, user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.EXAM_FORMATION_NOT_FOUND)
        guide = await queries.read_exam_guide(tx, formation_id)
        format_value = format_domain.propose_exam_format(formation["exam_format"], guide_of(guide))
        if format_value["confirmed"] is not True:
            raise AppError("FORMAT_NOT_CONFIRMED", texts.EXAM_FORMAT_NOT_CONFIRMED)
        modules = await queries.read_exam_modules(tx, user_id, formation_id)
        if not modules:
            raise AppError("CONFLICT", texts.EXAM_NO_PROGRAMME, status=409)
        studied_modules = {str(module["module_id"]) for module in modules if _study_of(module)}
        rows = await queries.read_exam_bank(tx, user_id, formation_id)
        candidates = domain.candidates_of(rows, studied_modules)
        if not candidates:
            raise AppError("CONFLICT", texts.EXAM_NO_QUESTION_AVAILABLE, status=409)
        attempt_no = await queries.read_next_exam_attempt_no(tx, user_id, formation_id)
        seed = f"{user_id}:{formation_id}:exam:{attempt_no}"
        selected = domain.select_exam_questions(
            candidates,
            [
                {
                    "moduleId": str(module["module_id"]),
                    "position": int(module["position"]),
                    "notionCount": int(module["notion_count"]),
                }
                for module in modules
            ],
            int(format_value["questionCount"]),
            seed,
        )
        if not selected:
            raise AppError("CONFLICT", texts.EXAM_NO_QUESTION_AVAILABLE, status=409)
        points = 100 / len(selected)
        items = [
            {
                "brickId": question["brickId"],
                "brickVersionId": question["versionId"],
                "points": points,
                "notionId": question["notionId"],
                "notionLabel": question["notionLabel"],
                "type": question["type"],
                "payload": question["payload"],
                "moduleId": question["moduleId"],
                "modulePosition": question["modulePosition"],
                "moduleLabel": question["moduleLabel"],
                "studied": question["studied"],
            }
            for question in selected
        ]
        diagnostic_positions = [index + 1 for index, item in enumerate(items) if item["studied"] is not True]
        config: dict[str, Any] = {
            "threshold": int(format_value["threshold"]),
            "durationSec": int(format_value["durationMin"]) * 60,
            "questionCount": len(selected),
            "scoring": "equal",
            "examFormat": format_domain.format_dto(format_value),
            "diagnosticPositions": diagnostic_positions,
            "modules": [
                {
                    "moduleId": str(module["module_id"]),
                    "position": int(module["position"]),
                    "label": str(module["label"]),
                    "studied": str(module["module_id"]) in studied_modules,
                }
                for module in modules
                if any(question["moduleId"] == str(module["module_id"]) for question in selected)
            ],
        }
        activity_id = await queries.insert_exam_activity(
            tx,
            user_id=user_id,
            formation_id=formation_id,
            config=json.dumps(config, ensure_ascii=False),
            items=json.dumps(items, ensure_ascii=False),
        )
        if activity_id is None:
            raise AppError("INTERNAL_ERROR", texts.EXAM_ACTIVITY_NOT_CREATED)
        deadline = exam_deadline(started_at, int(config["durationSec"]))
        attempt_id = await queries.insert_exam_attempt(
            tx,
            user_id=user_id,
            activity_id=activity_id,
            attempt_no=attempt_no,
            started_at=to_iso(started_at),
            deadline_at=to_iso(deadline),
        )
        if attempt_id is None:
            raise AppError("INTERNAL_ERROR", texts.EXAM_ATTEMPT_NOT_CREATED)
        for index, item in enumerate(items):
            await queries.insert_exam_answer(
                tx,
                attempt_id=attempt_id,
                version_id=str(item["brickVersionId"]),
                position=index + 1,
                max_score=float(item["points"]),
                answered_at=to_iso(started_at),
            )
        await tx.emit(
            "exam/started",
            {
                "userId": user_id,
                "formationId": formation_id,
                "attemptId": attempt_id,
                "deadlineAt": to_iso(deadline),
            },
            event_id=f"exam-started:{attempt_id}",
        )
        return {"attemptId": attempt_id}


async def get_exam_attempt(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """ET-4, BR-PRA-03 - the read model of the attempt; an expired one is submitted lazily."""
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        first = await _read_attempt(tx, user_id, attempt_id)
        expired = first["status"] == "in_progress" and exam_expired(first["deadline_at"], deps.clock.now())
    if expired:
        await submit_exam(deps, actor, attempt_id, trigger="lazy")
    async with deps.db.user_tx(actor) as tx:
        attempt = await _read_attempt(tx, user_id, attempt_id)
        answers = await queries.read_exam_answers(tx, attempt_id)
        config = domain.config_of(attempt["config"])
        items = domain.items_of(attempt["items"])
        marked = set(domain.marked_positions_of(attempt["review_feedback"]))
        graded = attempt["status"] == "graded"
        questions = build_questions(items, answers, marked, graded)
        remaining = int((exam_remaining_ms(attempt["deadline_at"], deps.clock.now()) + 999) // 1000)
        return {
            "id": str(attempt["id"]),
            "attemptNo": int(attempt["attempt_no"]),
            "formationId": str(attempt["formation_id"]),
            "status": str(attempt["status"]),
            "threshold": int(config["threshold"]),
            "total": len(questions),
            "questions": questions,
            "startedAt": to_iso(attempt["started_at"]),
            "deadlineAt": to_iso(attempt["deadline_at"]),
            "serverTime": to_iso(deps.clock.now()),
            "remainingSeconds": remaining,
            "answeredCount": sum(1 for question in questions if "response" in question),
            "markedCount": len(marked),
        }


async def submit_exam(
    deps: AssessmentDeps, actor: Actor, attempt_id: str, *, trigger: str = "manual"
) -> dict[str, Any]:
    """EF-3, EF-4, CL-3, CL-4 - submits and grades the attempt once, whatever the trigger."""
    now = deps.clock.now()
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_exam_submit(tx, attempt_id)
        attempt = await _read_attempt(tx, user_id, attempt_id, lock=True)
        answers = await queries.read_exam_answers(tx, attempt_id)
        items = domain.items_of(attempt["items"])
        config = domain.config_of(attempt["config"])
        marked = domain.marked_positions_of(attempt["review_feedback"])
        answered_count = 0
        for index, item in enumerate(items):
            if index >= len(answers):
                continue
            if domain.has_response(domain.text_field(item.get("type")), answers[index]["response"]):
                answered_count += 1
        unanswered_count = len(items) - answered_count
        timed_out = to_epoch_ms(now) > to_epoch_ms(attempt["deadline_at"])
        restored = {"unansweredCount": unanswered_count, "markedCount": len(marked), "timedOut": timed_out}
        if attempt["status"] != "in_progress":
            return {"status": str(attempt["status"]), **restored}
        if trigger in ("deadline", "lazy") and not exam_expired(attempt["deadline_at"], now):
            return {"status": "in_progress", **restored}

        graded_items: list[dict[str, Any]] = []
        for index, item in enumerate(items):
            if index >= len(answers):
                continue
            answer = answers[index]
            graded_item = grade_item(item, answer, item.get("studied") is True)
            graded_items.append(graded_item)
            question = graded_item["question"]
            await queries.update_exam_graded_answer(
                tx,
                answer_id=graded_item["answerId"],
                is_correct=bool(question["isCorrect"]),
                score=float(question["score"]),
                max_score=float(question["maxScore"]),
                feedback=json.dumps(graded_item["feedback"], ensure_ascii=False),
                now=to_iso(now),
            )
        questions = [graded_item["question"] for graded_item in graded_items]
        summary = domain.grade_exam(questions, config["modules"], float(config["threshold"]))
        duration_ms = max(
            0,
            min(int(config["durationSec"]) * 1000, to_epoch_ms(now) - to_epoch_ms(attempt["started_at"])),
        )
        review_feedback = {
            **(domain.as_object(attempt["review_feedback"]) or {}),
            "markedPositions": marked,
            "timedOut": timed_out,
            "plan": summary["plan"],
        }
        await queries.update_exam_graded_attempt(
            tx,
            attempt_id=attempt_id,
            score=float(summary["score"]),
            passed=bool(summary["passed"]),
            per_notion=json.dumps(domain.per_notion_of(questions), ensure_ascii=False),
            now=to_iso(now),
            duration_ms=duration_ms,
            review_feedback=json.dumps(review_feedback, ensure_ascii=False),
        )
        await tx.emit(
            "exam/submitted",
            {
                "userId": user_id,
                "formationId": str(attempt["formation_id"]),
                "attemptId": attempt_id,
            },
            event_id=f"exam-submitted:{attempt_id}",
        )
    # The learning application of a graded exam (FSRS, mastery, gaps, streak) belongs to the
    # worker: `exam/submitted` is written in the same transaction and is its single trigger. The
    # consumer is declared by SPEC-2207, so this use case stops at the graded attempt.
    return {"status": "graded", **restored}


async def get_exam_result(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """EF-4, BR-PRA-04 - the complete result with separated scores, gaps and review rows."""
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        first = await _read_attempt(tx, user_id, attempt_id)
        expired = first["status"] == "in_progress" and exam_expired(first["deadline_at"], deps.clock.now())
    if expired:
        await submit_exam(deps, actor, attempt_id, trigger="lazy")
    async with deps.db.user_tx(actor) as tx:
        attempt = await _read_attempt(tx, user_id, attempt_id)
        if attempt["status"] != "graded":
            raise AppError("CONFLICT", texts.EXAM_NOT_GRADED, status=409)
        answers = await queries.read_exam_answers(tx, attempt_id)
        items = domain.items_of(attempt["items"])
        config = domain.config_of(attempt["config"])
        graded_items = [
            grade_item(item, answers[index], item.get("studied") is True)
            for index, item in enumerate(items)
            if index < len(answers)
        ]
        summary = domain.grade_exam(
            [graded_item["question"] for graded_item in graded_items],
            config["modules"],
            float(config["threshold"]),
        )
        review = domain.as_object(attempt["review_feedback"]) or {}
        duration_min = int(js_round(float(config["durationSec"]) / 60))
        duration_ms = attempt["duration_ms"] or 0
        time_used_min = max(0, min(duration_min, int(js_round(duration_ms / 60_000))))
        answered_count = sum(
            1
            for graded_item in graded_items
            if domain.has_response(
                domain.text_field(items[graded_item["question"]["position"] - 1].get("type")),
                answers[graded_item["question"]["position"] - 1]["response"],
            )
        )
        return {
            "attemptId": attempt_id,
            "formationId": str(attempt["formation_id"]),
            "status": str(attempt["status"]),
            "threshold": int(config["threshold"]),
            "durationMin": duration_min,
            "timeUsedMin": time_used_min,
            "timedOut": review.get("timedOut") is True,
            "score": float(summary["score"]),
            "passed": bool(summary["passed"]),
            "answeredCount": answered_count,
            "total": len(summary["review"]),
            "studied": summary["studied"],
            "diagnostic": summary["diagnostic"],
            "modules": summary["modules"],
            "gaps": summary["gaps"],
            "plan": summary["plan"],
            "review": summary["review"],
        }


__all__ = [
    "EXAM_GRACE_SECONDS",
    "build_questions",
    "exam_deadline",
    "exam_expired",
    "exam_remaining_ms",
    "get_exam_attempt",
    "get_exam_result",
    "grade_item",
    "start_exam_attempt",
    "submit_exam",
]
