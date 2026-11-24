"""[SPEC-2206] Billing domain against the reference oracle (SPEC-210, CA-2).

Equality is strict: a divergence is a Python bug, never an oracle change (ADR-2008).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.billing.domain.checkout import absolute_url, is_safe_relative_path
from learny.billing.domain.config import resolve_billing_config
from learny.billing.domain.subscription import (
    is_known_stripe_status,
    map_stripe_status,
    mask_stripe_id,
)
from learny.billing.domain.webhook import (
    normalize_stripe_event,
    sign_payload,
    verify_signature,
)
from learny.shared.errors import AppError
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2206")

ORACLE = json.loads(
    (Path(__file__).resolve().parents[5] / "api" / "oracles" / "vectors" / "billing.json").read_text(
        encoding="utf-8"
    )
)


def _config_code(env: dict[str, str | None]) -> str | None:
    try:
        resolve_billing_config(env)
    except AppError as error:
        return error.code
    return None


def _signature_code(body: str, header: str | None, secret: str, now: str) -> str | None:
    try:
        verify_signature(body, header, secret, parse_iso(now))
    except AppError as error:
        return error.code
    return None


def _event(raw: Any) -> tuple[str | None, Any]:
    try:
        return (None, normalize_stripe_event(raw))
    except AppError as error:
        return (error.code, None)


def _url(path: str, app_url: str, field: str) -> tuple[str | None, str | None]:
    try:
        return (None, absolute_url(path, app_url, field))
    except AppError as error:
        return (error.code, None)


def test_the_configuration_matches_the_typescript_resolution() -> None:
    for case in ORACLE["config"]:
        config = resolve_billing_config(case["env"])
        assert config.mode == case["mode"], case["env"]
        assert config.app_url == case["appUrl"], case["env"]
        assert config.price_id == case["priceId"], case["env"]
        assert config.secret_key == case["secretKey"], case["env"]
        assert config.webhook_secret == case["webhookSecret"], case["env"]


def test_mock_is_refused_in_production() -> None:
    for case in ORACLE["refusedConfig"]:
        assert _config_code(case["env"]) == case["code"]


def test_stripe_statuses_are_mapped_and_known_flags_match() -> None:
    for case in ORACLE["statuses"]:
        assert map_stripe_status(case["stripe"]) == case["mapped"], case["stripe"]
        assert is_known_stripe_status(case["stripe"]) is case["known"], case["stripe"]


def test_stripe_identifiers_are_masked() -> None:
    for case in ORACLE["masks"]:
        assert mask_stripe_id(case["id"]) == case["masked"], case["id"]


def test_the_signature_scheme_matches_and_every_refusal_keeps_its_code() -> None:
    signature = ORACLE["signatures"]
    signed = sign_payload(signature["payload"], signature["secret"], parse_iso("2026-11-11T12:20:00Z"))
    assert signed == signature["header"]
    for case in signature["verifications"]:
        code = _signature_code(case["body"], case["header"], signature["secret"], case["now"])
        assert code == case["code"]


def test_the_event_normalisation_matches() -> None:
    for case in ORACLE["events"]:
        code, event = _event(case["raw"])
        assert code == case["code"], case["raw"]
        if code is None:
            expected = case["normalized"]
            assert event.id == expected["id"]
            assert event.type == expected["type"]
            assert event.created == expected["created"]
            assert event.user_id == expected["userId"]
            assert event.customer_id == expected["customerId"]
            assert event.subscription_id == expected["subscriptionId"]


def test_return_paths_and_absolute_urls_match() -> None:
    for case in ORACLE["paths"]:
        assert is_safe_relative_path(case["value"]) is case["safe"], case["value"]
    for case in ORACLE["urls"]:
        code, url = _url(case["path"], case["appUrl"], case["field"])
        assert code == case["code"], case["path"]
        if code is None:
            assert url == case["url"], case["path"]
