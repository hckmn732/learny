"""Product constants of the Python backend, copied from `packages/config/src/product.ts`.

Only the values a Python use case reads are copied here, verbatim from the TypeScript file that
remains the single source of truth until SPEC-2302 moves the product configuration (ADR-2011).
Each constant keeps the identifier of the TypeScript object it comes from so a divergence is easy
to spot.
"""

from collections.abc import Mapping
from typing import Any, Final

# STUDY_DEFAULTS (BR-ACC-08).
STUDY_DEFAULTS: Final[Mapping[str, Any]] = {
    "hoursPerDay": 2,
    "studyDays": (1, 2, 3, 4, 5),
    "preferredSlots": ("soir",),
}

# NOTIFICATION_DEFAULTS.channelEmail / NOTIFICATION_DEFAULTS.channelPush (BR-NOT-04, BR-NOT-05).
NOTIFICATION_DEFAULT_EMAIL: Final = True
NOTIFICATION_DEFAULT_PUSH: Final = True

# `ONBOARDING_AUTOMATION_KEYS` of `packages/services/src/onboarding/state.ts` (SPEC-602 EF-10).
ONBOARDING_AUTOMATION_KEYS: Final = ("reprise", "micro_seance", "echauffement", "plafond_quiz")

# AUTOMATION_DEFAULTS (BR-AUT-01 to BR-AUT-10), the ten keys of `public.automation_key`.
AUTOMATION_DEFAULTS: Final[Mapping[str, Mapping[str, Any]]] = {
    "reprise": {"missedReplace": "consent", "inactiveDays": 2, "lightenAfterDays": 5},
    "micro_seance": {"hour": 20, "durationMin": 5},
    "echauffement": {"questionCount": 3, "scope": "yesterday_and_prerequisites"},
    "remediation": {"retryDelayHours": 24, "mode": "advised"},
    "jeu_lacune": {"preference": "vary"},
    "questions_cartes": {"mode": "confirm"},
    "plafond_quiz": {"maxMinutes": 15, "targetRetention": 0.9},
    "sprint": {"daysBefore": 3, "durationMin": 30},
    "bilan": {"weekday": 7, "hour": 19, "channel": "app"},
    "pause": {"diagnosticOnReturn": True, "diagnosticMinutes": 10},
}
