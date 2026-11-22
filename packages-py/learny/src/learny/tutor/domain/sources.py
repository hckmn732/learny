"""Citation identifiers of a tutor answer (SPEC-610 ET-5, CA-3).

Port of `packages/services/src/tutor-chat/sources.ts`: the model cites by `chunkId` only, the code
keeps the identifiers actually sent in the context, turns them into readable labels from the
resource location and drops an invented citation with a warning. A marker block is hidden while
streaming, so the visible answer is exactly what the learner must read.
"""

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from learny.shared.locale_fr import tutor as texts

DURATION_SUFFIX = re.compile(r",\s*\d{1,2}:\d{2}\s*$")
TYPE_SUFFIX = re.compile(
    r"\s*\((?:PDF|DOCX?|TXT|MD|MARKDOWN|AUDIO|VID\u00c9O|VIDEO|WEB|HTML)\)\s*$", re.IGNORECASE
)
MARKER_START = "[[sources:"
MARKER_END = "]]"


@dataclass(frozen=True, slots=True)
class SourceCandidate:
    """One `<document>` really sent to the model: the only identifiers it may cite."""

    chunk_id: str
    resource_id: str
    title: str
    kind: str
    location: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class SourceContext:
    candidates: Sequence[SourceCandidate]
    chapter_position: int
    primary_resource_title: str | None


@dataclass(frozen=True, slots=True)
class SourceResolution:
    sources: list[dict[str, str]]
    cited_chunk_ids: list[str]
    invented: list[str]


def _base_title(title: str) -> str:
    return DURATION_SUFFIX.sub("", TYPE_SUFFIX.sub("", title)).strip()


def _mmss(seconds: float) -> str:
    safe = max(0, int(seconds // 1))
    return f"{safe // 60}:{safe % 60:02d}"


def _number_at(location: Mapping[str, Any], key: str) -> float | None:
    value = location.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def source_label(chunk: SourceCandidate) -> str:
    """ET-5 \u2014 stable, human-readable label of one resource passage."""
    title = _base_title(chunk.title)
    page = _number_at(chunk.location, "page")
    start_sec = _number_at(chunk.location, "startSec")
    if chunk.kind == "pdf" and page is not None:
        return texts.SOURCE_PDF_PAGE.format(title=title, page=int(page))
    if (
        chunk.kind == "audio" or re.match(r"note vocale", title, re.IGNORECASE) is not None
    ) and start_sec is not None:
        lowered = title[:1].lower() + title[1:]
        lowered = re.sub(r"^note vocale", "note vocale", lowered, flags=re.IGNORECASE)
        return texts.SOURCE_AUDIO.format(title=lowered, time=_mmss(start_sec))
    if chunk.kind in ("video", "youtube") and start_sec is not None:
        return f"{title}, {_mmss(start_sec)}"
    return title


def tutor_source(primary_resource_title: str | None) -> dict[str, str]:
    """ET-5 \u2014 tutor knowledge is never presented as a sourced passage."""
    if primary_resource_title is None:
        return {"label": texts.TUTOR_SOURCE_UNKNOWN}
    return {"label": texts.TUTOR_SOURCE_KNOWN.format(title=_base_title(primary_resource_title))}


def _partial_prefix(value: str) -> str:
    for length in range(min(len(value), len(MARKER_START) - 1), 0, -1):
        if MARKER_START.startswith(value[-length:]):
            return value[-length:]
    return ""


def _parse_marker(marker: str) -> list[str]:
    body = re.sub(r"^\[\[sources:", "", marker)
    body = re.sub(r"\]\]$", "", body)
    return [entry.strip() for entry in body.split(",") if entry.strip() != ""]


class SourceMarkerFilter:
    """Streaming filter that hides `[[sources:...]]` while keeping the visible answer intact."""

    def __init__(self) -> None:
        self._buffer = ""
        self._hidden = False
        self._visible = ""
        self._marker = ""
        self._cited: list[str] = []

    def push(self, delta: str) -> str:
        self._buffer += delta
        out = ""
        while self._buffer:
            if self._hidden:
                end = self._buffer.find(MARKER_END)
                if end < 0:
                    self._marker += self._buffer
                    self._buffer = ""
                    break
                self._marker += self._buffer[:end]
                self._buffer = self._buffer[end + len(MARKER_END) :]
                self._cited.extend(_parse_marker(self._marker))
                self._marker = ""
                self._hidden = False
                continue
            start = self._buffer.find(MARKER_START)
            if start < 0:
                keep = _partial_prefix(self._buffer)
                out += self._buffer[: len(self._buffer) - len(keep)]
                self._buffer = keep
                break
            out += self._buffer[:start]
            self._buffer = self._buffer[start + len(MARKER_START) :]
            self._hidden = True
        self._visible += out
        return out

    def finish(self) -> tuple[str, list[str]]:
        if self._buffer != "" and not self._hidden:
            self._visible += self._buffer
        if self._hidden and self._marker != "":
            self._cited.extend(_parse_marker(f"{self._marker}{MARKER_END}"))
        self._buffer = ""
        return self._visible, self._cited


def resolve_sources(
    identifiers: Sequence[str],
    context: SourceContext,
    warn: Callable[[str, Mapping[str, Any]], None] | None = None,
) -> SourceResolution:
    """Filters guessed identifiers, keeps the sent ones, and labels the answer's provenance."""
    by_chunk = {candidate.chunk_id: candidate for candidate in context.candidates}
    sources: list[dict[str, str]] = []
    cited: list[str] = []
    invented: list[str] = []
    for identifier in identifiers:
        if identifier == "course":
            sources.append({"label": texts.SOURCE_COURSE.format(position=context.chapter_position)})
            continue
        if identifier == "tutor":
            sources.append(tutor_source(context.primary_resource_title))
            continue
        candidate = by_chunk.get(identifier)
        if candidate is None:
            invented.append(identifier)
            continue
        cited.append(identifier)
        sources.append({"label": source_label(candidate)})
    if invented and warn is not None:
        warn("tutor.chat.invented_source", {"count": len(invented)})
    unique: list[dict[str, str]] = []
    for source in sources:
        if all(existing["label"] != source["label"] for existing in unique):
            unique.append(source)
    return SourceResolution(sources=unique, cited_chunk_ids=cited, invented=invented)
