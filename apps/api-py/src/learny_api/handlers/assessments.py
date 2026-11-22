"""HTTP handlers of the assessments context (SPEC-2202).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.assessments`.
"""

from typing import Any, cast

from learny.assessments import public as assessments
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


# --- quiz attempts -------------------------------------------------------------------------------


@handler("quiz.attempts.get")
async def quiz_attempts_get(call: Call) -> Any:
    return await assessments.get_attempt(call.deps, _actor(call), _params(call)["aid"])


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
