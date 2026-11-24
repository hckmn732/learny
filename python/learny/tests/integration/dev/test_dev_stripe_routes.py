"""[SPEC-2207] The simulated Stripe routes through the facade.

The Checkout page pays, cancels and reads its webhook history on the simulated gateway; the
development guard refuses everything outside `ENABLE_SDD_PAGES`.
"""

from typing import Any

import pytest
from dev_route_support import DevDeps, allow_authentication, build_dev_app
from learny.platform.stripe import CreateCheckoutInput, MockCheckoutSession, MockStripeGateway, WebhookJournal
from learny.shared.config import Settings
from learny.shared.db.uow import Database
from learny.shared.locale_fr import billing as fr
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.stripe.checkoutCancel",
    "dev.stripe.checkoutPay",
    "dev.stripe.simulate",
)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
WEBHOOK_VALUE = "unit-test-signing-value"


@pytest.fixture
def gateway() -> MockStripeGateway:
    return MockStripeGateway(DevDeps().clock, WEBHOOK_VALUE)


@pytest.fixture
def app(database: Database, gateway: MockStripeGateway) -> tuple[Any, Any]:
    deps = DevDeps(
        db=database,
        stripe=gateway,
        webhook_journal=WebhookJournal(),
        settings=Settings(app_env="test", enable_sdd_pages="true"),
    )
    return build_dev_app(ROUTE_IDS, deps, ENABLED)


async def _open_session(gateway: MockStripeGateway, user_id: str) -> MockCheckoutSession:
    created = await gateway.create_checkout_session(
        CreateCheckoutInput(
            customer_id="cus_mock_1",
            user_id=user_id,
            success_url="https://app.learny.example/merci",
            cancel_url="https://app.learny.example/tarifs",
            success_path="/merci",
            cancel_path="/tarifs",
            idempotency_key="dev-stripe-session",
        )
    )
    session = gateway.get_checkout_session(created["id"])
    assert session is not None
    return session


async def test_the_payment_redirects_to_the_success_path(
    app: tuple[Any, Any], gateway: MockStripeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    session = await _open_session(gateway, "22222222-2222-4222-8222-222222222222")

    response = client.post("/api/v1/dev/sdd/stripe/checkout/pay", json={"sessionId": session.id})

    assert response.status_code == 200
    assert response.json() == {"redirectTo": "/merci"}


async def test_the_cancellation_redirects_to_the_cancel_path(
    app: tuple[Any, Any], gateway: MockStripeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    session = await _open_session(gateway, "22222222-2222-4222-8222-222222222222")

    response = client.post("/api/v1/dev/sdd/stripe/checkout/cancel", json={"sessionId": session.id})

    assert response.status_code == 200
    assert response.json() == {"redirectTo": "/tarifs"}
    assert session.status == "canceled"


async def test_another_learners_session_is_not_found(
    app: tuple[Any, Any], gateway: MockStripeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    session = await _open_session(gateway, "33333333-3333-4333-8333-333333333333")

    response = client.post("/api/v1/dev/sdd/stripe/checkout/pay", json={"sessionId": session.id})

    assert response.status_code == 404
    assert response.json()["detail"] == fr.SESSION_NOT_FOUND


async def test_the_replay_delivers_the_last_webhook_again(
    app: tuple[Any, Any], gateway: MockStripeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    session = await _open_session(gateway, "22222222-2222-4222-8222-222222222222")
    client.post("/api/v1/dev/sdd/stripe/checkout/pay", json={"sessionId": session.id})

    response = client.post("/api/v1/dev/sdd/stripe/simulate", json={"action": "replay"})

    assert response.status_code == 200
    assert isinstance(response.json()["result"], str)


async def test_the_replay_without_history_is_not_found(
    app: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)

    response = client.post("/api/v1/dev/sdd/stripe/simulate", json={"action": "replay"})

    assert response.status_code == 404
    assert response.json()["detail"] == fr.NO_WEBHOOK_TO_REPLAY


async def test_the_guard_refuses_the_simulation_outside_enable_sdd_pages() -> None:
    gateway = MockStripeGateway(DevDeps().clock, WEBHOOK_VALUE)
    _app, client = build_dev_app(
        ROUTE_IDS,
        DevDeps(stripe=gateway, webhook_journal=WebhookJournal()),
        {"APP_ENV": "test"},
    )
    response = client.post("/api/v1/dev/sdd/stripe/simulate", json={"action": "replay"})

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
