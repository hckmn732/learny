"""[SPEC-2202] Reference SAP dataset (SPEC-401 ET-7, CA-6).

Ported from `packages/learning-engine/src/fixtures/sap-reference.test.ts`. The dataset itself is
recorded from TypeScript (`learning_engine_reference.json`); the cases below assert its shape, so a
change in the recording breaks one place only.
"""

import pytest
from factories.learning_support import (
    REFERENCE_NOW,
    SAP_AVAILABILITY,
    SAP_CHAPTERS,
    SAP_FORMATION,
    SAP_GAPS_AT_REFERENCE,
    SAP_LINKS,
    SAP_MASTERY_AT_REFERENCE,
    SAP_MODULES,
    SAP_NOTIONS,
)

pytestmark = pytest.mark.spec("SPEC-2202")

MODULES = ("sap-m1", "sap-m2", "sap-m3", "sap-m4", "sap-m5", "sap-m6", "sap-m7")


def test_the_dataset_has_seven_modules_twenty_four_chapters_and_forty_eight_notions() -> None:
    assert len(SAP_MODULES) == 7
    assert len(SAP_CHAPTERS) == 24
    assert len(SAP_NOTIONS) == 48
    assert len({module["moduleId"] for module in SAP_MODULES}) == 7
    assert len({chapter["chapterId"] for chapter in SAP_CHAPTERS}) == 24
    assert len({notion["notionId"] for notion in SAP_NOTIONS}) == 48


def test_every_notion_belongs_to_exactly_one_chapter_of_its_module() -> None:
    for notion in SAP_NOTIONS:
        module = next(
            (candidate for candidate in SAP_MODULES if candidate["moduleId"] == notion["moduleId"]),
            None,
        )
        assert module is not None, notion["notionId"]
        chapter = next(
            (candidate for candidate in module["chapters"] if candidate["chapterId"] == notion["chapterId"]),
            None,
        )
        assert chapter is not None, notion["notionId"]
        assert chapter["moduleId"] == notion["moduleId"]
        assert module["position"] == notion["modulePosition"]


def test_module_three_uses_the_explicit_attachment() -> None:
    module = next(candidate for candidate in SAP_MODULES if candidate["position"] == 3)
    assert module["title"] == "Comptabilit\u00e9 g\u00e9n\u00e9rale"
    by_chapter: dict[str, list[str]] = {}
    for notion in SAP_NOTIONS:
        if notion["moduleId"] != "sap-m3":
            continue
        by_chapter.setdefault(notion["chapterId"], []).append(notion["notionId"])
    assert sorted(by_chapter["sap-m3-c1"]) == ["n-compte", "n-partie"]
    assert sorted(by_chapter["sap-m3-c2"]) == [
        "n-cle",
        "n-dates",
        "n-entete",
        "n-equilibre",
        "n-piece",
        "n-poste",
        "n-type",
    ]
    assert by_chapter["sap-m3-c3"] == ["n-acdoca"]
    assert by_chapter["sap-m3-c4"] == ["n-ledgers"]


def test_the_modules_describe_the_mockup() -> None:
    assert tuple(module["moduleId"] for module in SAP_MODULES) == MODULES
    assert [len(module["chapters"]) for module in SAP_MODULES] == [3, 3, 4, 4, 4, 3, 3]
    assert [module["hours"] for module in SAP_MODULES] == [15, 10, 25, 25, 25, 25, 25]
    assert all(module["threshold"] == 80 for module in SAP_MODULES)
    assert SAP_FORMATION["formationId"] == "sap"
    assert SAP_FORMATION["title"] == "SAP S/4HANA Finance"
    assert SAP_FORMATION["startDate"] == "2026-11-02"
    assert SAP_FORMATION["endDate"] == "2026-12-11"
    assert SAP_FORMATION["objectives"] == ["operational", "exam"]
    assert SAP_FORMATION["tz"] == "Europe/Paris"
    assert SAP_AVAILABILITY == {
        "hoursPerDay": 5,
        "studyDays": [1, 2, 3, 4, 5],
        "preferredSlots": ["matin", "apres_midi"],
    }


def test_no_reflexive_link_and_the_fifty_nine_links_of_the_mockup() -> None:
    assert len(SAP_LINKS) == 59
    assert all(link["fromNotionId"] != link["toNotionId"] for link in SAP_LINKS)
    ids = {notion["notionId"] for notion in SAP_NOTIONS}
    for link in SAP_LINKS:
        assert link["fromNotionId"] in ids, link["fromNotionId"]
        assert link["toNotionId"] in ids, link["toNotionId"]
    assert len([link for link in SAP_LINKS if link["kind"] == "confusion"]) == 1
    assert len([link for link in SAP_LINKS if link["kind"] == "tutor"]) == 4
    assert len([link for link in SAP_LINKS if link["kind"] == "prerequisite"]) == 54


def test_the_mastery_and_the_four_gaps_of_the_map() -> None:
    assert len(SAP_MASTERY_AT_REFERENCE) == 48
    assert SAP_MASTERY_AT_REFERENCE["n-cle"] == 35
    assert SAP_MASTERY_AT_REFERENCE["n-ledgers"] == 28
    assert SAP_MASTERY_AT_REFERENCE["n-equilibre"] == 55
    assert SAP_MASTERY_AT_REFERENCE["n-variante"] == 60
    assert SAP_MASTERY_AT_REFERENCE["n-fourn"] is None
    assert SAP_GAPS_AT_REFERENCE == [
        {"notionId": "n-variante", "nature": "forgetting", "confusedWith": None, "mastery": 60},
        {"notionId": "n-cle", "nature": "confusion", "confusedWith": "n-type", "mastery": 35},
        {"notionId": "n-equilibre", "nature": "application", "confusedWith": None, "mastery": 55},
        {"notionId": "n-ledgers", "nature": "misunderstanding", "confusedWith": None, "mastery": 28},
    ]
    assert REFERENCE_NOW == "2026-11-11T12:20:00.000Z"


def test_the_notion_order_stays_stable_inside_each_module() -> None:
    for module in SAP_MODULES:
        notions = [notion for notion in SAP_NOTIONS if notion["moduleId"] == module["moduleId"]]
        assert [notion["position"] for notion in notions] == list(range(len(notions)))
        assert all(notion["modulePosition"] == module["position"] for notion in notions)
        assert len(notions) > 0
