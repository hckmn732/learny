"""Return paths of Checkout and of the portal (SPEC-210 EF-1, EF-2, CL-5).

A path of this application, one leading `/`, never `//` nor `/\\`, no control character and no
space. The pipeline validates the body through the generated contract; this pure rule is reused by
the service so both agree.
"""

import re

from learny.shared.errors import AppError
from learny.shared.locale_fr import billing as fr

SAFE_PATH_MAX = 512

_FORBIDDEN = re.compile(r"[\\\s\x00-\x1f\x7f]")

# `/parametres#abonnement` - the "Abonnement" tab (BR-SET-01) the portal returns to (EF-2).
PORTAL_RETURN_PATH = "/parametres#abonnement"


def is_safe_relative_path(value: str) -> bool:
    """`isSafeRelativePath`: a relative path that stays on the application's origin."""
    if len(value) < 1 or len(value) > SAFE_PATH_MAX:
        return False
    if not value.startswith("/") or value.startswith("//") or value.startswith("/\\"):
        return False
    return _FORBIDDEN.search(value) is None


def invalid_path(field: str) -> AppError:
    """`invalidPath`: the `VALIDATION_FAILED` problem of an external return path."""
    return AppError(
        "VALIDATION_FAILED",
        fr.RETURN_PATH_INVALID,
        errors=[{"path": field, "message": fr.RETURN_PATH_EXTERNAL}],
    )


def absolute_url(path: str, app_url: str, field: str) -> str:
    """`absoluteUrl`: a relative path resolved against the application, checked to stay inside it."""
    if not is_safe_relative_path(path):
        raise invalid_path(field)
    origin = origin_of(app_url)
    if origin == "":
        raise invalid_path(field)
    return f"{origin}{path}"


def origin_of(url: str) -> str:
    """`new URL(value).origin`: scheme, host and non-default port, or an empty string."""
    scheme, separator, rest = url.partition("://")
    if separator == "":
        return ""
    authority = rest.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0]
    if authority == "":
        return ""
    return f"{scheme.lower()}://{authority.lower()}"
