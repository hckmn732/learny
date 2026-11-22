"""Pure layout of the personal-data ZIP (SPEC-211 EF-3, CL-10, ADR-0216).

Port of `packages/jobs/src/personal-data/zip-layout.ts`. Every name in the archive is built here,
never by string concatenation at the call site: path separators, traversal segments and control
characters are neutralised, collisions inside one directory are suffixed `-2`, `-3`..., and the order
of the entries is deterministic so the demonstration, the tests and the evidence always agree.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from learny.shared.jsmath import js_number, js_round
from learny.shared.jsonx import dumps_pretty
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import FRENCH_MONTHS_LONG, FRENCH_WEEKDAYS, from_epoch_ms, to_epoch_ms, wall_ms_of

ARCHIVE_README = "README.txt"
ARCHIVE_SETTINGS = "settings.json"
ARCHIVE_RESULTS = "results.json"
ARCHIVE_CONVERSATIONS = "conversations.json"

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_DIACRITICS = re.compile(r"[\u0300-\u036f]")
_SEPARATORS = re.compile(r"[\\/]+")
_DOTS = re.compile(r"\.{2,}")
_FORBIDDEN = re.compile(r'[<>:"|?*]')
_SPACES = re.compile(r"\s+")
_DASHES = re.compile(r"-{2,}")
_EDGES = re.compile(r"^[.\s-]+|[.\s-]+$")
_NON_SLUG = re.compile(r"[^a-z0-9]+")
_SLUG_EDGES = re.compile(r"^-+|-+$")
_SLUG_TAIL = re.compile(r"-+$")

SIZE_UNITS = ("o", "Ko", "Mo", "Go")
SECRET_KEYS = frozenset(
    {
        "encryptedKey",
        "encrypted_key",
        "apiKey",
        "api_key",
        "keyLast4",
        "key_last4",
        "secret",
        "password",
        "token",
    }
)


def _clean(value: str) -> str:
    """`clean`: compatibility decomposition without combining marks (`Élève` -> `Eleve`)."""
    return _DIACRITICS.sub("", unicodedata.normalize("NFKD", value))


def normalize_archive_name(original_name: str, fallback: str = fr.ARCHIVE_FILE_FALLBACK) -> str:
    """Strips every dangerous character from an original file name (CL-10)."""
    source = _CONTROL.sub("", _clean(unicodedata.normalize("NFC", original_name))).strip()
    replaced = _SEPARATORS.sub("-", source)
    replaced = _DOTS.sub("", replaced)
    replaced = _FORBIDDEN.sub("-", replaced)
    replaced = _SPACES.sub(" ", replaced)
    replaced = _DASHES.sub("-", replaced)
    replaced = _EDGES.sub("", replaced)
    return fallback if replaced == "" else replaced[:120]


def archive_slug(value: str, fallback: str = fr.ARCHIVE_FORMATION_FALLBACK) -> str:
    """Lower-case archive slug: `SAP S/4HANA - Finance` -> `sap-s-4hana-finance`."""
    slug = _NON_SLUG.sub("-", _clean(value).lower())
    slug = _SLUG_EDGES.sub("", slug)[:60]
    slug = _SLUG_TAIL.sub("", slug)
    return fallback if slug == "" else slug


def module_folder(position: int, title: str) -> str:
    """Module folder `NN-<slug>` (two-digit position, stable across exports)."""
    bounded = position if isinstance(position, int) and position > 0 else 1
    return f"{bounded:02d}-{archive_slug(title, fr.ARCHIVE_MODULE_FALLBACK)}"


def _with_suffix(name: str, suffix: int) -> str:
    slash = name.rfind("/")
    folder = "" if slash == -1 else name[: slash + 1]
    file = name if slash == -1 else name[slash + 1 :]
    dot = file.rfind(".")
    if dot <= 0:
        return f"{folder}{file}-{suffix}"
    return f"{folder}{file[:dot]}-{suffix}{file[dot:]}"


def reserve_entry_name(used: set[str], wanted: str) -> str:
    """Reserves one full path, suffixing the file name when the directory already holds it."""
    candidate = wanted
    suffix = 2
    while candidate in used:
        candidate = _with_suffix(wanted, suffix)
        suffix += 1
    used.add(candidate)
    return candidate


def reserve_folder_name(used: set[str], wanted: str) -> str:
    """Reserves one folder name inside a parent, suffixing `-2`, `-3` on a collision."""
    candidate = wanted
    suffix = 2
    while candidate in used:
        candidate = f"{wanted}-{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


@dataclass(frozen=True, slots=True)
class ArchiveApport:
    """One apport of a module: an original name and either a storage path or inline text."""

    name: str
    storage_path: str | None = None
    text: str | None = None


@dataclass(frozen=True, slots=True)
class ArchiveModule:
    """One module of a formation, with its rendered course and its apports."""

    position: int
    title: str
    course_markdown: str | None = None
    apports: tuple[ArchiveApport, ...] = ()


@dataclass(frozen=True, slots=True)
class ArchiveFormation:
    """One formation of the archive: its programme JSON and its modules."""

    title: str
    programme: Any
    modules: tuple[ArchiveModule, ...] = ()


@dataclass(frozen=True, slots=True)
class ArchiveModel:
    """Everything `build_archive_entries` lays out for one learner."""

    readme: str
    settings: Any
    results: Any
    conversations: Any
    formations: tuple[ArchiveFormation, ...] = ()


@dataclass(frozen=True, slots=True)
class ArchiveEntry:
    """One file of the archive: inline text, or a storage object read later by the zip step."""

    name: str
    text: str | None = None
    storage_path: str | None = None


def _json_block(value: Any) -> str:
    """`${JSON.stringify(value, null, 2)}\\n`, with the JavaScript number formatting."""
    return dumps_pretty(value).decode("utf-8") + "\n"


def build_archive_entries(model: ArchiveModel) -> list[ArchiveEntry]:
    """Deterministic list of the archive entries of one learner (EF-3)."""
    entries: list[ArchiveEntry] = [
        ArchiveEntry(name=ARCHIVE_README, text=model.readme),
        ArchiveEntry(name=ARCHIVE_SETTINGS, text=_json_block(model.settings)),
        ArchiveEntry(name=ARCHIVE_RESULTS, text=_json_block(model.results)),
        ArchiveEntry(name=ARCHIVE_CONVERSATIONS, text=_json_block(model.conversations)),
    ]
    used_formations: set[str] = set()
    used: set[str] = {entry.name for entry in entries}

    for formation in model.formations:
        formation_slug = reserve_folder_name(
            used_formations, archive_slug(formation.title, fr.ARCHIVE_FORMATION_FOLDER_FALLBACK)
        )
        formation_folder = f"formations/{formation_slug}"
        entries.append(
            ArchiveEntry(
                name=reserve_entry_name(used, f"{formation_folder}/{fr.PROGRAMME_FILE_NAME}"),
                text=_json_block(formation.programme),
            )
        )
        used_modules: set[str] = set()
        for module in formation.modules:
            folder = reserve_folder_name(used_modules, module_folder(module.position, module.title))
            course = module.course_markdown
            if isinstance(course, str) and course != "":
                entries.append(
                    ArchiveEntry(
                        name=reserve_entry_name(used, f"{formation_folder}/{folder}/cours.md"),
                        text=course,
                    )
                )
            apport_folder = f"apports/{formation_slug}/{folder}"
            for apport in module.apports:
                name = normalize_archive_name(apport.name, fr.ARCHIVE_APPORT_FALLBACK)
                target = reserve_entry_name(used, f"{apport_folder}/{name}")
                if isinstance(apport.text, str):
                    entries.append(ArchiveEntry(name=target, text=apport.text))
                elif isinstance(apport.storage_path, str) and apport.storage_path != "":
                    entries.append(ArchiveEntry(name=target, storage_path=apport.storage_path))
    return entries


def format_size_label(size_bytes: float) -> str:
    """French size label of BR-ACC-10: `12,4 Mo`, `1 Ko`, `980 o`."""
    value = size_bytes if isinstance(size_bytes, (int, float)) and size_bytes > 0 else 0
    unit = 0
    amount = float(value)
    while amount >= 1000 and unit < len(SIZE_UNITS) - 1:
        amount /= 1000
        unit += 1
    rounded = float(js_round(amount)) if unit == 0 else js_round(amount * 10) / 10
    text = js_number(rounded).replace(".", ",")
    return f"{text} {SIZE_UNITS[unit]}"


def format_long_date(instant: datetime, time_zone: str) -> str:
    """`mercredi 18 novembre a 13:20`, in the learner's zone (`formatLongDate`)."""
    milliseconds = to_epoch_ms(instant)
    local = from_epoch_ms(wall_ms_of(milliseconds, time_zone))
    return fr.LONG_DATE.format(
        weekday=FRENCH_WEEKDAYS[local.weekday()],
        day=local.day,
        month=FRENCH_MONTHS_LONG[local.month - 1],
        hour=f"{local.hour:02d}",
        minute=f"{local.minute:02d}",
    )


@dataclass(frozen=True, slots=True)
class SettingsInput:
    """The four blocks of `settings.json` (EF-3)."""

    profile: dict[str, Any]
    study_preferences: dict[str, Any] | None
    notification_settings: dict[str, Any] | None
    automations: tuple[dict[str, Any], ...] = field(default_factory=tuple)


def _without_secrets(value: Any) -> Any:
    if isinstance(value, list):
        return [_without_secrets(item) for item in value]
    if isinstance(value, dict):
        return {key: _without_secrets(item) for key, item in value.items() if key not in SECRET_KEYS}
    return value


def build_settings_json(data: SettingsInput) -> dict[str, Any]:
    """`settings.json` of EF-3: profile, rhythm, notifications and automations, never a secret."""
    return {
        "profile": _without_secrets(data.profile),
        "studyPreferences": _without_secrets(data.study_preferences),
        "notificationSettings": _without_secrets(data.notification_settings),
        "automations": _without_secrets(list(data.automations)),
    }
