"""Demonstration of the push channel (SPEC-205 EF-7): one in-app notification sent to the caller.

Port of `packages/notifications/src/push/demo.ts`. The answer shows outcomes and codes, never an
endpoint, and the notification is private to the caller.
"""

from dataclasses import asdict
from datetime import datetime
from typing import Any

from learny.engagement import public as engagement
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.locale_fr import dev_notifications as fixture
from learny.shared.locale_fr.details import UNAUTHENTICATED
from learny.shared.time import to_iso
from sqlalchemy import text

from learny_api.pipeline import Call

INSERT_NOTIFICATION = text(
    "insert into public.notifications "
    "(id, user_id, type, title, body, href, icon, dedupe_key, created_at) values "
    "(cast(:id as uuid), cast(:user_id as uuid), cast(:type as public.notification_type), "
    ":title, :body, :href, :icon, null, :created_at) "
    "returning id::text as id, title, body, icon, href"
)


def _user_id(call: Call) -> str:
    if call.actor is None or call.user_id is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
    return call.user_id


def _sent_at(delivery: Any) -> str | None:
    sent_at: datetime | None = delivery["sent_at"] if isinstance(delivery, dict) else delivery.sent_at
    return None if sent_at is None else to_iso(sent_at)


def _field(row: Any, name: str) -> Any:
    return row[name] if isinstance(row, dict) else getattr(row, name)


async def send(call: Call) -> dict[str, Any]:
    """`sendDemoPush`: one impersonal reminder sent to the caller's own subscriptions."""
    user_id = _user_id(call)
    now = call.deps.clock.now()
    async with call.deps.db.service_tx() as tx:
        row = (
            (
                await tx.conn.execute(
                    INSERT_NOTIFICATION,
                    {
                        "id": new_id(),
                        "user_id": user_id,
                        "type": fixture.PUSH_TYPE,
                        "title": fixture.PUSH_TITLE,
                        "body": fixture.PUSH_BODY,
                        "href": fixture.PUSH_HREF,
                        "icon": fixture.PUSH_ICON,
                        "created_at": now,
                    },
                )
            )
            .mappings()
            .first()
        )
    if row is None:  # pragma: no cover - the insert either answers or raises
        raise AppError("INTERNAL_ERROR")
    outcome = await engagement.send_push(
        call.deps,
        user_id=user_id,
        notification={
            "id": str(row["id"]),
            "title": str(row["title"]),
            "body": str(row["body"]),
            "icon": str(row["icon"]),
            "href": str(row["href"]),
        },
    )
    delivery = outcome["delivery"]
    payload = asdict(outcome["payload"])
    status = str(_field(delivery, "status"))
    if status not in ("sent", "failed"):
        status = "skipped_pref"
    return {
        "notificationId": str(row["id"]),
        "payload": payload,
        "delivery": {
            "status": status,
            "error": _field(delivery, "error"),
            "sentAt": _sent_at(delivery),
        },
        "attempts": [
            {
                "outcome": engagement.mock_outcome_of(str(attempt["endpoint"])),
                "statusCode": attempt["result"].status_code or 0,
                "removed": bool(attempt["removed"]),
                "failureCount": int(attempt["failureCount"]),
            }
            for attempt in outcome["attempts"]
        ],
        "remainingSubscriptions": int(outcome["remainingSubscriptions"]),
    }
