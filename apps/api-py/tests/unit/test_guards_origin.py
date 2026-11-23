"""[SPEC-2101] Origin guard and trusted proxy, ported from SPEC-208 and SPEC-1102."""

from dataclasses import dataclass, field
from typing import Any

import pytest
from learny.shared.errors import AppError
from learny_api.guards.origin import (
    OriginGuard,
    OriginRequest,
    client_address,
    create_origin_guard,
    create_request_origin_guard,
    is_origin_exempt,
    is_trusted_proxy,
    normalize,
    parse_allowed_origins,
    request_origin,
)

pytestmark = pytest.mark.spec("SPEC-2101")

APP = "https://app.exemple.fr"
SECRET = "learny-test-only-api-proxy-secret-value"
PREVIOUS_SECRET = "learny-test-only-api-proxy-secret-previous"


@dataclass(frozen=True)
class FakeRequest:
    """The structural request the ported helpers read (Starlette is not needed for the unit)."""

    method: str = "POST"
    headers: dict[str, str] = field(default_factory=dict)
    scope: dict[str, Any] = field(default_factory=lambda: {"scheme": "http", "path": "/api/v1/x"})


def request(**overrides: Any) -> OriginRequest:
    values: dict[str, Any] = {
        "method": "POST",
        "pathname": "/api/v1/formations",
        "origin": APP,
        "sec_fetch_site": None,
        "request_origin": APP,
    }
    values.update(overrides)
    return OriginRequest(**values)


def refused(run: Any) -> AppError:
    with pytest.raises(AppError) as caught:
        run()
    return caught.value


GUARD = create_origin_guard(
    app_url=APP,
    allowed_origins="https://partner.example, https://autre.example:8443",
)


def test_accepts_the_application_origin_and_the_listed_ones() -> None:
    for origin in (APP, "https://partner.example", "https://autre.example:8443"):
        GUARD.check(request(origin=origin))


def test_refuses_a_foreign_origin_with_the_french_detail() -> None:
    error = refused(lambda: GUARD.check(request(origin="https://evil.example")))
    assert error.code == "ORIGIN_REJECTED"
    assert error.detail == "Requ\u00eate refus\u00e9e : origine non autoris\u00e9e."


@pytest.mark.parametrize(
    "origin",
    [
        "https://app.exemple.fr.attaquant.com",
        "https://attaquant.com/https://app.exemple.fr",
        "http://app.exemple.fr",
        "https://app.exemple.fr:8443",
        "https://sub.app.exemple.fr",
        "null",
        "",
        "pas une url",
    ],
)
def test_refuses_the_trapped_origins(origin: str) -> None:
    assert refused(lambda: GUARD.check(request(origin=origin))).code == "ORIGIN_REJECTED"


def test_compares_normalised_origins() -> None:
    GUARD.check(request(origin="HTTPS://APP.EXEMPLE.FR/"))


def test_without_origin_accepts_only_same_origin() -> None:
    GUARD.check(request(origin=None, sec_fetch_site="same-origin"))
    for sec_fetch_site in (None, "same-site", "cross-site", "none"):
        assert check_without_origin(sec_fetch_site) == "ORIGIN_REJECTED"


def check_without_origin(sec_fetch_site: str | None) -> str:
    return refused(lambda: GUARD.check(request(origin=None, sec_fetch_site=sec_fetch_site))).code


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
def test_does_not_check_the_safe_methods(method: str) -> None:
    GUARD.check(request(method=method, origin="https://evil.example"))


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_checks_the_mutating_methods(method: str) -> None:
    assert (
        refused(lambda: GUARD.check(request(method=method, origin="https://evil.example"))).code
        == "ORIGIN_REJECTED"
    )


def test_exempts_the_webhooks_the_job_endpoint_and_the_unsubscribe_link() -> None:
    for pathname in ("/api/v1/webhooks/stripe", "/api/inngest", "/api/v1/email/unsubscribe"):
        GUARD.check(request(pathname=pathname, origin=None, sec_fetch_site=None))
    assert is_origin_exempt("GET", "/api/v1/email/unsubscribe") is False
    assert is_origin_exempt("POST", "/api/v1/webhooksx/stripe") is False
    assert is_origin_exempt("PUT", "/api/v1/email/unsubscribe") is False


def test_falls_back_to_the_origin_of_the_request() -> None:
    local = create_origin_guard()
    local.check(request(origin="http://localhost:3000", request_origin="http://localhost:3000"))
    assert (
        refused(
            lambda: local.check(request(origin="http://evil.example", request_origin="http://localhost:3000"))
        ).code
        == "ORIGIN_REJECTED"
    )


def test_parses_allowed_origins_and_refuses_an_invalid_list() -> None:
    assert parse_allowed_origins(None) == []
    assert parse_allowed_origins("  ") == []
    assert parse_allowed_origins("https://a.example/path, HTTPS://B.example:443") == [
        "https://a.example",
        "https://b.example",
    ]
    with pytest.raises(ValueError, match="invalid ALLOWED_ORIGINS"):
        parse_allowed_origins("https://a.example, pas-une-origine")


def test_normalize_matches_the_url_origin() -> None:
    assert normalize(" HTTPS://App.Example.FR/path ") == "https://app.example.fr"
    assert normalize("http://localhost:3000") == "http://localhost:3000"
    assert normalize("http://localhost:80") == "http://localhost"
    assert normalize("pas une url") is None
    assert normalize("null") is None


ENV = {"API_PROXY_SECRET": SECRET, "NEXT_PUBLIC_APP_URL": "https://learny.example"}


def proxied(**headers: str) -> FakeRequest:
    base = {
        "host": "api.internal",
        "x-learny-proxy-secret": SECRET,
        "x-forwarded-host": "learny.example",
        "x-forwarded-proto": "https",
        "x-forwarded-for": "198.51.100.7, 10.0.0.4",
    }
    base.update(headers)
    return FakeRequest(headers=base)


def test_trusted_proxy_uses_the_forwarded_origin_and_the_first_address() -> None:
    assert request_origin(proxied(), ENV) == "https://learny.example"
    assert client_address(proxied(), ENV) == "198.51.100.7"
    assert is_trusted_proxy(proxied().headers, ENV) is True


def test_ignores_forwarded_data_without_or_with_a_wrong_secret() -> None:
    for secret in (None, f"{SECRET}x"):
        headers = proxied()
        merged = dict(headers.headers)
        if secret is None:
            merged.pop("x-learny-proxy-secret")
        else:
            merged["x-learny-proxy-secret"] = secret
        merged["x-forwarded-host"] = "evil.example"
        request_without = FakeRequest(headers=merged)
        assert request_origin(request_without, ENV) == "http://api.internal"
        assert client_address(request_without, ENV) is None


def test_accepts_the_previous_secret_during_a_rotation() -> None:
    rotating = {"API_PROXY_SECRET": SECRET, "API_PROXY_SECRET_PREVIOUS": PREVIOUS_SECRET}
    for secret in (SECRET, PREVIOUS_SECRET):
        headers = proxied(**{"x-learny-proxy-secret": secret})
        assert request_origin(headers, rotating) == "https://learny.example"
        assert client_address(headers, rotating) == "198.51.100.7"
    previous_only = proxied(**{"x-learny-proxy-secret": PREVIOUS_SECRET})
    assert request_origin(previous_only, ENV) == "http://api.internal"
    assert client_address(previous_only, ENV) is None


def test_legacy_trust_proxy_is_ignored_when_a_relay_secret_is_configured() -> None:
    legacy = {"TRUST_PROXY": "true"}
    plain = FakeRequest(
        headers={
            "host": "api.internal",
            "x-forwarded-host": "evil.example",
            "x-forwarded-proto": "https",
            "x-forwarded-for": "198.51.100.9",
        }
    )
    # Only the protocol comes from the forwarded header: the host stays the one received, because
    # `x-forwarded-host` is honoured through the relay secret only.
    assert request_origin(plain, legacy) == "https://api.internal"
    assert client_address(plain, legacy) == "198.51.100.9"
    # A configured-but-empty secret disables the legacy mode, like the TypeScript check.
    assert request_origin(plain, {**legacy, "API_PROXY_SECRET": ""}) == "http://api.internal"


def test_exempts_an_origin_less_bearer_mutation_but_not_a_cookie_mutation() -> None:
    guard = create_request_origin_guard(ENV)
    bearer = FakeRequest(headers={"authorization": "Bearer abc.def.ghi", "host": "api.internal"})
    cookie = FakeRequest(headers={"cookie": "session=value", "host": "api.internal"})
    guard.check(bearer)
    assert refused(lambda: guard.check(cookie)).code == "ORIGIN_REJECTED"


def test_accepts_a_mutation_forwarded_by_the_relay_and_rejects_a_spoofed_one() -> None:
    local_env = {"API_PROXY_SECRET": SECRET}
    guard = create_request_origin_guard(local_env)
    trusted = FakeRequest(
        method="POST",
        headers={
            "origin": "https://learny.example",
            "host": "api.internal",
            "x-forwarded-host": "learny.example",
            "x-forwarded-proto": "https",
            "x-learny-proxy-secret": SECRET,
        },
    )
    guard.check(trusted)
    spoofed = FakeRequest(
        method="POST",
        headers={
            "origin": "https://learny.example",
            "host": "other.example",
            "x-forwarded-host": "learny.example",
            "x-forwarded-proto": "https",
            "x-learny-proxy-secret": "wrong",
        },
    )
    assert refused(lambda: guard.check(spoofed)).code == "ORIGIN_REJECTED"


def test_the_guard_refuses_an_invalid_allowed_origins_list_at_startup() -> None:
    with pytest.raises(ValueError, match="invalid ALLOWED_ORIGINS"):
        create_request_origin_guard({"ALLOWED_ORIGINS": "pas-une-origine"})


def test_origin_guard_dataclass_keeps_the_parsed_origins() -> None:
    guard = create_origin_guard(APP, "https://partner.example")
    assert isinstance(guard, OriginGuard)
    assert guard.allowed_origins == ["https://partner.example"]
