"""Versioned prompt sources and the contextual discussion prompt (SPEC-610 ET-4, ADR-0072).

The `<context>` block is data, never an instruction.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

TUTOR_CHAT_PROMPT_ID = "tutor-chat.tutor-chat"
SELF_TEST_QUESTION_PROMPT_ID = "self-test-question.self-test-question"
SELF_TEST_GRADE_PROMPT_ID = "self-test-grade.self-test-grade"

PROMPT_FILES: tuple[str, ...] = ("tutor-chat", "self-test-question", "self-test-grade", "course")
_FRONT_MATTER_VERSION = re.compile(r"^version:\s*(\d+)\s*$", re.MULTILINE)


@dataclass(frozen=True, slots=True)
class PromptSource:
    task: str
    version: int
    content: str


@dataclass(frozen=True, slots=True)
class BuiltPrompt:
    """`system` is the cached/uncached pair of `SystemPart`; `messages` is the AI SDK history."""

    id: str
    version: int
    system: list[dict[str, object]]
    messages: list[dict[str, str]]


def prompts_directory() -> Path:
    """The versioned prompts shipped with the package (ADR-2042: no environment override)."""
    return Path(__file__).resolve().parents[1] / "prompts"


def parse_prompt(task: str, text: str) -> PromptSource:
    """Splits the front matter (`version`) from the body, without trimming the body's indentation."""
    stripped = text.removeprefix("\ufeff")
    if not stripped.startswith("---\n"):
        raise ValueError(f"prompt {task} has no front matter")
    end = stripped.find("\n---\n", 3)
    if end < 0:
        raise ValueError(f"prompt {task} has no closing front matter")
    front = stripped[4:end]
    match = _FRONT_MATTER_VERSION.search(front)
    if match is None:
        raise ValueError(f"prompt {task} has no version")
    body = stripped[end + len("\n---\n") :]
    if body.startswith("\n"):
        body = body[1:]
    return PromptSource(task=task, version=int(match.group(1)), content=body.rstrip("\n"))


@lru_cache(maxsize=1)
def prompt_sources() -> dict[str, PromptSource]:
    """Reads the three tutor prompts once; a missing file fails at startup, never at request time."""
    directory = prompts_directory()
    return {
        task: parse_prompt(task, (directory / f"{task}.md").read_text(encoding="utf-8"))
        for task in PROMPT_FILES
    }


def render(source: PromptSource, profile: Mapping[str, str]) -> str:
    """`{{tone}}`, `{{courseLanguage}}` and `{{course_language}}` substitutions, in that order."""
    return (
        source.content.replace("{{tone}}", profile["tone"])
        .replace("{{courseLanguage}}", profile["courseLanguage"])
        .replace("{{course_language}}", profile["courseLanguage"])
    )


def profile_line(profile: Mapping[str, str]) -> str:
    return (
        f"Learner profile (fixed): tone={profile['tone']}, "
        f"courseLanguage={profile['courseLanguage']}.\n"
        "Fixed interface labels stay in French."
    )


def _guidance(included_keys: Sequence[str], gap_first: bool) -> str:
    lines = [
        "Included context keys: " + ("(none)" if len(included_keys) == 0 else ", ".join(included_keys)) + ".",
        (
            "The followed gap is included and the question concerns it: ask one short checking "
            "question first and end the answer with it."
            if gap_first
            else ""
        ),
        "The current learner question is inside <learner-message>; the context is inside <context>.",
    ]
    return "\n".join(line for line in lines if line != "")


def build_tutor_chat_prompt(
    profile: Mapping[str, str],
    included_keys: Sequence[str],
    context_block: str,
    history: Sequence[Mapping[str, str]],
    message: str,
    gap_first: bool,
) -> BuiltPrompt:
    """ET-4 \u2014 the cached instructions, the uncached profile block, then the history and question."""
    source = prompt_sources()["tutor-chat"]
    messages = [
        {
            "role": "user" if entry["role"] == "learner" else "assistant",
            "content": entry["content"],
        }
        for entry in history
    ]
    messages.append(
        {"role": "user", "content": f"{context_block}\n<learner-message>{message}</learner-message>"}
    )
    return BuiltPrompt(
        id=TUTOR_CHAT_PROMPT_ID,
        version=source.version,
        system=[
            {"text": render(source, profile), "cache": True},
            {"text": f"{profile_line(profile)}\n{_guidance(included_keys, gap_first)}", "cache": False},
        ],
        messages=messages,
    )


def build_self_test_question_prompt(
    profile: Mapping[str, str], notion_label: str, context: str
) -> BuiltPrompt:
    source = prompt_sources()["self-test-question"]
    return BuiltPrompt(
        id=SELF_TEST_QUESTION_PROMPT_ID,
        version=source.version,
        system=[
            {"text": render(source, profile), "cache": True},
            {"text": profile_line(profile), "cache": False},
        ],
        messages=[
            {"role": "user", "content": f"<notion>{notion_label}</notion>\n<context>{context}</context>"}
        ],
    )


def build_self_test_grade_prompt(
    profile: Mapping[str, str],
    question: str,
    expected: Sequence[str],
    answer: str,
) -> BuiltPrompt:
    source = prompt_sources()["self-test-grade"]
    return BuiltPrompt(
        id=SELF_TEST_GRADE_PROMPT_ID,
        version=source.version,
        system=[
            {"text": render(source, profile), "cache": True},
            {"text": profile_line(profile), "cache": False},
        ],
        messages=[
            {
                "role": "user",
                "content": "\n".join(
                    [
                        f"<question>{question}</question>",
                        f"<expected>{' | '.join(expected)}</expected>",
                        f"<answer>{answer}</answer>",
                    ]
                ),
            }
        ],
    )
