"""Parameter resolution of the engine (SPEC-401 ET-4).

A deep merge of the `ENGINE` defaults with a partial user setting: arrays are replaced, never
concatenated; a value outside an `allowed...` list raises `INVALID_PARAM` (CL-7). The defaults are
the exact mirror of `ENGINE` in `packages/config/src/product.ts` (BR-MEM, BR-LAC, BR-AUT, BR-GUI).
"""

from typing import Any

from learny.learning.domain.errors import EngineError, invalid_param

ENGINE: dict[str, Any] = {
    "mastery": {"halfLifeDays": 14, "threshold": 80, "decimals": 2},
    "fsrs": {
        "requestRetention": 0.9,
        "allowedRetentions": [0.85, 0.9, 0.95],
        "enableFuzz": False,
        "enableShortTerm": True,
        "medianWindow": 50,
        "medianMinSamples": 5,
        "defaultMedianMs": 20_000,
        "hardFactor": 2,
        "easyFactor": 0.5,
    },
    "gaps": {
        "failureRatio": 0.5,
        "forgettingMinDays": 7,
        "clearSuccesses": 2,
        "clearMinDaysApart": 1,
        "repeatedErrorAttempts": 2,
    },
    "draw": {
        "defaultSize": 12,
        "minSize": 10,
        "maxSize": 20,
        "openShare": 0.3,
        "minOpen": 1,
        "gapWeight": 3,
        "weakWeight": 2,
        "baseWeight": 1,
        "totalPoints": 100,
    },
    "globalQuiz": {
        "maxMinutesDefault": 15,
        "allowedMaxMinutes": [10, 15, 20, 30],
        "notionCostSec": 60,
        "sessionOverheadSec": 60,
        "microMinutesDefault": 5,
        "allowedMicroMinutes": [3, 5, 10],
        "maintenanceMaxMinutes": 5,
        "cardDeckMax": 5,
        "groupMin": 2,
        "groupMax": 4,
        "formatSeconds": {
            "recall_card": 30,
            "choice_question": 45,
            "cloze": 45,
            "ordering": 60,
            "matching": 40,
            "categorization": 40,
            "open_question": 90,
        },
        "gamePreferenceDefault": "vary",
    },
    "planner": {
        "moments": {
            "matin": {"start": "09:00", "end": "12:00"},
            "apres_midi": {"start": "14:00", "end": "17:00"},
            "soir": {"start": "18:30", "end": "21:00"},
        },
        "revisionTailMinutes": 60,
        "globalQuizMinutes": 30,
        "sprintMinutes": 30,
        "sprintDaysBeforeDefault": 3,
        "allowedSprintDaysBefore": [2, 3, 5],
        "validationQuizMinutes": 60,
        "bufferMinutes": 60,
        "contributionShare": 0.6,
        "granularityMinutes": 30,
        "mockExam": {"questions": 20, "minutesPerQuestion": 2, "threshold": 70},
        "blockedDelayDays": 3,
        "blockedModuleExtraDays": 2,
        "maxHoursPerDay": 6,
        "maintenanceGlobalQuizMinutes": 5,
    },
    "retention": {
        "horizonsDays": [30, 60],
        "toleranceDays": 3,
        "sources": ["global_quiz", "micro_session", "offline"],
    },
    "streak": {"readingMinSeconds": 300, "regularityDays": 14, "maxLookbackDays": 3660},
    "milestones": {"notionsRetained": 100, "streakDays": 30, "masteryThreshold": 80},
    "warmup": {
        "defaultCount": 3,
        "allowedCounts": [2, 3, 5],
        "defaultScope": "yesterday_and_prerequisites",
        "yesterdayLookbackDays": 7,
    },
}

_ALLOWED_DEFAULTS: dict[str, str] = {
    "allowedMaxMinutes": "maxMinutesDefault",
    "allowedMicroMinutes": "microMinutesDefault",
    "allowedSprintDaysBefore": "sprintDaysBeforeDefault",
    "allowedCounts": "defaultCount",
    "allowedRetentions": "requestRetention",
}


def _is_plain_object(value: Any) -> bool:
    return isinstance(value, dict)


def _clone(value: Any) -> Any:
    if isinstance(value, list):
        return [_clone(item) for item in value]
    if isinstance(value, dict):
        return {key: _clone(item) for key, item in value.items()}
    return value


def _validate_allowed_list(base: dict[str, Any], key: str, value: Any) -> None:
    allowed = base.get(key)
    if not isinstance(allowed, list):
        return
    if not isinstance(value, list):
        raise invalid_param(key, f"{key} must be an array.")
    for item in value:
        if item not in allowed:
            raise invalid_param(key, f"{item} is not an allowed value of {key}.")


def _validate_object(base: dict[str, Any], overrides: dict[str, Any], path: str) -> None:
    for key, value in overrides.items():
        if key not in base:
            raise invalid_param(key if path == "" else f"{path}.{key}", f"Unknown parameter: {key}.")
        at = key if path == "" else f"{path}.{key}"
        if key.startswith("allowed") and isinstance(base[key], list):
            _validate_allowed_list(base, key, value)
        for allowed_key, default_key in _ALLOWED_DEFAULTS.items():
            if default_key != key:
                continue
            allowed = base.get(allowed_key)
            if isinstance(allowed, list) and value not in allowed:
                raise invalid_param(at, f"{value} is not an allowed value of {allowed_key}.")


def _deep_merge(base: Any, overrides: Any, path: str) -> Any:
    if overrides is None:
        return _clone(base)
    if isinstance(overrides, list):
        return [_clone(item) for item in overrides]
    if not isinstance(overrides, dict):
        return overrides
    if not isinstance(base, dict):
        raise invalid_param(path, f"Object expected for {path}.")
    _validate_object(base, overrides, path)
    result = _clone(base)
    for key, value in overrides.items():
        result[key] = _deep_merge(base[key], value, key if path == "" else f"{path}.{key}")
    return result


def with_params(key: str, overrides: dict[str, Any] | None = None) -> Any:
    """Defaults of one engine area with the given overrides applied; always a fresh deep copy."""
    if key not in ENGINE:
        raise EngineError("INVALID_PARAM", f"Unknown parameter: {key}", key)
    return _deep_merge(ENGINE[key], overrides, key)
