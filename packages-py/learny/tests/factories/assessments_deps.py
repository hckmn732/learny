"""Dependency bundle of the assessments use cases in the integration suite (SPEC-2202).

The assessments and learning use cases receive the same bundle: the offline pack composes the
review session of the day, and both open their user transaction the same way. This module only
names that bundle for the assessments tests instead of borrowing the learning name.
"""

from datetime import datetime

from learny.shared.db.uow import Tx

from factories.identity_support import FIXED
from factories.learning_deps import LearningTestDeps, learning_deps


def assessment_deps(tx: Tx, *, now: datetime = FIXED) -> LearningTestDeps:
    """The dependency bundle the assessments use cases see."""
    return learning_deps(tx, now=now)


__all__ = ["assessment_deps"]
