"""Deterministic selection and formatting of the model context (SPEC-511 EF-2 to EF-4; ADR-0300).

Candidates are ordered by decreasing cosine score, then by source, position and chunk identifier;
duplicates and strongly overlapping passages are removed in that order, so the result does not
depend on the input order. Each kept passage is formatted as a `<document>` tag and its complete
cost is reserved before it is added: the budget is never exceeded and a passage never fits
partially.
"""

import re
import unicodedata
from typing import Any, Final

from learny.content.domain.chunk import estimate_tokens
from learny.shared.errors import AppError
from learny.shared.jsmath import js_number
from learny.shared.locale_fr import content as texts

RETRIEVAL_TOKEN_BUDGETS: Final[dict[str, int]] = {
    "programme": 6000,
    "course": 24000,
    "gaps": 8000,
    "tutor": 4000,
}
RETRIEVAL_TASKS: Final = tuple(RETRIEVAL_TOKEN_BUDGETS)
RETRIEVAL_DEFAULT_LIMIT: Final = 10
RETRIEVAL_MAX_LIMIT: Final = 50
RETRIEVAL_MAX_TOKEN_BUDGET: Final = 200_000
RETRIEVAL_OVERLAP_THRESHOLD: Final = 0.8

SHINGLE_SIZE = 5
WHITESPACE = re.compile(r"\s+")
ATTRIBUTE_BREAK = re.compile(r"[\t\n\r\f\v]+")


def normalize_document_text(text: str) -> str:
    """NFKC, lower case and collapsed whitespace: equivalent passages normalise the same way."""
    return WHITESPACE.sub(" ", unicodedata.normalize("NFKC", text).lower()).strip()


def _shingles(text: str) -> set[str]:
    if len(text) <= SHINGLE_SIZE:
        return {text}
    return {text[index : index + SHINGLE_SIZE] for index in range(len(text) - SHINGLE_SIZE + 1)}


def text_overlap_ratio(left: str, right: str) -> float:
    """EF-2: share of the smaller passage found in the larger one, on normalised 5-grams."""
    left_text = normalize_document_text(left)
    right_text = normalize_document_text(right)
    if left_text == "" or right_text == "":
        return 0.0
    if left_text == right_text:
        return 1.0
    left_shingles = _shingles(left_text)
    right_shingles = _shingles(right_text)
    if len(left_shingles) <= len(right_shingles):
        small, large = left_shingles, right_shingles
    else:
        small, large = right_shingles, left_shingles
    if not small:
        return 0.0
    common = sum(1 for shingle in small if shingle in large)
    return common / len(small)


def compare_retrieval_chunks(left: dict[str, Any], right: dict[str, Any]) -> int:
    """EF-2 total order: score descending, then source, position and chunk identifier ascending."""
    if left["score"] != right["score"]:
        return -1 if left["score"] > right["score"] else 1
    if left["source"] != right["source"]:
        return -1 if left["source"] < right["source"] else 1
    if left["position"] != right["position"]:
        return -1 if left["position"] < right["position"] else 1
    if left["chunkId"] != right["chunkId"]:
        return -1 if left["chunkId"] < right["chunkId"] else 1
    return 0


def deduplicate_chunks(
    chunks: list[dict[str, Any]],
    threshold: float = RETRIEVAL_OVERLAP_THRESHOLD,
) -> tuple[list[dict[str, Any]], int]:
    """EF-2, CL-4: drops a passage an already kept passage duplicates or overlaps by >= `threshold`."""
    ordered = sorted(chunks, key=_ChunkKey)
    kept: list[dict[str, Any]] = []
    duplicates = 0
    for candidate in ordered:
        duplicate = any(
            text_overlap_ratio(existing["text"], candidate["text"]) >= threshold for existing in kept
        )
        if duplicate:
            duplicates += 1
        else:
            kept.append(candidate)
    return kept, duplicates


class _ChunkKey:
    """Sort key of `compareRetrievalChunks`, for `list.sort` (stable, like `Array.sort`)."""

    __slots__ = ("_chunk",)

    def __init__(self, chunk: dict[str, Any]) -> None:
        self._chunk = chunk

    def __lt__(self, other: "_ChunkKey") -> bool:
        return compare_retrieval_chunks(self._chunk, other._chunk) < 0


def escape_document_text(text: str) -> str:
    """Escapes the character data of a data tag (`&` first, then the two angle brackets)."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def escape_document_attribute(value: str) -> str:
    """Escapes an attribute value: line breaks collapse, quotes are entity-encoded."""
    escaped = escape_document_text(value).replace('"', "&quot;").replace("'", "&#39;")
    return ATTRIBUTE_BREAK.sub(" ", escaped)


def _seconds(value: float | int) -> str:
    return js_number(value)


def format_chunk_location(location: dict[str, Any]) -> str:
    """Stable human-readable location shown in the tag and in the demonstration."""
    parts: list[str] = []
    page = location.get("page")
    start = location.get("startSec")
    end = location.get("endSec")
    anchor = location.get("anchor")
    if page is not None:
        parts.append(f"p. {_seconds(page)}")
    if start is not None and end is not None:
        parts.append(f"{_seconds(start)}\u2013{_seconds(end)} s")
    elif start is not None:
        parts.append(f"\u00e0 partir de {_seconds(start)} s")
    elif end is not None:
        parts.append(f"jusqu\u2019\u00e0 {_seconds(end)} s")
    if anchor is not None:
        parts.append(f"ancre {anchor}")
    parts.append(f"car. {_seconds(location['charStart'])}\u2013{_seconds(location['charEnd'])}")
    return " \u00b7 ".join(parts)


def format_document_chunk(chunk: dict[str, Any]) -> str:
    """ET-3: `<document source chunk location>text</document>`, everything escaped."""
    for field in ("chunkId", "source", "text", "location"):
        if field not in chunk:
            raise _invalid_chunk()
    if not isinstance(chunk["location"], dict):
        raise _invalid_chunk()
    source = escape_document_attribute(str(chunk["source"]))
    chunk_id = escape_document_attribute(str(chunk["chunkId"]))
    location = escape_document_attribute(format_chunk_location(chunk["location"]))
    return (
        f'<document source="{source}" chunk="{chunk_id}" location="{location}">'
        f"{escape_document_text(str(chunk['text']))}</document>"
    )


def _invalid_chunk() -> AppError:
    return AppError("VALIDATION_FAILED", texts.DOCUMENT_CHUNK_INVALID, errors=[])


def _invalid_selection(errors: list[dict[str, str]]) -> AppError:
    return AppError("VALIDATION_FAILED", texts.CONTEXT_SELECTION_INVALID, errors=errors)


def _validate_selection(
    chunks: list[dict[str, Any]], task: str, token_budget: int | None
) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []
    if task not in RETRIEVAL_TASKS:
        errors.append({"path": "task", "message": "Tache inconnue."})
    if token_budget is not None and not 1 <= token_budget <= RETRIEVAL_MAX_TOKEN_BUDGET:
        errors.append({"path": "tokenBudget", "message": "Budget hors bornes."})
    for index, chunk in enumerate(chunks):
        for field in ("chunkId", "resourceId", "source", "position", "score", "text", "location"):
            if field not in chunk:
                errors.append({"path": f"chunks.{index}.{field}", "message": "Champ manquant."})
    return errors


def select_context(
    chunks: list[dict[str, Any]],
    task: str,
    token_budget: int | None = None,
) -> dict[str, Any]:
    """ET-2: sorts, deduplicates and cuts the candidates to `token_budget`, tags included."""
    errors = _validate_selection(chunks, task, token_budget)
    if errors:
        raise _invalid_selection(errors)
    budget = RETRIEVAL_TOKEN_BUDGETS[task] if token_budget is None else token_budget
    kept, duplicates = deduplicate_chunks(list(chunks))

    selected: list[dict[str, Any]] = []
    documents: list[str] = []
    estimated_tokens = 0
    omitted = 0
    for chunk in kept:
        document = format_document_chunk(chunk)
        cost = estimate_tokens(document) + (0 if not selected else 1)
        if estimated_tokens + cost > budget:
            omitted += 1
            continue
        selected.append(chunk)
        documents.append(document)
        estimated_tokens += cost

    if selected:
        reason = None
    elif not chunks:
        reason = "no_matches"
    else:
        reason = "budget_exhausted"
    return {
        "task": task,
        "tokenBudget": budget,
        "estimatedTokens": estimated_tokens,
        "reason": reason,
        "chunks": selected,
        "documents": documents,
        "text": "\n".join(documents),
        "duplicates": duplicates,
        "omitted": omitted,
    }
