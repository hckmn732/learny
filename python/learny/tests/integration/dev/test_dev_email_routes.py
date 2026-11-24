"""[SPEC-2207] The e-mail demonstration routes through the facade.

The preview renders the real template with the sample data, the send uses the real service on the
memory transport, and the outbox of that transport is listed then emptied. The development guard
refuses everything outside `ENABLE_SDD_PAGES`.
"""

from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.engagement.infrastructure.email import EmailConfig, MemoryEmailTransport
from learny.shared.db.uow import Database

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.email.outbox",
    "dev.email.outbox.purge",
)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
HTML_ACCEPT = {"accept": "text/html"}


def email_config() -> EmailConfig:
    return EmailConfig(
        mode="memory",
        sender="Learny <bonjour@learny.app>",
        app_url="https://app.learny.example",
        link_secret="learny-test-only-email-link-secret-00000000",
        smtp_host="127.0.0.1",
        smtp_port=1025,
        resend_api_key=None,
        is_production=False,
    )


@pytest.fixture
async def app(database: Database) -> tuple[Any, Any]:
    deps = DevDeps(
        db=database,
        email=MemoryEmailTransport(DevDeps().clock),
        email_config=email_config(),
    )
    return build_dev_app(ROUTE_IDS, deps, ENABLED)
