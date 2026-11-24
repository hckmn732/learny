"""HTTP handlers of the assessments context (SPEC-2202).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.assessments`.
"""

from typing import Any, cast

from learny.assessments import public as assessments
from learny.formation.application.simple import diagnostic as simple
from learny.shared.jsonx import dumps
from starlette.responses import Response

from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _body(call: Call, *, partial: bool = False) -> dict[str, Any]:
    """The validated body as a plain mapping; `partial` keeps only the fields the caller sent."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump(exclude_unset=partial))


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


def _query(call: Call) -> dict[str, Any]:
    """The validated query string as a plain mapping, defaults included."""
    return cast(dict[str, Any], cast(Any, call.query).model_dump())


def _json(payload: Any, status: int) -> Response:
    """A handler-owned status code: the pipeline only writes the headers."""
    return Response(
        content=dumps(payload),
        status_code=status,
        headers={"content-type": "application/json; charset=utf-8"},
    )


# --- bricks --------------------------------------------------------------------------------------


@handler("bricks.correct")
async def bricks_correct(call: Call) -> Any:
    return await assessments.correct_brick(call.deps, _actor(call), _params(call)["bid"], _body(call))


@handler("bricks.report")
async def bricks_report(call: Call) -> Any:
    result = await assessments.report_brick(call.deps, _actor(call), _params(call)["bid"], _body(call))
    payload = {"reportId": result["reportId"], "status": result["status"]}
    if result["created"]:
        return payload
    return _json(payload, 200)


# --- offline ------------------------------------------------------------------------------------


@handler("offline.pack")
async def offline_pack(call: Call) -> Any:
    return await assessments.build_pack(call.deps, _actor(call))


@handler("offline.sync")
async def offline_sync(call: Call) -> Any:
    return await assessments.sync_offline_answers(call.deps, _actor(call), _body(call)["entries"])


# --- practice exercises --------------------------------------------------------------------------
# SPEC-613: the tutor generation, the attempt lifecycle and the mastery application.


@handler("exercises.detail")
async def exercises_detail(call: Call) -> Any:
    params = _params(call)
    return await assessments.get_practice_exercise(
        call.deps, _actor(call), params["fid"], params["mid"], params["aid"]
    )


@handler("exercises.start")
async def exercises_start(call: Call) -> Any:
    params = _params(call)
    result = await assessments.start_exercise_attempt(call.deps, _actor(call), params["aid"], params["mid"])
    return _json(result, 201)


@handler("exercises.saveDraft")
async def exercises_save_draft(call: Call) -> Any:
    return await assessments.save_exercise_draft(
        call.deps, _actor(call), _params(call)["aid"], _body(call)["submission"]
    )


@handler("exercises.submit")
async def exercises_submit(call: Call) -> Any:
    result = await assessments.submit_exercise(
        call.deps, _actor(call), _params(call)["aid"], _body(call)["submission"]
    )
    return _json(result, 201)


@handler("exercises.hint")
async def exercises_hint(call: Call) -> Any:
    params = _params(call)
    result = await assessments.request_exercise_hint(call.deps, _actor(call), params["aid"], params["mid"])
    return _json(result, 201)


# --- remediation ---------------------------------------------------------------------------------


@handler("remediation.get")
async def remediation_get(call: Call) -> Any:
    return await assessments.get_remediation(call.deps, _actor(call), _params(call)["mid"])


@handler("remediation.prepare")
async def remediation_prepare(call: Call) -> Any:
    result = await assessments.request_remediation_preparation(call.deps, _actor(call), _params(call)["mid"])
    return _json(result, 202)


@handler("remediation.complete")
async def remediation_complete(call: Call) -> Any:
    return await assessments.complete_remediation(call.deps, _actor(call), _params(call)["mid"])


# --- quiz attempts -------------------------------------------------------------------------------


@handler("quiz.attempts.create")
async def quiz_attempts_create(call: Call) -> Any:
    result = await assessments.start_validation_attempt(call.deps, _actor(call), _params(call)["mid"])
    if result.get("preparing") is True:
        return _json(result, 202)
    if result.get("resumed") is True:
        return _json(result, 200)
    return _json(result, 201)


@handler("quiz.attempts.get")
async def quiz_attempts_get(call: Call) -> Any:
    return await assessments.get_attempt(call.deps, _actor(call), _params(call)["aid"])


@handler("quiz.attempts.result")
async def quiz_attempts_result(call: Call) -> Any:
    return await assessments.get_quiz_result(call.deps, _actor(call), _params(call)["aid"])


@handler("quiz.attempts.submit")
async def quiz_attempts_submit(call: Call) -> Any:
    """The diagnostic is graded at submission, then its acquired modules are validated (SPEC-4001)."""
    result = await assessments.submit_attempt(call.deps, _actor(call), _params(call)["aid"])
    diagnostic = result.pop("_diagnostic", None)
    if isinstance(diagnostic, dict):
        await simple.apply_acquired_modules(
            call.deps,
            _actor(call),
            str(diagnostic["formationId"]),
            [str(value) for value in diagnostic.get("acquiredModuleIds") or []],
        )
    return result


@handler("quiz.answers.save")
async def quiz_answers_save(call: Call) -> Any:
    params = _params(call)
    return await assessments.save_draft(
        call.deps, _actor(call), params["aid"], int(params["pos"]), _body(call)
    )


@handler("quiz.answers.check")
async def quiz_answers_check(call: Call) -> Any:
    params = _params(call)
    return await assessments.check_answer(
        call.deps, _actor(call), params["aid"], int(params["pos"]), _body(call)
    )


# --- mock exams ----------------------------------------------------------------------------------


@handler("exam.answers.save")
async def exam_answers_save(call: Call) -> Any:
    params = _params(call)
    return await assessments.save_exam_answer(
        call.deps, _actor(call), params["aid"], int(params["pos"]), _body(call)
    )


@handler("exam.attempts.create")
async def exam_attempts_create(call: Call) -> Any:
    result = await assessments.start_exam_attempt(call.deps, _actor(call), _params(call)["fid"])
    if result.get("resumed") is True:
        return _json(result, 200)
    return _json(result, 201)


@handler("exam.attempts.get")
async def exam_attempts_get(call: Call) -> Any:
    return await assessments.get_exam_attempt(call.deps, _actor(call), _params(call)["aid"])


@handler("exam.attempts.submit")
async def exam_attempts_submit(call: Call) -> Any:
    result = await assessments.submit_exam(call.deps, _actor(call), _params(call)["aid"])
    return {
        "status": result["status"],
        "unansweredCount": result["unansweredCount"],
        "markedCount": result["markedCount"],
    }


@handler("exam.attempts.result")
async def exam_attempts_result(call: Call) -> Any:
    return await assessments.get_exam_result(call.deps, _actor(call), _params(call)["aid"])


@handler("exam.intro")
async def exam_intro(call: Call) -> Any:
    return await assessments.get_exam_intro(call.deps, _actor(call), _params(call)["fid"])


@handler("exam.format.confirm")
async def exam_format_confirm(call: Call) -> Any:
    return await assessments.confirm_exam_format(call.deps, _actor(call), _params(call)["fid"])


@handler("exam.questions.mark")
async def exam_questions_mark(call: Call) -> Any:
    params = _params(call)
    return await assessments.mark_exam_question(
        call.deps, _actor(call), params["aid"], int(params["pos"]), _body(call)["marked"] is True
    )
