"""Attempt lifecycle of a practice exercise (SPEC-613 EF-1 to EF-5; BR-PRA-01).

Port of `packages/services/src/exercises/{attempt-service,get-practice-exercise,exercise-store}.ts`.
Draft, hint and submit all go through one locked attempt: a second identical request observes the
committed transition and changes nothing. The submit transaction writes the answer, the attempt and
the `exercise/submitted` outbox row together; the mastery application of SPEC-411 runs after the
commit through `learny.learning.application.apply_result` and remains idempotent through the unique
review-log key.

The instruction invariants, the production validation and the bounded tutor correction live in
`learny.assessments.domain.exercise`; nothing is duplicated here.
"""

import json
from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain import exercise as domain
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.application.apply_result import apply_learning_result
from learny.learning.domain.params import ENGINE
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import parse_iso, to_iso

MAX_HINTS = 2
"""CL-3 - the exercise reveals two hints at most."""

MAX_SCORE = 10
"""EF-2 - the exercise scale, one point of maximum per used hint."""

GAP_NATURES = ("forgetting", "confusion", "misunderstanding", "application")
"""The four contract natures of a gap."""

MIME_OVERHEAD = 1_000_000
"""`maxSizeMb * 1_000_000`: the size unit of the contract, never `1024 * 1024`."""


def iso_of(value: Any) -> str:
    """`iso`: a stored instant as the ISO string of the contract."""
    return to_iso(value) if not isinstance(value, str) else to_iso(parse_iso(value))


def number_or_none(value: Any) -> float | None:
    """A numeric column stored as text by the driver."""
    if value is None:
        return None
    return float(value)


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


def instruction_of(row: Mapping[str, Any]) -> dict[str, Any]:
    """`instructionOf`: the immutable instruction, never guessed from an invalid payload."""
    parsed = domain.parse_instruction(row["payload"])
    if parsed is None:
        raise AppError("INTERNAL_ERROR", texts.EXERCISE_INSTRUCTION_INVALID)
    return parsed


def submission_error(issues: list[dict[str, str]]) -> AppError:
    """`submissionError`: a production refused by the code, with one issue per faulty cell."""
    return AppError("RESPONSE_INVALID", texts.EXERCISE_SUBMISSION_INVALID, status=422, errors=issues)


def validation_error(issues: list[dict[str, str]]) -> AppError:
    """`submissionError` of the request itself: 400 `VALIDATION_FAILED` with the field paths."""
    return AppError("VALIDATION_FAILED", texts.EXERCISE_SUBMISSION_INVALID, errors=issues)


def parse_submission(value: Any) -> dict[str, Any]:
    """`ExerciseSubmissionSchema.safeParse` of the service, after the pipeline validation."""
    parsed, issues = domain.parse_submission(value)
    if parsed is None or issues:
        raise validation_error(issues)
    return parsed


def assert_submission_kind(instruction: Mapping[str, Any], submission: Mapping[str, Any]) -> None:
    """`assertSubmissionKind`: a table never reaches a text correction."""
    if submission["kind"] != instruction["production"]["kind"]:
        raise AppError("VALIDATION_FAILED", texts.EXERCISE_KIND_MISMATCH)


async def assert_file_owned(
    tx: Any,
    user_id: str,
    submission: Mapping[str, Any],
    instruction: Mapping[str, Any],
) -> None:
    """`assertFileOwned`: the deposited file belongs to the learner and respects the instruction."""
    production = instruction["production"]
    if submission["kind"] != "file" or production["kind"] != "file":
        return
    file = await queries.read_owned_resource_file(tx, user_id, str(submission["resourceId"]))
    if file is None:
        raise submission_error([{"path": "resourceId", "message": texts.EXERCISE_FILE_NOT_FOUND}])
    mime = file["mime"]
    if mime is not None and str(mime) not in production["accept"]:
        raise submission_error([{"path": "resourceId", "message": texts.EXERCISE_FILE_TYPE}])
    size = file["size_bytes"]
    if size is not None and int(production["maxSizeMb"]) * MIME_OVERHEAD < int(size):
        raise submission_error([{"path": "resourceId", "message": texts.EXERCISE_FILE_SIZE}])


def correction_of(value: Any) -> dict[str, Any] | None:
    """`ExerciseCorrectionSchema.safeParse` of a stored correction, `None` when unreadable."""
    raw = as_object(value)
    if raw is None or not isinstance(raw.get("criteria"), list):
        return None
    if not isinstance(raw.get("nextStep"), Mapping):
        return None
    if raw.get("verdict") not in ("passed", "retry"):
        return None
    if not isinstance(raw.get("summary"), str):
        return None
    return raw


def correction_from_attempt(row: Mapping[str, Any]) -> dict[str, Any] | None:
    """`correctionFromAttempt`: the correction already stored on a graded attempt."""
    if row["status"] != "graded":
        return None
    feedback = as_object(row["review_feedback"])
    if feedback is None:
        return None
    return correction_of(feedback.get("correction"))


def mastery_from_feedback(row: Mapping[str, Any], key: str) -> float | None:
    """`masteryFromFeedback`: the stored mastery snapshot, `None` when it is not a number."""
    feedback = as_object(row["review_feedback"])
    if feedback is None:
        return None
    value = feedback.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def submission_of(instruction: Mapping[str, Any], value: Any) -> dict[str, Any] | None:
    """`submissionOf`: the stored production, read with the kind of the instruction."""
    if not isinstance(value, Mapping):
        return None
    parsed, issues = domain.parse_submission({"kind": instruction["production"]["kind"], **dict(value)})
    return None if parsed is None or issues else parsed


def attempt_dto(
    row: Mapping[str, Any] | None,
    instruction: Mapping[str, Any],
    fallback_mastery: float,
) -> dict[str, Any] | None:
    """`attemptDto`: the attempt state a page reload restores, without recomputing a grade."""
    if row is None:
        return None
    hints_used = max(0, min(MAX_HINTS, int(row["hints_used"])))
    mastery_before = mastery_from_feedback(row, "masteryBefore")
    return {
        "attemptId": str(row["id"]),
        "status": "graded" if row["status"] == "graded" else "in_progress",
        "hintsUsed": hints_used,
        "maxScore": max(0, MAX_SCORE - hints_used),
        "submission": submission_of(instruction, row["response"]),
        "correction": correction_from_attempt(row),
        "masteryBefore": fallback_mastery if mastery_before is None else mastery_before,
        "masteryAfter": mastery_from_feedback(row, "masteryAfter"),
        "startedAt": iso_of(row["started_at"]),
        "submittedAt": None if row["submitted_at"] is None else iso_of(row["submitted_at"]),
        "durationMs": None if row["duration_ms"] is None else int(row["duration_ms"]),
    }


def practice_exercise_dto(
    row: Mapping[str, Any],
    state: Mapping[str, Any],
    attempt_row: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """`practiceExerciseDto`: the read model of SCR-08."""
    instruction = instruction_of(row)
    mastery = number_or_none(state["mastery"]) or 0.0
    attempt = attempt_dto(attempt_row, instruction, mastery)
    hints_used = 0 if attempt is None else int(attempt["hintsUsed"])
    nature = state["gap_nature"]
    return {
        "exerciseId": str(row["exercise_id"]),
        "formationId": str(row["formation_id"]),
        "formationTitle": str(row["formation_title"]),
        "moduleId": str(row["module_id"]),
        "moduleTitle": str(row["module_title"]),
        "modulePosition": int(str(row["module_position"])),
        "notionId": str(row["notion_id"]),
        "notionLabel": str(row["notion_label"]),
        "instruction": instruction,
        "attempt": attempt,
        "mastery": mastery,
        "masteryThreshold": int(ENGINE["mastery"]["threshold"]),
        "hintsUsed": hints_used,
        "hintsLeft": max(0, MAX_HINTS - hints_used),
        "maxScore": max(0, MAX_SCORE - hints_used),
        "revealedHints": instruction["hints"][:hints_used],
        "gapNature": nature if nature in GAP_NATURES else None,
    }


async def _exercise_row(tx: Any, user_id: str, exercise_id: str) -> Mapping[str, Any]:
    """`readExercise` with its 404."""
    row = await queries.read_exercise(tx, user_id, exercise_id)
    if row is None:
        raise AppError("NOT_FOUND", texts.EXERCISE_NOT_FOUND)
    return row


async def _notion_state(tx: Any, user_id: str, notion_id: str) -> Mapping[str, Any]:
    """`readNotionState`: an absent row is a brand-new notion with a zero mastery."""
    row = await queries.read_exercise_notion_state(tx, user_id, notion_id)
    return {"mastery": 0, "gap_nature": None} if row is None else row


async def ensure_attempt(tx: Any, user_id: str, exercise_id: str) -> dict[str, Any]:
    """`ensureAttempt`: the in-progress attempt, or the next one created under the locks."""
    await queries.lock_exercise_attempt(tx, user_id, exercise_id)
    last = await queries.lock_exercise_latest_attempt(tx, user_id, exercise_id)
    if last is not None and last["status"] == "in_progress":
        return {
            "attemptId": str(last["id"]),
            "hintsUsed": int(last["hints_used"]),
            "status": str(last["status"]),
            "startedAt": last["started_at"],
        }
    activity = await queries.lock_exercise_activity(tx, user_id, exercise_id)
    if activity is None:
        raise AppError("NOT_FOUND", texts.ACTIVITY_NOT_FOUND)
    if activity["status"] != "ready":
        raise AppError("VALIDATION_FAILED", texts.ACTIVITY_NOT_READY)
    attempt_no = await queries.read_next_exercise_attempt_no(tx, user_id, exercise_id)
    for _ in range(5):
        created = await queries.insert_exercise_attempt(
            tx, user_id=user_id, exercise_id=exercise_id, attempt_no=attempt_no
        )
        if created is not None:
            return {
                "attemptId": str(created["id"]),
                "hintsUsed": int(created["hints_used"]),
                "status": str(created["status"]),
                "startedAt": created["started_at"],
            }
        attempt_no = await queries.read_next_exercise_attempt_no(tx, user_id, exercise_id)
    raise AppError("INTERNAL_ERROR", texts.EXERCISE_ATTEMPT_NO_MISSING)


def _exercise_id(value: str) -> str:
    """`exerciseId`: a malformed identifier is refused before any read."""
    if not domain.is_uuid(value):
        raise AppError("VALIDATION_FAILED", texts.EXERCISE_INVALID_ID)
    return value


async def get_practice_exercise(
    deps: AssessmentDeps, actor: Actor, formation_id: str, module_id: str, exercise_id: str
) -> dict[str, Any]:
    """ET-1 - the exercise, the revealed hints and the latest attempt under the learner's RLS."""
    if not (domain.is_uuid(formation_id) and domain.is_uuid(module_id) and domain.is_uuid(exercise_id)):
        raise AppError("VALIDATION_FAILED", texts.EXERCISE_INVALID_IDS)
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        row = await _exercise_row(tx, user_id, exercise_id)
        if str(row["formation_id"]) != formation_id or str(row["module_id"]) != module_id:
            raise AppError("NOT_FOUND", texts.EXERCISE_NOT_FOUND)
        state = await _notion_state(tx, user_id, str(row["notion_id"]))
        attempt = await queries.read_exercise_latest_attempt(tx, user_id, exercise_id)
        return practice_exercise_dto(row, state, attempt)


async def start_exercise_attempt(
    deps: AssessmentDeps, actor: Actor, exercise_id: str, module_id: str
) -> dict[str, Any]:
    """ET-2 - starts or resumes the single in-progress attempt of one owned exercise."""
    user_id = actor.user_id
    identifier = _exercise_id(exercise_id)
    async with deps.db.user_tx(actor) as tx:
        row = await _exercise_row(tx, user_id, identifier)
        if str(row["module_id"]) != module_id:
            raise AppError("NOT_FOUND", texts.EXERCISE_NOT_FOUND)
        attempt = await ensure_attempt(tx, user_id, identifier)
        return {
            "attemptId": attempt["attemptId"],
            "status": "in_progress",
            "hintsUsed": attempt["hintsUsed"],
            "maxScore": max(0, MAX_SCORE - attempt["hintsUsed"]),
        }


async def save_exercise_draft(
    deps: AssessmentDeps, actor: Actor, exercise_id: str, submission: Any
) -> dict[str, Any]:
    """EF-3 - stores the current production without correction nor tutor call."""
    user_id = actor.user_id
    identifier = _exercise_id(exercise_id)
    parsed = parse_submission(submission)
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        row = await _exercise_row(tx, user_id, identifier)
        instruction = instruction_of(row)
        assert_submission_kind(instruction, parsed)
        attempt = await ensure_attempt(tx, user_id, identifier)
        version_id = await queries.read_exercise_brick_version_id(tx, identifier)
        if version_id is None:
            raise AppError("INTERNAL_ERROR", texts.EXERCISE_BRICK_VERSION_MISSING)
        await queries.upsert_exercise_answer(
            tx,
            attempt_id=attempt["attemptId"],
            version_id=str(version_id),
            response=json.dumps(parsed, ensure_ascii=False),
            answered_at=to_iso(now),
        )
        return {"attemptId": attempt["attemptId"], "savedAt": to_iso(now)}


async def request_exercise_hint(
    deps: AssessmentDeps, actor: Actor, exercise_id: str, module_id: str
) -> dict[str, Any]:
    """CL-3 - reveals the next hint; the third request is refused with 422."""
    user_id = actor.user_id
    identifier = _exercise_id(exercise_id)
    async with deps.db.user_tx(actor) as tx:
        row = await _exercise_row(tx, user_id, identifier)
        if str(row["module_id"]) != module_id:
            raise AppError("NOT_FOUND", texts.EXERCISE_NOT_FOUND)
        instruction = instruction_of(row)
        await queries.lock_exercise_attempt(tx, user_id, identifier)
        last = await queries.read_exercise_latest_attempt(tx, user_id, identifier)
        if last is not None and last["status"] == "graded":
            raise AppError("CONFLICT", texts.EXERCISE_ALREADY_GRADED)
        attempt = (
            {"attemptId": str(last["id"]), "hintsUsed": int(last["hints_used"])}
            if last is not None and last["status"] == "in_progress"
            else await ensure_attempt(tx, user_id, identifier)
        )
        hints_used = await queries.increment_exercise_hints(
            tx, attempt_id=str(attempt["attemptId"]), user_id=user_id
        )
        if hints_used is None:
            raise AppError("RESPONSE_INVALID", texts.EXERCISE_HINT_LIMIT, status=422)
        index = hints_used - 1
        if index < 0 or index >= len(instruction["hints"]):
            raise AppError("INTERNAL_ERROR", texts.EXERCISE_HINT_MISSING)
        return {
            "attemptId": str(attempt["attemptId"]),
            "hintIndex": hints_used,
            "hintText": instruction["hints"][index],
            "hintsUsed": hints_used,
            "hintsLeft": max(0, MAX_HINTS - hints_used),
            "maxScore": max(0, MAX_SCORE - hints_used),
        }


def _graded_update(
    attempt_id: str,
    user_id: str,
    now: str,
    correction: Mapping[str, Any],
    hints_used: int,
    mastery_before: float,
    notion_id: str,
) -> dict[str, Any]:
    """The parameters of the graded attempt update, exactly as `persistSubmission` writes them."""
    passed = correction["verdict"] == "passed"
    return {
        "attempt_id": attempt_id,
        "user_id": user_id,
        "now": now,
        "score": float(correction["score"]) * 10,
        "passed": passed,
        "per_notion": json.dumps(
            {
                notion_id: {
                    "correct": 1 if passed else 0,
                    "total": 1,
                    "score": float(correction["score"]) * 10,
                }
            },
            ensure_ascii=False,
        ),
        "hints_used": hints_used,
        "review_feedback": json.dumps(
            {
                "summary": correction["summary"],
                "nextStep": correction["nextStep"]["label"],
                "correction": dict(correction),
                "masteryBefore": mastery_before,
            },
            ensure_ascii=False,
        ),
    }


async def persist_submission(
    deps: AssessmentDeps, actor: Actor, exercise_id: str, submission: Mapping[str, Any]
) -> dict[str, Any]:
    """The submit transaction: the answer, the attempt and the outbox row together."""
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        row = await _exercise_row(tx, user_id, exercise_id)
        instruction = instruction_of(row)
        assert_submission_kind(instruction, submission)
        await assert_file_owned(tx, user_id, submission, instruction)
        await queries.lock_exercise_attempt(tx, user_id, exercise_id)
        last = await queries.read_exercise_latest_attempt(tx, user_id, exercise_id)
        if last is not None and last["status"] == "graded":
            correction = correction_from_attempt(last)
            if correction is not None:
                submitted_at = deps.clock.now() if last["submitted_at"] is None else last["submitted_at"]
                return {
                    "attemptId": str(last["id"]),
                    "correction": correction,
                    "masteryBefore": 0.0,
                    "submittedAt": iso_of(submitted_at),
                    "notionId": str(row["notion_id"]),
                    "moduleId": str(row["module_id"]),
                    "formationId": str(row["formation_id"]),
                    "alreadyGraded": True,
                }
        attempt = (
            {"attemptId": str(last["id"]), "hintsUsed": int(last["hints_used"])}
            if last is not None and last["status"] == "in_progress"
            else await ensure_attempt(tx, user_id, exercise_id)
        )
        state = await _notion_state(tx, user_id, str(row["notion_id"]))
        mastery_before = number_or_none(state["mastery"]) or 0.0
        issues = domain.validate_production(instruction, submission)
        if issues:
            raise submission_error(issues)
        now = deps.clock.now()
        label = str(row["notion_label"])
        formation_id = str(row["formation_id"])
        graded = domain.grade_exercise(
            instruction,
            submission,
            hints_used=attempt["hintsUsed"],
            next_step=domain.next_step_for(notion_label=label, formation_id=formation_id, passed=False),
        )
        if graded["ok"] is not True:
            raise submission_error(graded["issues"])
        provisional = graded["value"]
        correction = {
            **provisional,
            "nextStep": domain.next_step_for(
                notion_label=label,
                formation_id=formation_id,
                passed=provisional["verdict"] == "passed",
            ),
        }
        version_id = await queries.read_exercise_brick_version_id(tx, exercise_id)
        if version_id is None:
            raise AppError("INTERNAL_ERROR", texts.EXERCISE_BRICK_VERSION_MISSING)
        passed = correction["verdict"] == "passed"
        await queries.update_exercise_graded_attempt(
            tx,
            **_graded_update(
                str(attempt["attemptId"]),
                user_id,
                to_iso(now),
                correction,
                int(str(attempt["hintsUsed"])),
                mastery_before,
                str(row["notion_id"]),
            ),
        )
        await queries.upsert_exercise_answer(
            tx,
            attempt_id=str(attempt["attemptId"]),
            version_id=str(version_id),
            response=json.dumps(dict(submission), ensure_ascii=False),
            is_correct=passed,
            score=float(correction["score"]),
            max_score=float(correction["maxScore"]),
            graded_by="tutor",
            feedback=json.dumps(
                {
                    "explanation": correction["summary"],
                    "criteria": [
                        {
                            "key": criterion["key"],
                            "ok": criterion["ok"],
                            "comment": criterion["comment"],
                        }
                        for criterion in correction["criteria"]
                    ],
                    "missing": [
                        criterion["label"] for criterion in correction["criteria"] if not criterion["ok"]
                    ],
                },
                ensure_ascii=False,
            ),
            answered_at=to_iso(now),
        )
        await tx.emit(
            "exercise/submitted",
            {"userId": user_id, "moduleId": str(row["module_id"]), "attemptId": str(attempt["attemptId"])},
            event_id=f"exercise-submitted:{attempt['attemptId']}",
        )
        return {
            "attemptId": str(attempt["attemptId"]),
            "correction": correction,
            "masteryBefore": mastery_before,
            "submittedAt": to_iso(now),
            "notionId": str(row["notion_id"]),
            "moduleId": str(row["module_id"]),
            "formationId": formation_id,
            "alreadyGraded": False,
        }


async def mastery_after_of(
    deps: AssessmentDeps,
    actor: Actor,
    notion_id: str,
    fallback: float,
    applied: Mapping[str, Any] | None,
) -> float:
    """`masteryAfterOf`: the applied transition, or the persisted state, never an invented value."""
    if applied is not None:
        for state in applied.get("states", []):
            if str(state["notionId"]) == notion_id:
                return float(state["masteryAfter"])
    async with deps.db.user_tx(actor) as tx:
        row = await queries.read_exercise_notion_state(tx, actor.user_id, notion_id)
    if row is None:
        return fallback
    value = number_or_none(row["mastery"])
    return fallback if value is None else value


async def submit_exercise(
    deps: AssessmentDeps, actor: Actor, exercise_id: str, submission: Any
) -> dict[str, Any]:
    """EF-2, ET-4 - grades one submission, then applies its mastery through SPEC-411."""
    identifier = _exercise_id(exercise_id)
    parsed = parse_submission(submission)
    outcome = await persist_submission(deps, actor, identifier, parsed)
    applied: dict[str, Any] | None = None
    if not outcome["alreadyGraded"]:
        try:
            applied = await apply_learning_result(deps, actor, str(outcome["attemptId"]))
        except AppError as error:
            deps.logger.warn(
                "exercise mastery application deferred",
                outcome="exercise_mastery_deferred",
                attempt=outcome["attemptId"],
                code=error.code,
            )
    mastery_after = await mastery_after_of(
        deps,
        actor,
        str(outcome["notionId"]),
        float(outcome["masteryBefore"]),
        applied,
    )
    if not outcome["alreadyGraded"]:
        try:
            async with deps.db.user_tx(actor) as tx:
                await queries.update_exercise_mastery_after(
                    tx,
                    attempt_id=str(outcome["attemptId"]),
                    mastery_after=mastery_after,
                )
        except Exception:
            deps.logger.warn(
                "exercise feedback enrichment failed",
                outcome="exercise_feedback_deferred",
                code="INTERNAL_ERROR",
            )
    return {
        "attemptId": str(outcome["attemptId"]),
        "status": "graded",
        "correction": outcome["correction"],
        "masteryBefore": float(outcome["masteryBefore"]),
        "masteryAfter": mastery_after,
        "submittedAt": outcome["submittedAt"],
    }


__all__ = [
    "GAP_NATURES",
    "MAX_HINTS",
    "MAX_SCORE",
    "assert_file_owned",
    "assert_submission_kind",
    "attempt_dto",
    "correction_from_attempt",
    "ensure_attempt",
    "get_practice_exercise",
    "instruction_of",
    "mastery_after_of",
    "parse_submission",
    "persist_submission",
    "practice_exercise_dto",
    "request_exercise_hint",
    "save_exercise_draft",
    "start_exercise_attempt",
    "submit_exercise",
]
