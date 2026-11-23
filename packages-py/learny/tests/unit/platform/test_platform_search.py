"""[SPEC-2203] Web search adapter: public URLs, HTML removal, dedup and token budget.

Normalization is applied once for every provider.
"""

import json

import httpx
import pytest
from learny.platform.search import (
    SEARCH_WEB_EMPTY_MESSAGE,
    SEARCH_WEB_UNAVAILABLE_MESSAGE,
    SearchProviderRequest,
    SearchRun,
    TavilySearch,
    canonicalize_url,
    default_search_client,
    fit_results_to_budget,
    is_public_http_url,
    normalize_search_results,
    plain_text,
    run_search,
    search_fixture,
)
from learny.shared.config import Settings
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2203")


def test_active_html_is_removed_and_entities_are_decoded() -> None:
    assert plain_text("<b>Planifier</b> des seances &amp; relire") == "Planifier des seances & relire"
    assert plain_text("<script>alert(1)</script>Une fraction") == "Une fraction"
    assert plain_text("a&#233;b&#x41;c&unknown;") == "a\u00e9bAc&unknown;"
    assert plain_text("  plusieurs   espaces  ") == "plusieurs espaces"


@pytest.mark.parametrize(
    ("url", "public"),
    [
        ("javascript:alert(1)", False),
        ("file:///etc/passwd", False),
        ("http://127.0.0.1:8080/secret", False),
        ("http://192.168.1.10/notes", False),
        ("http://serveur.local/notes", False),
        ("https://user:secret@example.org/prive", False),
        ("https://example.org/page-publique", True),
        ("https://www.ressources.example.org/methodes", True),
    ],
)
def test_only_a_public_http_url_is_accepted(url: str, public: bool) -> None:
    assert is_public_http_url(url) is public


def test_the_canonical_url_removes_tracking_and_fragment() -> None:
    assert canonicalize_url("https://www.Ressources.example.org/fractions/?utm_source=news#top") == (
        "https://ressources.example.org/fractions"
    )
    assert canonicalize_url("https://example.org/a?b=2&a=1") == "https://example.org/a?a=1&b=2"
    assert canonicalize_url("https://example.org") == "https://example.org/"


def test_the_unsafe_fixture_is_cleaned_and_deduplicated() -> None:
    raw = search_fixture("tavily", "unsafe")

    results = normalize_search_results(raw, "tavily")

    assert [result.url for result in results] == [
        "https://ressources.example.org/fractions",
        "https://example.org/page-publique",
    ]
    assert results[0].title == "Fractions avec suivi"
    assert "<script>" not in results[0].snippet
    assert results[0].published_at == "2026-09-14T00:00:00.000Z"


def test_the_fallback_fixture_keeps_dates_and_shortens_tracking_urls() -> None:
    raw = search_fixture("tavily", "fallback")

    results = normalize_search_results(raw, "tavily")

    assert len(results) == 3
    assert results[0].url == "https://etudes-exemple.org/gestion-du-temps"
    assert results[0].provider == "tavily"
    assert results[1].url == "https://ressources.example.org/methodes-actives"
    assert results[1].published_at == "2026-11-02T10:00:00.000Z"


def test_the_text_budget_cuts_the_last_snippet_and_flags_the_answer() -> None:
    results = normalize_search_results(search_fixture("tavily", "fallback"), "tavily")

    from learny.platform.llm.types import estimate_tokens

    first_cost = estimate_tokens(json.dumps(results[0].as_json(), ensure_ascii=False, separators=(",", ":")))
    kept, limited = fit_results_to_budget(results, first_cost + 5)

    assert limited is True
    assert [result.url for result in kept] == [results[0].url]


def test_an_empty_answer_is_honest() -> None:
    run = SearchRun(results=(), limited=False)

    assert run.message == SEARCH_WEB_EMPTY_MESSAGE


async def test_the_tavily_fallback_needs_its_server_side_key() -> None:
    with pytest.raises(AppError) as error:
        await TavilySearch(mode="mock", api_key=None).search(SearchProviderRequest(query="reviser", limit=5))

    assert error.value.code == "SEARCH_UNAVAILABLE"
    assert error.value.detail == SEARCH_WEB_UNAVAILABLE_MESSAGE


async def test_the_tavily_mock_reads_the_committed_fixture() -> None:
    client = TavilySearch(mode="mock", api_key="search-secret")

    raw = await client.search(SearchProviderRequest(query="reviser", limit=5))
    run = await run_search(client, SearchProviderRequest(query="reviser", limit=5))

    assert len(raw) == 3
    assert len(run.results) == 3
    assert run.limited is False


async def test_a_failed_fixture_is_an_explicit_unavailability() -> None:
    client = TavilySearch(mode="mock", api_key="search-secret", scenario="unavailable")

    with pytest.raises(AppError) as error:
        await client.search(SearchProviderRequest(query="reviser", limit=5))
    assert error.value.code == "SEARCH_UNAVAILABLE"


async def test_the_tavily_live_call_normalises_its_answer() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "results": [
                    {"title": "<b>Page</b>", "url": "https://example.org/page", "content": "<i>ok</i>"}
                ]
            },
        )

    client = TavilySearch(
        mode="live",
        api_key="search-secret",
        transport=httpx.MockTransport(handler),
    )
    run = await run_search(client, SearchProviderRequest(query="reviser", limit=3))

    assert seen["authorization"] == "Bearer search-secret"
    assert seen["body"] == {
        "query": "reviser",
        "max_results": 3,
        "search_depth": "basic",
        "include_answer": False,
        "include_raw_content": False,
    }
    assert len(run.results) == 1
    assert run.results[0].title == "Page"
    assert run.results[0].snippet == "ok"


async def test_a_tavily_error_is_an_explicit_unavailability() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={})

    client = TavilySearch(mode="live", api_key="search-secret", transport=httpx.MockTransport(handler))
    with pytest.raises(AppError) as error:
        await client.search(SearchProviderRequest(query="reviser", limit=3))
    assert error.value.code == "SEARCH_UNAVAILABLE"


def test_the_default_client_requires_the_key() -> None:
    client = default_search_client(Settings(llm_mode="mock", search_api_key=None))

    assert isinstance(client, TavilySearch)
