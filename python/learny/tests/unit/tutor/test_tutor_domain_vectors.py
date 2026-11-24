"""[SPEC-2204] Tutor domain against the reference oracle (SPEC-610, CA-2).

The expected values of `api/oracles/vectors/tutor.json` are the reference recordingss
(`assembleContext`, `greetingOf`, `buildTutorChatPrompt`, `SourceMarkerFilter`, `resolveSources`,
`buildFollowUps`) and of the private helpers reproduced by the oracle script (2026-11-22). Equality
is strict: a divergence is a Python bug, never an oracle change (ADR-2008).
"""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import pytest
from learny.shared.locale_fr import tutor as texts
from learny.tutor.domain.context import ContextRecords, assemble_context, greeting_text
from learny.tutor.domain.events import (
    DONE,
    data_follow_ups,
    data_self_test,
    data_sources,
    error,
    finish,
    frame,
    start,
    text_delta,
    text_end,
    text_start,
)
from learny.tutor.domain.follow_ups import build_follow_ups
from learny.tutor.domain.prompts import (
    build_self_test_grade_prompt,
    build_self_test_question_prompt,
    build_tutor_chat_prompt,
)
from learny.tutor.domain.sources import SourceCandidate, SourceContext, SourceMarkerFilter, resolve_sources
from learny.tutor.domain.turn import (
    asks_for_test,
    looks_injection,
    mock_grade_scenario,
    scenario_for,
    summary_of,
    text_chunks,
)

pytestmark = pytest.mark.spec("SPEC-2204")

ORACLE = json.loads(
    (Path(__file__).resolve().parents[5] / "api" / "oracles" / "vectors" / "tutor.json").read_text(
        encoding="utf-8"
    )
)
CONTEXT_CASES = ORACLE["context"]
PROMPT_CASES = ORACLE["prompts"]
TURN_CASES = ORACLE["turns"]
SOURCE_CASES = ORACLE["sources"]
FOLLOW_UP_CASES = ORACLE["followUps"]
SSE = ORACLE["sse"]


def records_of(case: dict[str, Any]) -> ContextRecords:
    raw = case["records"]
    return ContextRecords(
        formation_id=raw["formation_id"],
        formation_title=raw["formation_title"],
        objectives=tuple(raw["objectives"]),
        cadrage_profile=raw["cadrage_profile"],
        module_position=raw["module_position"],
        module_title=raw["module_title"],
        chapter_id=raw["chapter_id"],
        chapter_position=raw["chapter_position"],
        chapter_title=raw["chapter_title"],
        course_id=raw["course_id"],
        percent=raw["percent"],
        tone=raw["tone"],
        course_language=raw["course_language"],
        resources=tuple(raw["resources"]),
        gap=raw["gap"],
        sections=tuple({**section, "notionIds": tuple(section["notionIds"])} for section in raw["sections"]),
        notions=tuple(raw["notions"]),
        chunks=tuple(raw["chunks"]),
    )


@pytest.mark.parametrize("case", CONTEXT_CASES, ids=[case["name"] for case in CONTEXT_CASES])
def test_context_assembly_matches_typescript(case: dict[str, Any]) -> None:
    built = assemble_context(records_of(case), case["input"], case["question"])
    assert built.prompt_block == case["promptBlock"]
    assert built.resources_block == case["resourcesBlock"]
    assert built.included_keys == case["includedKeys"]
    assert built.items == case["items"]
    assert [asdict(source) for source in built.sources] == [
        {
            "chunk_id": source["chunkId"],
            "resource_id": source["resourceId"],
            "title": source["title"],
            "kind": source["kind"],
            "location": source["location"],
        }
        for source in case["sources"]
    ]
    assert built.gap_first is case["gapFirst"]
    assert built.notion_ids == case["notionIds"]
    assert built.passage_label == case["passageLabel"]
    assert built.passage_preview == case["passagePreview"]
    assert built.resource_titles == case["resourceTitles"]
    assert built.gap_nature_text == case["gapNatureText"]
    assert built.confusion == case["confusion"]
    assert built.profile == case["profile"]
    assert greeting_text(built) == case["greeting"]["content"]
    assert build_follow_ups(built.confusion) == case["greeting"]["followUps"]


@pytest.mark.parametrize("case", PROMPT_CASES, ids=[case["name"] for case in PROMPT_CASES])
def test_chat_prompt_matches_typescript(case: dict[str, Any]) -> None:
    source = case["input"]
    built = build_tutor_chat_prompt(
        source["profile"],
        source["includedKeys"],
        source["contextBlock"],
        source["history"],
        source["message"],
        source["gapFirst"],
    )
    assert built.id == case["expected"]["id"]
    assert built.version == case["expected"]["version"]
    assert built.system == case["expected"]["system"]
    assert built.messages == case["expected"]["messages"]


def test_self_test_prompts_use_the_same_sources() -> None:
    profile = {"tone": "vous", "courseLanguage": "fr"}
    question = build_self_test_question_prompt(
        profile, "Cl\u00e9 de comptabilisation", "<context>x</context>"
    )
    assert question.id == "self-test-question.self-test-question"
    assert question.messages == [
        {
            "role": "user",
            "content": (
                "<notion>Cl\u00e9 de comptabilisation</notion>\n<context><context>x</context></context>"
            ),
        }
    ]
    grade = build_self_test_grade_prompt(profile, "Q ?", ("A", "B"), "r\u00e9ponse")
    assert grade.id == "self-test-grade.self-test-grade"
    assert (
        grade.messages[0]["content"]
        == "<question>Q ?</question>\n<expected>A | B</expected>\n<answer>r\u00e9ponse</answer>"
    )


@pytest.mark.parametrize("case", TURN_CASES["scenarios"], ids=lambda case: case["text"][:24])
def test_turn_predicates_match_typescript(case: dict[str, Any]) -> None:
    assert scenario_for(case["text"], case["followUp"], case["gapFirst"]) == case["scenario"]
    assert asks_for_test(case["text"]) is case["asksForTest"]
    assert looks_injection(case["text"]) is case["looksInjection"]


@pytest.mark.parametrize("case", TURN_CASES["summary"], ids=lambda case: f"len-{case['length']}")
def test_summary_of_matches_typescript(case: dict[str, Any]) -> None:
    assert summary_of(case["history"]) == case["summary"]


@pytest.mark.parametrize("case", TURN_CASES["chunks"], ids=lambda case: f"len-{len(case['text'])}")
def test_text_chunks_match_typescript(case: dict[str, Any]) -> None:
    assert text_chunks(case["text"]) == case["chunks"]


@pytest.mark.parametrize("case", TURN_CASES["grades"], ids=lambda case: case["scenario"])
def test_mock_grade_scenario_matches_typescript(case: dict[str, Any]) -> None:
    assert mock_grade_scenario(case["answer"]) == case["scenario"]


@pytest.mark.parametrize("case", FOLLOW_UP_CASES, ids=lambda case: f"served-{case['served']}")
def test_follow_ups_match_typescript(case: dict[str, Any]) -> None:
    assert build_follow_ups(case["confusion"], case["served"]) == case["expected"]


def source_context() -> SourceContext:
    return SourceContext(
        candidates=tuple(
            SourceCandidate(
                chunk_id="chunk-1" if index == 0 else "chunk-2",
                resource_id="r1",
                title="Support de cours (PDF)",
                kind="pdf",
                location={"page": index + 12},
            )
            for index in range(2)
        ),
        chapter_position=3,
        primary_resource_title="Support de cours (PDF)",
    )


@pytest.mark.parametrize("case", SOURCE_CASES, ids=[case["name"] for case in SOURCE_CASES])
def test_source_marker_filter_matches_typescript(case: dict[str, Any]) -> None:
    marker_filter = SourceMarkerFilter()
    emitted = []
    for delta in case["deltas"]:
        out = marker_filter.push(delta)
        if out != "":
            emitted.append(out)
    text, tokens = marker_filter.finish()
    assert emitted == case["emitted"]
    assert text == case["text"]
    assert tokens == case["tokens"]
    resolved = resolve_sources(tokens, source_context())
    assert resolved.sources == case["sources"]
    assert resolved.cited_chunk_ids == case["cited"]
    assert resolved.invented == case["invented"]


def test_sse_error_and_self_test_sequences_match_typescript() -> None:
    self_test = SSE["selfTest"]
    frames = [
        frame(start(self_test["messageId"])),
        frame(text_start("self-test")),
        *(frame(text_delta("self-test", chunk)) for chunk in text_chunks(self_test["content"])),
        frame(text_end("self-test")),
        frame(data_self_test({"status": "pending"})),
        frame(finish()),
        DONE,
    ]
    assert "".join(frames) == self_test["body"]

    failure = SSE["error"]
    frames = [
        frame(start(failure["messageId"])),
        frame(text_start("tutor")),
        frame(error("La r\u00e9ponse n\u2019a pas pu \u00eatre obtenue.")),
    ]
    assert "".join(frames) == failure["body"]


@pytest.mark.parametrize("case", SSE["chat"], ids=[case["name"] for case in SSE["chat"]])
def test_sse_chat_sequence_matches_typescript(case: dict[str, Any]) -> None:
    candidates = tuple(
        SourceCandidate(
            chunk_id=chunk_id,
            resource_id="r1",
            title="Support de cours (PDF)",
            kind="pdf",
            location={"page": index + 1},
        )
        for index, chunk_id in enumerate(case["candidates"])
    )
    context = SourceContext(
        candidates=candidates,
        chapter_position=3,
        primary_resource_title="Support de cours (PDF)",
    )
    frames = [frame(start(case["messageId"]))]
    marker_filter = SourceMarkerFilter()
    visible = ""
    frames.append(frame(text_start("tutor")))
    for delta in case["deltas"]:
        text = marker_filter.push(delta)
        if text != "":
            visible += text
            frames.append(frame(text_delta("tutor", text)))
    finished_text, tokens = marker_filter.finish()
    if len(finished_text) > len(visible):
        frames.append(frame(text_delta("tutor", finished_text[len(visible) :])))
        visible = finished_text
    frames.append(frame(text_end("tutor")))
    resolved = resolve_sources(tokens if tokens else ["course"], context)
    sources = (
        resolved.sources
        if resolved.sources
        else [{"label": texts.TUTOR_SOURCE_KNOWN.format(title="Support de cours")}]
    )
    follow_ups = build_follow_ups({"left": "Cl\u00e9 de comptabilisation", "right": "Compte de tiers"})
    frames.extend(
        [
            frame(data_sources(sources)),
            frame(data_follow_ups(follow_ups)),
            frame(finish()),
            DONE,
        ]
    )
    assert "".join(frames) == case["body"]
    assert visible == case["visible"]
