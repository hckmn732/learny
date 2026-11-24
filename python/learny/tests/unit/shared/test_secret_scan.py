"""[SPEC-2207] Secret scanner: the cases of `packages/config/src/secret-patterns.test.ts`.

The fake keys are assembled at runtime, so this file never contains a secret-like literal. One
finding per secret, the first pattern wins when several overlap, and the preview is masked.
"""

import pytest
from learny.shared.secret_scan import (
    SECRET_PATTERNS,
    mask_secret,
    scan_text,
)

pytestmark = pytest.mark.spec("SPEC-2207")


def fake(*parts: str) -> str:
    return "".join(parts)


POSITIVE: dict[str, str] = {
    "anthropic-key": fake("sk-ant-", "api03-", "A" * 30),
    "openai-key": fake("sk-", "proj-", "B" * 40),
    "stripe-key": fake("sk_", "live_", "C" * 24),
    "stripe-webhook": fake("whsec_", "D" * 24),
    "aws-access-key": fake("AKIA", "E" * 16),
    "private-key": fake("-----BEGIN ", "RSA PRIVATE KEY-----"),
    "jwt": fake("eyJ", "F" * 12, ".eyJ", "G" * 12, ".", "H" * 12),
    "resend-key": fake("re_", "I" * 8, "_", "J" * 16),
    "api-proxy-secret": fake("API_PROXY_SECRET=", "P" * 40),
    "voyage-key": fake("pa-", "K" * 32),
    "tavily-key": fake("tvly-", "L" * 24),
    "sentry-token": fake("sntry", "s_", "M" * 24),
    "vercel-token": fake("VERCEL_", "TOKEN=", "N" * 24),
    "generic-assignment": fake('api_key = "', "O" * 20, '"'),
}

NEGATIVE: dict[str, str] = {
    "anthropic-key": "sk-ant-short",
    "openai-key": "sk-short-value",
    "stripe-key": "sk_live_short",
    "stripe-webhook": "whsec_short",
    "aws-access-key": "AKIA-lowercase",
    "private-key": "-----BEGIN PUBLIC KEY-----",
    "jwt": "eyJhbGciOi.short",
    "resend-key": "re_short",
    "api-proxy-secret": "API_PROXY_SECRET=short",
    "voyage-key": "pa-short",
    "tavily-key": "tvly-short",
    "sentry-token": "sntrys_short",
    "vercel-token": "VERCEL_TOKEN=",
    "generic-assignment": "api_key = process.env.API_KEY",
}


def test_every_pattern_has_a_positive_and_a_negative_value() -> None:
    identifiers = [pattern.id for pattern in SECRET_PATTERNS]

    assert sorted(POSITIVE) == sorted(identifiers)
    assert sorted(NEGATIVE) == sorted(identifiers)


@pytest.mark.parametrize("identifier", [pattern.id for pattern in SECRET_PATTERNS])
def test_each_pattern_detects_its_own_value(identifier: str) -> None:
    findings = scan_text(f"value {POSITIVE[identifier]}", "f.ts")

    assert identifier in [finding["rule"] for finding in findings]


@pytest.mark.parametrize("identifier", [pattern.id for pattern in SECRET_PATTERNS])
def test_each_pattern_ignores_its_harmless_look_alike(identifier: str) -> None:
    findings = scan_text(NEGATIVE[identifier], "f.ts")

    assert identifier not in [finding["rule"] for finding in findings]


def test_one_finding_per_secret_when_patterns_overlap() -> None:
    key = fake("sk-ant-", "api03-", "A" * 30)

    assert [finding["rule"] for finding in scan_text(f"ANTHROPIC_API_KEY={key}", "f")] == ["anthropic-key"]


def test_the_previous_proxy_secret_is_detected() -> None:
    text = fake("API_PROXY_SECRET_PREVIOUS=", "P" * 40)

    assert "api-proxy-secret" in [finding["rule"] for finding in scan_text(text, "f.ts")]


def test_a_line_with_the_allow_marker_is_ignored() -> None:
    assert scan_text("sk-ant-learny-test-only-0000000000000000", "f.ts") == []


def test_the_finding_reports_its_line_and_a_masked_preview() -> None:
    key = fake("sk-ant-", "api03-", "A" * 30)

    findings = scan_text(f"first\nANTHROPIC_API_KEY={key}", "saisie")

    assert findings == [{"file": "saisie", "line": 2, "rule": "anthropic-key", "preview": "sk-a\u2026"}]
    assert mask_secret("abcdef") == "abcd\u2026"
