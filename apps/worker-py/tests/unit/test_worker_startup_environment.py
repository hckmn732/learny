"""[SPEC-009] The worker refuses an incomplete production start (CA-2, ADR-2040)."""

import pytest
from learny.shared.config import PRODUCTION_REQUIRED_ENV, ConfigurationError
from learny_worker.__main__ import main

pytestmark = pytest.mark.spec("SPEC-009")


def test_main_refuses_an_incomplete_production(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in PRODUCTION_REQUIRED_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(ConfigurationError):
        main()
