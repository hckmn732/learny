"""Closed vocabularies of the automation engine (SPEC-2205, ADR-0190).

Copied from `packages/contracts/src/{events,moteur-d-automatismes}.ts`: the ten keys of V1 in the
order of the database enumeration, the six statuses of the journal, the `snake_case` action kind and
the one-line summary ceiling. Pure constants and predicates, no IO.
"""

import re
from typing import Any, Final

# EVENT_AUTOMATION_KEYS: the order of the enumeration `public.automation_key`.
AUTOMATION_KEYS: Final = (
    "reprise",
    "micro_seance",
    "echauffement",
    "remediation",
    "jeu_lacune",
    "questions_cartes",
    "plafond_quiz",
    "sprint",
    "bilan",
    "pause",
)

# AUTOMATION_ACTION_STATUSES.
ACTION_STATUSES: Final = (
    "pending_consent",
    "applied",
    "declined",
    "undone",
    "expired",
    "consumed",
)

# AutomationActionKind: one to eighty characters, `snake_case`.
KIND_PATTERN: Final = re.compile(r"^[a-z][a-z0-9_]*$")
KIND_MAX: Final = 80

# AutomationSummary: one line, one to 160 characters (the database column allows 300).
SUMMARY_MAX: Final = 160

# The engine only proposes these keys without checking the settings or the global pause (CL-5).
PAUSE_EXEMPT_KEYS: Final = frozenset({"pause", "remediation"})


def is_automation_key(value: Any) -> bool:
    """Is the value one of the ten published automation keys?"""
    return isinstance(value, str) and value in AUTOMATION_KEYS


def is_action_status(value: Any) -> bool:
    """Is the value one of the six journal statuses?"""
    return isinstance(value, str) and value in ACTION_STATUSES


def is_action_kind(value: Any) -> bool:
    """Is the value a `snake_case` action kind of one to eighty characters?"""
    return isinstance(value, str) and 1 <= len(value) <= KIND_MAX and KIND_PATTERN.match(value) is not None
