"""HTTP handlers of the content context (SPEC-2203).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.content`.
"""

from typing import Any, cast

from learny.content import public as content
from learny.shared.errors import AppError

from learny_api.guards.idempotency import read_idempotency_key
from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _body(call: Call) -> dict[str, Any]:
    """The validated body as a plain mapping, the union member included."""
    model = cast(Any, call.body)
    if hasattr(model, "root"):
        model = model.root
    return cast(dict[str, Any], model.model_dump(exclude_unset=True))


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


def _query(call: Call) -> dict[str, Any]:
    """The validated query string as a plain mapping, defaults included."""
    return cast(dict[str, Any], cast(Any, call.query).model_dump())


def _request_key(call: Call) -> str:
    """The mandatory `Idempotency-Key` header of the upload route (`readIdempotencyKey`, EF-1)."""
    return read_idempotency_key(call.request.headers.get("idempotency-key"))


# --- contributions -------------------------------------------------------------------------------


@handler("uploads.create")
async def uploads_create(call: Call) -> Any:
    return await content.create_upload(
        call.deps, _actor(call), _params(call)["cid"], _body(call), _request_key(call)
    )


@handler("resources.create")
async def resources_create(call: Call) -> Any:
    return await content.create_resource(call.deps, _actor(call), _params(call)["cid"], _body(call))


@handler("resources.finalize")
async def resources_finalize(call: Call) -> Any:
    return await content.finalize_upload(call.deps, _actor(call), _params(call)["rid"])


@handler("resources.readUrl")
async def resources_read_url(call: Call) -> Any:
    return await content.get_signed_read_url(call.deps, _actor(call), _params(call)["rid"])


@handler("resources.rename")
async def resources_rename(call: Call) -> Any:
    return await content.rename_resource(call.deps, _actor(call), _params(call)["rid"], _body(call))


@handler("resources.retry")
async def resources_retry(call: Call) -> Any:
    return await content.retry_resource(call.deps, _actor(call), _params(call)["rid"])


@handler("resources.delete")
async def resources_delete(call: Call) -> Any:
    await content.delete_resource(call.deps, _actor(call), _params(call)["rid"])
    return None


@handler("suggestions.import")
async def suggestions_import(call: Call) -> Any:
    return await content.import_suggestion(call.deps, _actor(call), _params(call)["rid"])


@handler("suggestions.dismiss")
async def suggestions_dismiss(call: Call) -> Any:
    return await content.dismiss_suggestion(call.deps, _actor(call), _params(call)["rid"])


# --- module screen and course generation ---------------------------------------------------------


@handler("modules.screen")
async def modules_screen(call: Call) -> Any:
    query = _query(call)
    return await content.get_module_screen(
        call.deps, _actor(call), _params(call)["mid"], query.get("chapitre")
    )


@handler("modules.generateCourse")
async def modules_generate_course(call: Call) -> Any:
    return await content.generate_course_now(call.deps, _actor(call), _params(call)["mid"])


@handler("chapters.complete")
async def chapters_complete(call: Call) -> Any:
    return await content.complete_chapter(call.deps, _actor(call), _params(call)["cid"], _body(call))


# --- course reading ------------------------------------------------------------------------------


@handler("modules.course")
async def modules_course(call: Call) -> Any:
    query = _query(call)
    return await content.get_module_course(
        call.deps, _actor(call), _params(call)["mid"], query.get("chapitre")
    )


@handler("courses.progress")
async def courses_progress(call: Call) -> Any:
    return await content.record_course_progress(call.deps, _actor(call), _params(call)["cid"], _body(call))


@handler("course-citations.source")
async def course_citations_source(call: Call) -> Any:
    return await content.get_citation_source(call.deps, _actor(call), _params(call)["cid"])


@handler("course-sections.edit")
async def course_sections_edit(call: Call) -> Any:
    return await content.edit_course_section(
        call.deps, _actor(call), _params(call)["sid"], _body(call), _request_key(call)
    )


@handler("course-sections.report")
async def course_sections_report(call: Call) -> Any:
    return await content.report_course_section(
        call.deps, _actor(call), _params(call)["sid"], _body(call), _request_key(call)
    )


_ = AppError


@handler("chapters.summary")
async def chapters_summary(call: Call) -> Any:
    return await content.submit_chapter_summary(
        call.deps, _actor(call), _params(call)["cid"], _body(call), _request_key(call)
    )
