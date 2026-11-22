"""Text helpers shared by the tutor domain (SPEC-2204).

Ports `escapeDocumentText` and `escapeDocumentAttribute` of
`packages/ingestion/src/retrieval/format-document.ts` and the `lowerInitial` helper repeated by the
TypeScript services. The tutor context embeds the same untrusted data in the same tags as the
ingestion pipeline, so the escaping rules are identical, byte for byte; `escape_tutor_data` adds the
`escapeTutorData` of `packages/tutor/src/context.ts`, which also neutralises a simulation marker.
"""

import re

_WHITESPACE = re.compile(r"[\t\n\r\f\v]+")
_MOCK_MARKER = re.compile(r"\[\[mock:([a-z0-9]+(?:-[a-z0-9]+)*)\]\]")


def escape_document_text(text: str) -> str:
    """`&`, `<` and `>` entity-encoded; the ampersand first so entities are never double-encoded."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def escape_document_attribute(value: str) -> str:
    """Attribute escaping: the text rules, quotes encoded, and inner whitespace collapsed."""
    escaped = escape_document_text(value).replace('"', "&quot;").replace("'", "&#39;")
    return _WHITESPACE.sub(" ", escaped)


def escape_tutor_data(value: str) -> str:
    """`escapeTutorData`: entity-encode the five characters and neutralise a marker."""
    escaped = (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )
    return _MOCK_MARKER.sub(r"[[ mock:\1 ]]", escaped)


def lower_initial(value: str) -> str:
    """`TITLE` -> `tITLE`, exactly `charAt(0).toLowerCase() + slice(1)`."""
    return value[:1].lower() + value[1:] if value else value
