"""Notion map of one formation (SPEC-616 ET-3 to ET-5; BR-CAR-01 to 05).

Port of `notion-graph/get-graph.ts`. Every read runs in the learner's RLS transaction: a formation
of another learner is invisible and therefore a 404, never an empty graph. The projection itself
lives in `learny.formation.domain.notion_graph`.
"""

from dataclasses import dataclass
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.domain import notion_graph as rules
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import FORMATION_NOT_FOUND
from learny.shared.time import to_iso


@dataclass(frozen=True, slots=True)
class GraphFormation:
    """The three facts the graph needs from the formation row."""

    id: str
    title: str
    timezone: str


@dataclass(frozen=True, slots=True)
class GraphModule:
    id: str
    position: int
    title: str
    threshold: int


@dataclass(frozen=True, slots=True)
class GraphNotion:
    id: str
    label: str
    definition: str | None
    module_id: str
    chapter_id: str
    chapter_position: int
    notion_position: int
    module_position: int
    module_title: str
    threshold: int
    mastery: float | None
    gap_nature: str | None
    gap_cleared_at: Any
    section_id: str | None
    section_anchor: str | None


@dataclass(frozen=True, slots=True)
class GraphLink:
    id: str
    from_notion_id: str
    to_notion_id: str
    kind: str


@dataclass(frozen=True, slots=True)
class GraphResource:
    id: str
    title: str
    chapter_id: str | None
    created_at: Any


@dataclass(frozen=True, slots=True)
class GraphModel:
    formation: GraphFormation
    modules: list[GraphModule]
    notions: list[GraphNotion]
    links: list[GraphLink]
    resources: list[GraphResource]


async def get_notion_graph(deps: FormationDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """ET-3 - the graph of one formation, read under the learner's RLS client."""
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_graph_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        modules, notions, links, resources = await queries.read_graph_rows(tx, actor.user_id, formation_id)
        model = GraphModel(
            formation=GraphFormation(
                id=str(formation["id"]),
                title=str(formation["title"]),
                timezone=str(formation["timezone"]),
            ),
            modules=[
                GraphModule(
                    id=str(row["id"]),
                    position=int(row["position"]),
                    title=str(row["title"]),
                    threshold=int(row["threshold"]),
                )
                for row in modules
            ],
            notions=[
                GraphNotion(
                    id=str(row["id"]),
                    label=str(row["label"]),
                    definition=None if row["definition"] is None else str(row["definition"]),
                    module_id=str(row["module_id"]),
                    chapter_id=str(row["chapter_id"]),
                    chapter_position=int(row["chapter_position"]),
                    notion_position=int(row["notion_position"]),
                    module_position=int(row["module_position"]),
                    module_title=str(row["module_title"]),
                    threshold=int(row["threshold"]),
                    mastery=None if row["mastery"] is None else float(row["mastery"]),
                    gap_nature=None if row["gap_nature"] is None else str(row["gap_nature"]),
                    gap_cleared_at=row["gap_cleared_at"],
                    section_id=None if row["section_id"] is None else str(row["section_id"]),
                    section_anchor=(None if row["section_anchor"] is None else str(row["section_anchor"])),
                )
                for row in notions
            ],
            links=[
                GraphLink(
                    id=str(row["id"]),
                    from_notion_id=str(row["from_notion_id"]),
                    to_notion_id=str(row["to_notion_id"]),
                    kind=str(row["kind"]),
                )
                for row in links
            ],
            resources=[
                GraphResource(
                    id=str(row["id"]),
                    title=str(row["title"]),
                    chapter_id=None if row["chapter_id"] is None else str(row["chapter_id"]),
                    created_at=row["created_at"],
                )
                for row in resources
            ],
        )
        return rules.build_graph(model, to_iso(deps.clock.now()))
