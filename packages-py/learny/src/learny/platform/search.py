"""Web search of the tutor (SPEC-512 EF-2, EF-3, EF-5; BR-IA-12, ADR-0048).

Port of `packages/llm/src/search/{normalize,tavily,fixtures}.ts`: the Tavily fallback is called with
`SEARCH_API_KEY`, `LLM_MODE=mock` plays the committed fixtures, and a missing key is an explicit
`SEARCH_UNAVAILABLE`. A provider answer is untrusted: only a public HTTP(S) URL survives, active
HTML is removed, duplicates are collapsed on the canonical URL, and the answer is cut to the
programme text budget.
"""

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import parse_qs, quote, urlsplit

import httpx

from learny.platform.llm.mock import fixtures_directory
from learny.platform.llm.types import estimate_tokens
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts

SEARCH_WEB_PROVIDERS = ("anthropic", "tavily")
SEARCH_WEB_PURPOSES = ("programme", "resource_suggestion")
SEARCH_WEB_QUERY_MIN_LENGTH = 2
SEARCH_WEB_QUERY_MAX_LENGTH = 300
SEARCH_WEB_DEFAULT_LIMIT = 5
SEARCH_WEB_MAX_LIMIT = 10
SEARCH_WEB_TITLE_MAX_LENGTH = 200
SEARCH_WEB_SNIPPET_MAX_LENGTH = 400
SEARCH_WEB_TEXT_BUDGET_TOKENS = 6_000
SEARCH_WEB_EMPTY_MESSAGE = texts.SEARCH_WEB_EMPTY_MESSAGE
SEARCH_WEB_UNAVAILABLE_MESSAGE = texts.SEARCH_WEB_UNAVAILABLE_MESSAGE
TAVILY_ENDPOINT = "https://api.tavily.com/search"
TAVILY_TIMEOUT_SECONDS = 20.0

DEFAULT_SEARCH_SCENARIO = {"anthropic": "native", "tavily": "fallback"}

_ACTIVE_BLOCK = re.compile(
    r"<(script|style|iframe|object|embed|noscript)\b[^>]*>[\s\S]*?</\1\s*>", re.IGNORECASE
)
_TAG = re.compile(r"<[^>]*>")
_ENTITY = re.compile(r"&(#x[0-9a-f]+|#\d+|[a-z]+);", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_WHITESPACE = re.compile(r"\s+")
_IPV4 = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_NAMED_ENTITIES = {
    "amp": "&",
    "lt": "<",
    "gt": ">",
    "quot": '"',
    "apos": "'",
    "nbsp": " ",
}
_TRACKING_PARAMETERS = frozenset({"fbclid", "gclid", "mc_cid", "mc_eid", "ref_src"})


@dataclass(frozen=True, slots=True)
class SearchProviderRequest:
    query: str
    limit: int


@dataclass(frozen=True, slots=True)
class SearchWebResult:
    title: str
    url: str
    snippet: str
    provider: str
    published_at: str | None = None

    def as_json(self) -> dict[str, Any]:
        """The provider-neutral shape, keys in the TypeScript order (budget cost is identical)."""
        payload: dict[str, Any] = {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "provider": self.provider,
        }
        if self.published_at is not None:
            payload["publishedAt"] = self.published_at
        return payload


@dataclass(frozen=True, slots=True)
class SearchRun:
    results: tuple[SearchWebResult, ...]
    limited: bool

    @property
    def message(self) -> str | None:
        return SEARCH_WEB_EMPTY_MESSAGE if not self.results else None


class SearchClient(Protocol):
    """One provider route; normalization is applied once by `run_search`."""

    provider: str

    async def search(self, request: SearchProviderRequest) -> list[Any]: ...


def search_unavailable() -> AppError:
    """EF-5: explicit, safe unavailability: no invented source and no automatic paid fallback."""
    return AppError("SEARCH_UNAVAILABLE", SEARCH_WEB_UNAVAILABLE_MESSAGE, status=503)


# --- normalization (SPEC-512 ET-2, ET-3) ---------------------------------------------------------


def plain_text(value: str) -> str:
    """ET-2: removes active HTML and markup, decodes entities, collapses whitespace."""

    def decode(match: re.Match[str]) -> str:
        body = match.group(1)
        lower = body.lower()
        if lower.startswith("#x"):
            code = int(lower[2:], 16)
            return chr(code) if 0 < code <= 0x10FFFF else " "
        if lower.startswith("#"):
            code = int(lower[1:])
            return chr(code) if 0 < code <= 0x10FFFF else " "
        replacement = _NAMED_ENTITIES.get(lower)
        return replacement if replacement is not None else f"&{body};"

    text = _ACTIVE_BLOCK.sub(" ", value)
    text = _TAG.sub(" ", text)
    text = _ENTITY.sub(decode, text)
    text = _CONTROL.sub(" ", text)
    return _WHITESPACE.sub(" ", text).strip()


def _ipv4_is_private(host: str) -> bool:
    octets: list[int] = []
    for part in host.split("."):
        if not part.isdigit():
            return True
        octets.append(int(part))
    if len(octets) != 4 or any(part < 0 or part > 255 for part in octets):
        return True
    a, b, c, _d = octets
    return (
        a == 0
        or a == 10
        or a == 127
        or (a == 100 and 64 <= b <= 127)
        or (a == 169 and b == 254)
        or (a == 172 and 16 <= b <= 31)
        or (a == 192 and b == 0 and (c == 0 or c == 2))
        or (a == 192 and b == 168)
        or (a == 198 and (b == 18 or b == 19))
        or (a == 198 and b == 51 and c == 100)
        or (a == 203 and b == 0 and c == 113)
        or a >= 224
    )


def _ipv6_is_private(host: str) -> bool:
    value = host.lower()
    if value in ("::", "::1"):
        return True
    if value.startswith("::ffff:"):
        mapped = value[len("::ffff:") :]
        return _ipv4_is_private(mapped) if _IPV4.match(mapped) is not None else True
    return value.startswith(("fc", "fd", "fe8", "fe9", "fea", "feb", "ff"))


def is_private_host(hostname: str) -> bool:
    """ET-2: a public host is neither loopback, private, link-local nor a local-only name."""
    host = hostname.lower().strip("[]").removesuffix(".")
    if host == "" or host == "localhost":
        return True
    if host.endswith((".localhost", ".local", ".internal")):
        return True
    if host.endswith((".home", ".lan", ".test")):
        return True
    if _IPV4.match(host) is not None:
        return _ipv4_is_private(host)
    if ":" in host:
        return _ipv6_is_private(host)
    return "." not in host


def _parse_public_url(value: str) -> Any | None:
    if not isinstance(value, str):
        return None
    try:
        parts = urlsplit(value)
    except ValueError:
        return None
    if parts.scheme not in ("http", "https"):
        return None
    if parts.username is not None or parts.password is not None:
        return None
    try:
        port = parts.port
    except ValueError:
        return None
    if parts.hostname is None or port == 0:
        return None
    if is_private_host(parts.hostname):
        return None
    return parts


def is_public_http_url(value: str) -> bool:
    """ET-2: true only for an absolute, public, credential-free HTTP(S) URL."""
    return _parse_public_url(value) is not None


def canonicalize_url(value: str) -> str | None:
    """ET-2, CL-4: canonical form used for deduplication."""
    parts = _parse_public_url(value)
    if parts is None:
        return None
    scheme = parts.scheme
    host = (parts.hostname or "").lower().removesuffix(".")
    if host.startswith("www."):
        host = host[4:]
    try:
        port = parts.port
    except ValueError:
        return None
    default_port = 443 if scheme == "https" else 80
    netloc = host if port is None or port == default_port else f"{host}:{port}"
    path = parts.path or "/"
    trimmed = path.rstrip("/")
    path = trimmed if trimmed != "" else "/"
    kept: list[tuple[str, str]] = []
    values = parse_qs(parts.query, keep_blank_values=True)
    for key in sorted(values):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in _TRACKING_PARAMETERS:
            continue
        for entry in values[key]:
            kept.append((key, entry))
    encoded = "&".join(f"{quote(key, safe='')}={quote(entry, safe='')}" for key, entry in kept)
    return f"{scheme}://{netloc}{path}{f'?{encoded}' if encoded else ''}"


def _clip(value: str, limit: int) -> str:
    return value[:limit]


def _first_string(record: dict[str, Any], keys: Sequence[str]) -> str | None:
    for key in keys:
        value = record.get(key)
        if isinstance(value, str) and value.strip() != "":
            return value
    return None


def _iso_date(value: Any) -> str | None:
    if not isinstance(value, str) or value.strip() == "":
        return None
    candidate = value.strip()
    if _DATE_ONLY.match(candidate) is not None:
        candidate = f"{candidate}T00:00:00.000Z"
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _hostname_of(url: str) -> str:
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return texts.SOURCE_WEB_LABEL
    return host.removeprefix("www.") or texts.SOURCE_WEB_LABEL


def normalize_search_results(raw: Any, provider: str) -> list[SearchWebResult]:
    """ET-2, ET-3: provider output (unknown) -> validated normalized results."""
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    results: list[SearchWebResult] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        raw_url = _first_string(item, ("url", "link"))
        if raw_url is None:
            continue
        url = canonicalize_url(raw_url)
        if url is None or url in seen:
            continue
        seen.add(url)
        title = _clip(plain_text(_first_string(item, ("title", "name")) or _hostname_of(url)), 200)
        title = title or _hostname_of(url)
        snippet = _clip(plain_text(_first_string(item, ("snippet", "content", "description")) or ""), 400)
        published_at = _iso_date(item.get("publishedAt", item.get("published_date")))
        results.append(
            SearchWebResult(
                title=title,
                url=url,
                snippet=snippet,
                provider=provider,
                published_at=published_at,
            )
        )
    return results


def _cost(result: SearchWebResult) -> int:
    return estimate_tokens(json.dumps(result.as_json(), ensure_ascii=False, separators=(",", ":")))


def fit_results_to_budget(
    results: Sequence[SearchWebResult], max_tokens: int
) -> tuple[list[SearchWebResult], bool]:
    """ET-3: keeps whole results, shortens the last snippet when it does not fit."""
    kept: list[SearchWebResult] = []
    used = 0
    limited = False
    for result in results:
        cost = _cost(result)
        if used + cost <= max_tokens:
            kept.append(result)
            used += cost
            continue
        limited = True
        empty = SearchWebResult(
            title=result.title,
            url=result.url,
            snippet="",
            provider=result.provider,
            published_at=result.published_at,
        )
        remaining = max_tokens - used - _cost(empty)
        characters = min(len(result.snippet), max(0, remaining) * 4)
        if characters > 0:
            kept.append(
                SearchWebResult(
                    title=result.title,
                    url=result.url,
                    snippet=result.snippet[:characters],
                    provider=result.provider,
                    published_at=result.published_at,
                )
            )
        break
    return kept, limited


# --- fixtures and Tavily fallback ----------------------------------------------------------------


def search_fixtures_directory() -> Path:
    """`<packages/llm/fixtures>/search`, or `LLM_FIXTURES_DIR/search` in a container."""
    return fixtures_directory() / "search"


@lru_cache(maxsize=8)
def _load_fixture(provider: str, scenario: str) -> dict[str, Any] | None:
    path = search_fixtures_directory() / provider / f"{scenario}.json"
    if not path.is_file():
        return None
    payload: Any = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else None


def search_fixture(provider: str, scenario: str | None = None) -> list[Any]:
    """The deterministic answer of a provider fixture; a failed fixture raises `SEARCH_UNAVAILABLE`."""
    chosen = scenario if scenario is not None else DEFAULT_SEARCH_SCENARIO[provider]
    fixture = _load_fixture(provider, chosen)
    if fixture is None or fixture.get("error") is not None:
        raise search_unavailable()
    results = fixture.get("results")
    return list(results) if isinstance(results, list) else []


class TavilySearch:
    """Tavily fallback: fixture in mock mode, httpx in live mode; the key is never logged."""

    provider = "tavily"

    def __init__(
        self,
        *,
        mode: str,
        api_key: str | None,
        scenario: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._mode = mode
        self._api_key = api_key
        self._scenario = scenario
        self._transport = transport

    async def search(self, request: SearchProviderRequest) -> list[Any]:
        if self._api_key is None or self._api_key.strip() == "":
            raise search_unavailable()
        if self._mode == "mock":
            return search_fixture("tavily", self._scenario)
        try:
            async with httpx.AsyncClient(
                timeout=TAVILY_TIMEOUT_SECONDS, transport=self._transport, trust_env=False
            ) as client:
                response = await client.post(
                    TAVILY_ENDPOINT,
                    headers={
                        "authorization": f"Bearer {self._api_key}",
                        "content-type": "application/json",
                    },
                    content=json.dumps(
                        {
                            "query": request.query,
                            "max_results": request.limit,
                            "search_depth": "basic",
                            "include_answer": False,
                            "include_raw_content": False,
                        },
                        ensure_ascii=False,
                    ),
                )
        except httpx.HTTPError as error:
            raise search_unavailable() from error
        if response.status_code >= 400:
            raise search_unavailable()
        try:
            payload: Any = response.json()
        except ValueError as error:
            raise search_unavailable() from error
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            raise search_unavailable()
        return list(payload["results"])


def default_search_client(settings: Settings) -> SearchClient:
    """The configured fallback; a missing `SEARCH_API_KEY` makes it unavailable, even in mock."""
    return TavilySearch(
        mode="live" if settings.llm_mode == "live" else "mock",
        api_key=settings.search_api_key,
    )


async def run_search(
    client: SearchClient,
    request: SearchProviderRequest,
    *,
    budget_tokens: int = SEARCH_WEB_TEXT_BUDGET_TOKENS,
) -> SearchRun:
    """ET-2, ET-3: one normalization and one budget pass for every provider route."""
    raw = await client.search(request)
    normalized = normalize_search_results(raw, client.provider)
    kept, limited = fit_results_to_budget(normalized, budget_tokens)
    return SearchRun(results=tuple(kept), limited=limited)


def validate_search_query(query: str, limit: int) -> str:
    """EF-3 bounds applied before any provider request."""
    trimmed = query.strip()
    if len(trimmed) < SEARCH_WEB_QUERY_MIN_LENGTH or len(trimmed) > SEARCH_WEB_QUERY_MAX_LENGTH:
        raise AppError("VALIDATION_FAILED", texts.SEARCH_QUERY_INVALID)
    if limit < 1 or limit > SEARCH_WEB_MAX_LIMIT:
        raise AppError("VALIDATION_FAILED", texts.SEARCH_LIMIT_INVALID)
    return trimmed


__all__ = [
    "DEFAULT_SEARCH_SCENARIO",
    "SEARCH_WEB_DEFAULT_LIMIT",
    "SEARCH_WEB_EMPTY_MESSAGE",
    "SEARCH_WEB_MAX_LIMIT",
    "SEARCH_WEB_PROVIDERS",
    "SEARCH_WEB_PURPOSES",
    "SEARCH_WEB_TEXT_BUDGET_TOKENS",
    "SEARCH_WEB_UNAVAILABLE_MESSAGE",
    "TAVILY_ENDPOINT",
    "SearchClient",
    "SearchProviderRequest",
    "SearchRun",
    "SearchWebResult",
    "TavilySearch",
    "canonicalize_url",
    "default_search_client",
    "fit_results_to_budget",
    "is_private_host",
    "is_public_http_url",
    "normalize_search_results",
    "plain_text",
    "run_search",
    "search_fixture",
    "search_fixtures_directory",
    "search_unavailable",
    "validate_search_query",
]
