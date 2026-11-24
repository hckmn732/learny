"""Dependency protocols of the assessments use cases (00-conventions section 4).

The bundle is the very object the learning use cases receive (`learny.shared.deps.Deps`), plus the
`LlmGateway` the remediation plan needs. The offline pack composes the review session of the
learning context: the protocols are re-derived rather than duplicated so the two contexts can never
drift apart.
"""

from typing import Protocol

from learny.learning.application.ports import (
    ClockPort,
    LearningDeps,
    Transactions,
)
from learny.platform.llm.gateway import LlmGateway


class AssessmentDeps(LearningDeps, Protocol):
    """What the assessments use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def llm(self) -> LlmGateway: ...


__all__ = ["AssessmentDeps", "ClockPort", "Transactions"]
