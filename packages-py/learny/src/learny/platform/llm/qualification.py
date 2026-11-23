"""Non-blocking compatibility battery of one personal model (SPEC-2204, port of
`packages/llm/src/qualification/{compatibility,fixtures}.ts`).

Only the probes required by `TASK_CONFIG` run: a strict tool call, a structured output and an image
for the tasks that need them. A provider failure is a reserve, never a blocking error; brick
validation and runtime correction stay in the normal task flow. The fixtures are the committed ones
of the TypeScript repository plus the compatibility ones it builds in code, and no prompt, key or
payload is ever returned by the report (ET-1, ET-2).
"""

import asyncio
from collections.abc import Awaitable
from typing import Annotated, Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from learny.platform.llm.mock import RegisteredFixture, fixtures_directory, parse_fixture
from learny.platform.llm.tasks import TASK_CONFIG, TaskCapability
from learny.platform.llm.types import StepInput, StepOutput, SystemPart
from learny.shared.clock import Clock
from learny.shared.errors import AppError
from learny.shared.locale_fr import ai as texts
from learny.shared.time import to_epoch_ms, to_iso

COMPATIBILITY_TIMEOUT_MS = 12_000
COMPATIBILITY_PROMPT_ID = "qualification.compatibility"
QUALIFICATION_PROMPT_ID = "qualification.run"

AiCompatibilityReserveCode = Literal[
    "STRUCTURED_UNRELIABLE",
    "NO_VISION",
    "NO_TOOLS",
    "CHECK_TIMEOUT",
]

RESERVE_ORDER: tuple[AiCompatibilityReserveCode, ...] = (
    "STRUCTURED_UNRELIABLE",
    "NO_VISION",
    "NO_TOOLS",
    "CHECK_TIMEOUT",
)

QUALIFICATION_SCENARIOS = (
    "qualification-success",
    "qualification-invalid-brick",
    "qualification-connection-failure",
)

COMPATIBILITY_SCENARIOS = (
    "compatibility-programme-success",
    "compatibility-course-success",
    "compatibility-gaps-success",
    "compatibility-tutor-success",
    "compatibility-light-success",
    "compatibility-tutor-reserve",
)

COMPATIBILITY_TASKS = ("programme", "course", "gaps", "tutor", "light")

# A valid 16x16 RGB PNG (CRC checked), exactly the bytes of `compatibility.ts`; the former 1x1
# pixel was corrupted and rejected by live providers.
TRANSPARENT_PIXEL = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000010000000100802000000909168360000001649444154789c"
    "63b8232747126218d530aa61f86a00009a331810746bb5600000000049454e44ae426082"
)

STRUCTURED_SYSTEM = "Compatibility probe: return the exact structured value requested. No explanation."
STRUCTURED_MESSAGE = 'Return {"compatible":true,"summary":"Sortie structur\u00e9e disponible."}.'
TOOLS_SYSTEM = 'Compatibility probe: call the strict tool exactly once with value "ok".'
TOOLS_MESSAGE = 'Call compatibility_probe with {"value":"ok"}.'
VISION_SYSTEM = "Compatibility probe: inspect the provided image and return only the exact schema."
VISION_MESSAGE = "Confirm that one opaque image was supplied."


def is_qualification_scenario(value: str) -> bool:
    """`isQualificationScenario`: a scenario of the brick battery fixtures."""
    return value in QUALIFICATION_SCENARIOS


def is_compatibility_scenario(value: str) -> bool:
    """`isCompatibilityScenario`: a scenario of the per-task compatibility fixtures."""
    return value in COMPATIBILITY_SCENARIOS


class StructuredProbe(BaseModel):
    """The structured output the task must produce (`structured` capability)."""

    model_config = ConfigDict(extra="forbid")
    compatible: Literal[True]
    summary: Annotated[str, Field(min_length=1, max_length=200)]


class VisionProbe(BaseModel):
    """The image answer the model must produce (`vision` capability)."""

    model_config = ConfigDict(extra="forbid")
    visible: Literal[True]


class ToolProbeInput(BaseModel):
    """The exact tool input the strict probe requires."""

    model_config = ConfigDict(extra="forbid")
    value: Literal["ok"]


class ProbeSession(Protocol):
    """What `evaluate_task_compatibility` needs from one qualification session."""

    async def step(self, input: StepInput) -> StepOutput: ...

    async def object(self, schema: type[BaseModel], input: StepInput) -> BaseModel: ...


class ProbeCapabilities(BaseModel):
    """The five capabilities a qualification report proves (kept for the legacy readers)."""

    tools: bool
    structured: bool
    web_search: bool
    passage_refs: bool
    vision: bool


class ProbeStepResult(BaseModel):
    step: Literal["connection", "tools", "structured", "bricks"]
    status: Literal["passed", "failed"]


class ProbeBrickResult(BaseModel):
    type: Annotated[str, Field(min_length=1, max_length=64)]
    status: Literal["passed", "failed"]


class QualificationReport(BaseModel):
    """The shape `QualificationReport.safeParse` accepts; anything else is rejected."""

    model_config = ConfigDict(extra="ignore")
    id: Annotated[str, Field(min_length=1)]
    credentialId: Annotated[str, Field(min_length=1)]
    modelId: Annotated[str, Field(min_length=1, max_length=120)]
    provider: str
    status: Literal["qualified", "failed"]
    startedAt: Annotated[str, Field(min_length=1)]
    finishedAt: Annotated[str, Field(min_length=1)]
    durationMs: Annotated[int, Field(ge=0)]
    modelVersion: Annotated[str, Field(min_length=1, max_length=200)]
    steps: list[ProbeStepResult] = Field(min_length=4, max_length=4)
    bricks: list[ProbeBrickResult] = Field(min_length=13, max_length=13)
    capabilities: ProbeCapabilities


def parse_report(value: Any) -> QualificationReport | None:
    """`QualificationReport.safeParse`: the report, or `None` when it does not fit the contract."""
    if not isinstance(value, dict):
        return None
    try:
        return QualificationReport.model_validate(value)
    except ValidationError:
        return None


class CompatibilityReason(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: AiCompatibilityReserveCode
    message: Annotated[str, Field(min_length=1, max_length=300)]


class TaskCompatibility(BaseModel):
    """The shape `AiTaskCompatibility.safeParse` accepts; a `pending` placeholder is rejected."""

    model_config = ConfigDict(extra="ignore")
    credentialId: Annotated[str, Field(min_length=1)]
    modelId: Annotated[str, Field(min_length=1, max_length=120)]
    task: Literal["programme", "course", "gaps", "tutor", "light"]
    status: Literal["compatible", "reserve"]
    checkedAt: Annotated[str, Field(min_length=1)]
    durationMs: Annotated[int, Field(ge=0)]
    requiredCapabilities: list[TaskCapability] = Field(max_length=5)
    reserveCodes: list[AiCompatibilityReserveCode] = Field(max_length=4)
    reasons: list[CompatibilityReason] = Field(max_length=4)


def parse_compatibility(value: Any) -> dict[str, Any] | None:
    """`AiTaskCompatibility.safeParse`: the stored report, or `None` for a pending placeholder."""
    if not isinstance(value, dict):
        return None
    try:
        return TaskCompatibility.model_validate(value).model_dump(mode="json")
    except ValidationError:
        return None


def _fixture(path: str, value: Any) -> RegisteredFixture:
    return RegisteredFixture(path=path, fixture=parse_fixture(value, path))


def qualification_fixtures() -> tuple[RegisteredFixture, ...]:
    """The three committed qualification fixtures, sorted by path (ADR-0153 section 2c)."""
    directory = fixtures_directory() / "qualification"
    entries: list[RegisteredFixture] = []
    for path in sorted(directory.glob("*.json")):
        relative = f"qualification/{path.name}"
        entries.append(_fixture(relative, _read_json(path)))
    return tuple(entries)


def _read_json(path: Any) -> Any:
    import json

    return json.loads(path.read_text("utf-8"))


def _compatibility_steps(task: str) -> list[dict[str, Any]]:
    usage = {"inputTokens": 20, "outputTokens": 8, "cacheReadTokens": 0, "cacheWriteTokens": 0}
    structured = {
        "type": "object",
        "object": {"compatible": True, "summary": "Sortie structur\u00e9e disponible."},
        "usage": usage,
        "latencyMs": 20,
    }
    tools = {
        "type": "tool-calls",
        "toolCalls": [
            {
                "toolCallId": f"compatibility-{task}-tool",
                "toolName": "compatibility_probe",
                "input": {"value": "ok"},
            }
        ],
        "usage": usage,
        "latencyMs": 20,
    }
    vision = {
        "type": "object",
        "object": {"visible": True},
        "usage": usage,
        "latencyMs": 20,
    }
    if task in ("programme", "tutor"):
        return [structured, tools]
    if task == "light":
        return [structured, vision]
    return [structured]


def compatibility_fixtures() -> tuple[RegisteredFixture, ...]:
    """The six compatibility fixtures `fixtures.ts` builds in code, one per task plus a reserve."""
    entries: list[RegisteredFixture] = []
    for task in COMPATIBILITY_TASKS:
        path = f"qualification/compatibility-{task}-success.json"
        entries.append(
            _fixture(
                path,
                {
                    "task": task,
                    "scenario": f"compatibility-{task}-success",
                    "promptId": COMPATIBILITY_PROMPT_ID,
                    "promptVersion": 1,
                    "description": f"Compatibility {task}: required probes succeed.",
                    "steps": _compatibility_steps(task),
                },
            )
        )
    entries.append(
        _fixture(
            "qualification/compatibility-tutor-reserve.json",
            {
                "task": "tutor",
                "scenario": "compatibility-tutor-reserve",
                "promptId": COMPATIBILITY_PROMPT_ID,
                "promptVersion": 1,
                "description": "Structured output unreliable, strict tool available.",
                "steps": [
                    {
                        "type": "object",
                        "object": {"compatible": "yes"},
                        "usage": {
                            "inputTokens": 20,
                            "outputTokens": 8,
                            "cacheReadTokens": 0,
                            "cacheWriteTokens": 0,
                        },
                        "latencyMs": 20,
                    },
                    {
                        "type": "tool-calls",
                        "toolCalls": [
                            {
                                "toolCallId": "compatibility-tutor-reserve-tool",
                                "toolName": "compatibility_probe",
                                "input": {"value": "ok"},
                            }
                        ],
                        "usage": {
                            "inputTokens": 20,
                            "outputTokens": 8,
                            "cacheReadTokens": 0,
                            "cacheWriteTokens": 0,
                        },
                        "latencyMs": 20,
                    },
                ],
            },
        )
    )
    return tuple(entries)


def qualification_registry() -> tuple[RegisteredFixture, ...]:
    """Every probe fixture, sorted by path: what a qualification session resolves against."""
    return tuple(
        sorted(
            (*qualification_fixtures(), *compatibility_fixtures()),
            key=lambda entry: entry.path,
        )
    )


def _input(system: str, content: str) -> StepInput:
    return StepInput(
        system=(SystemPart(text=system, cache=False),),
        messages=({"role": "user", "content": content},),
    )


def _reserve_for(error: AppError, code: AiCompatibilityReserveCode, reserves: set[str]) -> None:
    reserves.add("CHECK_TIMEOUT" if error.code == "AI_TIMEOUT" else code)


async def _structured_probe(session: ProbeSession, reserves: set[str]) -> None:
    try:
        await session.object(StructuredProbe, _input(STRUCTURED_SYSTEM, STRUCTURED_MESSAGE))
    except AppError as error:
        _reserve_for(error, "STRUCTURED_UNRELIABLE", reserves)


async def _tools_probe(session: ProbeSession, reserves: set[str]) -> None:
    input = StepInput(
        system=(SystemPart(text=TOOLS_SYSTEM, cache=False),),
        messages=({"role": "user", "content": TOOLS_MESSAGE},),
        tools={
            "compatibility_probe": _tool_declaration(),
        },
    )
    try:
        output = await session.step(input)
    except AppError as error:
        _reserve_for(error, "NO_TOOLS", reserves)
        return
    call = next(
        (candidate for candidate in output.tool_calls if candidate.tool_name == "compatibility_probe"),
        None,
    )
    if call is None:
        reserves.add("NO_TOOLS")
        return
    try:
        ToolProbeInput.model_validate(call.input)
    except ValidationError:
        reserves.add("NO_TOOLS")


def _tool_declaration() -> Any:
    from learny.platform.llm.types import ToolDeclaration

    return ToolDeclaration(
        description="Strict compatibility probe. It must be called exactly once.",
        input_schema=ToolProbeInput.model_json_schema(),
    )


async def _vision_probe(session: ProbeSession, reserves: set[str]) -> None:
    input = StepInput(
        system=(SystemPart(text=VISION_SYSTEM, cache=False),),
        messages=(
            {
                "role": "user",
                "content": (
                    {"type": "text", "text": VISION_MESSAGE},
                    {
                        "type": "image",
                        "image": TRANSPARENT_PIXEL,
                        "mediaType": "image/png",
                    },
                ),
            },
        ),
    )
    try:
        await session.object(VisionProbe, input)
    except AppError as error:
        _reserve_for(error, "NO_VISION", reserves)


async def evaluate_task_compatibility(
    *,
    credential_id: str,
    model_id: str,
    task: str,
    clock: Clock,
    session: ProbeSession,
    timeout_ms: int = COMPATIBILITY_TIMEOUT_MS,
) -> dict[str, Any]:
    """`evaluateTaskCompatibility`: the report of one model for one task, never blocking."""
    started_at = clock.now()
    required: tuple[TaskCapability, ...] = TASK_CONFIG[_as_task(task)].capabilities
    reserves: set[str] = set()
    probes: list[Awaitable[None]] = []
    if "structured" in required:
        probes.append(_structured_probe(session, reserves))
    if "tools" in required:
        probes.append(_tools_probe(session, reserves))
    if "vision" in required:
        probes.append(_vision_probe(session, reserves))
    if probes:
        try:
            await asyncio.wait_for(asyncio.gather(*probes), timeout=timeout_ms / 1000)
        except TimeoutError:
            reserves.add("CHECK_TIMEOUT")
    reserve_codes = [code for code in RESERVE_ORDER if code in reserves]
    finished_at = clock.now()
    return {
        "credentialId": credential_id,
        "modelId": model_id,
        "task": task,
        "status": "compatible" if not reserve_codes else "reserve",
        "checkedAt": to_iso(finished_at),
        "durationMs": max(0, to_epoch_ms(finished_at) - to_epoch_ms(started_at)),
        "requiredCapabilities": list(required),
        "reserveCodes": reserve_codes,
        "reasons": [{"code": code, "message": texts.reserve_message(code)} for code in reserve_codes],
    }


def _as_task(task: str) -> Any:
    if task not in TASK_CONFIG:
        raise KeyError(f"unknown AI task: {task}")
    return task


__all__ = [
    "COMPATIBILITY_PROMPT_ID",
    "COMPATIBILITY_SCENARIOS",
    "COMPATIBILITY_TASKS",
    "COMPATIBILITY_TIMEOUT_MS",
    "QUALIFICATION_PROMPT_ID",
    "QUALIFICATION_SCENARIOS",
    "RESERVE_ORDER",
    "QualificationReport",
    "compatibility_fixtures",
    "evaluate_task_compatibility",
    "is_compatibility_scenario",
    "is_qualification_scenario",
    "parse_compatibility",
    "parse_report",
    "qualification_fixtures",
    "qualification_registry",
]
