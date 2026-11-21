"""Public surface of the learning context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.learning.application.agenda import agenda_totals, get_agenda, slot_href, slot_label
from learny.learning.application.gaps import course_target, list_gaps, training_target
from learny.learning.application.ports import (
    BrickReferenceResolver,
    ClockPort,
    LearningDeps,
    Transactions,
)

__all__ = [
    "BrickReferenceResolver",
    "ClockPort",
    "LearningDeps",
    "Transactions",
    "agenda_totals",
    "course_target",
    "get_agenda",
    "list_gaps",
    "slot_href",
    "slot_label",
    "training_target",
]
