"""The sprint planning route served natively by Python (SPEC-719, SPEC-2302).

`POST /api/v1/formations/:fid/sprints` is a standard `handler()` route whose contract
(`sprintPlanRoute`, SPEC-719) was never added to the `ROUTES` registry: `api/openapi.yaml` does not
carry it, so `learny_api.generated.routes` cannot describe it (see
`packages/api-routes/src/special/sprints.ts` and `evidence/SPEC-1004/acceptance.md`). The route is
therefore declared here with a local `RouteSpec` and local strict models, then handed to
`pipeline.handle`: authentication, rate limit, idempotency, validation and output validation stay
the shared twelve steps of ADR-2012, with the same codes and the same headers as the TypeScript.
"""

from dataclasses import replace
from typing import Annotated, Any, Final, Literal, cast

from fastapi import FastAPI, Request
from learny.engagement import public as engagement
from learny.shared.ids import UUID_PATTERN
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError
from starlette.responses import Response

from learny_api.generated.routes import RouteSpec
from learny_api.pipeline import Call, PipelineContext, handle

SPRINTS_ROUTE_ID: Final = "formations.sprints.plan"
SPRINTS_PATH: Final = "/api/v1/formations/{fid}/sprints"

Uuid = Annotated[str, StringConstraints(pattern=UUID_PATTERN)]
CivilDay = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Instant = Annotated[
    str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")
]
ShortText = Annotated[str, StringConstraints(min_length=1, max_length=200)]


class SprintsParams(BaseModel):
    """`z.object({ fid: Uuid })` of the route params, in the lax mode of a path input."""

    fid: Uuid


class SprintsBody(BaseModel):
    """`SprintPlanInput`: a strict object, the milestone narrowing the run is optional, not null."""

    model_config = ConfigDict(extra="forbid")

    examSlotId: Uuid | None = None

    @field_validator("examSlotId", mode="before")
    @classmethod
    def _absent_or_uuid(cls, value: Any) -> Any:
        """`Uuid.optional()` accepts a missing key, never an explicit `null` (`invalid_type`)."""
        if value is None:
            raise PydanticCustomError("string_type", "Invalid input: expected string, received null")
        return value


class SprintPlannedSlot(BaseModel):
    """`SprintPlannedSlot`: one placed sprint of the plan."""

    model_config = ConfigDict(extra="forbid")

    label: Literal["J-K", "J-1"]
    day: CivilDay
    slotId: Uuid | None
    startsAt: Instant
    endsAt: Instant
    durationMin: int = Field(ge=5, le=120)


class SprintImpossibleTarget(BaseModel):
    """`SprintImpossibleTarget`: a target day that received no sprint, with its CL-3 reason."""

    model_config = ConfigDict(extra="forbid")

    label: Literal["J-K", "J-1"]
    day: CivilDay
    reason: Literal["past", "no_study_day", "no_slot"]


class SprintPlanView(BaseModel):
    """`SprintPlanView`: one plan returned by the service and rendered by the agenda."""

    model_config = ConfigDict(extra="forbid")

    actionId: Uuid | None
    formationId: Uuid
    examSlotId: Uuid
    examKind: Literal["validation_quiz", "mock_exam"]
    examDate: CivilDay
    examTitle: ShortText
    daysBefore: int = Field(ge=1, le=31)
    durationMin: int = Field(ge=5, le=120)
    notionIds: list[Uuid]
    notionLabels: list[ShortText]
    targets: list[SprintPlannedSlot]
    impossible: list[SprintImpossibleTarget]
    summary: Annotated[str, StringConstraints(min_length=1, max_length=300)]


class SprintPlanResult(BaseModel):
    """`SprintPlanResult`: what this run created, why it skipped, and the active plans."""

    model_config = ConfigDict(extra="forbid")

    created: int = Field(ge=0)
    skipped: Literal["disabled", "paused"] | None
    plans: list[SprintPlanView]


SPRINTS_SPEC: Final = RouteSpec(
    id=SPRINTS_ROUTE_ID,
    method="POST",
    path=SPRINTS_PATH,
    auth="user",
    rate_limit="default",
    idempotent=True,
    requires_idempotency_key=False,
    fresh_auth=False,
    legal_acceptance=False,
    validation_status=400,
    success_status=200,
    params=SprintsParams,
    query=None,
    body=SprintsBody,
    output=SprintPlanResult,
)


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


def _body(call: Call) -> dict[str, Any]:
    """The validated body as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump())


async def plan_sprints(call: Call) -> dict[str, Any]:
    """The thin adapter of the route: the use case lives in `learny.engagement`."""
    exam_slot_id = _body(call).get("examSlotId")
    return await engagement.plan_sprints_before_milestones(
        call.deps,
        call.actor,
        str(_params(call)["fid"]),
        None if exam_slot_id is None else str(exam_slot_id),
    )


async def endpoint(request: Request, context: PipelineContext) -> Response:
    """The special route entry point: the whole pipeline, unchanged."""
    return await handle(SPRINTS_SPEC, request, context)


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    """Registers the sprint route; returns the installed route id."""
    # The route is not in the generated table, so `pipeline.install` cannot register its handler:
    # the context receives it here, and a test may pass its own guard bundle unchanged.
    resolved = (
        context
        if SPRINTS_ROUTE_ID in context.handlers
        else replace(context, handlers={**context.handlers, SPRINTS_ROUTE_ID: plan_sprints})
    )
    app.add_api_route(
        SPRINTS_PATH,
        _handler(resolved),
        methods=["POST"],
        include_in_schema=False,
        name=f"special:{SPRINTS_ROUTE_ID}",
    )
    return [SPRINTS_ROUTE_ID]


def _handler(context: PipelineContext) -> Any:
    async def route(request: Request) -> Response:
        return await endpoint(request, context)

    route.__name__ = "special_plan_sprints"
    return route


__all__ = [
    "SPRINTS_PATH",
    "SPRINTS_ROUTE_ID",
    "SPRINTS_SPEC",
    "SprintPlanResult",
    "install",
    "plan_sprints",
]
