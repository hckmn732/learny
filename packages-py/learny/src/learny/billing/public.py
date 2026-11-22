"""Public surface of the billing context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.billing.application.checkout import get_subscription, open_portal, start_checkout
from learny.billing.application.ports import BillingDeps
from learny.billing.application.webhook import WebhookOutcome, handle_webhook
from learny.billing.domain.checkout import PORTAL_RETURN_PATH, is_safe_relative_path
from learny.billing.domain.config import BillingConfig, resolve_billing_config
from learny.billing.domain.entitlements import grants_access
from learny.billing.domain.subscription import (
    SUBSCRIPTION_STATUSES,
    SubscriptionStatus,
    is_known_stripe_status,
    map_stripe_status,
    mask_stripe_id,
)
from learny.billing.domain.webhook import (
    HANDLED_EVENT_TYPES,
    StripeEvent,
    is_handled_event_type,
    normalize_stripe_event,
    sign_payload,
    verify_signature,
)

__all__ = [
    "HANDLED_EVENT_TYPES",
    "PORTAL_RETURN_PATH",
    "SUBSCRIPTION_STATUSES",
    "BillingConfig",
    "BillingDeps",
    "StripeEvent",
    "SubscriptionStatus",
    "WebhookOutcome",
    "get_subscription",
    "grants_access",
    "handle_webhook",
    "is_handled_event_type",
    "is_known_stripe_status",
    "is_safe_relative_path",
    "map_stripe_status",
    "mask_stripe_id",
    "normalize_stripe_event",
    "open_portal",
    "resolve_billing_config",
    "sign_payload",
    "start_checkout",
    "verify_signature",
]
