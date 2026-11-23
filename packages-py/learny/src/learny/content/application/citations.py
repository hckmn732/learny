"""Controlled link of a course citation (SPEC-609 EF-2, ET-1, ET-3, CL-3, BR-COU-02).

The browser never receives a model-produced URL, it asks this use case with the citation identifier.
A deleted or foreign source returns the "source supprimee" label without signing anything; a PDF or
an image gets a ten-minute read URL with the page fragment, a web page keeps its URL with the anchor
or the minute.
"""

from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.application.progress import is_uuid
from learny.content.application.resources import get_signed_read_url
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts


def _as_object(value: Any) -> dict[str, Any] | None:
    return dict(value) if isinstance(value, dict) else None


def _int_of(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def with_fragment(url: str, fragment: str | None) -> str:
    """Appends the fragment, keeping an existing one."""
    if fragment is None:
        return url
    base, _, existing = url.partition("#")
    return f"{base or url}#{existing or fragment}"


def _deleted(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "citationId": row["id"],
        "mediaKind": row["media_kind"],
        "deleted": True,
        "url": None,
        "page": None,
        "startSec": None,
        "anchor": None,
    }


async def get_citation_source(deps: ContentDeps, actor: Actor, citation_id: str) -> dict[str, Any]:
    """Resolves the controlled source of a citation, under the caller's identity."""
    if not is_uuid(citation_id):
        raise AppError("VALIDATION_FAILED", texts.INVALID_CITATION_ID)
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx, queries.SELECT_CITATION_SOURCE, {"id": citation_id, "user_id": actor.user_id}
        )
    if row is None:
        raise AppError("NOT_FOUND", texts.CITATION_NOT_FOUND)
    location = _as_object(row.get("location")) or {}
    page = _int_of(location.get("page"))
    start_sec = _int_of(location.get("startSec"))
    anchor = location.get("anchor")
    anchor = anchor[:200] if isinstance(anchor, str) else None
    deleted = (
        row.get("resource_id") is None
        or row.get("resource_kind") is None
        or row.get("deleted_at") is not None
        or row.get("status") != "ready"
    )
    if deleted:
        return _deleted(row)

    kind = row["resource_kind"]
    url: str | None = None
    if kind in ("pdf", "image"):
        try:
            signed = await get_signed_read_url(deps, actor, str(row["resource_id"]))
        except AppError as error:
            if error.code == "NOT_FOUND":
                return _deleted(row)
            raise
        url = with_fragment(signed["url"], f"page={page}" if page is not None else None)
    elif row.get("url") is not None:
        if anchor is not None:
            fragment: str | None = anchor
        elif start_sec is not None:
            fragment = f"t={start_sec}"
        else:
            fragment = None
        url = with_fragment(str(row["url"]), fragment)

    return {
        "citationId": row["id"],
        "mediaKind": row["media_kind"],
        "deleted": False,
        "url": url,
        "page": page if kind in ("pdf", "image") else None,
        "startSec": start_sec if kind in ("web", "youtube") else None,
        "anchor": anchor if kind == "web" else None,
    }
