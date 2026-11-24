"""HTTP handler of the public client configuration (`config.public`, ADR-4007).

The mobile application only knows the API URL at build time: it reads the Supabase project, the
web URL and the public keys here. Every value is public; an unset one is `None`.
"""

from typing import Any

from learny_api.pipeline import Call, handler


def _value(raw: str | None) -> str | None:
    value = (raw or "").strip()
    return value or None


def public_config(settings: Any) -> dict[str, str | None]:
    """The five public values of `PublicConfig`, read from the settings."""
    return {
        "supabaseUrl": _value(settings.supabase_url),
        "supabaseAnonKey": _value(settings.supabase_anon_key),
        "webUrl": _value(settings.next_public_app_url),
        "vapidPublicKey": _value(settings.vapid_public_key),
        "stripePublishableKey": _value(settings.stripe_publishable_key),
    }


@handler("config.public")
async def config_public(call: Call) -> Any:
    """`GET /api/v1/config/public`: no authentication, no database access."""
    return public_config(call.deps.settings)
