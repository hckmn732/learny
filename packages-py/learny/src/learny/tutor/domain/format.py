"""Text helpers shared by the tutor domain (SPEC-2204).

Ports `escapeDocumentText` and `escapeDocumentAttribute` of
`packages/ingestion/src/retrieval/format-document.ts` and the `lowerInitial` helper repeated by the
TypeScript services. The tutor context embeds the same untrusted data in the same tags as the
ingestion pipeline, so the escaping rules are identical, byte for byte.
"""

import re

_WHITESPACE = re.compile(r"[\t\n\r\f\v]+")


def escape_document_text(text: str) -> str:
    """`&`, `<` and `>` entity-encoded; the ampersand first so entities are never double-encoded."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def escape_document_attribute(value: str) -> str:
    """Attribute escaping: the text rules, quotes encoded, and inner whitespace collapsed."""
    escaped = escape_document_text(value).replace('"', "&quot;").replace("'", "&#39;")
    return _WHITESPACE.sub(" ", escaped)


def lower_initial(value: str) -> str:
    """`TITLE` -> `tITLE`, exactly `charAt(0).toLowerCase() + slice(1)`."""
    return value[:1].lower() + value[1:] if value else value
