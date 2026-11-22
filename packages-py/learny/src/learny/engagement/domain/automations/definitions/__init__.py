"""Product definitions of the ten automations (SPEC-2205, ADR-0190).

One module per key, as ADR-0190 requires: each one ports the explanation and the effects of
`packages/automations/src/definitions/*.ts`. `product_registry` registers all ten on a fresh
registry, in the order of the database enumeration, and is the only place the engine finds them.
"""

from learny.engagement.domain.automations.definitions import (
    bilan,
    echauffement,
    jeu_lacune,
    micro_seance,
    pause,
    plafond_quiz,
    questions_cartes,
    remediation,
    reprise,
    sprint,
)
from learny.engagement.domain.automations.keys import AUTOMATION_KEYS
from learny.engagement.domain.automations.model import AutomationDefinition
from learny.engagement.domain.automations.registry import AutomationRegistry, create_registry

DEFINITIONS: dict[str, AutomationDefinition] = {
    definition.DEFINITION.key: definition.DEFINITION
    for definition in (
        reprise,
        micro_seance,
        echauffement,
        remediation,
        jeu_lacune,
        questions_cartes,
        plafond_quiz,
        sprint,
        bilan,
        pause,
    )
}


def product_registry() -> AutomationRegistry:
    """A fresh registry holding exactly the ten definitions, in the enumeration order."""
    registry = create_registry()
    for key in AUTOMATION_KEYS:
        registry.register(DEFINITIONS[key])
    return registry


__all__ = [
    "DEFINITIONS",
    "bilan",
    "echauffement",
    "jeu_lacune",
    "micro_seance",
    "pause",
    "plafond_quiz",
    "product_registry",
    "questions_cartes",
    "remediation",
    "reprise",
    "sprint",
]
