"""Shared helpers of the development demonstrations (SPEC-2207)."""

from typing import Any

from learny.engagement import public as engagement


def emails_for(deps: Any, to: str | None) -> list[dict[str, str]]:
    """`emailsFor`: the messages the memory transport captured for one recipient."""
    items = engagement.list_demo_outbox(deps)["items"]
    return [
        {"template": item["template"] or "email", "to": item["to"], "at": item["at"]}
        for item in items
        if to is None or item["to"] == to
    ]
