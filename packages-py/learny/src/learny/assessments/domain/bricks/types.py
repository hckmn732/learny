"""The thirteen brick types: closed vocabularies and pure helpers (SPEC-501, BR-BRI-01/04/09).

A new type requires code in this list, a validator, checks, a public projection, examples and a
registry entry: that is exactly the "a new type needs code" rule. No IO, no framework import.
"""

BRICK_TYPES = (
    "text",
    "resource_excerpt",
    "choice_question",
    "open_question",
    "cloze",
    "matching",
    "ordering",
    "categorization",
    "recall_card",
    "instruction",
    "scripted_dialogue",
    "timer",
    "scoring",
)
"""Every brick type of BR-BRI-01, in the normative order."""

BRICK_PURPOSES = (
    "course",
    "validation",
    "bank",
    "remediation",
    "exercise",
    "exam",
    "warmup",
    "review",
)
"""BR-BRI-09: why the tutor assembled the brick."""

BRICK_ORIGINS = ("resource", "tutor")
"""BR-BRI-04: a content brick comes from a resource excerpt or from the tutor knowledge."""

QUESTION_TYPES = (
    "choice_question",
    "open_question",
    "cloze",
    "matching",
    "ordering",
    "categorization",
    "recall_card",
)
"""The seven types carrying a fingerprint (BR-BRI-07, ADR-0151)."""

AUTO_GRADED_TYPES = (
    "choice_question",
    "cloze",
    "matching",
    "ordering",
    "categorization",
    "recall_card",
)
"""The six types corrected by `grade_brick` (BR-BRI-08, EF-2)."""

TUTOR_GRADED_TYPES = ("open_question", "instruction", "scripted_dialogue")
"""The three types the code refuses to grade (CL-12, BR-BRI-08)."""

RECALL_SELF_GRADES = ("again", "hard", "good", "easy")
"""Self-assessment of a recall card, the same scale as FSRS (BR-MEM-02, EF-8)."""


def is_brick_type(value: object) -> bool:
    """True for one of the thirteen brick types."""
    return isinstance(value, str) and value in BRICK_TYPES


__all__ = [
    "AUTO_GRADED_TYPES",
    "BRICK_ORIGINS",
    "BRICK_PURPOSES",
    "BRICK_TYPES",
    "QUESTION_TYPES",
    "RECALL_SELF_GRADES",
    "TUTOR_GRADED_TYPES",
    "is_brick_type",
]
