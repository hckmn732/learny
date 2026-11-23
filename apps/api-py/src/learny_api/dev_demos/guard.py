"""Development guard of the pipeline demonstrations (SPEC-2207, `devRoutesEnabled`)."""

from typing import Any

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

from learny_api.special import dev_routes_enabled


def require_dev(deps: Any) -> None:
    """`guarded()`: the problem+json 404 of the demonstration guard, before any other logic."""
    settings = getattr(deps, "settings", None)
    env = {
        "ENABLE_SDD_PAGES": getattr(settings, "enable_sdd_pages", None),
        "APP_ENV": getattr(settings, "app_env", "") or "",
    }
    if not dev_routes_enabled(env):
        raise AppError("NOT_FOUND", RESOURCE_NOT_FOUND)
