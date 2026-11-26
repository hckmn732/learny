"""Figures of a deposited document, read back by their owner (QA 2026-11-26).

A course shows `![caption](/api/v1/resources/<id>/figures/<n>)`: the API checks that the caller
owns the resource, then streams the stored image. Another learner's figure answers `None`, exactly
like a missing one.
"""

from typing import Any

from learny.content.application.ingestion import select_resource
from learny.content.application.ports import ContentDeps
from learny.content.infrastructure.figures import read_figure


def figure_entries(metadata: Any) -> list[dict[str, Any]]:
    """The figure entries of a resource metadata, ignoring malformed ones."""
    raw = metadata.get("figures") if isinstance(metadata, dict) else None
    if not isinstance(raw, list):
        return []
    return [
        entry
        for entry in raw
        if isinstance(entry, dict)
        and isinstance(entry.get("n"), int)
        and isinstance(entry.get("page"), int)
        and isinstance(entry.get("path"), str)
    ]


def figure_url(resource_id: str, index: int) -> str:
    """The stable URL of a figure, written into the course Markdown."""
    return f"/api/v1/resources/{resource_id}/figures/{index}"


async def owned_figure(
    deps: ContentDeps, user_id: str, resource_id: str, index: int
) -> tuple[bytes, str] | None:
    """The bytes and media type of one figure of the caller's resource, or `None`."""
    loaded = await select_resource(deps, resource_id)
    if loaded is None or loaded.deleted or loaded.owner_id != user_id:
        return None
    entry = next((item for item in figure_entries(loaded.metadata) if item["n"] == index), None)
    if entry is None:
        return None
    data = await read_figure(deps.settings, loaded.owner_id, str(entry["path"]))
    if data is None:
        return None
    return data, str(entry.get("mime") or "image/jpeg")


__all__ = ["figure_entries", "figure_url", "owned_figure"]
