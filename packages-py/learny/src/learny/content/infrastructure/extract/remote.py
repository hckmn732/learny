"""Shared limits, inputs and error mapping of the remote extractors (SPEC-510 ET-1 to ET-5).

Port of `packages/ingestion/src/extract/remote.ts`: the network guard lives in
`learny.platform.safe_fetch` and this module only translates its typed errors into the ingestion
contract. A page or a video detail is never copied into a log or an error message.
"""

from urllib.parse import urlsplit

from learny.content.domain.errors import IngestionError
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts

WEB_LIMITS = {"timeout_ms": 15_000, "max_bytes": 5 * 1_048_576, "max_redirects": 5}
IMAGE_LIMITS = {"max_bytes": 10_485_760}
YOUTUBE_LIMITS = {"max_segments": 5_000, "max_duration_sec": 12 * 60 * 60}
MAX_URL_LENGTH = 2048

PERMANENT_CODES = frozenset(
    {
        "URL_INVALID",
        "URL_BLOCKED_HOST",
        "FETCH_TIMEOUT",
        "FETCH_TOO_LARGE",
        "FETCH_HTTP_ERROR",
        "FETCH_TOO_MANY_REDIRECTS",
        "WEB_ROBOTS_DISALLOWED",
        "ROBOTS_DISALLOWED",
        "WEB_EMPTY_TEXT",
        "WEB_UNSUPPORTED_CONTENT",
        "WEB_TOO_LARGE",
        "YOUTUBE_INVALID_URL",
        "YOUTUBE_NO_CAPTIONS",
        "IMAGE_TOO_LARGE",
        "IMAGE_UNREADABLE",
        "IMAGE_EMPTY_TEXT",
        "IMAGE_VISION_UNAVAILABLE",
    }
)


def is_valid_remote_url(value: str) -> bool:
    """ET-4: an absolute HTTP(S) URL of at most 2048 characters, validated before the guard."""
    if not isinstance(value, str) or value == "" or len(value) > MAX_URL_LENGTH:
        return False
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and parts.hostname is not None


def safe_detail(error: AppError) -> str:
    """A bounded, whitespace-normalised detail, safe to display and to store."""
    detail = " ".join((error.detail or "").split()).strip()
    return texts.SOURCE_UNREADABLE if detail == "" else detail[:500]


def remote_error(error: Exception, fallback: str) -> IngestionError:
    """Maps a network/guard error to the stable ingestion code.

    `WEB_ROBOTS_DISALLOWED` becomes the `ROBOTS_DISALLOWED` written on the resource (CL-2), every
    other permanent code keeps its value; an unexpected code becomes the extractor's fallback and
    stays transient so the job can retry.
    """
    if isinstance(error, IngestionError):
        return error
    if isinstance(error, AppError):
        code = "ROBOTS_DISALLOWED" if error.code == "WEB_ROBOTS_DISALLOWED" else error.code
        if code == fallback or code in PERMANENT_CODES:
            return IngestionError(
                code,
                safe_detail(error),
                permanent=code in PERMANENT_CODES,
                status=error.status,
            )
        return IngestionError(fallback, safe_detail(error), permanent=False, status=error.status)
    return IngestionError(fallback, texts.SOURCE_UNREADABLE, permanent=False)


__all__ = [
    "IMAGE_LIMITS",
    "MAX_URL_LENGTH",
    "PERMANENT_CODES",
    "WEB_LIMITS",
    "YOUTUBE_LIMITS",
    "is_valid_remote_url",
    "remote_error",
    "safe_detail",
]
