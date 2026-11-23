"""Task catalogue of `learny.platform.llm` (SPEC-2201).

The single source of task budgets (SPEC-504 ET-1). No model is attached to a task here: the learner
chooses it (BR-IA-02), so this table only declares what each task needs.
"""

from dataclasses import dataclass
from typing import Literal

AiTask = Literal["programme", "course", "gaps", "tutor", "light"]
ThinkingEffort = Literal["low", "medium", "high"]

# `AI_TASKS` (`packages/config/src/models.ts`): the mockup order of the five AI tasks.
AI_TASKS: tuple[AiTask, ...] = ("programme", "course", "gaps", "tutor", "light")
TaskCapability = Literal["tools", "structured", "web_search", "passage_refs", "vision"]

TASK_CAPABILITIES: tuple[TaskCapability, ...] = (
    "tools",
    "structured",
    "web_search",
    "passage_refs",
    "vision",
)

# Calls above this output budget stream on the provider side to avoid HTTP timeouts (ET-1).
STREAMING_OUTPUT_THRESHOLD = 16_000


@dataclass(frozen=True, slots=True)
class TaskConfig:
    """Adaptive thinking effort, output budget, deadline and required capabilities."""

    effort: ThinkingEffort
    max_output_tokens: int
    timeout_ms: int
    capabilities: tuple[TaskCapability, ...]


# `light` uses `low` rather than `none`: thinking cannot be disabled at every level of the 5.5
# models (SPEC-504 section 15).
TASK_CONFIG: dict[AiTask, TaskConfig] = {
    "programme": TaskConfig("high", 32_000, 180_000, ("tools", "structured", "web_search")),
    "course": TaskConfig("medium", 64_000, 300_000, ("structured", "passage_refs")),
    "gaps": TaskConfig("medium", 16_000, 120_000, ("structured",)),
    "tutor": TaskConfig("low", 8_000, 60_000, ("tools", "structured")),
    "light": TaskConfig("low", 4_000, 30_000, ("structured", "vision")),
}


def needs_provider_streaming(task: AiTask) -> bool:
    """True when the task needs provider-side streaming for its output budget."""
    return TASK_CONFIG[task].max_output_tokens > STREAMING_OUTPUT_THRESHOLD
