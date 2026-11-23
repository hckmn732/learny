"""Pure rules of the practice exercise of one notion (SPEC-2205, from SPEC-613 ET-4).

The deterministic `LLM_MODE=mock` fixture of the instruction of a notion.
"""

import copy
import re
from typing import Any

from learny.shared.locale_fr import engagement_exercises as fr

TITLE_MAX = 120
TABLE_LABEL = re.compile(r"\u00e9quilibre.*pi\u00e8ce|equilibre.*piece", re.IGNORECASE | re.UNICODE)


def criteria_total(criteria: list[dict[str, Any]]) -> int:
    """`criteriaTotal`: the points of the ten-point scale, summed."""
    return sum(int(criterion["points"]) for criterion in criteria)


def table_instruction() -> dict[str, Any]:
    """`tableInstruction`: a fresh copy, so a caller can never mutate the fixture."""
    return copy.deepcopy(fr.TABLE_INSTRUCTION)


def generic_instruction(label: str, short_definition: str | None) -> dict[str, Any]:
    """`genericInstruction`: the interpolated text of a notion without a specific fixture."""
    definition = short_definition if short_definition is not None else fr.GENERIC_DEFINITION_FALLBACK
    criteria = []
    for template in fr.GENERIC_CRITERIA:
        criterion = dict(template)
        description = str(criterion["description"])
        criterion["description"] = description.format(label=label)
        criteria.append(criterion)
    return {
        "title": fr.GENERIC_TITLE.format(label=label)[:TITLE_MAX],
        "taskMd": fr.GENERIC_TASK_MD.format(label=label, definition=definition),
        "data": [fr.GENERIC_DATA.format(label=label)],
        "deliverable": fr.GENERIC_DELIVERABLE,
        "production": {"kind": "text", "minChars": 80, "maxChars": 2000},
        "explanationPrompt": fr.GENERIC_EXPLANATION,
        "hints": [
            fr.GENERIC_HINT_RESTATE.format(label=label),
            fr.GENERIC_HINT_SOURCE,
        ],
        "criteria": criteria,
        "estimatedMinutes": 10,
        "passPoints": 8,
        "sources": [],
    }


def instruction_for(label: str, short_definition: str | None) -> dict[str, Any]:
    """`instructionFor`: the table fixture for the matching label, the generic text otherwise."""
    if TABLE_LABEL.search(label) is not None:
        return table_instruction()
    return generic_instruction(label, short_definition)


__all__ = [
    "TITLE_MAX",
    "criteria_total",
    "generic_instruction",
    "instruction_for",
    "table_instruction",
]
