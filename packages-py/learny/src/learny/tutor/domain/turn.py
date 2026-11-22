"""Deterministic turn helpers of the tutor chat (SPEC-610 ET-2, ET-3).

Ports the private helpers of `packages/services/src/tutor-chat/stream.ts` (`summaryOf`,
`textChunks`, `scenarioFor`) and of `self-test.ts` (`looksInjection`, `asksForTest`,
`mockGradeScenario`). The JavaScript regular expressions are compiled with `re.ASCII`, because
`\\b` and `\\w` are ASCII-based in JavaScript: without the flag Python would not split around an
accented letter.
"""

import re
from collections.abc import Mapping, Sequence

HISTORY_WINDOW = 20
SUMMARY_ENTRIES = 10
SUMMARY_CHARS = 160
CHUNK_SIZE = 60

_INJECTION = re.compile(
    r"ignore (tes|vos) instructions|r[\u00e9e]v[\u00e8e]le ta consigne|system prompt",
    re.IGNORECASE | re.ASCII,
)
_ASKS_TEST = re.compile(
    r"\b(teste|interroge|pose-moi une question|v[\u00e9e]rifie ma)\b", re.IGNORECASE | re.ASCII
)
_GRADE_OK = re.compile(r"\b31\b", re.ASCII)
_GRADE_CREDIT = re.compile(r"cr[\u00e9e]dit", re.IGNORECASE | re.ASCII)

_SCENARIOS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"date", re.IGNORECASE | re.ASCII), "chat-dates"),
    (re.compile(r"[\u00e9e]quilibr|total|partie double", re.IGNORECASE | re.ASCII), "chat-equilibre"),
    (
        re.compile(r"type de pi[\u00e8e]ce|diff[\u00e9e]rence|confond", re.IGNORECASE | re.ASCII),
        "chat-difference",
    ),
    (re.compile(r"ce passage|s[\u00e9e]lection", re.IGNORECASE | re.ASCII), "chat-selection"),
    (re.compile(r"exemple|concret|chiffr", re.IGNORECASE | re.ASCII), "chat-exemple"),
    (
        re.compile(r"autrement|simple|comprends? pas|r[\u00e9e]explique", re.IGNORECASE | re.ASCII),
        "chat-autrement",
    ),
)


def looks_injection(text: str) -> bool:
    return _INJECTION.search(text) is not None


def asks_for_test(text: str) -> bool:
    return _ASKS_TEST.search(text) is not None


def mock_grade_scenario(answer: str) -> str:
    """`mockGradeScenario`: the demo answer that mentions the 31 and the credit is graded correct."""
    if _GRADE_OK.search(answer) is not None and _GRADE_CREDIT.search(answer) is not None:
        return "self-test-grade-ok"
    return "self-test-grade-ko"


def scenario_for(text: str, follow_up: str | None, gap_first: bool) -> str:
    """`scenarioFor`: the mock scenario of a chat turn, in the TypeScript order."""
    if looks_injection(text):
        return "chat-injection"
    if gap_first:
        return "chat-gap-first-question"
    if follow_up == "rephrase":
        return "chat-autrement"
    if follow_up == "example":
        return "chat-exemple"
    if follow_up == "compare":
        return "chat-difference"
    for pattern, scenario in _SCENARIOS:
        if pattern.search(text) is not None:
            return scenario
    return "chat-generic"


def summary_of(history: Sequence[Mapping[str, str]]) -> str:
    """`summaryOf`: the ten messages older than the last twenty, truncated to 160 characters."""
    older = history[: max(0, len(history) - HISTORY_WINDOW)]
    if not older:
        return ""
    return " ".join(
        f"{'Apprenant' if entry['role'] == 'learner' else 'Tuteur'} : {entry['content'][:SUMMARY_CHARS]}"
        for entry in older[-SUMMARY_ENTRIES:]
    )


def text_chunks(text: str) -> list[str]:
    """`textChunks`: 60-character deltas, and one empty delta for an empty text."""
    chunks = [text[index : index + CHUNK_SIZE] for index in range(0, len(text), CHUNK_SIZE)]
    return chunks if chunks else [""]
