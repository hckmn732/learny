"""Dependency protocols of the assessments use cases (00-conventions section 4).

The bundle is the very object the learning use cases receive (`learny.shared.deps.Deps`), and the
offline pack composes the review session of the learning context: the protocols are re-exported
rather than duplicated so the two contexts can never drift apart.
"""

from learny.learning.application.ports import (
    ClockPort,
    LearningDeps,
    Transactions,
)

AssessmentDeps = LearningDeps
"""What the assessments use cases need; `learny.shared.deps.Deps` satisfies it."""

__all__ = ["AssessmentDeps", "ClockPort", "Transactions"]
