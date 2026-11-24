"""Gateway adapters of the tutor use cases (SPEC-2204).

The tutor task, the prompt identifiers and the translation of a built prompt into a gateway step
live here, so `stream` and `self_test` share them without importing each other.
"""

from learny.platform.llm.tasks import AiTask
from learny.platform.llm.types import StepInput, SystemPart
from learny.tutor.domain.prompts import (
    SELF_TEST_GRADE_PROMPT_ID,
    SELF_TEST_QUESTION_PROMPT_ID,
    TUTOR_CHAT_PROMPT_ID,
    BuiltPrompt,
)

TUTOR_TASK: AiTask = "tutor"

__all__ = [
    "SELF_TEST_GRADE_PROMPT_ID",
    "SELF_TEST_QUESTION_PROMPT_ID",
    "TUTOR_CHAT_PROMPT_ID",
    "TUTOR_TASK",
    "step_input",
    "system_parts",
]


def system_parts(prompt: BuiltPrompt) -> tuple[SystemPart, ...]:
    """The cached and uncached system blocks of a built prompt, as the gateway reads them."""
    return tuple(SystemPart(text=str(part["text"]), cache=bool(part.get("cache"))) for part in prompt.system)


def step_input(prompt: BuiltPrompt) -> StepInput:
    """One gateway step request built from a prompt (same history and system blocks)."""
    return StepInput(system=system_parts(prompt), messages=tuple(prompt.messages))
