"""Stripe event shape used by the application, and the webhook signature scheme (SPEC-210 EF-4, ET-2).

Port of `packages/services/src/billing/stripe-event.ts`. The real gateway verifies through the SDK;
the simulated one verifies with `verify_signature`, which implements the same documented scheme:
`t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`, tolerance 300 s (ADR-0215).
"""

import hashlib
import hmac
import json
import math
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from learny.billing.domain.config import WEBHOOK_TOLERANCE_SECONDS
from learny.shared.errors import AppError
from learny.shared.locale_fr import billing as fr

# Types the service applies (EF-4); every other type is acknowledged and ignored.
HANDLED_EVENT_TYPES: tuple[str, ...] = (
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
)


@dataclass(frozen=True, slots=True)
class StripeEvent:
    """The part of a Stripe event the application reads (everything else is ignored)."""

    id: str
    type: str
    created: int
    user_id: str | None
    customer_id: str | None
    subscription_id: str | None


def is_handled_event_type(event_type: str) -> bool:
    """True for the four types the service applies."""
    return event_type in HANDLED_EVENT_TYPES


def _as_record(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_string(value: object) -> str | None:
    """A non-empty string, or the `id` of an expanded object; anything else is `None`."""
    if isinstance(value, str) and value != "":
        return value
    identifier = _as_record(value).get("id")
    return identifier if isinstance(identifier, str) and identifier != "" else None


def _metadata_user_id(obj: dict[str, Any]) -> str | None:
    direct = _as_record(obj.get("metadata")).get("userId")
    if isinstance(direct, str) and direct != "":
        return direct
    details = _as_record(_as_record(obj.get("subscription_details")).get("metadata")).get("userId")
    return details if isinstance(details, str) and details != "" else None


def normalize_stripe_event(raw: object) -> StripeEvent:
    """`normalizeStripeEvent`: reads the fields the service needs from an authenticated event."""
    event = _as_record(raw)
    obj = _as_record(_as_record(event.get("data")).get("object"))
    identifier = event.get("id")
    event_type = event.get("type")
    created = event.get("created")
    readable = (
        isinstance(identifier, str)
        and identifier != ""
        and isinstance(event_type, str)
        and event_type != ""
        and isinstance(created, (int, float))
        and not isinstance(created, bool)
        and math.isfinite(created)
    )
    if not readable:
        raise AppError("INVALID_SIGNATURE", fr.EVENT_UNREADABLE)
    is_subscription = str(event_type).startswith("customer.subscription.")
    return StripeEvent(
        id=str(identifier),
        type=str(event_type),
        created=int(created),  # type: ignore[arg-type]
        user_id=_metadata_user_id(obj) or _as_string(obj.get("client_reference_id")),
        customer_id=_as_string(obj.get("customer")),
        subscription_id=(
            _as_string(obj.get("id")) if is_subscription else _as_string(obj.get("subscription"))
        ),
    )


def signature_payload(timestamp: int, payload: str) -> str:
    """The signed string: `<timestamp>.<raw body>`."""
    return f"{timestamp}.{payload}"


def sign_payload(payload: str, webhook_secret: str, at: datetime) -> str:
    """`t=...,v1=...` header for `payload` signed at `at` (simulated gateway and tests)."""
    timestamp = int(at.astimezone(UTC).timestamp())
    digest = hmac.new(
        webhook_secret.encode("utf-8"),
        signature_payload(timestamp, payload).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def _invalid(detail: str) -> AppError:
    return AppError("INVALID_SIGNATURE", detail)


def verify_signature(
    payload: str,
    header: str | None,
    webhook_secret: str,
    now: datetime,
    tolerance_seconds: int = WEBHOOK_TOLERANCE_SECONDS,
) -> None:
    """Verifies a `Stripe-Signature` header (CL-3): raises `INVALID_SIGNATURE` on any refusal."""
    if header is None or header.strip() == "":
        raise _invalid(fr.SIGNATURE_MISSING)
    timestamp: int | None = None
    candidates: list[str] = []
    for part in header.split(","):
        key, separator, value = part.partition("=")
        if separator == "":
            continue
        if key.strip() == "t":
            try:
                timestamp = int(value.strip())
            except ValueError:
                timestamp = None
        if key.strip() == "v1":
            candidates.append(value.strip())
    if timestamp is None or not candidates:
        raise _invalid(fr.SIGNATURE_UNREADABLE)
    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        signature_payload(timestamp, payload).encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not _matches(candidates, expected):
        raise _invalid(fr.SIGNATURE_INVALID)
    if int(now.astimezone(UTC).timestamp()) - timestamp > tolerance_seconds:
        raise _invalid(fr.SIGNATURE_EXPIRED)


def _matches(candidates: list[str], expected: bytes) -> bool:
    """`timingSafeEqual` over the hex-decoded candidates (a malformed candidate never matches)."""
    for candidate in candidates:
        try:
            provided = bytes.fromhex(candidate)
        except ValueError:
            continue
        if len(provided) == len(expected) and hmac.compare_digest(provided, expected):
            return True
    return False


def parse_event(payload: str) -> StripeEvent:
    """Parses an already authenticated raw body; an unreadable body is an invalid signature."""
    try:
        raw = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise AppError("INVALID_SIGNATURE", fr.EVENT_UNREADABLE) from error
    return normalize_stripe_event(raw)
