"""Read model of the notion map (SPEC-616 EF-1 to EF-5, ET-3 to ET-5; BR-CAR-01 to 05).

The projection is pure: the service reads the rows under the learner's RLS transaction and this
module decides the nodes, the typed links, the gap cards and the statistics. A contribution belongs
to a chapter, so it feeds every notion of that chapter (ADR-0307): the graph never invents a private
relation.
"""

import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import quote

from learny.shared.locale_fr.details import MODULE_LABEL

# `RECOMMENDED_ACTION_BY_NATURE` of the learning engine (BR-LAC-04).
RECOMMENDED_ACTION_BY_NATURE: Mapping[str, str] = {
    "forgetting": "global_quiz",
    "confusion": "confrontation",
    "misunderstanding": "alternative_explanation",
    "application": "practice_exercise",
}

GAP_NATURES = tuple(RECOMMENDED_ACTION_BY_NATURE)
MASTERY_STATUSES = ("upcoming", "to_consolidate", "mastered")


def encode(value: str) -> str:
    """`encodeURIComponent`: one path segment of a notion link."""
    return quote(value, safe="-_.!~*'()")


def course_target(
    formation_id: str, module_id: str, chapter_id: str, section: Mapping[str, str] | None
) -> dict[str, str] | None:
    """ET-5 - the course action points to the exact section, or does not exist at all."""
    anchor = (section.get("anchor") or "").strip() if section is not None else ""
    if section is None or anchor == "":
        return None
    href = (
        f"/formations/{encode(formation_id)}/modules/{encode(module_id)}/cours"
        f"?chapitre={encode(chapter_id)}#{encode(anchor)}"
    )
    return {"sectionId": section["sectionId"], "anchor": anchor, "href": href}


def training_target(formation_id: str, module_id: str, notion_id: str, nature: str) -> dict[str, str]:
    """BR-LAC-04 - only `application` opens an exercise; the other natures open the quiz."""
    if RECOMMENDED_ACTION_BY_NATURE.get(nature) == "practice_exercise":
        return {
            "kind": "exercise",
            "href": (
                f"/formations/{encode(formation_id)}/modules/{encode(module_id)}/exercices"
                f"?notion={encode(notion_id)}"
            ),
        }
    return {
        "kind": "quiz",
        "href": f"/formations/{encode(formation_id)}/quiz-global?cible={encode(notion_id)}",
    }


def gap_href(formation_id: str, nature: str) -> str:
    """The remediation page of one gap nature."""
    return f"/formations/{encode(formation_id)}/lacunes?nature={encode(nature)}"


def notion_node_id(identifier: str) -> str:
    """`notionLinkIds`: the node identifier of a formation, a module, a notion or a resource."""
    return f"notion:{identifier}"


def mastery_status(mastery: float | None, threshold: int, has_open_gap: bool) -> str:
    """ET-3 - an unknown mastery is `upcoming`; an open gap always asks for consolidation."""
    if mastery is None:
        return "upcoming"
    if has_open_gap:
        return "to_consolidate"
    return "mastered" if mastery >= threshold else "to_consolidate"


def _empty_node(identifier: str, kind: str, label: str, order: int) -> dict[str, Any]:
    return {
        "id": notion_node_id(identifier),
        "kind": kind,
        "label": label,
        "order": order,
        "moduleId": None,
        "modulePosition": None,
        "moduleTitle": None,
        "chapterPosition": None,
        "notionPosition": None,
        "definition": None,
        "mastery": None,
        "masteryStatus": None,
        "gapNature": None,
        "courseHref": None,
        "trainingHref": None,
        "gapHref": None,
    }


def build_nodes(model: Any, formation_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    """`buildNodes`: the formation, its modules, its notions and the learner's own sources."""
    nodes: list[dict[str, Any]] = []
    gaps: list[dict[str, Any]] = []
    order = 0
    nodes.append(_empty_node(formation_id, "formation", model.formation.title, order))
    order += 1
    for module in model.modules:
        node = _empty_node(
            module.id, "module", MODULE_LABEL.format(position=module.position, title=module.title), order
        )
        node.update(
            {
                "moduleId": module.id,
                "modulePosition": module.position,
                "moduleTitle": module.title,
            }
        )
        nodes.append(node)
        order += 1

    for notion in model.notions:
        open_gap = notion.gap_nature is not None and notion.gap_cleared_at is None
        status = mastery_status(notion.mastery, notion.threshold, open_gap)
        section = (
            None
            if notion.section_id is None or notion.section_anchor is None
            else {"sectionId": notion.section_id, "anchor": notion.section_anchor}
        )
        target = course_target(formation_id, notion.module_id, notion.chapter_id, section)
        href = (
            target["href"]
            if target is not None
            else f"/formations/{encode(formation_id)}/modules/{encode(notion.module_id)}/cours"
        )
        if open_gap and notion.gap_nature is not None:
            training = training_target(formation_id, notion.module_id, notion.id, notion.gap_nature)["href"]
            notion_gap_href: str | None = gap_href(formation_id, notion.gap_nature)
            nature: str | None = notion.gap_nature
        else:
            training = f"/formations/{encode(formation_id)}/quiz-global?cible={encode(notion.id)}"
            notion_gap_href = None
            nature = None
        node = _empty_node(notion.id, "notion", notion.label, order)
        node.update(
            {
                "moduleId": notion.module_id,
                "modulePosition": notion.module_position,
                "moduleTitle": notion.module_title,
                "chapterPosition": notion.chapter_position,
                "notionPosition": notion.notion_position,
                "definition": notion.definition,
                "mastery": notion.mastery,
                "masteryStatus": status,
                "gapNature": nature,
                "courseHref": href,
                "trainingHref": training,
                "gapHref": notion_gap_href,
            }
        )
        nodes.append(node)
        order += 1
        if open_gap and notion.gap_nature is not None and notion.mastery is not None:
            gaps.append(
                {
                    "notionId": notion.id,
                    "label": notion.label,
                    "mastery": notion.mastery,
                    "nature": notion.gap_nature,
                    "href": notion_gap_href or gap_href(formation_id, notion.gap_nature),
                }
            )

    for resource in model.resources:
        nodes.append(_empty_node(resource.id, "source", resource.title, order))
        order += 1

    gaps.sort(key=lambda item: (item["mastery"], _fold(item["label"])))
    return nodes, gaps, len(model.links)


def _fold(value: str) -> str:
    """`localeCompare(fr)`: accent- and case-insensitive order."""
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).lower()


def build_links(model: Any) -> list[dict[str, Any]]:
    """`buildLinks`: formation membership, module containment, typed links and sources."""
    links: list[dict[str, Any]] = []
    for module in model.modules:
        links.append(
            {
                "id": f"formation:{module.id}",
                "from": notion_node_id(model.formation.id),
                "to": notion_node_id(module.id),
                "kind": "formation",
            }
        )
    for notion in model.notions:
        links.append(
            {
                "id": f"contains:{notion.id}",
                "from": notion_node_id(notion.module_id),
                "to": notion_node_id(notion.id),
                "kind": "contains",
            }
        )
    for link in model.links:
        links.append(
            {
                "id": f"notion-link:{link.id}",
                "from": notion_node_id(link.from_notion_id),
                "to": notion_node_id(link.to_notion_id),
                "kind": link.kind,
            }
        )
    notion_by_chapter: dict[str, list[str]] = {}
    for notion in model.notions:
        notion_by_chapter.setdefault(notion.chapter_id, []).append(notion.id)
    for resource in model.resources:
        fed = [] if resource.chapter_id is None else notion_by_chapter.get(resource.chapter_id, [])
        for notion_id in fed:
            links.append(
                {
                    "id": f"source:{resource.id}:{notion_id}",
                    "from": notion_node_id(resource.id),
                    "to": notion_node_id(notion_id),
                    "kind": "source",
                }
            )
    return links


def build_graph(model: Any, generated_at: str) -> dict[str, Any]:
    """`getNotionGraph`: the validated DTO of one formation graph."""
    formation_id = model.formation.id
    nodes, gaps, relation_links = build_nodes(model, formation_id)
    notion_nodes = [node for node in nodes if node["kind"] == "notion"]
    return {
        "formationId": formation_id,
        "formationTitle": model.formation.title,
        "timezone": model.formation.timezone,
        "generatedAt": generated_at,
        "nodes": nodes,
        "links": build_links(model),
        "gaps": gaps,
        "stats": {
            "notions": len(notion_nodes),
            "links": relation_links,
            "modules": len(model.modules),
            "mastered": sum(1 for node in notion_nodes if node["masteryStatus"] == "mastered"),
            "upcoming": sum(1 for node in notion_nodes if node["masteryStatus"] == "upcoming"),
            "openGaps": len(gaps),
        },
    }


def sequence_of(values: Sequence[Any]) -> list[Any]:
    """A plain list, for the frozen rows the service hands to the projection."""
    return list(values)
