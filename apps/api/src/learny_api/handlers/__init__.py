"""HTTP handler modules of the facade, imported for their registration side effect.

Importing this package fills `learny_api.pipeline.HANDLERS` through the `@handler` decorator, which
must happen before `pipeline.install` checks that every route of the contract has a handler.
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
    public_config,
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
    "public_config",
    "tutor",
]
