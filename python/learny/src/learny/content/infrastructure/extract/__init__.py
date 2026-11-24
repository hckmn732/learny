"""Extractors of a contribution (SPEC-509 EF-2, SPEC-510; ADR-2015).

One module per source kind; every extractor returns the same `ExtractedContent` shape so the
passage pipeline never knows where the text came from.
"""

from learny.content.infrastructure.extract.document import DOCX_MIME, extract_document
from learny.content.infrastructure.extract.image import (
    IMAGE_PROMPT_ID,
    IMAGE_SCENARIO,
    ImageReading,
    ImageResourceInput,
    VisionReader,
    VisionReading,
    create_llm_vision_reader,
    extract_image,
    extract_image_document,
    image_content,
)
from learny.content.infrastructure.extract.note import extract_note
from learny.content.infrastructure.extract.pdf import DEFAULT_PDF_LIMITS, extract_pdf
from learny.content.infrastructure.extract.remote import (
    IMAGE_LIMITS,
    PERMANENT_CODES,
    WEB_LIMITS,
    YOUTUBE_LIMITS,
    is_valid_remote_url,
    remote_error,
)
from learny.content.infrastructure.extract.types import (
    ExtractedContent,
    PdfLimits,
    VisionOrigin,
)
from learny.content.infrastructure.extract.web import (
    WebExtractedDocument,
    WebFetcher,
    WebFetchResult,
    extract_web,
    extract_web_document,
    safe_web_fetcher,
)
from learny.content.infrastructure.extract.youtube import (
    YoutubeCaptions,
    YoutubeExtraction,
    YoutubeProvider,
    default_youtube_provider,
    extract_youtube,
    live_youtube_provider,
    mock_youtube_provider,
    parse_youtube_url,
    youtube_content,
)

__all__ = [
    "DEFAULT_PDF_LIMITS",
    "DOCX_MIME",
    "IMAGE_LIMITS",
    "IMAGE_PROMPT_ID",
    "IMAGE_SCENARIO",
    "PERMANENT_CODES",
    "WEB_LIMITS",
    "YOUTUBE_LIMITS",
    "ExtractedContent",
    "ImageReading",
    "ImageResourceInput",
    "PdfLimits",
    "VisionOrigin",
    "VisionReader",
    "VisionReading",
    "WebExtractedDocument",
    "WebFetchResult",
    "WebFetcher",
    "YoutubeCaptions",
    "YoutubeExtraction",
    "YoutubeProvider",
    "create_llm_vision_reader",
    "default_youtube_provider",
    "extract_document",
    "extract_image",
    "extract_image_document",
    "extract_note",
    "extract_pdf",
    "extract_web",
    "extract_web_document",
    "extract_youtube",
    "image_content",
    "is_valid_remote_url",
    "live_youtube_provider",
    "mock_youtube_provider",
    "parse_youtube_url",
    "remote_error",
    "safe_web_fetcher",
    "youtube_content",
]
