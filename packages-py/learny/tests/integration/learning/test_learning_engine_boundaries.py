"""[SPEC-2202] Boundaries of the learning engine (SPEC-401, CA-5, CA-7, EF-3)."""

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.spec("SPEC-2202")

DOMAIN = Path(__file__).resolve().parents[3] / "src" / "learny" / "learning" / "domain"
FORBIDDEN_IMPORT_PREFIXES = ("learny.shared.db", "learny.platform", "sqlalchemy", "httpx", "requests")
FORBIDDEN_CALLS = {"now", "utcnow", "today", "time", "monotonic"}


def source_files() -> list[Path]:
    return sorted(path for path in DOMAIN.glob("*.py") if path.name != "__init__.py")


def imported_modules(tree: ast.AST) -> set[str]:
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            modules.add(node.module)
    return modules


def test_no_domain_module_imports_an_outside_package() -> None:
    files = source_files()
    assert len(files) > 5
    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        imports = imported_modules(tree)
        forbidden = [
            name
            for name in imports
            if any(name == prefix or name.startswith(prefix + ".") for prefix in FORBIDDEN_IMPORT_PREFIXES)
        ]
        assert forbidden == [], f"{path.name}: {forbidden}"


def test_the_real_entry_point_is_accepted_without_error() -> None:
    files = source_files()
    assert any(path.name == "planner.py" for path in files)
    assert any(path.name == "fsrs.py" for path in files)
    for path in files:
        ast.parse(path.read_text(encoding="utf-8"))


def test_the_domain_reads_neither_the_clock_the_network_nor_the_environment() -> None:
    files = source_files()
    assert len(files) > 5
    for path in files:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            attribute = node.func
            if isinstance(attribute, ast.Attribute) and attribute.attr in FORBIDDEN_CALLS:
                owner = attribute.value
                name = owner.id if isinstance(owner, ast.Name) else ""
                if name in ("datetime", "time", "os"):
                    pytest.fail(f"{path.name} reads {name}.{attribute.attr}")
        assert "process.env" not in source
        assert "os.environ" not in source
        assert "fetch(" not in source
