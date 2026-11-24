"""[SPEC-2206] Layout of the personal-data archive (SPEC-211, CA-1).

Slugs, module numbering, collisions suffixed `-2`, hostile names neutralised, `settings.json`
without any secret, French size and date labels.
"""

import pytest
from learny.privacy.domain.archive import (
    ArchiveApport,
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
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2206")


def _model(formations: tuple[ArchiveFormation, ...]) -> ArchiveModel:
    return ArchiveModel(
        readme="README", settings={"profile": {}}, results={}, conversations={}, formations=formations
    )


def test_slugs_module_numbering_and_fixed_files() -> None:
    assert archive_slug("SAP S/4HANA \u2014 Finance") == "sap-s-4hana-finance"
    assert archive_slug("\u00c9l\u00e8ve") == "eleve"
    assert module_folder(1, "Comptabilit\u00e9 g\u00e9n\u00e9rale") == "01-comptabilite-generale"
    assert module_folder(12, "Module") == "12-module"
    names = [
        entry.name
        for entry in build_archive_entries(
            _model(
                (
                    ArchiveFormation(
                        title="SAP S/4HANA Finance",
                        programme={"formation": {"title": "SAP"}},
                        modules=(
                            ArchiveModule(
                                position=1,
                                title="Comptabilit\u00e9 g\u00e9n\u00e9rale",
                                course_markdown="# Cours\n",
                                apports=(
                                    ArchiveApport(
                                        name="Guide FI.pdf",
                                        storage_path="user/resource/Guide FI.pdf",
                                    ),
                                ),
                            ),
                        ),
                    ),
                )
            )
        )
    ]
    assert names == [
        "README.txt",
        "settings.json",
        "results.json",
        "conversations.json",
        "formations/sap-s-4hana-finance/programme.json",
        "formations/sap-s-4hana-finance/01-comptabilite-generale/cours.md",
        "apports/sap-s-4hana-finance/01-comptabilite-generale/Guide FI.pdf",
    ]


def test_collisions_are_suffixed_without_overwriting_a_file() -> None:
    names = [
        entry.name
        for entry in build_archive_entries(
            _model(
                (
                    ArchiveFormation(
                        title="Formation",
                        programme={},
                        modules=(
                            ArchiveModule(
                                position=1,
                                title="Module",
                                apports=(
                                    ArchiveApport(name="notes.txt", text="a"),
                                    ArchiveApport(name="notes.txt", text="b"),
                                    ArchiveApport(name="notes.txt", text="c"),
                                ),
                            ),
                        ),
                    ),
                )
            )
        )
    ]
    assert "apports/formation/01-module/notes.txt" in names
    assert "apports/formation/01-module/notes-2.txt" in names
    assert "apports/formation/01-module/notes-3.txt" in names
    assert len(set(names)) == len(names)


def test_a_hostile_name_stays_inside_apports() -> None:
    assert normalize_archive_name("../../etc/passwd") == "etc-passwd"
    assert normalize_archive_name("..\\..\\windows\\system32") == "windows-system32"
    assert normalize_archive_name("a\x00b.txt") == "ab.txt"
    assert normalize_archive_name("") == "fichier"
    assert normalize_archive_name("C:secret?.pdf") == "C-secret-.pdf"
    names = [
        entry.name
        for entry in build_archive_entries(
            _model(
                (
                    ArchiveFormation(
                        title="Formation",
                        programme={},
                        modules=(
                            ArchiveModule(
                                position=1,
                                title="Module",
                                apports=(ArchiveApport(name="../../etc/passwd", text="x"),),
                            ),
                        ),
                    ),
                )
            )
        )
    ]
    assert "apports/formation/01-module/etc-passwd" in names
    assert all(".." not in name and not name.startswith("/") for name in names)


def test_settings_json_never_contains_a_key_or_a_secret() -> None:
    settings = build_settings_json(
        SettingsInput(
            profile={"email": "eleve@test.learny.test", "timezone": "Europe/Paris"},
            study_preferences={"hoursPerDay": 2},
            notification_settings={"channelEmail": True},
            automations=(
                {"key": "reprise", "enabled": True, "params": {"apiKey": "secret", "nested": {"token": "x"}}},
            ),
        )
    )
    serialised = str(settings)
    assert "apiKey" not in serialised
    assert "token" not in serialised
    assert "eleve@test.learny.test" in serialised
    assert settings["automations"] == [{"key": "reprise", "enabled": True, "params": {"nested": {}}}]


def test_size_and_local_date_labels_are_french() -> None:
    assert format_size_label(12_400_000) == "12,4 Mo"
    assert format_size_label(1024) == "1 Ko"
    assert format_size_label(980) == "980 o"
    assert format_long_date(parse_iso("2026-11-18T12:20:00Z"), "Europe/Paris") == (
        "mercredi 18 novembre \u00e0 13:20"
    )
    assert format_long_date(parse_iso("2026-11-11T12:20:00Z"), "Europe/Paris") == (
        "mercredi 11 novembre \u00e0 13:20"
    )
