"""[SPEC-4001] DOCX, TXT and Markdown sources of simple mode (EF-2)."""

import io
import zipfile

import pytest
from learny.content.domain.errors import IngestionError
from learny.content.infrastructure.detect import (
    DOCX_MIME,
    detect_document,
    detect_upload,
)
from learny.content.infrastructure.extract import extract_document

pytestmark = pytest.mark.spec("SPEC-4001")


def docx_bytes(text: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "word/document.xml",
            f'<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>{text}</w:t>'
            "</w:r></w:p><w:p><w:r><w:t>Deuxieme paragraphe.</w:t></w:r></w:p>"
            "</w:body></w:document>",
        )
    return buffer.getvalue()


def test_a_markdown_source_is_detected_and_extracted() -> None:
    data = b"# Comptabilite\n\nLe plan comptable et les comptes."
    assert detect_document(data) == "text/markdown"
    content = extract_document(data, "text/markdown")
    assert content.pages is None
    assert content.title == "# Comptabilite"
    assert content.locations[0].char_start == 0
    assert content.locations[0].char_end == len(content.text)


def test_a_plain_text_source_is_detected() -> None:
    data = b"Chapitre 1\nLe contenu du cours."
    assert detect_document(data) == "text/plain"
    assert extract_document(data, "text/plain").title == "Chapitre 1"


def test_a_docx_source_is_read_from_its_document_xml() -> None:
    data = docx_bytes("Introduction")
    assert detect_document(data) == DOCX_MIME
    content = extract_document(data, DOCX_MIME)
    assert "Introduction" in content.text
    assert "Deuxieme paragraphe." in content.text


def test_a_binary_file_is_refused_as_a_document() -> None:
    with pytest.raises(IngestionError):
        extract_document(b"\x00\x01\x02\x03", "text/plain")


def test_an_empty_document_is_refused() -> None:
    with pytest.raises(IngestionError):
        extract_document(b"   \n\n ", "text/plain")


def test_detect_upload_honours_the_document_flag() -> None:
    data = b"Un texte simple."
    assert detect_upload(data, "pdf", document=True).mime == "text/plain"
    assert detect_upload(data, "pdf", document=True).pages is None
