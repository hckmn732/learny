"""User-facing French messages of the input validation (ADR-2011).

Verbatim copy of Zod's `fr` locale (`zod/v4/locales/fr.js`, version 4.6.7), which is what
`packages/http/src/validate.ts` passes to `safeParse`. Every sentence, space and typographic detail
is normative: the Python pipeline must answer the same `errors[].message` as the TypeScript backend.
The message builders take the same arguments as the Zod issue fields they render.
"""

from typing import Any

# `Sizable`: unit and verb used by `too_small` / `too_big` when the origin is sizable.
SIZABLE: dict[str, tuple[str, str]] = {
    "string": ("caractères", "avoir"),
    "file": ("octets", "avoir"),
    "array": ("éléments", "avoir"),
    "set": ("éléments", "avoir"),
}

TYPE_DICTIONARY: dict[str, str] = {
    "string": "chaîne de caractères",
    "number": "nombre",
    "int": "entier",
    "boolean": "booléen",
    "bigint": "grand entier",
    "symbol": "symbole",
    "undefined": "indéfini",
    "null": "null",
    "never": "jamais",
    "void": "vide",
    "date": "date",
    "array": "tableau",
    "object": "objet",
    "tuple": "tuple",
    "record": "record",
    "map": "map",
    "set": "ensemble",
    "file": "fichier",
    "nonoptional": "non optionnel",
    "nan": "NaN",
    "function": "fonction",
}

FORMAT_DICTIONARY: dict[str, str] = {
    "regex": "expression régulière",
    "email": "adresse e-mail",
    "url": "URL",
    "emoji": "emoji",
    "uuid": "UUID",
    "uuidv4": "UUIDv4",
    "uuidv6": "UUIDv6",
    "nanoid": "nanoid",
    "guid": "GUID",
    "cuid": "cuid",
    "cuid2": "cuid2",
    "ulid": "ULID",
    "xid": "XID",
    "ksuid": "KSUID",
    "datetime": "date et heure ISO",
    "date": "date ISO",
    "time": "heure ISO",
    "duration": "durée ISO",
    "ipv4": "adresse IPv4",
    "ipv6": "adresse IPv6",
    "mac": "adresse MAC",
    "cidrv4": "plage IPv4",
    "cidrv6": "plage IPv6",
    "base64": "chaîne de caractères encodée en base64",
    "base64url": "chaîne de caractères encodée en base64url",
    "json_string": "chaîne de caractères JSON",
    "e164": "numéro au format E.164",
    "credit_card": "numéro de carte de crédit",
    "currency_code": "code de devise",
    "iban": "IBAN",
    "jwt": "JWT",
    "template_literal": "entrée",
}


def parsed_type_name(value: Any) -> str:
    """`util.parsedType` for the values a JSON payload can carry."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "nan" if isinstance(value, float) and value != value else "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "undefined"


def stringify_primitive(value: Any) -> str:
    """`util.stringifyPrimitive`: strings are JSON-quoted, everything else uses `String(value)`."""
    if isinstance(value, str):
        return f'"{value}"'
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    return str(value)


def join_values(values: list[Any], separator: str = "|") -> str:
    """`util.joinValues`: primitives stringified, non-primitives become `object`."""
    return separator.join(
        stringify_primitive(value) if _is_primitive(value) else "object" for value in values
    )


def _is_primitive(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def _typed(name: str) -> str:
    return TYPE_DICTIONARY.get(name, name)


def invalid_type(expected: str, received: str) -> str:
    """`invalid_type`: the expected side keeps its raw name when it is a class name."""
    if expected[:1].isupper():
        return f"Entrée invalide : instance de {expected} attendu, {_typed(received)} reçu"
    return f"Entrée invalide : {_typed(expected)} attendu, {_typed(received)} reçu"


def invalid_value(values: list[Any]) -> str:
    if len(values) == 1:
        return f"Entrée invalide : {stringify_primitive(values[0])} attendu"
    return f"Option invalide : une valeur parmi {join_values(values)} attendue"


def too_big(origin: str, maximum: Any, *, inclusive: bool) -> str:
    adjective = "<=" if inclusive else "<"
    sizing = SIZABLE.get(origin)
    if sizing is not None:
        unit, verb = sizing
        return f"Trop grand : {TYPE_DICTIONARY.get(origin, 'valeur')} doit {verb} {adjective}{maximum} {unit}"
    return f"Trop grand : {TYPE_DICTIONARY.get(origin, 'valeur')} doit être {adjective}{maximum}"


def too_small(origin: str, minimum: Any, *, inclusive: bool) -> str:
    adjective = ">=" if inclusive else ">"
    sizing = SIZABLE.get(origin)
    if sizing is not None:
        unit, verb = sizing
        return f"Trop petit : {TYPE_DICTIONARY.get(origin, 'valeur')} doit {verb} {adjective}{minimum} {unit}"
    return f"Trop petit : {TYPE_DICTIONARY.get(origin, 'valeur')} doit être {adjective}{minimum}"


def invalid_format(format_name: str, *, pattern: str | None = None) -> str:
    if format_name == "starts_with":
        return f'Chaîne de caractères invalide : doit commencer par "{pattern}"'
    if format_name == "ends_with":
        return f'Chaîne de caractères invalide : doit se terminer par "{pattern}"'
    if format_name == "includes":
        return f'Chaîne de caractères invalide : doit inclure "{pattern}"'
    if format_name == "regex":
        return f"Chaîne de caractères invalide : doit correspondre au motif {pattern}"
    return f"{FORMAT_DICTIONARY.get(format_name, format_name)} invalide"


def not_multiple_of(divisor: Any) -> str:
    return f"Nombre invalide : doit être un multiple de {divisor}"


def unrecognized_keys(keys: list[str]) -> str:
    plural = "s" if len(keys) > 1 else ""
    return f"Clé{plural} non reconnue{plural} : {join_values(list(keys), ', ')}"


def invalid_key(origin: str) -> str:
    return f"Clé invalide dans {origin}"


def invalid_union() -> str:
    return "Entrée invalide"


def invalid_element(origin: str) -> str:
    return f"Valeur invalide dans {origin}"


def generic() -> str:
    """`default`: the fallback message of the Zod locale."""
    return "Entrée invalide"


# Refinements of `packages/contracts/src/{me,parametres-onglets-et-profil,sidebar,legal}.ts` that the
# OpenAPI schema cannot carry: `datamodel-codegen` drops `.refine(...)`, `.trim()` and the IANA
# check. `learny_api.validate.REFINEMENTS` applies them after the generated model, with these texts.
PROFILE_FIELD_REQUIRED = "au moins un champ du profil est attendu"
STUDY_DAYS_UNIQUE = "les jours doivent être uniques"
STUDY_SLOTS_UNIQUE = "les moments doivent être uniques"
REMINDERS_NEED_DEPART = "les rappels ne sont acceptés qu’avec l’étape depart"
SIDEBAR_UPDATE_REQUIRED = "Indiquez le menu masqué ou la formation courante."
UNKNOWN_TIME_ZONE = "Fuseau horaire inconnu"
