"""Global search use case (SPEC-212 EF-1 to EF-5, ET-2, ET-4, ET-5; BR-NAV-05, ADR-0217).

The query is validated and normalized first (CL-1); the private SQL function `search_user_content`
runs under the caller's JWT with the normalized text as a bound parameter, then the rows are grouped
by kind in the fixed order and turned into plain-text snippets. Only the length of the query and the
number of results are logged, never the text.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.domain import search as rules
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import SEARCH_QUERY_INVALID, SEARCH_TOO_LONG, SEARCH_TOO_SHORT

SEARCH_SQL_MAX_ROWS = 100
SEARCH_SQL_QUOTA_FACTOR = 3
SEARCH_GROUP_COUNT = len(rules.SEARCH_KINDS)
KIND_OF_SQL = {"notion": "notion", "section": "chapter", "formation": "formation"}
INTERNAL_HREF = "^/"


def _valid_query(value: str) -> str:
    """`SearchQuery`: 2 to 100 characters after normalization."""
    normalized = rules.normalize_query(value)
    if len(normalized) < 2 or len(normalized) > 100:
        raise AppError(
            "VALIDATION_FAILED",
            SEARCH_QUERY_INVALID,
            errors=[
                {
                    "path": "query.q",
                    "message": SEARCH_TOO_SHORT if len(normalized) < 2 else SEARCH_TOO_LONG,
                }
            ],
        )
    return normalized


def _hit(row: Mapping[str, Any], logger: Any) -> dict[str, Any] | None:
    """EF-5 - a link is an internal relative path; anything else is dropped, never shown."""
    href = str(row["href"])
    if not href.startswith("/") or href.startswith("//"):
        logger.error("search result dropped", code="INTERNAL_ERROR", operation="search")
        return None
    return {
        "kind": KIND_OF_SQL[str(row["kind"])],
        "id": str(row["id"]),
        "title": str(row["title"]),
        "snippet": str(row["snippet"]),
        "href": href,
        "rank": int(row["rank"]),
    }


async def search_user_content(deps: FormationDeps, actor: Actor, query: str, limit: int) -> dict[str, Any]:
    """EF-1 to EF-5 - `GET /api/v1/search`."""
    parsed = _valid_query(query)
    row_limit = min(SEARCH_SQL_MAX_ROWS, SEARCH_GROUP_COUNT * SEARCH_SQL_QUOTA_FACTOR * limit)
    logger = getattr(deps, "logger", None)
    async with deps.db.user_tx(actor) as tx:
        rows = await queries.search_user_content(tx, parsed, row_limit)
        hits = [hit for row in rows if (hit := _hit(row, logger)) is not None]
        grouped: list[dict[str, Any]] = []
        for kind in rules.SEARCH_KINDS:
            of_kind = sorted(
                (hit for hit in hits if hit["kind"] == kind),
                key=lambda item: (-item["rank"], item["id"]),
            )
            if of_kind:
                grouped.append({"kind": kind, "total": len(of_kind), "shown": of_kind[:limit]})
        identities: dict[str, list[str]] = {}
        for group in grouped:
            for hit in group["shown"]:
                identities.setdefault(str(hit["kind"]), []).append(str(hit["id"]))
        bodies = await queries.read_search_bodies(tx, identities)
        return {
            "query": parsed,
            "groups": [
                {
                    "kind": group["kind"],
                    "label": rules.SEARCH_GROUP_LABELS[str(group["kind"])],
                    "items": [_item(hit, bodies, parsed) for hit in group["shown"]],
                    "total": group["total"],
                }
                for group in grouped
            ],
        }


def _item(hit: Mapping[str, Any], bodies: Mapping[str, str], query: str) -> dict[str, Any]:
    """`toItem`: the plain title, the centred snippet and both highlight lists."""
    title = rules.to_plain_title(str(hit["title"]))
    snippet = rules.build_snippet(bodies.get(str(hit["id"]), str(hit["snippet"])), query)
    return {
        "id": hit["id"],
        "title": title,
        "snippet": snippet["snippet"],
        "highlights": snippet["highlights"],
        "titleHighlights": rules.compute_highlights(title, query),
        "href": hit["href"],
    }


def _unused(_: Sequence[str]) -> None:
    """Keeps the `Sequence` import meaningful for the projection helpers."""
    return
