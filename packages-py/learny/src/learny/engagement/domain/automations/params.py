"""Canonical parameter schemas of the ten automations (SPEC-2205, SPEC-710 ET-4).

Ported from `AUTOMATION_PARAM_SCHEMAS` of `packages/contracts/src/parametres-automatismes.ts` and
from the four schemas of `packages/contracts/src/automations.ts`. The engine validates the stored
`automation_settings.params` with these rules and always emits the canonical object, including the
two legacy aliases (`questionCount`, `retryDelayHours`, `required`) so a setting written by an older
specification keeps working (ADR-0190 section 5, ADR-0327).

Every rejection carries the message zod produces, captured by the oracle
(`tools/engagement/oracle-automations.mjs`): the service copies it into the `VALIDATION_FAILED`
detail, so the learner reads the same text on both runtimes.
"""

from collections.abc import Mapping
from typing import Any, Final

from learny.engagement.domain.automations.keys import is_automation_key
from learny.shared.locale_fr import engagement_automations as fr

INVALID_INPUT: Final = "Invalid input"
INVALID_BOOLEAN: Final = "Invalid input: expected boolean, received string"
LEGACY_WARMUP_SCOPE: Final = "yesterday_and_prerequisites"
WARMUP_SCOPE: Final = "yesterday_prerequisites"


class ParamsError(ValueError):
    """One field of `params` violates its schema, with the zod path and message."""

    def __init__(self, path: str, message: str) -> None:
        self.path = path
        self.message = message
        super().__init__(f"{path}: {message}")


def _received(value: Any) -> str:
    """The type name zod prints in `expected ... received ...`."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, Mapping):
        return "object"
    return type(value).__name__


def _object(raw: Any) -> dict[str, Any]:
    """`z.object` rejects anything but a plain object before reading its keys."""
    if not isinstance(raw, Mapping):
        raise ParamsError("", f"Invalid input: expected object, received {_received(raw)}")
    return dict(raw)


def _literal(values: Mapping[str, Any], name: str, allowed: tuple[int, ...], default: int) -> int:
    """`z.union([z.literal(...)])`: a number outside the closed list is « Invalid input »."""
    value = values.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value not in allowed:
        raise ParamsError(name, INVALID_INPUT)
    return int(value)


def _enum(values: Mapping[str, Any], name: str, allowed: tuple[str, ...], default: str) -> str:
    """`z.enum`: the message lists the closed options, in their declaration order."""
    value = values.get(name, default)
    if not isinstance(value, str) or value not in allowed:
        options = "|".join(f'"{option}"' for option in allowed)
        raise ParamsError(name, f"Invalid option: expected one of {options}")
    return value


def _bounded_int(values: Mapping[str, Any], name: str, minimum: int, maximum: int, default: int) -> int:
    """`z.number().int().min().max()`: the two boundary messages of zod."""
    value = values.get(name, default)
    if isinstance(value, bool):
        raise ParamsError(name, f"Invalid input: expected int, received {_received(value)}")
    if not isinstance(value, (int, float)):
        raise ParamsError(name, f"Invalid input: expected int, received {_received(value)}")
    if isinstance(value, float) and not value.is_integer():
        raise ParamsError(name, f"Invalid input: expected int, received {_received(value)}")
    if value < minimum:
        raise ParamsError(name, f"Too small: expected number to be >={minimum}")
    if value > maximum:
        raise ParamsError(name, f"Too big: expected number to be <={maximum}")
    return int(value)


def _boolean(values: Mapping[str, Any], name: str, default: bool) -> bool:
    value = values.get(name, default)
    if not isinstance(value, bool):
        raise ParamsError(name, f"Invalid input: expected boolean, received {_received(value)}")
    return value


def _string(values: Mapping[str, Any], name: str) -> str | None:
    value = values.get(name)
    if value is None or isinstance(value, str):
        return value
    raise ParamsError(name, f"Invalid input: expected string, received {_received(value)}")


def _reprise(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    inactive = _literal(values, "inactiveDays", (1, 2, 3), 2)
    lighten = _literal(values, "lightenDays", (4, 5, 7), 5)
    mode = _enum(values, "mode", ("auto", "accord"), "accord")
    if lighten <= inactive:
        raise ParamsError("lightenDays", fr.REPRISE_ORDER)
    return {"inactiveDays": inactive, "lightenDays": lighten, "mode": mode}


def _micro_seance(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    return {
        "hour": _literal(values, "hour", (19, 20, 21), 20),
        "durationMin": _literal(values, "durationMin", (3, 5, 10), 5),
    }


def _echauffement(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    if "count" not in values and "questionCount" in values:
        values["count"] = values["questionCount"]
    if values.get("scope") == LEGACY_WARMUP_SCOPE:
        values["scope"] = WARMUP_SCOPE
    values.pop("questionCount", None)
    return {
        "count": _literal(values, "count", (2, 3, 5), 3),
        "scope": _enum(values, "scope", (WARMUP_SCOPE, "yesterday"), WARMUP_SCOPE),
    }


def _remediation(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    if "delayHours" not in values and "retryDelayHours" in values:
        values["delayHours"] = values["retryDelayHours"]
    if values.get("mode") == "required":
        values["mode"] = "mandatory"
    values.pop("retryDelayHours", None)
    return {
        "delayHours": _literal(values, "delayHours", (0, 12, 24, 48), 24),
        "mode": _enum(values, "mode", ("advised", "mandatory"), "advised"),
    }


def _jeu_lacune(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    return {"preference": _enum(values, "preference", ("vary", "cards", "matching"), "vary")}


def _questions_cartes(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    return {"mode": _enum(values, "mode", ("confirm", "auto"), "confirm")}


def _plafond_quiz(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    return {
        "maxMinutes": _literal(values, "maxMinutes", (10, 15, 20, 30), 15),
        "targetRetention": _retention(values, "targetRetention", (0.85, 0.9, 0.95), 0.9),
    }


def _retention(values: Mapping[str, Any], name: str, allowed: tuple[float, ...], default: float) -> float:
    """`z.union([z.literal(0.85), ...])`: an exact float of the closed list, nothing else."""
    value = values.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ParamsError(name, INVALID_INPUT)
    if float(value) not in allowed:
        raise ParamsError(name, INVALID_INPUT)
    return float(value)


def _sprint(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    return {
        "daysBefore": _literal(values, "daysBefore", (2, 3, 5), 3),
        "durationMin": _bounded_int(values, "durationMin", 5, 120, 30),
    }


def _bilan(raw: Any) -> dict[str, Any]:
    values = _object(raw)
    return {
        "weekday": _literal(values, "weekday", (5, 6, 7), 7),
        "hour": _literal(values, "hour", (18, 19, 20), 19),
        "channel": _enum(values, "channel", ("app", "app_email"), "app"),
    }


PAUSE_FIELDS: Final = ("pauseUntil", "diagnosticOnReturn", "diagnosticMinutes")


def _pause(raw: Any) -> dict[str, Any]:
    """`PauseParams` is a strict object: an unknown key is a rejection, not a silent drop."""
    values = _object(raw)
    for name in values:
        if name not in PAUSE_FIELDS:
            raise ParamsError("", f'Unrecognized key: "{name}"')
    params: dict[str, Any] = {}
    until = _string(values, "pauseUntil")
    if until is not None:
        if len(until) != 10 or until[4] != "-" or until[7] != "-":
            raise ParamsError("pauseUntil", fr.PAUSE_UNTIL_PATTERN)
        if not (until[:4].isdigit() and until[5:7].isdigit() and until[8:].isdigit()):
            raise ParamsError("pauseUntil", fr.PAUSE_UNTIL_PATTERN)
        params["pauseUntil"] = until
    params["diagnosticOnReturn"] = _boolean(values, "diagnosticOnReturn", True)
    params["diagnosticMinutes"] = _bounded_int(values, "diagnosticMinutes", 5, 30, 10)
    return params


SCHEMAS: Final = {
    "reprise": _reprise,
    "micro_seance": _micro_seance,
    "echauffement": _echauffement,
    "remediation": _remediation,
    "jeu_lacune": _jeu_lacune,
    "questions_cartes": _questions_cartes,
    "plafond_quiz": _plafond_quiz,
    "sprint": _sprint,
    "bilan": _bilan,
    "pause": _pause,
}


def validate_params(key: str, raw: Any) -> dict[str, Any]:
    """The canonical `params` object of one automation; raises `ParamsError` on a violation."""
    if not is_automation_key(key):
        raise ParamsError("", INVALID_INPUT)
    if raw is None:
        raw = {}
    return SCHEMAS[key](raw)


def params_or_stored(key: str, raw: Any) -> dict[str, Any]:
    """`listMyAutomations`: a stored object the schema refuses is surfaced as stored, never lost."""
    try:
        return validate_params(key, raw)
    except ParamsError:
        return dict(raw) if isinstance(raw, Mapping) else {}


def default_params(key: str) -> dict[str, Any]:
    """The canonical defaults of one automation, i.e. `safeParse({})`."""
    return validate_params(key, {})
