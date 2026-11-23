"""Route and job ownership between the Python backend and Hono (ADR-2005, SPEC-2003).

`api/ownership.yaml` gives exactly one owner per operation, special route, consumer and cron. The
facade refuses to start when an operation of the contract or a special route of the inventory is
missing: a forgotten entry would silently 404 in production. The worker reads the same table to
decide which consumers and crons it runs (SPEC-2102 CA-3).
"""

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import yaml

Owner = Literal["ts", "py"]

OPERATIONS_KEY = "operations"
SPECIAL_KEY = "special"
WILDCARD = "*"
CONSUMERS_KEY = "consumers"
CRONS_KEY = "crons"


class OwnershipError(RuntimeError):
    """The ownership table is incomplete or inconsistent."""


@dataclass(frozen=True, slots=True)
class Ownership:
    """One owner per entry of the contract."""

    operations: dict[str, Owner]
    special: dict[str, Owner]
    consumers: dict[str, Owner]
    crons: dict[str, Owner]

    def owner_of(self, route_id: str) -> Owner:
        return self.operations[route_id]

    def is_python(self, route_id: str) -> bool:
        return self.operations.get(route_id) == "py"


def load_ownership(path: Path) -> Ownership:
    """Reads and type-checks `api/ownership.yaml`."""
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise OwnershipError("ownership.yaml must be a mapping")
    return Ownership(
        operations=_section(raw, OPERATIONS_KEY),
        special=_section(raw, SPECIAL_KEY),
        consumers=_section(raw, CONSUMERS_KEY),
        crons=_section(raw, CRONS_KEY),
    )


def _section(raw: dict[str, object], key: str) -> dict[str, Owner]:
    section = raw.get(key) or {}
    if not isinstance(section, dict):
        raise OwnershipError(f"{key} must be a mapping")
    owners: dict[str, Owner] = {}
    for name, owner in section.items():
        if owner not in ("ts", "py"):
            raise OwnershipError(f"{key}.{name}: owner must be 'ts' or 'py' (got {owner!r})")
        owners[str(name)] = owner
    return owners


def validate_completeness(
    ownership: Ownership,
    route_ids: list[str],
    special_keys: list[str],
) -> None:
    """Every operation and special route must have exactly one owner."""
    missing = [route_id for route_id in route_ids if route_id not in ownership.operations]
    if missing:
        raise OwnershipError(f"operations without owner: {', '.join(sorted(missing))}")
    unknown = [route_id for route_id in ownership.operations if route_id not in set(route_ids)]
    if unknown:
        raise OwnershipError(f"operations not in the contract: {', '.join(sorted(unknown))}")
    missing_special = [key for key in special_keys if key not in ownership.special]
    if missing_special:
        raise OwnershipError(f"special routes without owner: {', '.join(sorted(missing_special))}")


def special_key(method: str, path: str) -> str:
    """Canonical key of a special route: `GET /health`."""
    return f"{method.upper()} {path}"


def overrides_from_env(raw: str | None) -> dict[str, Owner]:
    """`OWNERSHIP_OVERRIDES` is a JSON object `{route_id: "py"}` used by tests and canaries.

    `"*"` is the only accepted wildcard (SPEC-2301): it forces every entry to the same owner, so
    `{"*": "ts"}` is the relay-only deployment and the total rollback of a cutover.
    """
    if not raw:
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise OwnershipError("OWNERSHIP_OVERRIDES must be a JSON object")
    return {str(key): value for key, value in parsed.items() if value in ("ts", "py")}


def apply_overrides(ownership: Ownership, overrides: Mapping[str, Owner]) -> Ownership:
    """Returns the table with `OWNERSHIP_OVERRIDES` applied (ADR-2005, SPEC-2301).

    An explicit entry wins over the `"*"` wildcard, which itself wins over the committed table. The
    wildcard never reaches the completeness check: it is expanded here into concrete entries.
    """
    if not overrides:
        return ownership
    default = overrides.get(WILDCARD)

    def owner(entry: str, current: Owner) -> Owner:
        explicit = overrides.get(entry)
        if explicit is not None:
            return explicit
        return default if default is not None else current

    def table(section: dict[str, Owner]) -> dict[str, Owner]:
        return {entry: owner(entry, current) for entry, current in section.items()}

    return Ownership(
        operations=table(ownership.operations),
        special=table(ownership.special),
        consumers=table(ownership.consumers),
        crons=table(ownership.crons),
    )


def find_api_dir(start: Path | None = None) -> Path:
    """Directory holding the generated contract artefacts, searched upwards from `start` and cwd."""
    candidates = []
    if start is not None:
        candidates.extend([start, *start.parents])
    candidates.extend([Path.cwd(), *Path.cwd().parents])
    for candidate in candidates:
        if (candidate / "api" / "ownership.yaml").exists():
            return candidate / "api"
    return Path(__file__).resolve().parents[4] / "api"


def load_ownership_for_worker(path: Path | None = None) -> Ownership:
    """Ownership table of the worker, with `OWNERSHIP_OVERRIDES` applied (never in production)."""
    resolved = path or (find_api_dir() / "ownership.yaml")
    ownership = load_ownership(resolved)
    overrides = overrides_from_env(os.environ.get("OWNERSHIP_OVERRIDES"))
    return apply_overrides(ownership, overrides)
