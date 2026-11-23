"""HTTP handler modules of the facade, imported for their registration side effect.

Importing this package fills `learny_api.pipeline.HANDLERS` through the `@handler` decorator, which
must happen before `pipeline.install` registers the `py`-owned routes of `api/ownership.yaml`.
"""

from learny_api.handlers import (
    assessments,
    auth,
    billing,
    content,
    dev,
    engagement,
    formation,
    health,
    home,
    identity,
    learning,
    privacy,
    tutor,
)

__all__ = [
    "assessments",
    "auth",
    "billing",
    "content",
    "dev",
    "engagement",
    "formation",
    "health",
    "home",
    "identity",
    "learning",
    "privacy",
    "tutor",
]
