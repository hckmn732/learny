"""Complete validation of a brick (SPEC-501 ET-5, BR-IA-11).

Port of `packages/bricks/src/validate.ts`. The order is normative:
    1. the draft envelope; 2. the type schema; 3. internal rules; 4. common rules; 5. references.
Steps 3 to 5 only run when 1 and 2 succeed; every issue of a step is returned together, so the tutor
loop (SPEC-508) can send one complete, readable correction to the model. The reference resolver is
an injected port: the domain stays free of IO and only awaits the caller's lookups.
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any, Protocol, TypedDict

from learny.assessments.domain.bricks.fingerprint import brick_fingerprint
from learny.assessments.domain.bricks.issues import brick_issue, unique_issues
from learny.assessments.domain.bricks.registry import BRICK_REGISTRY, BrickDefinition
from learny.assessments.domain.bricks.schema import PARSERS, parse_draft, parse_payload

BRICK_RESOURCE_KINDS = (
    "note",
    "pdf",
    "web",
    "youtube",
    "image",
    "audio",
    "video",
    "exam_guide",
)
"""Resource kinds of the resolver; kept local so `bricks` never imports the database package."""

CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b-\x1f]")
"""CL-11: control characters are refused everywhere except a newline and a tab."""

ROOT_PATH = "(root)"


class BrickResourceInfo(TypedDict):
    """What the resolver knows about one resource (ET-5)."""

    kind: str
    pages: int | None
    durationSec: float | int | None
    deleted: bool


class BrickReferenceResolver(Protocol):
    """Reference reader limited to the current learner and formation (BR-BRI-05, ET-8)."""

    async def existing_notion_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]: ...

    async def chunks(self, ids: Sequence[str]) -> dict[str, dict[str, str]]: ...

    async def resources(self, ids: Sequence[str]) -> dict[str, BrickResourceInfo]: ...

    async def existing_brick_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]: ...


class BrickInvalid(Exception):
    """A rejected draft or payload: the complete list of readable issues."""

    def __init__(self, issues: Sequence[Mapping[str, str]]) -> None:
        super().__init__("invalid brick")
        self.issues: list[dict[str, str]] = unique_issues([dict(issue) for issue in issues])


def control_character_issues(
    value: Any, path: str = "", found: list[dict[str, str]] | None = None
) -> list[dict[str, str]]:
    """CL-11: one issue per offending string, on the raw draft and before trimming."""
    issues = [] if found is None else found
    if isinstance(value, str):
        match = CONTROL_CHARACTERS.search(value)
        if match is not None:
            code_point = f"{ord(match.group(0)):04X}"
            issues.append(
                brick_issue(
                    "SCHEMA_INVALID",
                    ROOT_PATH if path == "" else path,
                    f"Control character U+{code_point} is not allowed.",
                )
            )
        return issues
    if isinstance(value, list):
        for index, item in enumerate(value):
            control_character_issues(item, str(index) if path == "" else f"{path}.{index}", issues)
        return issues
    if isinstance(value, Mapping):
        for key, item in value.items():
            control_character_issues(item, str(key) if path == "" else f"{path}.{key}", issues)
    return issues


def trim_deep(value: Any) -> Any:
    """Recursively trims every string of a JSON-like value; other values are returned unchanged."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        return [trim_deep(item) for item in value]
    if isinstance(value, Mapping):
        return {key: trim_deep(item) for key, item in value.items()}
    return value


def parse_brick_payload(type_name: str, payload: Any) -> dict[str, Any]:
    """Parses one payload with the schema of its type; no cross-check and no reference resolution."""
    control = control_character_issues(payload, "payload")
    if control:
        raise BrickInvalid(control)
    if type_name not in PARSERS:
        raise BrickInvalid([brick_issue("SCHEMA_INVALID", "type", f'Unknown brick type "{type_name}".')])
    parsed, issues = parse_payload(type_name, trim_deep(payload))
    if issues or parsed is None:
        raise BrickInvalid(issues)
    return parsed


def _unique_ids(refs: Sequence[Mapping[str, str]]) -> list[str]:
    seen: list[str] = []
    for ref in refs:
        if ref["id"] not in seen:
            seen.append(ref["id"])
    return seen


def _location_issues(payload: Mapping[str, Any], resource: BrickResourceInfo) -> list[dict[str, str]]:
    location = payload["location"]
    kind = resource["kind"]

    def invalid(message: str, path: str = "payload.location") -> list[dict[str, str]]:
        return [brick_issue("LOCATION_INVALID", path, message)]

    if kind in ("pdf", "exam_guide"):
        page = location.get("page")
        pages = resource["pages"]
        if page is not None and pages is not None and page > pages:
            return invalid(
                f"Page {page} is beyond the {pages} pages of the resource.",
                "payload.location.page",
            )
        return []
    if kind in ("youtube", "audio", "video"):
        duration = resource["durationSec"]
        if duration is None:
            return []
        start = location.get("startSec")
        if start is None:
            return invalid("A timed resource excerpt requires startSec.", "payload.location.startSec")
        if start > duration:
            return invalid(
                f"startSec {start:g} is beyond the resource duration.",
                "payload.location.startSec",
            )
        end = location.get("endSec")
        if end is not None and end > duration:
            return invalid(
                f"endSec {end:g} is beyond the resource duration.",
                "payload.location.endSec",
            )
        return []
    if kind == "web":
        if location.get("anchor") is None and location.get("charStart") is None:
            return invalid("A web resource excerpt requires anchor or charStart.")
        return []
    if kind in ("note", "image"):
        if location.get("charStart") is None:
            return invalid(f"A {kind} resource excerpt requires charStart.")
        return []
    return []


def common_issues(
    draft: Mapping[str, Any],
    payload: Mapping[str, Any],
    definition: BrickDefinition,
) -> list[dict[str, str]]:
    """Rules that need the draft and the payload together (ET-4)."""
    issues: list[dict[str, str]] = []
    if definition.requires_notion and not draft["notionIds"]:
        issues.append(
            brick_issue(
                "NOTION_REQUIRED",
                "notionIds",
                "A pedagogical brick must be attached to at least one notion.",
            )
        )
    if draft["type"] == "resource_excerpt" and draft["origin"] != "resource":
        issues.append(
            brick_issue("ORIGIN_INVALID", "origin", 'A resource excerpt must have origin "resource".')
        )
    if draft["type"] in ("timer", "scoring") and draft["origin"] != "tutor":
        issues.append(
            brick_issue("ORIGIN_INVALID", "origin", f'A {draft["type"]} brick must have origin "tutor".')
        )
    if draft["origin"] == "resource" and not payload["sources"]:
        issues.append(
            brick_issue(
                "SOURCES_REQUIRED",
                "payload.sources",
                'A brick with origin "resource" must cite at least one source.',
            )
        )
    return issues


async def reference_issues(
    draft: Mapping[str, Any],
    payload: Mapping[str, Any],
    definition: BrickDefinition,
    resolver: BrickReferenceResolver,
) -> list[dict[str, str]]:
    """Resolves every reference of the payload against the caller's lookups (ET-5)."""
    issues: list[dict[str, str]] = []
    refs = definition.references(payload)
    notion_refs = [
        *(
            {"id": str(notion_id), "path": f"notionIds.{index}"}
            for index, notion_id in enumerate(draft["notionIds"])
        ),
        *refs["notions"],
    ]
    notion_ids = _unique_ids(notion_refs)
    if notion_ids:
        existing = await resolver.existing_notion_ids(str(draft["formationId"]), notion_ids)
        for ref in notion_refs:
            if ref["id"] not in existing:
                issues.append(
                    brick_issue(
                        "NOTION_NOT_FOUND",
                        ref["path"],
                        f'Unknown notion "{ref["id"]}" in this formation.',
                    )
                )
    chunk_refs = refs["chunks"]
    chunk_ids = _unique_ids(chunk_refs)
    chunks = await resolver.chunks(chunk_ids) if chunk_ids else {}
    for ref in chunk_refs:
        if ref["id"] not in chunks:
            issues.append(
                brick_issue(
                    "SOURCE_NOT_FOUND",
                    ref["path"],
                    f'Unknown or inaccessible passage "{ref["id"]}".',
                )
            )
    resource_refs = list(refs["resources"])
    resource_paths = {(ref["id"], ref["path"]) for ref in resource_refs}
    for ref in chunk_refs:
        chunk = chunks.get(ref["id"])
        if chunk is None:
            continue
        key = (chunk["resourceId"], ref["path"])
        if key in resource_paths:
            continue
        resource_paths.add(key)
        resource_refs.append({"id": chunk["resourceId"], "path": ref["path"]})
    resource_ids = _unique_ids(resource_refs)
    resources = await resolver.resources(resource_ids) if resource_ids else {}
    for ref in resource_refs:
        resource = resources.get(ref["id"])
        if resource is None or resource["deleted"]:
            issues.append(
                brick_issue(
                    "RESOURCE_NOT_FOUND",
                    ref["path"],
                    f'Unknown, deleted or inaccessible resource "{ref["id"]}".',
                )
            )
    if draft["type"] == "resource_excerpt":
        excerpt = payload
        chunk_id = excerpt["chunkId"]
        if chunk_id is not None:
            chunk = chunks.get(chunk_id)
            if chunk is not None and chunk["resourceId"] != excerpt["resourceId"]:
                issues.append(
                    brick_issue(
                        "CHUNK_RESOURCE_MISMATCH",
                        "payload.chunkId",
                        f'Passage "{chunk_id}" does not belong to resource "{excerpt["resourceId"]}".',
                    )
                )
        resource = resources.get(excerpt["resourceId"])
        if resource is not None and not resource["deleted"]:
            issues.extend(_location_issues(excerpt, resource))
    brick_refs = refs["bricks"]
    brick_ids = _unique_ids(brick_refs)
    if brick_ids:
        existing_bricks = await resolver.existing_brick_ids(str(draft["formationId"]), brick_ids)
        for ref in brick_refs:
            if ref["id"] not in existing_bricks:
                issues.append(
                    brick_issue(
                        "BRICK_REF_NOT_FOUND",
                        ref["path"],
                        f'Unknown brick "{ref["id"]}" in this formation.',
                    )
                )
    return issues


async def validate_brick(draft: Any, resolver: BrickReferenceResolver) -> dict[str, Any]:
    """Validates a draft and returns the normalized brick; raises `BrickInvalid` otherwise."""
    control = control_character_issues(draft)
    if control:
        raise BrickInvalid(control)
    data, issues = parse_draft(trim_deep(draft))
    if issues or data is None:
        raise BrickInvalid(issues)
    type_name = str(data["type"])
    payload = parse_brick_payload(type_name, data["payload"])
    definition = BRICK_REGISTRY[type_name]
    all_issues = unique_issues(
        [
            *definition.cross_check(payload),
            *common_issues(data, payload, definition),
            *(await reference_issues(data, payload, definition, resolver)),
        ]
    )
    if all_issues:
        raise BrickInvalid(all_issues)
    return {
        "type": type_name,
        "formationId": data["formationId"],
        "purpose": data["purpose"],
        "notionIds": list(data["notionIds"]),
        "origin": data["origin"],
        "payload": payload,
        "fingerprint": brick_fingerprint(type_name, payload),
    }


__all__ = [
    "BRICK_RESOURCE_KINDS",
    "BrickInvalid",
    "BrickReferenceResolver",
    "BrickResourceInfo",
    "common_issues",
    "control_character_issues",
    "parse_brick_payload",
    "reference_issues",
    "trim_deep",
    "validate_brick",
]
