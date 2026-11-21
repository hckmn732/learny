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
from learny.learning.application.planning import (
    apply_replan,
    get_replan_options,
    get_slot_alternatives,
    move_slot,
    reconcile_plan_slots,
    slot_version_of,
)
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
from learny.learning.application.warmups import get_today_warmups

__all__ = [
    "BrickReferenceResolver",
    "ClockPort",
    "LearningDeps",
    "Transactions",
    "agenda_totals",
    "apply_replan",
    "build_final_review",
    "course_target",
    "get_agenda",
    "get_final_review",
    "get_milestones",
    "get_replan_options",
    "get_slot_alternatives",
    "get_streak",
    "get_today_warmups",
    "is_uuid",
    "list_gaps",
    "milestone_label",
    "move_slot",
    "next_milestone_of",
    "reconcile_milestones",
    "reconcile_plan_slots",
    "set_maintenance",
    "slot_href",
    "slot_label",
    "slot_version_of",
    "training_target",
]
