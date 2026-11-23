"""[SPEC-205] `isPublicPushEndpoint`: the contract refinement of a browser subscription."""

import pytest
from learny.engagement.domain.push_endpoint import (
    PUSH_ENDPOINT_MAX_LENGTH,
    is_public_push_endpoint,
)

pytestmark = pytest.mark.spec("SPEC-205")


@pytest.mark.parametrize(
    "value",
    [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://push.mock.learny.test/x/success",
    ],
)
def test_accepts_a_public_https_endpoint(value: str) -> None:
    assert is_public_push_endpoint(value) is True


@pytest.mark.parametrize(
    "value",
    [
        f"https://example.com/{'a' * PUSH_ENDPOINT_MAX_LENGTH}",
        "https://example.com/a b",
        "https://example.com/a\\b",
        "not a url",
        "http://example.com/a",
        "https://user:pw@example.com/a",
        "https://localhost/a",
        "https://[::1]/a",
        "https://127.0.0.1/a",
        "https://intranet/a",
        "https://example.com./a",
        "https://push.internal/a",
        "https://box.home.arpa/a",
    ],
)
def test_refuses_an_unreachable_or_local_endpoint(value: str) -> None:
    assert is_public_push_endpoint(value) is False
