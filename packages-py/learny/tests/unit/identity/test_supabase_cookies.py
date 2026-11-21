"""[SPEC-2101] Supabase session cookies: reassembly and decoding."""

import base64
import json
from collections.abc import Mapping

import pytest
from learny.identity.infrastructure.supabase_cookies import (
    access_token_from_cookies,
    decode_session,
    reassemble,
    session_cookie_base,
)

pytestmark = pytest.mark.spec("SPEC-2101")

BASE = "sb-abcdefghijklmnop-auth-token"


def encode(payload: Mapping[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return "base64-" + base64.urlsafe_b64encode(raw).decode().rstrip("=")


def test_a_single_cookie_is_decoded() -> None:
    cookies = {BASE: encode({"access_token": "jwt-1", "refresh_token": "r"})}
    assert session_cookie_base(cookies) == BASE
    assert access_token_from_cookies(cookies) == "jwt-1"


def test_chunked_cookies_are_reassembled_in_order() -> None:
    payload = {"access_token": "jwt-2"}
    encoded = encode(payload)
    middle = len(encoded) // 2
    cookies = {
        f"{BASE}.1": encoded[middle:],
        f"{BASE}.0": encoded[:middle],
    }
    assert reassemble(cookies, BASE) == encoded
    assert access_token_from_cookies(cookies) == "jwt-2"


def test_plain_json_cookie_is_accepted() -> None:
    cookies = {BASE: json.dumps({"access_token": "jwt-3"})}
    assert access_token_from_cookies(cookies) == "jwt-3"


def test_unrelated_cookies_are_ignored() -> None:
    assert session_cookie_base({"other": "value"}) is None
    assert access_token_from_cookies({"other": "value"}) is None


def test_a_corrupt_value_yields_no_token() -> None:
    assert decode_session("base64-%%%not-base64%%%") is None
    assert access_token_from_cookies({BASE: "base64-%%%not-base64%%%"}) is None
    assert access_token_from_cookies({BASE: "not-json"}) is None
    assert access_token_from_cookies({BASE: encode({"refresh_token": "r"})}) is None
