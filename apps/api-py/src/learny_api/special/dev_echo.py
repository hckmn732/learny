"""Development demonstrations of SPEC-201: the idempotent echo and the paginated list.

Port of `packages/services/src/dev/echo.ts`. Neither function persists anything: the counter and
the 57 items live in the process, so the demonstration proves the absence of re-execution of the
pipeline without touching the database.
"""

from typing import Any

from learny.engagement.public import decode_cursor, encode_cursor
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    CURSOR_INVALID,
    CURSOR_INVALID_ITEM,
    DEV_ECHO_FORMATION_LIMIT,
)
from learny.shared.time import to_iso

from learny_api.pipeline import Call

DEV_ITEM_COUNT = 57

_executions = 0


def reset_executions() -> None:
    """Test hook of the demonstration counter, like `resetDevEchoCounter`."""
    global _executions
    _executions = 0


async def echo(call: Call) -> dict[str, Any]:
    """`devEcho`: the message, the instant and the number of effective executions."""
    global _executions
    body: Any = call.body
    fail = None if body is None else getattr(body, "fail", None)
    if fail == "business":
        raise AppError("FORMATION_LIMIT_REACHED", DEV_ECHO_FORMATION_LIMIT)
    if fail == "crash":
        raise RuntimeError("demo: unexpected failure")
    _executions += 1
    return {
        "message": body.message,
        "receivedAt": to_iso(call.deps.clock.now()),
        "counter": _executions,
    }


def _item(position: int) -> dict[str, Any]:
    label = f"item-{position:02d}"
    return {"id": label, "label": label, "position": position}


async def items(call: Call) -> dict[str, Any]:
    """`listDevItems`: 57 deterministic items, sorted by `(position desc, id desc)` (ET-5)."""
    query = call.query
    limit = int(getattr(query, "limit", 20))
    cursor = getattr(query, "cursor", None)
    start = DEV_ITEM_COUNT
    if cursor is not None:
        decoded = decode_cursor(cursor)
        if decoded is None:
            raise AppError(
                "VALIDATION_FAILED",
                CURSOR_INVALID,
                errors=[{"path": "query.cursor", "message": CURSOR_INVALID_ITEM}],
            )
        key, _identifier = decoded
        # A cursor made for another list (string key) simply yields an empty page (CL-9).
        if isinstance(key, str):
            return {"items": [], "nextCursor": None}
        start = min(DEV_ITEM_COUNT, max(0, int(key) - 1))
    rows: list[dict[str, Any]] = []
    position = start
    while position >= 1 and len(rows) < limit + 1:
        rows.append(_item(position))
        position -= 1
    has_more = len(rows) > limit
    page = rows[:limit]
    last = page[-1] if page else None
    return {
        "items": page,
        "nextCursor": encode_cursor(last["position"], last["id"]) if has_more and last else None,
    }
