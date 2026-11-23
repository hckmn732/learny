"""Route ownership of the facade (SPEC-2003, ADR-2005).

The loader lives in `learny.shared.ownership` because the worker reads the same table (SPEC-2102):
this module only re-exports it for the facade and its tests.
"""

from learny.shared.ownership import (
    CONSUMERS_KEY,
    CRONS_KEY,
    OPERATIONS_KEY,
    SPECIAL_KEY,
    WILDCARD,
    Owner,
    Ownership,
    OwnershipError,
    apply_overrides,
    load_ownership,
    overrides_from_env,
    special_key,
    validate_completeness,
)

__all__ = [
    "CONSUMERS_KEY",
    "CRONS_KEY",
    "OPERATIONS_KEY",
    "SPECIAL_KEY",
    "Owner",
    "Ownership",
    "OwnershipError",
    "WILDCARD",
    "apply_overrides",
    "load_ownership",
    "overrides_from_env",
    "special_key",
    "validate_completeness",
]
