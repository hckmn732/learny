"""[SPEC-009] The facade refuses an incomplete production start (CA-2, ADR-2040)."""

import pytest
from learny.shared.config import PRODUCTION_REQUIRED_ENV, ConfigurationError
from learny_api.main import create_app

pytestmark = pytest.mark.spec("SPEC-009")


def test_create_app_refuses_an_incomplete_production(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in PRODUCTION_REQUIRED_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(ConfigurationError) as caught:
        create_app()

    assert caught.value.names
