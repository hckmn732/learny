"""Built-in secret scanner (ADR-0103).

The `_dev` tooling endpoint scans the text a demonstration form carries and returns one finding per
matched span; the first pattern wins when several overlap, and the preview is masked, so a scanned
secret never leaves this module in clear.
"""

import re
from dataclasses import dataclass
from typing import Any

SECRET_ALLOW_MARKER = "learny-test-only"  # noqa: S105 - the scanner marker, not a secret
PREVIEW_LENGTH = 4
ELLIPSIS = "\u2026"


@dataclass(frozen=True, slots=True)
class SecretPattern:
    """One named rule; the identifier is the `rule` the answer carries."""

    id: str
    regex: re.Pattern[str]


SECRET_PATTERNS: tuple[SecretPattern, ...] = (
    SecretPattern("anthropic-key", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}")),
    SecretPattern("openai-key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9_-]{32,}")),
    SecretPattern("stripe-key", re.compile(r"(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}")),
    SecretPattern("stripe-webhook", re.compile(r"whsec_[0-9A-Za-z]{20,}")),
    SecretPattern("aws-access-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    SecretPattern("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    SecretPattern("jwt", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    SecretPattern("resend-key", re.compile(r"re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}")),
    SecretPattern(
        "api-proxy-secret",
        re.compile(r"API_PROXY_SECRET(?:_PREVIOUS)?\s*[=:]\s*['\"]?[A-Za-z0-9_./+-]{32,}"),
    ),
    SecretPattern("voyage-key", re.compile(r"pa-[A-Za-z0-9_-]{30,}")),
    SecretPattern("tavily-key", re.compile(r"tvly-[A-Za-z0-9]{20,}")),
    SecretPattern("sentry-token", re.compile(r"sntry[su]_[A-Za-z0-9+/=_-]{20,}")),
    SecretPattern(
        "vercel-token",
        re.compile(r"(?:VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN)\s*[=:]\s*['\"]?[A-Za-z0-9_-]{20,}"),
    ),
    SecretPattern(
        "generic-assignment",
        re.compile(r"(?:api[_-]?key|secret|password|token)\s*[=:]\s*['\"][^'\"\s]{16,}['\"]", re.IGNORECASE),
    ),
)


def mask_secret(value: str) -> str:
    """`maskSecret`: the four first characters and an ellipsis."""
    return f"{value[:PREVIEW_LENGTH]}{ELLIPSIS}"


def scan_text(text: str, file: str) -> list[dict[str, Any]]:
    """`scanText`: one finding per matched span, line by line, patterns tried in order."""
    findings: list[dict[str, Any]] = []
    for index, content in enumerate(re.split(r"\r?\n", text)):
        if SECRET_ALLOW_MARKER in content:
            continue
        spans: list[tuple[int, int]] = []
        for pattern in SECRET_PATTERNS:
            match = pattern.regex.search(content)
            if match is None:
                continue
            start, end = match.span()
            if any(start < other_end and end > other_start for other_start, other_end in spans):
                continue
            spans.append((start, end))
            findings.append(
                {
                    "file": file,
                    "line": index + 1,
                    "rule": pattern.id,
                    "preview": mask_secret(match.group(0)),
                }
            )
    return findings
