"""Web page extractor (SPEC-510 EF-1, ET-2, CA-1; ADR-0057).

Port of `packages/ingestion/src/extract/web.ts`: `safe_fetch` retrieves the page with its anti-SSRF
guard, 15 s and 5 MB bounds and robots.txt; `readability-lxml` isolates the main article; the text
is rebuilt block by block with the exact character range and nearest anchor of every block.
Navigation, headers and footers are never copied.
"""

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from lxml import html as lxml_html  # type: ignore[import-untyped]
from readability import Document  # type: ignore[import-untyped]

from learny.content.domain.chunk import SourceLocation
from learny.content.domain.errors import IngestionError
from learny.content.infrastructure.extract.remote import (
    WEB_LIMITS,
    is_valid_remote_url,
    remote_error,
)
from learny.content.infrastructure.extract.types import ExtractedContent
from learny.platform.safe_fetch import (
    AddressLookup,
    SafeFetchOptions,
    SafeFetchResult,
    SafeFetchTransport,
    safe_fetch,
)
from learny.shared.locale_fr import content as texts

SKIP_TAGS = frozenset(
    {
        "script",
        "style",
        "noscript",
        "template",
        "svg",
        "canvas",
        "iframe",
        "form",
        "nav",
        "header",
        "footer",
        "aside",
    }
)

BLOCK_TAGS = frozenset(
    {
        "address",
        "article",
        "blockquote",
        "dd",
        "details",
        "div",
        "dl",
        "dt",
        "fieldset",
        "figcaption",
        "figure",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "li",
        "main",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "tbody",
        "td",
        "tfoot",
        "th",
        "thead",
        "tr",
        "ul",
    }
)

MAX_TEXT_CHARACTERS = 2_000_000
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class WebFetchResult:
    """What a fetcher returns: the final URL, the declared type and the bytes."""

    url: str
    content_type: str | None
    body: bytes


WebFetcher = Callable[[str], Awaitable[WebFetchResult]]


@dataclass(frozen=True, slots=True)
class WebExtractedDocument:
    extraction: dict[str, Any]
    content: ExtractedContent


def _fetcher_options(
    *,
    lookup: AddressLookup | None,
    transport: SafeFetchTransport | None,
    allow_private: bool | None,
    respect_robots: bool | None,
    timeout_ms: int | None,
    max_bytes: int | None,
) -> SafeFetchOptions:
    return SafeFetchOptions(
        timeout_ms=WEB_LIMITS["timeout_ms"] if timeout_ms is None else timeout_ms,
        max_bytes=WEB_LIMITS["max_bytes"] if max_bytes is None else max_bytes,
        max_redirects=WEB_LIMITS["max_redirects"],
        allow_private=False if allow_private is None else allow_private,
        lookup=lookup,
        respect_robots=True if respect_robots is None else respect_robots,
        transport=transport,
    )


def safe_web_fetcher(
    *,
    lookup: AddressLookup | None = None,
    transport: SafeFetchTransport | None = None,
    allow_private: bool | None = None,
    respect_robots: bool | None = None,
    timeout_ms: int | None = None,
    max_bytes: int | None = None,
) -> WebFetcher:
    """Default fetcher: every guard of ADR-0159 is on, and the caller cannot weaken it."""
    options = _fetcher_options(
        lookup=lookup,
        transport=transport,
        allow_private=allow_private,
        respect_robots=respect_robots,
        timeout_ms=timeout_ms,
        max_bytes=max_bytes,
    )

    async def fetch(url: str) -> WebFetchResult:
        result: SafeFetchResult
        try:
            result = await safe_fetch(url, options)
        except Exception as error:  # every guard error becomes an ingestion code
            raise remote_error(error, "FETCH_FAILED") from error
        return WebFetchResult(url=result.url, content_type=result.content_type, body=result.body)

    return fetch


@dataclass(frozen=True, slots=True)
class _Block:
    text: str
    anchor: str | None


def _clean(value: str | None) -> str:
    return _WHITESPACE.sub(" ", value or "").strip()


def _clamp(value: str, limit: int) -> str:
    return value if len(value) <= limit else value[:limit]


def _tag(element: Any) -> str:
    tag = element.tag
    return tag.lower() if isinstance(tag, str) else ""


def _has_block_descendant(element: Any) -> bool:
    for child in element:
        tag = _tag(child)
        if tag in SKIP_TAGS:
            continue
        if tag in BLOCK_TAGS or _has_block_descendant(child):
            return True
    return False


def _collect_blocks(root: Any) -> list[_Block]:
    blocks: list[_Block] = []

    def walk(node: Any, inherited_anchor: str | None) -> None:
        tag = _tag(node)
        if tag in SKIP_TAGS:
            return
        own_id = _clean(node.get("id"))
        name = _clean(node.get("name"))
        anchor = own_id if own_id != "" else (name if tag == "a" and name != "" else inherited_anchor)
        if tag in BLOCK_TAGS and not _has_block_descendant(node):
            text = _clean(node.text_content())
            if text != "":
                blocks.append(_Block(text=text, anchor=anchor))
            return
        for child in node:
            walk(child, anchor)

    for child in root:
        walk(child, None)
    return blocks


def _content_of_blocks(blocks: list[_Block]) -> ExtractedContent:
    text = ""
    locations: list[SourceLocation] = []
    current: SourceLocation | None = None
    current_anchor: str | None = None

    for block in blocks:
        if text != "":
            text += "\n\n"
        char_start = len(text)
        text += block.text
        char_end = len(text)
        if current is not None and block.anchor == current_anchor and block.anchor is not None:
            current = SourceLocation(
                char_start=current.char_start,
                char_end=char_end,
                anchor=current.anchor,
            )
            locations[-1] = current
            continue
        current = SourceLocation(char_start=char_start, char_end=char_end, anchor=block.anchor)
        current_anchor = block.anchor
        locations.append(current)

    return ExtractedContent(text=text, pages=None, locations=tuple(locations))


def _anchors_of(root: Any) -> list[dict[str, str]]:
    seen: set[str] = set()
    anchors: list[dict[str, str]] = []
    for element in root.iter():
        if not isinstance(element.tag, str):
            continue
        identifier = _clean(element.get("id"))
        if identifier == "" and _tag(element) == "a":
            identifier = _clean(element.get("name"))
        if identifier == "" or identifier in seen:
            continue
        seen.add(identifier)
        text = _clean(element.text_content())[:500]
        anchor = {"id": _clamp(identifier, 200)}
        if text != "":
            anchor["text"] = text
        anchors.append(anchor)
    return anchors


def _meta_content(document: Any, property_name: str) -> str:
    for element in document.iter("meta"):
        if element.get("property") == property_name:
            return _clean(element.get("content"))
    return ""


def _hostname(url: str) -> str:
    try:
        return urlsplit(url).hostname or ""
    except ValueError:
        return ""


async def extract_web_document(
    url: str,
    *,
    fetcher: WebFetcher | None = None,
    **options: Any,
) -> WebExtractedDocument:
    if not is_valid_remote_url(url):
        raise IngestionError("URL_INVALID", texts.WEB_URL_INVALID)
    chosen = fetcher if fetcher is not None else safe_web_fetcher(**options)
    try:
        page = await chosen(url)
    except IngestionError:
        raise
    except Exception as error:  # a fetcher failure becomes an ingestion code
        raise remote_error(error, "FETCH_FAILED") from error

    content_type = (page.content_type or "").split(";")[0].strip().lower()
    if content_type not in ("text/html", "application/xhtml+xml"):
        raise IngestionError("WEB_UNSUPPORTED_CONTENT", texts.WEB_UNSUPPORTED_CONTENT)

    try:
        html = page.body.decode("utf-8", errors="replace")
    except Exception as error:  # decoding never raises with replacement, kept safe
        raise IngestionError("WEB_EMPTY_TEXT", texts.WEB_UNDECODABLE) from error

    document: Any
    article: Any
    try:
        document = lxml_html.document_fromstring(html)
        article = Document(html)
    except Exception as error:  # an unreadable page is a readable failure
        raise IngestionError("WEB_EMPTY_TEXT", texts.WEB_ARTICLE_UNREADABLE) from error

    title = _clamp(
        _clean(_document_title(article)) or _clean(_title_tag(document)) or _hostname(page.url),
        200,
    )
    if title == "":
        raise IngestionError("WEB_EMPTY_TEXT", texts.WEB_NO_TITLE)

    try:
        article_html = article.summary()
        root = lxml_html.fragment_fromstring(article_html, create_parent="div")
    except Exception as error:  # an unreadable article is a readable failure
        raise IngestionError("WEB_EMPTY_TEXT", texts.WEB_NO_TEXT) from error

    blocks = _collect_blocks(root)
    if not blocks:
        raise IngestionError("WEB_EMPTY_TEXT", texts.WEB_NO_MAIN_TEXT)
    content = _content_of_blocks(blocks)
    if len(content.text) > MAX_TEXT_CHARACTERS:
        raise IngestionError("WEB_TOO_LARGE", texts.WEB_TOO_LARGE)

    site_name = _meta_content(document, "og:site_name")
    language = _clean(document.get("lang"))
    extraction: dict[str, Any] = {
        "title": title,
        "text": content.text,
        "anchors": _anchors_of(root),
        "sourceUrl": page.url,
    }
    if site_name != "":
        extraction["siteName"] = _clamp(site_name, 200)
    if language != "":
        extraction["language"] = _clamp(language, 35)
    metadata: dict[str, Any] = {}
    if site_name != "":
        metadata["siteName"] = _clamp(site_name, 200)
    if language != "":
        metadata["language"] = _clamp(language, 35)
    return WebExtractedDocument(
        extraction=extraction,
        content=ExtractedContent(
            text=content.text,
            pages=None,
            locations=content.locations,
            title=title,
            metadata=metadata,
            content_origin="source",
        ),
    )


async def extract_web(url: str, *, fetcher: WebFetcher | None = None, **options: Any) -> Any:
    """ET-2: the contract-only entry point used by callers that do not need the offsets."""
    document = await extract_web_document(url, fetcher=fetcher, **options)
    return document.extraction


def _document_title(article: Any) -> str:
    try:
        return str(article.title() or "")
    except Exception:  # a missing title falls back to the document title
        return ""


def _title_tag(document: Any) -> str:
    for element in document.iter("title"):
        return _clean(element.text_content())
    return ""


__all__ = [
    "WebExtractedDocument",
    "WebFetchResult",
    "WebFetcher",
    "extract_web",
    "extract_web_document",
    "safe_web_fetcher",
]
