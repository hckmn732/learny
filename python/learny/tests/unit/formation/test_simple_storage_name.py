"""[SPEC-4002] La clé de stockage d'un document du mode simple reste en ASCII (EF-2)."""

import pytest
from learny.formation.application.simple.sources import storage_file_name


@pytest.mark.parametrize(
    ("original", "expected"),
    [
        ("Manuel de comptabilité générale.pdf", "Manuel-de-comptabilite-generale.pdf"),
        ("TD corrigés.txt", "TD-corriges.txt"),
        ("cours.pdf", "cours.pdf"),
        ("  Annales DCG 2023-2025.docx  ", "Annales-DCG-2023-2025.docx"),
        ("ééé", "eee"),
        ("???", "document"),
    ],
)
def test_the_storage_key_is_ascii(original: str, expected: str) -> None:
    assert storage_file_name(original) == expected


def test_the_extension_is_kept() -> None:
    assert storage_file_name("Révisions – chapitre 3.md").endswith(".md")
