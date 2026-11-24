"""[SPEC-2206] Stripe statuses, webhook signatures and return paths (SPEC-210 EF-5, ET-6, CL-3, CL-5).

The same cases and the same expected values, against the pure domain module.
"""

from datetime import timedelta

import pytest
from learny.billing.domain.checkout import is_safe_relative_path
from learny.billing.domain.subscription import (
    SUBSCRIPTION_STATUSES,
    is_known_stripe_status,
    map_stripe_status,
    mask_stripe_id,
)
from learny.billing.domain.webhook import (
    StripeEvent,
    normalize_stripe_event,
    sign_payload,
    verify_signature,
)
from learny.shared.errors import AppError
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2206")

NOW = parse_iso("2026-11-11T12:20:00Z")
WEBHOOK_KEY = "learny-status-signing-value"
PAYLOAD = '{"id":"evt_1","type":"x","created":1,"data":{"object":{}}}'


def _code(run: object) -> str | None:
    try:
        run()  # type: ignore[operator]
    except AppError as error:
        return error.code
    return None


def test_every_documented_status_maps_to_a_contract_value() -> None:
    expected = {
        "active": "active",
        "trialing": "active",
        "past_due": "past_due",
        "unpaid": "past_due",
        "canceled": "canceled",
        "incomplete_expired": "canceled",
        "incomplete": "incomplete",
    }
    for stripe, ours in expected.items():
        assert map_stripe_status(stripe) == ours
        assert map_stripe_status(stripe) in SUBSCRIPTION_STATUSES
        assert is_known_stripe_status(stripe) is True


def test_an_unknown_status_grants_nothing() -> None:
    assert map_stripe_status("something_new") == "incomplete"
    assert is_known_stripe_status("something_new") is False
    assert map_stripe_status("paused") == "past_due"


def test_only_internal_paths_are_accepted() -> None:
    for path in ["/", "/parametres#ia", "/formations/42?tab=a", "/_dev/sdd/SPEC-2206"]:
        assert is_safe_relative_path(path) is True, path
    for path in [
        "",
        "parametres",
        "https://evil.example/x",
        "//evil.example",
        "/\\evil.example",
        "javascript:alert(1)",
        "/a b",
        "/a\nb",
        "/" + "a" * 600,
    ]:
        assert is_safe_relative_path(path) is False, path


def test_stripe_identifiers_keep_only_the_kind_and_last_four() -> None:
    assert mask_stripe_id("cus_1AbCdEfGh2345") == "cus_\u20262345"
    assert mask_stripe_id("sub_mock_12") == "sub_\u2026k_12"
    assert mask_stripe_id(None) == "\u2014"
    assert mask_stripe_id("") == "\u2014"
    assert "1AbCdEfGh" not in mask_stripe_id("cus_1AbCdEfGh2345")


def test_a_valid_signature_is_accepted_inside_the_tolerance() -> None:
    header = sign_payload(PAYLOAD, WEBHOOK_KEY, NOW)
    verify_signature(PAYLOAD, header, WEBHOOK_KEY, NOW)
    verify_signature(PAYLOAD, header, WEBHOOK_KEY, NOW + timedelta(seconds=300))


def test_an_expired_tampered_or_missing_signature_is_refused() -> None:
    header = sign_payload(PAYLOAD, WEBHOOK_KEY, NOW)
    assert (
        _code(lambda: verify_signature(PAYLOAD, header, WEBHOOK_KEY, NOW + timedelta(seconds=301)))
        == "INVALID_SIGNATURE"
    )
    assert _code(lambda: verify_signature(f"{PAYLOAD} ", header, WEBHOOK_KEY, NOW)) == "INVALID_SIGNATURE"
    assert _code(lambda: verify_signature(PAYLOAD, header, "other-secret", NOW)) == "INVALID_SIGNATURE"
    assert _code(lambda: verify_signature(PAYLOAD, None, WEBHOOK_KEY, NOW)) == "INVALID_SIGNATURE"
    assert _code(lambda: verify_signature(PAYLOAD, "v1=abcd", WEBHOOK_KEY, NOW)) == "INVALID_SIGNATURE"


def test_the_header_format_is_the_stripe_one() -> None:
    header = sign_payload(PAYLOAD, WEBHOOK_KEY, NOW)
    assert header.startswith("t=1794399600,v1=")
    assert len(header.split("v1=")[1]) == 64


def test_the_useful_identifiers_of_the_four_handled_types_are_read() -> None:
    user_id = "11111111-1111-4111-8111-111111111111"

    def read(event_type: str, obj: dict[str, object]) -> StripeEvent:
        return normalize_stripe_event(
            {"id": f"evt_{event_type}", "type": event_type, "created": 5, "data": {"object": obj}}
        )

    checkout = read(
        "checkout.session.completed",
        {"customer": "cus_a", "subscription": "sub_a", "metadata": {"userId": user_id}},
    )
    assert (checkout.user_id, checkout.customer_id, checkout.subscription_id) == (
        user_id,
        "cus_a",
        "sub_a",
    )
    ended = read(
        "customer.subscription.deleted",
        {"id": "sub_b", "customer": "cus_b", "metadata": {"userId": user_id}},
    )
    assert (ended.customer_id, ended.subscription_id) == ("cus_b", "sub_b")
    failed = read(
        "invoice.payment_failed",
        {
            "customer": "cus_c",
            "subscription": "sub_c",
            "subscription_details": {"metadata": {"userId": user_id}},
        },
    )
    assert (failed.user_id, failed.customer_id, failed.subscription_id) == (
        user_id,
        "cus_c",
        "sub_c",
    )
    assert _code(lambda: normalize_stripe_event({"type": "x"})) == "INVALID_SIGNATURE"
