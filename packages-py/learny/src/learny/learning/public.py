"""Public surface of the learning context (00-conventions section 2).

Other contexts and the apps import only this module; everything else stays internal.
"""

from learny.learning.application.agenda import agenda_totals, get_agenda, slot_href, slot_label
from learny.learning.application.final_review import (
    build_final_review,
    get_final_review,
    is_uuid,
    set_maintenance,
)
from learny.learning.application.gaps import course_target, list_gaps, training_target
from learny.learning.application.ports import (
    BrickReferenceResolver,
    ClockPort,
    LearningDeps,
    Transactions,
)
from learny.learning.application.series import (
    get_milestones,
    get_streak,
    milestone_label,
    next_milestone_of,
    reconcile_milestones,
)

__all__ = [
    "BrickReferenceResolver",
    "ClockPort",
    "LearningDeps",
    "Transactions",
    "agenda_totals",
    "build_final_review",
    "course_target",
    "get_agenda",
    "get_final_review",
    "get_milestones",
    "get_streak",
    "is_uuid",
    "list_gaps",
    "milestone_label",
    "next_milestone_of",
    "reconcile_milestones",
    "set_maintenance",
    "slot_href",
    "slot_label",
    "training_target",
]
