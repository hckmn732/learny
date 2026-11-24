"""[SPEC-2206] Privacy domain against the reference oracle (SPEC-211, CA-2).

Equality is strict: a divergence is a Python bug, never an oracle change (ADR-2008).
"""

import json
from dataclasses import fields
from pathlib import Path
from typing import Any

import pytest
from learny.privacy.domain.archive import (
    ArchiveApport,
    ArchiveEntry,
    ArchiveFormation,
    ArchiveModel,
    ArchiveModule,
    SettingsInput,
    archive_slug,
    build_archive_entries,
    build_settings_json,
    format_long_date,
    format_size_label,
    module_folder,
    normalize_archive_name,
)
from learny.privacy.domain.exports import DownloadableExport, can_download
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2206")

ORACLE = json.loads(
    (Path(__file__).resolve().parents[5] / "api" / "oracles" / "vectors" / "privacy.json").read_text(
        encoding="utf-8"
    )
)


def _model(payload: dict[str, Any]) -> ArchiveModel:
    formations = tuple(
        ArchiveFormation(
            title=formation["title"],
            programme=formation["programme"],
            modules=tuple(
                ArchiveModule(
                    position=module["position"],
                    title=module["title"],
                    course_markdown=module["courseMarkdown"],
                    apports=tuple(
                        ArchiveApport(
                            name=apport["name"],
                            storage_path=apport.get("storagePath"),
                            text=apport.get("text"),
                        )
                        for apport in module["apports"]
                    ),
                )
                for module in formation["modules"]
            ),
        )
        for formation in payload["formations"]
    )
    return ArchiveModel(
        readme=payload["readme"],
        settings=payload["settings"],
        results=payload["results"],
        conversations=payload["conversations"],
        formations=formations,
    )


def _entry(entry: ArchiveEntry) -> dict[str, Any]:
    value: dict[str, Any] = {"name": entry.name}
    if entry.text is not None:
        value["text"] = entry.text
    if entry.storage_path is not None:
        value["storagePath"] = entry.storage_path
    return value


def test_slugs_and_module_folders_match() -> None:
    for case in ORACLE["slugs"]:
        assert archive_slug(case["value"]) == case["slug"], case["value"]
    for case in ORACLE["moduleFolders"]:
        assert module_folder(case["position"], case["title"]) == case["folder"], case["title"]


def test_archive_names_are_neutralised() -> None:
    for case in ORACLE["normalizedNames"]:
        assert normalize_archive_name(case["value"]) == case["normalized"], case["value"]


def test_build_archive_entries_matches_the_typescript_layout() -> None:
    for case in ORACLE["entries"]:
        produced = [_entry(entry) for entry in build_archive_entries(_model(case["model"]))]
        assert produced == case["entries"]


def test_size_labels_and_long_dates_are_french() -> None:
    for case in ORACLE["sizes"]:
        assert format_size_label(case["bytes"]) == case["label"], case["bytes"]
    for case in ORACLE["dates"]:
        assert format_long_date(parse_iso(case["instant"]), case["timezone"]) == case["label"]


def test_settings_json_drops_every_secret() -> None:
    for case in ORACLE["settings"]:
        payload = case["input"]
        produced = build_settings_json(
            SettingsInput(
                profile=payload["profile"],
                study_preferences=payload["studyPreferences"],
                notification_settings=payload["notificationSettings"],
                automations=tuple(payload["automations"]),
            )
        )
        assert produced == case["output"]


def test_downloadability_matches_the_typescript_rule() -> None:
    for case in ORACLE["download"]:
        record = DownloadableExport(
            status=case["status"],
            storage_path=case["storagePath"],
            expires_at=None if case["expiresAt"] is None else parse_iso(case["expiresAt"]),
        )
        assert can_download(record, parse_iso(case["now"])) is case["downloadable"], case


def test_every_archive_entry_field_is_covered() -> None:
    """Guard: a new field of `ArchiveEntry` must be added to the comparison above."""
    assert [field.name for field in fields(ArchiveEntry)] == ["name", "text", "storage_path"]
