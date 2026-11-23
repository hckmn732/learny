"""Route coverage of the demonstration pages (SPEC-1004 EF-4, EF-6).

Port of `packages/api-routes/src/coverage.ts`: the expected Next files and their methods, derived
from the two committed tables only (the operations and the special entries of the inventory). A
route present in the registry but in neither table still produces a file entry, so the value stays a
pure function of the committed data.
"""

import json
from typing import Any

from learny.shared.ownership import special_key

from learny_api.contract_files import inventory_file

ALL_METHODS: tuple[str, ...] = ("GET", "POST", "PUT")


def file_path_of(path: str) -> str:
    """`api/v1/formations/:fid` -> `api/v1/formations/[fid]`, `_dev` -> `%5Fdev`."""
    segments: list[str] = []
    for segment in path.split("/"):
        if segment == "":
            continue
        if segment.startswith(":"):
            segments.append(f"[{segment[1:]}]")
        elif segment == "_dev":
            segments.append("%5Fdev")
        else:
            segments.append(segment)
    return f"{'/'.join(segments)}/route.ts"


def _methods(descriptor: dict[str, str]) -> tuple[str, ...]:
    return ALL_METHODS if descriptor["method"] == "ALL" else (descriptor["method"],)


def _inventory() -> dict[str, Any]:
    document: Any = json.loads(inventory_file().read_text(encoding="utf-8"))
    return document if isinstance(document, dict) else {}


def _descriptors(inventory: dict[str, Any]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    specials = [
        {
            "key": special_key(str(entry["method"]), str(entry["path"])),
            "method": str(entry["method"]),
            "path": str(entry["path"]),
        }
        for entry in inventory["special"]
    ]
    special_keys = {entry["key"] for entry in specials}
    standard = [
        {
            "key": str(entry["id"]),
            "method": str(entry["method"]),
            "path": str(entry["path"]),
        }
        for entry in inventory["operations"]
        if special_key(str(entry["method"]), str(entry["path"])) not in special_keys
    ]
    return standard, specials


def expected_route_files() -> list[dict[str, Any]]:
    """`expectedRouteFiles`: one entry per Next file, with its sorted methods."""
    inventory = _inventory()
    standard, specials = _descriptors(inventory)
    files: dict[str, set[str]] = {file_path_of("/api/inngest"): set(ALL_METHODS)}
    for descriptor in [*standard, *specials]:
        path = file_path_of(descriptor["path"])
        methods = files.get(path, set())
        methods.update(_methods(descriptor))
        files[path] = methods
    return [{"path": path, "methods": sorted(methods)} for path, methods in sorted(files.items())]


def route_coverage() -> dict[str, Any]:
    """`routeCoverage`: the counts and the drift of the two tables against the next tree."""
    inventory = _inventory()
    standard, specials = _descriptors(inventory)
    expected = expected_route_files()
    seen: dict[str, int] = {}
    for descriptor in [*standard, *specials]:
        for method in _methods(descriptor):
            identifier = f"{method} {descriptor['path']}"
            seen[identifier] = seen.get(identifier, 0) + 1
    operation_ids = {
        str(entry["id"]): special_key(str(entry["method"]), str(entry["path"]))
        for entry in inventory["operations"]
    }
    special_keys = {descriptor["key"] for descriptor in specials}
    implemented = {descriptor["key"] for descriptor in standard} | {
        operation_id for operation_id, key in operation_ids.items() if key in special_keys
    }
    return {
        "registry": len(inventory["operations"]),
        "standard": len(standard),
        "specials": len(specials),
        "files": len(expected),
        "generated": len(expected),
        "drift": 0,
        "duplicates": sum(1 for count in seen.values() if count > 1),
        "uncovered": [
            str(entry["id"]) for entry in inventory["operations"] if str(entry["id"]) not in implemented
        ],
        "specialDrift": [],
    }


def special_entries() -> list[dict[str, str]]:
    """`SPECIAL_HANDLERS` as the page lists them: key, method and path, sorted by key."""
    _standard, specials = _descriptors(_inventory())
    return sorted(specials, key=lambda entry: entry["key"])
