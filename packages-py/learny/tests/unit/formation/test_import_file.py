"""[SPEC-2201] Imported programme text extraction (port of programme/import-file.ts)."""

import base64
import io
import zipfile

import pytest
from learny.formation.application.import_file import extract_programme_text
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2201")


def _docx(document: str) -> str:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", f"<w:document><w:body>{document}</w:body></w:document>")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_pasted_text_is_cleaned() -> None:
    extracted = extract_programme_text({"kind": "text", "text": "  Module 1 \r\n\r\n\r\n Notion  "})
    assert extracted["kind"] == "text"
    assert extracted["text"] == "Module 1\n\n\n Notion".strip()
    assert extracted["filename"] is None
    assert extracted["originalContent"] is None


def test_markdown_file_is_decoded() -> None:
    content = base64.b64encode(b"# Module 1\n\n- Notion A\n- Notion B\n").decode("ascii")
    extracted = extract_programme_text(
        {"kind": "file", "filename": "programme.md", "contentBase64": content}
    )
    assert extracted["kind"] == "file"
    assert extracted["filename"] == "programme.md"
    assert "Notion A" in extracted["text"]
    assert extracted["originalSize"] == len(base64.b64decode(content))


def test_docx_paragraphs_become_lines() -> None:
    content = _docx("<w:p><w:r><w:t>Module 1</w:t></w:r></w:p><w:p><w:r><w:t>Notion A</w:t></w:r></w:p>")
    extracted = extract_programme_text(
        {"kind": "file", "filename": "programme.docx", "contentBase64": content}
    )
    assert "Module 1" in extracted["text"]
    assert "Notion A" in extracted["text"]


def test_an_unsupported_extension_is_refused() -> None:
    content = base64.b64encode(b"something").decode("ascii")
    with pytest.raises(AppError) as failure:
        extract_programme_text({"kind": "file", "filename": "programme.xlsx", "contentBase64": content})
    assert failure.value.code == "UNSUPPORTED_TYPE"
    assert failure.value.status == 422


def test_an_empty_text_is_refused() -> None:
    with pytest.raises(AppError) as failure:
        extract_programme_text({"kind": "text", "text": "   "})
    assert failure.value.code == "TEXT_EMPTY"


def test_binary_text_is_refused() -> None:
    content = base64.b64encode(b"abc\x00def").decode("ascii")
    with pytest.raises(AppError) as failure:
        extract_programme_text({"kind": "file", "filename": "p.txt", "contentBase64": content})
    assert failure.value.code == "EXTRACTION_FAILED"
