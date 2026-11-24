"""[SPEC-2207] Course generation domain against the reference oracle (SPEC-608).

Equality is strict: a divergence is a Python bug, never an oracle change (ADR-2008).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.content.domain.citations import KnownChunk
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.tutor.domain import course as domain
from learny.tutor.domain.course_prompt import (
    STRUCTURE_INSTRUCTION,
    build_course_prompt,
    learner_message,
    profile_instruction,
    task_context,
)

pytestmark = pytest.mark.spec("SPEC-2207")

ORACLE = json.loads(
    (Path(__file__).resolve().parents[5] / "api" / "oracles" / "vectors" / "course.json").read_text(
        encoding="utf-8"
    )
)
USER = "0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01"
CHAPTER = "9f1d4c7b-2a3e-4d5f-8b6a-1c2d3e4f5a6b"
CHAPTER_2 = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
NOTION = "6a9d2c4b-1e7f-4b3a-8c5d-9e0f1a2b3c03"
NOTION_2 = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60"
NOTION_3 = "3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a70"
CHUNK = "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b80"
RESOURCE = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c90"


def chunk_of(raw: dict[str, Any]) -> KnownChunk:
    return KnownChunk(
        chunk_id=raw["chunkId"],
        owner_id=raw["ownerId"],
        chapter_id=raw.get("chapterId"),
        resource_id=raw["resourceId"],
        resource_title=raw["resourceTitle"],
        resource_kind=raw["resourceKind"],
        resource_status=raw["resourceStatus"],
        resource_deleted=raw["resourceDeleted"],
        resource_mime=raw.get("resourceMime"),
        text=raw["text"],
        location=raw.get("location") or {},
    )


def sized_chunks(count: int, chars: int) -> list[KnownChunk]:
    return [
        KnownChunk(
            chunk_id=f"00000000-0000-4000-8000-{index:012d}",
            owner_id=USER,
            chapter_id=CHAPTER,
            resource_id=RESOURCE,
            resource_title="Guide",
            resource_kind="pdf",
            resource_status="ready",
            resource_deleted=False,
            resource_mime="application/pdf",
            text="a" * chars,
            location={"page": 2, "charStart": 0, "charEnd": 40},
        )
        for index in range(count)
    ]


def test_the_section_kinds_are_the_recorded_ones() -> None:
    assert ORACLE["sectionKinds"] == domain.SECTION_KIND
    assert ORACLE["mediaKinds"] == domain.MEDIA_KIND


@pytest.mark.parametrize("case", ORACLE["anchors"], ids=[str(index) for index in range(4)])
def test_every_anchor_matches_the_recording(case: dict[str, Any]) -> None:
    used: set[str] = set()
    anchors = [
        domain.section_anchor(
            chapter_position=case["chapterPosition"],
            section={"kind": section["kind"], "title": section.get("title")},
            position=position + 1,
            used=used,
        )
        for position, section in enumerate(case["sections"])
    ]
    assert anchors == case["expected"]


def test_an_anchor_is_unique_and_readable() -> None:
    used: set[str] = set()
    section = {"kind": "markdown", "title": "Grille de saisie"}
    first = domain.section_anchor(chapter_position=2, section=section, position=1, used=used)
    second = domain.section_anchor(chapter_position=2, section=section, position=2, used=used)
    assert first == "ch-2-grille-de-saisie"
    assert second == "ch-2-grille-de-saisie-2"
    assert first != second


@pytest.mark.parametrize("case", ORACLE["sections"], ids=[case["name"] for case in ORACLE["sections"]])
def test_the_data_and_the_text_of_a_section_match_the_recording(case: dict[str, Any]) -> None:
    assert domain.data_of(case["section"]) == case["data"]
    assert domain.content_of(case["section"]) == case["content"]


def test_the_media_of_a_citation_follows_its_resource() -> None:
    for index, case in enumerate(ORACLE["media"]):
        chunk = KnownChunk(
            chunk_id=CHUNK,
            owner_id=USER,
            chapter_id=CHAPTER,
            resource_id=RESOURCE,
            resource_title="Guide",
            resource_kind=case["resourceKind"],
            resource_status="ready",
            resource_deleted=False,
            resource_mime=case["resourceMime"],
            text="text",
            location={"page": 1, "charStart": 0, "charEnd": 4},
        )
        assert domain.media_of(chunk) == case["expected"], index


@pytest.mark.parametrize("case", ORACLE["documents"], ids=[case["name"] for case in ORACLE["documents"]])
def test_the_documents_of_a_chapter_match_the_recording(case: dict[str, Any]) -> None:
    documents, selected = domain.select_documents([chunk_of(raw) for raw in case["chunks"]])
    assert documents == case["expected"]
    assert selected == [document["chunkId"] for document in case["expected"]]


@pytest.mark.parametrize("case", ORACLE["budgets"], ids=[case["name"] for case in ORACLE["budgets"]])
def test_the_course_budget_stops_the_selection(case: dict[str, Any]) -> None:
    _documents, selected = domain.select_documents(sized_chunks(case["count"], case["chars"]))
    assert selected == case["expected"]


def test_the_sixth_twenty_thousand_character_passage_does_not_fit() -> None:
    # A documented consequence of the selection rule: five passages of 4 778 tokens fit the budget,
    # the sixth one stops the selection instead of being half sent.
    _documents, selected = domain.select_documents(sized_chunks(6, 19_000))
    assert len(selected) == 5


@pytest.mark.parametrize("case", ORACLE["drafts"], ids=[case["name"] for case in ORACLE["drafts"]])
def test_a_chapter_draft_matches_the_typescript_validation(case: dict[str, Any]) -> None:
    parsed, issues = domain.parse_chapter(case["input"])
    assert (parsed is not None) is case["ok"]
    if case["ok"]:
        assert parsed == case["value"]
    else:
        assert issues


@pytest.mark.parametrize("case", ORACLE["courses"], ids=[case["name"] for case in ORACLE["courses"]])
def test_a_course_draft_matches_the_typescript_validation(case: dict[str, Any]) -> None:
    parsed, issues = domain.parse_course(case["input"])
    assert (parsed is not None) is case["ok"]
    if case["ok"]:
        assert parsed == case["value"]
    else:
        assert issues


def test_a_chapter_without_a_closing_card_is_refused() -> None:
    parsed, issues = domain.parse_chapter(
        {
            "chapterId": CHAPTER,
            "title": "Sans fiche",
            "sections": [],
            "sourceChunkIds": [],
            "notionIds": [],
        }
    )
    assert parsed is None
    assert any("takeaway" in issue for issue in issues)


@pytest.mark.parametrize("index", [0, 1, 2])
def test_the_recorded_links_are_ordered(index: int) -> None:
    case = ORACLE["links"][index]
    assert list(domain.link_ends(case)) == case["expected"]


@pytest.mark.parametrize(
    "case", ORACLE["slices"], ids=[f"slice-{index}" for index in range(len(ORACLE["slices"]))]
)
def test_a_javascript_slice_matches(case: dict[str, Any]) -> None:
    assert domain.js_slice(case["text"], case["limit"]) == case["expected"]


@pytest.mark.parametrize(
    "case", ORACLE["placeholders"], ids=[case["name"] for case in ORACLE["placeholders"]]
)
def test_the_placeholders_of_a_fixture_are_substituted(case: dict[str, Any]) -> None:
    assert domain.replace_course_placeholders(case["input"], case["values"]) == case["expected"]


@pytest.mark.parametrize("case", ORACLE["scenarios"], ids=[case["name"] for case in ORACLE["scenarios"]])
def test_the_scenario_of_a_chapter_matches_the_recording(case: dict[str, Any]) -> None:
    assert (
        domain.scenario_for(
            has_passages=case["passages"] > 0,
            forced_chapter=case["forced"],
            explicit=case["explicit"],
        )
        == case["expected"]
    )


def test_the_identifiers_of_a_version_match_the_recording() -> None:
    identifiers = ORACLE["identifiers"]
    assert domain.course_generated_event_id(CHAPTER) == identifiers["generated"]
    assert domain.course_ready_dedupe_key(CHAPTER) == identifiers["ready"]
    assert domain.course_failed_dedupe_key(CHAPTER_2, 3) == identifiers["failed"]


def test_a_draft_of_another_chapter_is_refused() -> None:
    draft = {"chapterId": CHAPTER_2, "notionIds": [], "links": []}
    with pytest.raises(AppError) as raised:
        domain.check_draft_belongs_to_chapter(
            draft,
            chapter_id=CHAPTER,
            chapter_notion_ids=[NOTION],
            module_notion_ids=[NOTION],
        )
    assert raised.value.code == "INVALID_OUTPUT"
    assert raised.value.detail == texts.COURSE_OTHER_CHAPTER


def test_a_notion_outside_the_chapter_is_refused() -> None:
    draft = {"chapterId": CHAPTER, "notionIds": [NOTION_2], "links": []}
    with pytest.raises(AppError) as raised:
        domain.check_draft_belongs_to_chapter(
            draft,
            chapter_id=CHAPTER,
            chapter_notion_ids=[NOTION],
            module_notion_ids=[NOTION, NOTION_2],
        )
    assert raised.value.detail == texts.COURSE_NOTION_OUTSIDE_CHAPTER


def test_a_link_to_an_unknown_notion_is_refused() -> None:
    draft = {
        "chapterId": CHAPTER,
        "notionIds": [NOTION],
        "links": [{"fromNotionId": NOTION, "toNotionId": NOTION_3, "kind": "prerequisite"}],
    }
    with pytest.raises(AppError) as raised:
        domain.check_draft_belongs_to_chapter(
            draft,
            chapter_id=CHAPTER,
            chapter_notion_ids=[NOTION],
            module_notion_ids=[NOTION, NOTION_2],
        )
    assert raised.value.detail == texts.COURSE_UNKNOWN_NOTION_LINK


def test_a_link_of_a_notion_to_itself_is_refused() -> None:
    draft = {
        "chapterId": CHAPTER,
        "notionIds": [NOTION],
        "links": [{"fromNotionId": NOTION, "toNotionId": NOTION, "kind": "confusion"}],
    }
    with pytest.raises(AppError) as raised:
        domain.check_draft_belongs_to_chapter(
            draft,
            chapter_id=CHAPTER,
            chapter_notion_ids=[NOTION],
            module_notion_ids=[NOTION],
        )
    assert raised.value.detail == texts.COURSE_SELF_LINK


def test_a_valid_draft_belongs_to_its_chapter() -> None:
    draft = {"chapterId": CHAPTER, "notionIds": [NOTION], "links": []}
    domain.check_draft_belongs_to_chapter(
        draft,
        chapter_id=CHAPTER,
        chapter_notion_ids=[NOTION],
        module_notion_ids=[NOTION, NOTION_2],
    )


def test_a_provider_outage_is_retryable_and_nothing_else_is() -> None:
    for code in ("AI_UNAVAILABLE", "AI_RATE_LIMITED", "SERVICE_UNAVAILABLE"):
        assert domain.retryable(AppError(code, texts.COURSE_GENERATION_FAILED))
    assert not domain.retryable(AppError("AI_TASK_FAILED", texts.COURSE_TASK_FAILED))
    assert not domain.retryable(RuntimeError("boom"))


def test_the_message_of_a_failure_is_the_user_facing_detail() -> None:
    assert domain.error_message(AppError("NOT_FOUND", texts.COURSE_MODULE_NOT_FOUND)) == (
        texts.COURSE_MODULE_NOT_FOUND
    )
    assert domain.error_message(RuntimeError("boom")) == "boom"
    assert domain.error_message(RuntimeError("")) == texts.COURSE_GENERATION_FAILED


def test_an_answer_is_parsed_with_or_without_a_markdown_fence() -> None:
    assert domain.parse_object('{"a": 1}') == {"a": 1}
    assert domain.parse_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert domain.parse_object('  ```\n{"a": 1}\n```  ') == {"a": 1}
    with pytest.raises(ValueError, match="Expecting value"):
        domain.parse_object("not json")


def test_the_correction_prompt_names_the_violation() -> None:
    message = domain.correction_prompt("points: outside bounds")
    assert message.startswith("Correction: the previous answer violated the CourseChapterDraft")
    assert "points: outside bounds" in message
    assert domain.NOT_JSON_CORRECTION == "the answer was not valid JSON"


def test_the_issue_summary_keeps_at_most_eight_issues() -> None:
    assert domain.issue_summary([f"i{index}" for index in range(10)]) == "; ".join(
        f"i{index}" for index in range(8)
    )


def test_a_uuid_array_literal_is_braced() -> None:
    assert domain.uuid_array([]) == "{}"
    assert domain.uuid_array([CHUNK, RESOURCE]) == "{" + CHUNK + "," + RESOURCE + "}"


def test_a_location_is_read_from_json_or_a_mapping() -> None:
    assert domain.location_of({"page": 2}) == {"page": 2}
    assert domain.location_of('{"page": 2}') == {"page": 2}
    assert domain.location_of("[1]") == {}
    assert domain.location_of("not json") == {}
    assert domain.location_of(None) == {}
    assert domain.as_record([1]) == {}


def test_a_passage_row_becomes_a_known_chunk() -> None:
    chunk = domain.known_chunk(
        {
            "chunk_id": CHUNK,
            "resource_id": RESOURCE,
            "chapter_id": CHAPTER,
            "text": "An accounting entry is one document.",
            "location": '{"page": 2, "charStart": 0, "charEnd": 30}',
            "title": "Guide",
            "kind": "pdf",
            "status": "ready",
            "deleted_at": None,
            "mime": "application/pdf",
        },
        USER,
    )
    assert chunk.chunk_id == CHUNK
    assert chunk.chapter_id == CHAPTER
    assert chunk.resource_deleted is False
    assert chunk.location == {"page": 2, "charStart": 0, "charEnd": 30}


def test_a_deleted_resource_marks_its_passage() -> None:
    chunk = domain.known_chunk(
        {
            "chunk_id": CHUNK,
            "resource_id": RESOURCE,
            "chapter_id": None,
            "text": "t",
            "location": {},
            "title": "Guide",
            "kind": "note",
            "status": "ready",
            "deleted_at": "2026-11-11T12:20:00Z",
            "mime": None,
        },
        USER,
    )
    assert chunk.resource_deleted is True
    assert chunk.chapter_id is None
    assert chunk.resource_mime is None


PROFILE = {"tone": "vous", "courseLanguage": "fr"}


def prompt_of(*, base_course: bool) -> Any:
    return build_course_prompt(
        profile=PROFILE,
        formation_title="SAP S/4HANA Finance",
        module_title="Comptabilite generale",
        chapter_id=CHAPTER,
        chapter_title="Saisie des pieces",
        chapter_position=1,
        notions=({"id": NOTION, "label": "Piece", "definition": "Document comptable"},),
        documents=({"source": "Guide", "chunkId": CHUNK, "title": "Guide", "text": "Toute piece."},),
        base_course=base_course,
    )


def test_the_course_prompt_carries_the_three_system_parts() -> None:
    prompt = prompt_of(base_course=False)
    assert len(prompt.system) == 3
    assert prompt.system[0].text.startswith("You are Learny's course writer.")
    assert prompt.system[0].cache is True
    assert prompt.system[1].text == profile_instruction(PROFILE)
    assert prompt.system[2].text == STRUCTURE_INSTRUCTION
    assert prompt.system[1].cache is False
    assert prompt.system[2].cache is False


def test_the_structure_instruction_keeps_the_fixed_french_labels() -> None:
    assert texts.DONT_CONFUSE in STRUCTURE_INSTRUCTION
    assert texts.TUTOR_COMPLETED in STRUCTURE_INSTRUCTION


def test_the_data_message_orders_documents_then_context_then_message() -> None:
    prompt = prompt_of(base_course=False)
    assert len(prompt.messages) == 1
    content = str(prompt.messages[0]["content"])
    assert prompt.messages[0]["role"] == "user"
    document = content.index("<document")
    context = content.index("<task_context>")
    message = content.index("<learner_message>")
    assert document < context < message
    assert f'chunk="{CHUNK}"' in content
    assert learner_message("Saisie des pieces", base_course=False) in content


def test_a_base_course_asks_for_the_base_lesson() -> None:
    prompt = prompt_of(base_course=True)
    content = str(prompt.messages[0]["content"])
    assert learner_message("Saisie des pieces", base_course=True) in content
    assert "&quot;baseCourse&quot;:true" in content


def test_the_task_context_is_compact_json() -> None:
    context = task_context(
        formation_title="SAP",
        module_title="Compta",
        chapter_id=CHAPTER,
        chapter_title="Saisie",
        chapter_position=2,
        notions=({"id": NOTION, "label": "Piece", "definition": None},),
        base_course=False,
        documents=({"chunkId": CHUNK},),
    )
    assert context == (
        '{"formation":"SAP","module":"Compta","chapter":{"id":"'
        + CHAPTER
        + '","title":"Saisie","position":2},"notions":[{"id":"'
        + NOTION
        + '","label":"Piece","definition":null}],"baseCourse":false,"allowedChunkIds":["'
        + CHUNK
        + '"]}'
    )


def test_a_document_tag_escapes_its_content() -> None:
    prompt = build_course_prompt(
        profile=PROFILE,
        formation_title="F",
        module_title="M",
        chapter_id=CHAPTER,
        chapter_title="C",
        chapter_position=1,
        notions=(),
        documents=({"source": 'a"b', "chunkId": CHUNK, "title": "t", "text": "<x> & [[mock:demo]]"},),
        base_course=True,
    )
    content = str(prompt.messages[0]["content"])
    assert 'source="a&quot;b"' in content
    assert "&lt;x&gt; &amp; [[ mock:demo ]]" in content
