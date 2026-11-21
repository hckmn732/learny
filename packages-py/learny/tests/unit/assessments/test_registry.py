"""[SPEC-2202] Registry and architecture of the brick contract (SPEC-501 ET-1).

Ported from `packages/bricks/src/registry.test.ts` and `architecture.test.ts`: the thirteen types
all have a definition, the grading mode is fixed by BR-BRI-08, and no pure module imports a model
SDK, a database driver or a web framework (CA-7).
"""

import ast
import json
from pathlib import Path

import pytest
from learny.assessments.domain.bricks.registry import BRICK_REGISTRY, GRADED_BY, REQUIRES_NOTION
from learny.assessments.domain.bricks.types import (
    AUTO_GRADED_TYPES,
    BRICK_TYPES,
    QUESTION_TYPES,
    TUTOR_GRADED_TYPES,
)

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
PAYLOADS = {type_name: entry["normalized"] for type_name, entry in FIXTURE["examples"].items()}
VERSION = FIXTURE["ids"]["version"]


def test_the_thirteen_types_are_registered() -> None:
    assert len(BRICK_TYPES) == 13
    assert sorted(BRICK_REGISTRY) == sorted(BRICK_TYPES)


def test_every_definition_carries_the_contract() -> None:
    for type_name, definition in BRICK_REGISTRY.items():
        assert definition.type == type_name
        assert definition.graded_by in ("code", "tutor", "none")
        assert callable(definition.cross_check)
        assert callable(definition.references)
        assert callable(definition.to_public)


def test_the_grading_mode_of_each_type_is_fixed() -> None:
    code_graded = {name for name, mode in GRADED_BY.items() if mode == "code"}
    assert code_graded == {*AUTO_GRADED_TYPES, "timer"}
    assert {name for name, mode in GRADED_BY.items() if mode == "tutor"} == set(TUTOR_GRADED_TYPES)
    assert {name for name, mode in GRADED_BY.items() if mode == "none"} == {
        "text",
        "resource_excerpt",
        "scoring",
    }


def test_only_the_control_bricks_skip_the_notion_requirement() -> None:
    assert {name for name, required in REQUIRES_NOTION.items() if not required} == {
        "timer",
        "scoring",
    }


def test_the_seven_question_types_carry_a_stem_and_an_answer() -> None:
    for type_name in QUESTION_TYPES:
        definition = BRICK_REGISTRY[type_name]
        assert definition.is_question is True
        assert definition.stem(PAYLOADS[type_name]) is not None
        assert definition.canonical_answer(PAYLOADS[type_name]) is not None


def test_the_six_other_types_have_no_stem_and_no_answer() -> None:
    for type_name, definition in BRICK_REGISTRY.items():
        if type_name in QUESTION_TYPES:
            continue
        assert definition.is_question is False
        assert definition.stem(PAYLOADS[type_name]) is None
        assert definition.canonical_answer(PAYLOADS[type_name]) is None


def test_the_public_projection_of_a_definition_is_seeded() -> None:
    for type_name, definition in BRICK_REGISTRY.items():
        first = definition.to_public(PAYLOADS[type_name], VERSION)
        second = definition.to_public(PAYLOADS[type_name], VERSION)
        assert first == second, type_name


DOMAIN = Path(__file__).resolve().parents[3] / "src" / "learny" / "assessments"
FORBIDDEN = (
    "sqlalchemy",
    "fastapi",
    "httpx",
    "openai",
    "anthropic",
    "psycopg",
    "learny.platform",
    "random",
    "time",
    "datetime",
)


def test_the_domain_never_imports_a_forbidden_module() -> None:
    offenders: list[str] = []
    for file in sorted(DOMAIN.rglob("*.py")):
        tree = ast.parse(file.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            else:
                continue
            for name in names:
                if name in FORBIDDEN:
                    offenders.append(f"{file.name}: {name}")
    assert offenders == []


def test_the_domain_reads_no_clock_and_no_global_randomness() -> None:
    offenders: list[str] = []
    for file in sorted(DOMAIN.rglob("*.py")):
        text = file.read_text(encoding="utf-8")
        for marker in ("time.time(", "datetime.now(", "random.random(", "uuid4("):
            if marker in text:
                offenders.append(f"{file.name}: {marker}")
    assert offenders == []


def test_the_domain_tree_is_complete() -> None:
    names = {file.stem for file in (DOMAIN / "domain" / "bricks").glob("*.py")}
    assert {"registry", "schema", "checks", "references", "validate", "public", "grade"} <= names
