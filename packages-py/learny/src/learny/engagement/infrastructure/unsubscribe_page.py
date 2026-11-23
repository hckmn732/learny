"""French HTML pages of the one-click unsubscribe flow (SPEC-2205).

Static markup, no script, the same tokens as the e-mails; the token is only echoed inside the form
action. The `<style>` block is stamped with the CSP nonce of the response: `style-src-elem` only
admits a nonce, so an anonymous `<style>` would be refused by the browser. A nonce that is not
shaped by `createCspNonce` is ignored, so a hostile header can never close the tag.
"""

import re
from dataclasses import dataclass
from html import escape as _escape
from urllib.parse import quote as _quote

from learny.shared.locale_fr import engagement as fr

# packages/ui/src/tokens/colors.ts, the base tokens of the e-mails and of these pages.
CANVAS = "#F4F4F1"
SURFACE = "#FFFFFF"
BORDER = "#E7E6E1"
INK = "#111113"
INK_MUTED = "#62626B"
LIME = "#C6F432"
INDIGO_INK = "#3A3AA8"
WHITE = "#FFFFFF"

NONCE_PATTERN = re.compile(r"^[A-Za-z0-9+/]{16,}={0,2}$")
HTML_HEADERS = {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"}


@dataclass(frozen=True, slots=True)
class HtmlPage:
    """A rendered HTML document with the status the route answers."""

    status: int
    html: str


def px(value: int) -> str:
    """`px()` of the design tokens: the CSS `rem` value of a pixel measurement."""
    return f"{value / 16}rem"


def escape_html(value: str) -> str:
    """The five HTML replacements, apostrophe included (`&#39;`)."""
    return _escape(value, quote=True).replace("&#x27;", "&#39;")


def is_valid_csp_nonce(nonce: str) -> bool:
    """True for a nonce shaped by `createCspNonce`; a malformed header value is ignored."""
    return NONCE_PATTERN.match(nonce) is not None


def request_csp_nonce(nonce: str | None) -> str:
    """The `x-nonce` request header, or an empty string when it is absent or malformed."""
    return nonce if nonce is not None and is_valid_csp_nonce(nonce) else ""


def _style(nonce: str) -> str:
    nonce_attribute = f' nonce="{nonce}"' if is_valid_csp_nonce(nonce) else ""
    font = "'Inter','Helvetica Neue',Arial,sans-serif"
    display = "'Space Grotesk',Arial,sans-serif"
    rules = [
        f"body{{margin:0;padding:{px(32)} {px(16)};background:{CANVAS};color:{INK};"
        f"font-family:{font};font-size:{px(15)};line-height:{px(24)}}}",
        f"main{{max-width:{px(600)};margin:0 auto;background:{SURFACE};"
        f"border:1px solid {BORDER};border-radius:{px(24)};padding:{px(32)}}}",
        f"h1{{margin:{px(24)} 0 {px(12)};font-family:{display};font-size:{px(24)};line-height:{px(32)}}}",
        f"p{{margin:0 0 {px(16)}}}.muted{{color:{INK_MUTED};font-size:{px(13)};line-height:{px(20)}}}",
        f".logo{{display:inline-block;width:{px(32)};height:{px(32)};border-radius:{px(10)};"
        f"background:{LIME};vertical-align:middle}}",
        f".brand{{display:inline-block;margin-left:{px(12)};font-family:{display};"
        f"font-size:{px(20)};font-weight:700;vertical-align:middle}}",
        f"button{{display:inline-block;min-height:{px(44)};padding:{px(12)} {px(22)};border:0;"
        f"border-radius:{px(12)};background:{INK};color:{WHITE};font:inherit;font-weight:600;"
        "cursor:pointer}",
        f"a{{color:{INDIGO_INK}}}",
    ]
    return f"<style{nonce_attribute}>\n" + "\n".join(rules) + "\n</style>"


def page(title: str, body: str, nonce: str = "") -> str:
    """The document shared by the three pages, with its noindex robots directive."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{escape_html(title)}{fr.UNSUBSCRIBE_PAGE_TITLE_SUFFIX}</title>
{_style(nonce)}
</head>
<body>
<main>
<span class="logo" aria-hidden="true"></span><span class="brand">Learny</span>
{body}
</main>
</body>
</html>
"""


def unsubscribe_form_page(token: str, action_path: str, nonce: str = "") -> str:
    """GET with a valid token: a form, no state change until the learner confirms (CL-6)."""
    action = f"{action_path}?token={_quote_value(token)}"
    body = (
        f'<h1 data-testid="unsubscribe-title">{escape_html(fr.UNSUBSCRIBE_QUESTION)}</h1>\n'
        f"<p>{escape_html(fr.UNSUBSCRIBE_KEEP)}</p>\n"
        f'<form method="post" action="{escape_html(action)}">\n'
        '<input type="hidden" name="List-Unsubscribe" value="One-Click">\n'
        f'<button type="submit" data-testid="unsubscribe-confirm">'
        f"{escape_html(fr.UNSUBSCRIBE_CONFIRM)}</button>\n"
        "</form>"
    )
    return page(fr.UNSUBSCRIBE_QUESTION, body, nonce)


def unsubscribe_done_page(nonce: str = "") -> str:
    """After a POST: confirmation of the change."""
    body = (
        f'<h1 data-testid="unsubscribe-title">{escape_html(fr.UNSUBSCRIBE_DONE_TITLE)}</h1>\n'
        f'<p data-testid="unsubscribe-done">{escape_html(fr.UNSUBSCRIBE_DONE)}</p>'
    )
    return page(fr.UNSUBSCRIBE_DONE_TITLE, body, nonce)


def unsubscribe_invalid_page(nonce: str = "") -> str:
    """Altered or unknown token (400)."""
    body = (
        f'<h1 data-testid="unsubscribe-title">{escape_html(fr.UNSUBSCRIBE_INVALID_TITLE)}</h1>\n'
        f'<p class="muted">{escape_html(fr.UNSUBSCRIBE_INVALID_HINT)}</p>'
    )
    return page(fr.UNSUBSCRIBE_INVALID_TITLE, body, nonce)


def _quote_value(value: str) -> str:
    return _quote(value, safe="")


def wants_json(accept: str | None) -> bool:
    """`Accept: application/json` wins; browsers and mail clients get the HTML page."""
    header = accept or ""
    return "application/json" in header and "text/html" not in header


__all__ = [
    "BORDER",
    "CANVAS",
    "HTML_HEADERS",
    "INDIGO_INK",
    "INK",
    "INK_MUTED",
    "LIME",
    "NONCE_PATTERN",
    "SURFACE",
    "WHITE",
    "HtmlPage",
    "escape_html",
    "is_valid_csp_nonce",
    "page",
    "px",
    "request_csp_nonce",
    "unsubscribe_done_page",
    "unsubscribe_form_page",
    "unsubscribe_invalid_page",
    "wants_json",
]
