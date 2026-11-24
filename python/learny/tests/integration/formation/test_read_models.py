"""[SPEC-2201] Read models: notion map, global search and active programme (notion-graph, search)."""

from typing import Any, cast

import pytest
from factories.db_support import rolled_back
from factories.formation_support import formation_deps
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_notion_state,
    create_user,
)
from learny.formation.application import notion_graph as graph_service
from learny.formation.application import programme as programme_service
from learny.formation.application import search as search_service
from learny.formation.domain import search as search_rules
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import FORMATION_NOT_FOUND
from learny_api.generated.models import NotionGraphGetOutput, ProgrammeGetOutput, SearchGlobalOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")


async def test_highlights_ignore_case_and_accents() -> None:
    # "Le reseau informatique et le Reseau local" with accents: the fold compares "reseau".
    text_value = "Le r\u00e9seau informatique et le R\u00e9seau local"
    highlights = search_rules.compute_highlights(text_value, "reseau")
    assert [text_value[item["start"] : item["end"]] for item in highlights] == [
        "r\u00e9seau",
        "R\u00e9seau",
    ]


async def test_snippet_is_plain_text_and_bounded() -> None:
    long_text = "# Titre\n\n" + ("Un texte **important** sur le r\u00e9seau. " * 20)
    snippet = search_rules.build_snippet(long_text, "reseau")
    assert len(snippet["snippet"]) <= search_rules.SEARCH_SNIPPET_MAX_LENGTH
    assert "**" not in snippet["snippet"]
    assert snippet["snippet"].endswith("\u2026")
    assert snippet["highlights"]


@pytest.mark.parametrize(
    ("query", "message"),
    [
        ("a", "Saisissez au moins 2 caract\u00e8res."),
        ("  a  ", "Saisissez au moins 2 caract\u00e8res."),
        ("\n\t", "Saisissez au moins 2 caract\u00e8res."),
        ("x" * 101, "Recherche limit\u00e9e \u00e0 100 caract\u00e8res."),
    ],
)
async def test_search_refusals_use_the_messages_of_the_interface(query: str, message: str) -> None:
    # EF-1: SEARCH_TOO_SHORT_MESSAGE / SEARCH_TOO_LONG_MESSAGE of `packages/contracts`, never the
    # generic text of the validation library. The query is checked before any database access.
    with pytest.raises(AppError) as raised:
        await search_service.search_user_content(cast(Any, None), cast(Any, None), query, 5)
    assert raised.value.code == "VALIDATION_FAILED"
    assert raised.value.extra["errors"] == [{"path": "query.q", "message": message}]


async def test_notion_graph_lists_nodes_links_and_stats(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1)
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        notion_id = await create_notion(tx.conn, formation_id, module_id, chapter_id)
        await create_notion_state(tx.conn, alice, notion_id, gap_nature="forgetting")
        deps = formation_deps(tx)
        return await graph_service.get_notion_graph(deps, actor_for(alice), formation_id)

    graph = await rolled_back(database, run)
    parsed = NotionGraphGetOutput.model_validate(graph)
    kinds = [node.kind for node in parsed.nodes]
    assert kinds == ["formation", "module", "notion"]
    assert parsed.stats.notions == 1
    assert parsed.stats.openGaps == 1
    assert parsed.gaps[0].href.startswith("/formations/")
    assert parsed.links
    assert parsed.timezone == "Europe/Paris"


async def test_notion_graph_of_a_foreign_formation_is_a_404(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        formation_id = await create_formation(tx.conn, alice, status="active")
        deps = formation_deps(tx)
        with pytest.raises(AppError) as failure:
            await graph_service.get_notion_graph(deps, actor_for(bob), formation_id)
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "NOT_FOUND"
    assert error.detail == FORMATION_NOT_FOUND


async def test_search_returns_the_owner_notions(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1)
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id)
        await tx.conn.execute(
            text(
                "update public.notions set label = 'Le r\u00e9seau SAP', "
                "short_definition = 'Un r\u00e9seau de partenaires.' where id = "
                "(select id from public.notions where formation_id = cast(:id as uuid) limit 1)"
            ),
            {"id": formation_id},
        )
        deps = formation_deps(tx)
        return await search_service.search_user_content(deps, actor_for(alice), "reseau", 10)

    response = await rolled_back(database, run)
    parsed = SearchGlobalOutput.model_validate(response)
    assert parsed.query == "reseau"
    assert parsed.groups
    assert parsed.groups[0].items[0].title == "Le r\u00e9seau SAP"
    assert parsed.groups[0].items[0].highlights


async def test_active_programme_exposes_modules_and_calendar(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        await tx.conn.execute(
            text(
                "update public.formations set start_date = '2026-11-02', "
                "end_date = '2026-12-11', volume_hours = 150, default_threshold = 80 "
                "where id = cast(:id as uuid)"
            ),
            {"id": formation_id},
        )
        module_id = await create_module(tx.conn, formation_id, 1)
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id)
        await tx.conn.execute(
            text(
                "update public.modules set planned_start = '2026-11-02', "
                "planned_end = '2026-11-20' where id = cast(:id as uuid)"
            ),
            {"id": module_id},
        )
        deps = formation_deps(tx)
        return await programme_service.get_programme_state(deps, actor_for(alice), formation_id, {})

    state = await rolled_back(database, run)
    parsed = ProgrammeGetOutput.model_validate(state)
    root = parsed.root
    assert hasattr(root, "modules")
    active = cast(Any, root)
    assert active.formation.status == "active"
    assert active.formation.startDate == "2026-11-02"
    assert active.modules[0].quizKind == "exam"
    assert active.indicators.progress.total == 1
    assert active.calendar[0].moduleId == active.modules[0].id


async def test_module_label_is_the_french_label() -> None:
    from learny.shared.locale_fr.details import MODULE_LABEL

    assert MODULE_LABEL.format(position=1, title="SAP") == "Module 1 \u00b7 SAP"
