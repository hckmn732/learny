"""YouTube extractor (SPEC-510 EF-2, ET-2, CA-2, CL-4; ADR-0057).

Port of `packages/ingestion/src/extract/youtube.ts` on `youtube-transcript-api`: the URL is parsed
into a strict 11-character identifier, captions are read through a port, and a video without public
captions is a permanent `YOUTUBE_NO_CAPTIONS` failure, never an empty list and never an invented
transcript. The mock provider reads the committed fixtures and is the only one a test can reach.
"""

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from learny.content.domain.chunk import SourceLocation
from learny.content.domain.errors import IngestionError
from learny.content.infrastructure.extract.remote import (
    YOUTUBE_LIMITS,
    is_valid_remote_url,
    remote_error,
)
from learny.content.infrastructure.extract.types import ExtractedContent
from learny.content.infrastructure.extract.youtube_fixtures import youtube_fixture
from learny.shared.locale_fr import content as texts

YOUTUBE_HOSTS = frozenset(
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
        "www.youtu.be",
        "youtube-nocookie.com",
        "www.youtube-nocookie.com",
    }
)
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_SHORT_PATH = re.compile(r"^/(?:shorts|embed|live)/([A-Za-z0-9_-]{11})(?:/|$)")
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class YoutubeSegment:
    start_sec: float
    end_sec: float
    text: str


@dataclass(frozen=True, slots=True)
class YoutubeCaptions:
    video_id: str
    title: str
    language: str
    segments: tuple[YoutubeSegment, ...]
    duration_sec: float | None = None


@dataclass(frozen=True, slots=True)
class YoutubeExtraction:
    video_id: str
    title: str
    language: str
    source_url: str
    segments: tuple[YoutubeSegment, ...]
    duration_sec: float | None = None


YoutubeProvider = Callable[[str], Awaitable[YoutubeCaptions]]


def _invalid() -> IngestionError:
    return IngestionError("YOUTUBE_INVALID_URL", texts.YOUTUBE_EXTRACT_INVALID_URL)


def parse_youtube_url(value: str) -> tuple[str, str]:
    """ET-2: accepts watch, shorts, embed, live and youtu.be links, nothing else."""
    if not is_valid_remote_url(value):
        raise _invalid()
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    if host not in YOUTUBE_HOSTS:
        raise _invalid()
    video_id: str | None = None
    if host == "youtu.be":
        segments = [segment for segment in parts.path.split("/") if segment]
        video_id = segments[0] if segments else None
    elif parts.path == "/watch":
        video_id = parse_qs(parts.query).get("v", [None])[0]
    else:
        match = _SHORT_PATH.match(parts.path)
        video_id = match.group(1) if match is not None else None
    if video_id is None or VIDEO_ID.match(video_id) is None:
        raise _invalid()
    return video_id, f"https://www.youtube.com/watch?v={video_id}"


def mock_youtube_provider() -> YoutubeProvider:
    """EF-2: deterministic public captions of the fixtures; an unknown video has no captions."""

    async def fetch(video_id: str) -> YoutubeCaptions:
        fixture = youtube_fixture(video_id)
        if fixture is None:
            raise IngestionError("YOUTUBE_NO_CAPTIONS", texts.YOUTUBE_NO_CAPTIONS)
        return YoutubeCaptions(
            video_id=str(fixture["videoId"]),
            title=str(fixture["title"]),
            language=str(fixture["language"]),
            duration_sec=float(fixture["durationSec"]),
            segments=tuple(
                YoutubeSegment(
                    start_sec=float(segment["startSec"]),
                    end_sec=float(segment["endSec"]),
                    text=str(segment["text"]),
                )
                for segment in fixture["segments"]
            ),
        )

    return fetch


def live_youtube_provider() -> YoutubeProvider:
    """Live provider; only reachable in `LLM_MODE=live`, never imported by a test."""

    async def fetch(video_id: str) -> YoutubeCaptions:
        try:
            from youtube_transcript_api import (
                NoTranscriptFound,
                TranscriptsDisabled,
                YouTubeTranscriptApi,
            )

            api = YouTubeTranscriptApi()
            try:
                transcript = api.fetch(video_id, languages=["fr"])
            except (NoTranscriptFound, TranscriptsDisabled) as error:
                raise IngestionError("YOUTUBE_NO_CAPTIONS", texts.YOUTUBE_NO_CAPTIONS) from error
            segments: list[YoutubeSegment] = []
            for snippet in transcript:
                text = _WHITESPACE.sub(" ", snippet.text).strip()
                if text == "":
                    continue
                start = float(snippet.start)
                end = start + float(snippet.duration)
                if end < start:
                    continue
                segments.append(YoutubeSegment(start_sec=start, end_sec=end, text=text))
                if len(segments) >= YOUTUBE_LIMITS["max_segments"]:
                    break
        except IngestionError:
            raise
        except Exception as error:  # any provider failure is a transient failure
            raise remote_error(error, "YOUTUBE_UNAVAILABLE") from error
        if not segments:
            raise IngestionError("YOUTUBE_NO_CAPTIONS", texts.YOUTUBE_NO_CAPTIONS)
        duration = segments[-1].end_sec if segments else None
        return YoutubeCaptions(
            video_id=video_id,
            title=texts.YOUTUBE_TITLE_FALLBACK.format(video_id=video_id),
            language="fr",
            duration_sec=duration,
            segments=tuple(segments),
        )

    return fetch


def default_youtube_provider(mode: str) -> YoutubeProvider:
    """`live` calls YouTube; every other mode plays the committed fixtures."""
    return live_youtube_provider() if mode == "live" else mock_youtube_provider()


async def extract_youtube(
    url: str,
    *,
    provider: YoutubeProvider | None = None,
    mode: str = "mock",
) -> YoutubeExtraction:
    """ET-2, CA-2: returns timed segments; `NO_CAPTIONS` is permanent (CL-4)."""
    video_id, source_url = parse_youtube_url(url)
    chosen = provider if provider is not None else default_youtube_provider(mode)
    try:
        captions = await chosen(video_id)
    except IngestionError:
        raise
    except Exception as error:  # a provider failure becomes an ingestion code
        raise remote_error(error, "YOUTUBE_NO_CAPTIONS") from error
    if not captions.segments:
        raise IngestionError("YOUTUBE_NO_CAPTIONS", texts.YOUTUBE_NO_CAPTIONS)
    title = captions.title.strip()[:200] or texts.YOUTUBE_TITLE_FALLBACK.format(video_id=video_id)
    language = captions.language[:35] or "fr"
    duration = None if captions.duration_sec is None else max(0.0, captions.duration_sec)
    return YoutubeExtraction(
        video_id=video_id,
        title=title,
        language=language,
        source_url=source_url,
        duration_sec=duration,
        segments=captions.segments[: YOUTUBE_LIMITS["max_segments"]],
    )


def youtube_content(extraction: YoutubeExtraction) -> ExtractedContent:
    """Converts timed segments into exact located content; each passage keeps its minute range."""
    text = ""
    locations: list[SourceLocation] = []
    for segment in extraction.segments:
        if text != "":
            text += "\n\n"
        char_start = len(text)
        text += segment.text
        locations.append(
            SourceLocation(
                char_start=char_start,
                char_end=len(text),
                start_sec=segment.start_sec,
                end_sec=segment.end_sec,
            )
        )
    metadata: dict[str, Any] = {
        "youtubeId": extraction.video_id,
        "language": extraction.language,
    }
    if extraction.duration_sec is not None:
        metadata["durationSec"] = extraction.duration_sec
    return ExtractedContent(
        text=text,
        pages=None,
        locations=tuple(locations),
        title=extraction.title,
        metadata=metadata,
        content_origin="source",
    )


__all__ = [
    "YOUTUBE_HOSTS",
    "YoutubeCaptions",
    "YoutubeExtraction",
    "YoutubeProvider",
    "YoutubeSegment",
    "default_youtube_provider",
    "extract_youtube",
    "live_youtube_provider",
    "mock_youtube_provider",
    "parse_youtube_url",
    "youtube_content",
]
