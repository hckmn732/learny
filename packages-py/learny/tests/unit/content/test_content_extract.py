"""[SPEC-2203] Extractors: note, PDF, web page, YouTube captions and image reading.

No test opens a socket: the web fetcher and the vision reader are injected.
"""

import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from learny.content.domain.errors import IngestionError
from learny.content.infrastructure.extract import (
    ImageResourceInput,
    PdfLimits,
    VisionOrigin,
    VisionReading,
    extract_image,
    extract_image_document,
    extract_note,
    extract_pdf,
    extract_web,
    extract_web_document,
    extract_youtube,
    parse_youtube_url,
    youtube_content,
)
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2203")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def web_fixture() -> dict[str, Any]:
    payload: Any = json.loads((FIXTURES / "content_web.json").read_text(encoding="utf-8"))
    assert isinstance(payload, dict)
    return payload


# --- PDF fixture builder --------------------------


def pdf_literal(value: str) -> str:
    out = ""
    for character in value:
        code = ord(character)
        if character in ("(", ")", "\\"):
            out += f"\\{character}"
        elif 32 <= code <= 126:
            out += character
        elif code <= 255:
            out += f"\\{code:03o}"
        else:
            out += "?"
    return out


def assemble(pages: list[tuple[tuple[str, ...], bool]]) -> bytes:
    objects: list[str] = []
    font_object = 3 + len(pages) * 2
    objects.append("<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{index + 3} 0 R" for index in range(len(pages)))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>")
    for index in range(len(pages)):
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_object} 0 R >> >> "
            f"/Contents {3 + len(pages) + index} 0 R >>"
        )
    for lines, with_text in pages:
        content = ""
        if with_text:
            body = " ".join(
                f"{'' if index == 0 else '0 -16 Td '}({pdf_literal(line)}) Tj"
                for index, line in enumerate(lines)
            )
            content = f"BT /F1 12 Tf 72 720 Td {body} ET"
        objects.append(f"<< /Length {len(content)} >>\nstream\n{content}\nendstream")
    objects.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")

    body = "%PDF-1.4\n"
    offsets: list[int] = []
    for index, item in enumerate(objects):
        offsets.append(len(body))
        body += f"{index + 1} 0 obj\n{item}\nendobj\n"
    xref = len(body)
    body += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n"
    for offset in offsets:
        body += f"{offset:010d} 00000 n \n"
    body += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return body.encode("latin-1")


def build_text_pdf(pages: list[tuple[str, ...]]) -> bytes:
    return assemble([(lines, True) for lines in pages])


def build_empty_pdf(page_count: int = 1) -> bytes:
    return assemble([((), False) for _ in range(page_count)])


def demo_pdf() -> bytes:
    return build_text_pdf(
        [
            (
                "Comptabilit\u00e9 g\u00e9n\u00e9rale",
                "Le d\u00e9bit augmente les actifs et les charges.",
                "Le cr\u00e9dit augmente les passifs et les produits.",
                (
                    "Une \u00e9criture\u0020est\u0020\u00e9quilibr\u00e9e quand le total "
                    "des d\u00e9bits \u00e9gale le total des cr\u00e9dits."
                ),
            ),
            (
                "Contr\u00f4le des comptes",
                "Le compte 401 enregistre les fournisseurs.",
                "Le compte 512 enregistre la banque.",
                "Rapprochez toujours le solde du compte avec le relev\u00e9.",
            ),
        ]
    )


# --- note ---------------------------------------------------------------------------------------


def test_a_note_keeps_its_exact_range() -> None:
    content = extract_note("La photosynthese.")

    assert content.text == "La photosynthese."
    assert content.pages is None
    assert len(content.locations) == 1
    assert (content.locations[0].char_start, content.locations[0].char_end) == (0, 17)


def test_an_empty_note_is_a_permanent_failure() -> None:
    with pytest.raises(IngestionError) as error:
        extract_note("   ")
    assert error.value.code == "NOTE_EMPTY"


def test_an_oversized_note_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        extract_note("a" * 100_001)
    assert error.value.code == "NOTE_TOO_LARGE"


# --- PDF ----------------------------------------------------------------------------------------


def test_a_pdf_is_extracted_page_by_page_with_exact_locations() -> None:
    content = extract_pdf(demo_pdf())

    assert content.pages == 2
    assert [location.page for location in content.locations] == [1, 2]
    assert "Le d\u00e9bit augmente les actifs et les charges." in content.text
    assert "Le compte 512 enregistre la banque." in content.text
    for location in content.locations:
        assert content.text[location.char_start : location.char_end].strip() != ""


def test_a_pdf_without_text_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        extract_pdf(build_empty_pdf(1))
    assert error.value.code == "PDF_EMPTY_TEXT"


def test_a_corrupted_pdf_is_refused() -> None:
    corrupted = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n"

    with pytest.raises(IngestionError) as error:
        extract_pdf(corrupted)
    assert error.value.code in ("PDF_CORRUPTED", "PDF_EMPTY_TEXT")


def test_a_pdf_beyond_the_page_bound_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        extract_pdf(demo_pdf(), PdfLimits(max_pages=1))
    assert error.value.code == "PDF_TOO_MANY_PAGES"


def test_a_pdf_beyond_the_byte_bound_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        extract_pdf(demo_pdf(), PdfLimits(max_bytes=10))
    assert error.value.code == "PDF_TOO_LARGE"


# --- web ----------------------------------------------------------------------------------------

ROBOTS_TEXT = "Le site interdit la lecture de cette page."


def web_fetcher(payload: dict[str, Any]) -> Any:
    async def fetch(url: str) -> Any:
        from learny.content.infrastructure.extract import WebFetchResult

        return WebFetchResult(
            url=url, content_type=payload["contentType"], body=payload["html"].encode("utf-8")
        )

    return fetch


async def test_the_main_text_and_anchors_are_kept_without_navigation() -> None:
    payload = web_fixture()

    extraction = await extract_web(payload["url"], fetcher=web_fetcher(payload))

    assert extraction["title"].startswith("Comptabilit\u00e9")
    assert extraction["siteName"] == payload["siteName"]
    assert extraction["language"] == payload["language"]
    assert "Le compte de r\u00e9sultat pr\u00e9sente les charges" in extraction["text"]
    for forbidden in payload["forbidden"]:
        assert forbidden not in extraction["text"]
    anchor_ids = [anchor["id"] for anchor in extraction["anchors"]]
    assert all(expected in anchor_ids for expected in payload["anchors"])


async def test_the_located_content_keeps_exact_ranges_and_anchors() -> None:
    payload = web_fixture()

    document = await extract_web_document(payload["url"], fetcher=web_fetcher(payload))

    assert document.content.text == document.extraction["text"]
    assert len(document.content.locations) >= 3
    for location in document.content.locations:
        assert document.content.text[location.char_start : location.char_end] != ""
        if location.anchor is not None:
            assert location.anchor in [anchor["id"] for anchor in document.extraction["anchors"]]
    assert any(location.anchor == "marge-brute" for location in document.content.locations)
    assert any(location.anchor == "resultat-net" for location in document.content.locations)


async def test_a_non_html_answer_and_an_invalid_url_are_refused() -> None:
    async def pdf_fetcher(url: str) -> Any:
        from learny.content.infrastructure.extract import WebFetchResult

        return WebFetchResult(url=url, content_type="application/pdf", body=b"%PDF-1.4")

    with pytest.raises(IngestionError) as error:
        await extract_web(web_fixture()["url"], fetcher=pdf_fetcher)
    assert error.value.code == "WEB_UNSUPPORTED_CONTENT"

    with pytest.raises(IngestionError) as invalid:
        await extract_web("javascript:alert(1)", fetcher=web_fetcher(web_fixture()))
    assert invalid.value.code == "URL_INVALID"


async def test_a_robots_refusal_becomes_a_permanent_robots_disallowed() -> None:
    async def blocked(_url: str) -> Any:
        raise AppError("WEB_ROBOTS_DISALLOWED", ROBOTS_TEXT)

    with pytest.raises(IngestionError) as error:
        await extract_web(web_fixture()["url"], fetcher=blocked)
    assert error.value.code == "ROBOTS_DISALLOWED"
    assert error.value.permanent is True


# --- YouTube ------------------------------------------------------------------------------------


def test_youtube_urls_are_strictly_parsed() -> None:
    assert parse_youtube_url("https://youtu.be/dQw4w9WgXcQ")[0] == "dQw4w9WgXcQ"
    assert parse_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")[0] == "dQw4w9WgXcQ"
    assert parse_youtube_url("https://www.youtube.com/shorts/dQw4w9WgXcQ")[0] == "dQw4w9WgXcQ"
    with pytest.raises(IngestionError):
        parse_youtube_url("https://example.test/watch?v=dQw4w9WgXcQ")


async def test_timed_captions_and_a_video_without_captions() -> None:
    extraction = await extract_youtube("https://youtu.be/dQw4w9WgXcQ")

    assert extraction.video_id == "dQw4w9WgXcQ"
    assert len(extraction.segments) > 3
    assert extraction.segments[0].start_sec == 0
    assert extraction.segments[0].end_sec == 9
    assert extraction.segments[-1].end_sec == 96

    content = youtube_content(extraction)
    assert "Le compte de r\u00e9sultat pr\u00e9sente les charges" in content.text
    for location in content.locations:
        assert content.text[location.char_start : location.char_end] != ""
        assert location.start_sec is not None
        assert location.start_sec >= 0
        assert location.end_sec is not None
        assert location.end_sec >= location.start_sec

    with pytest.raises(IngestionError) as error:
        await extract_youtube("https://www.youtube.com/watch?v=noCaptions1")
    assert error.value.code == "YOUTUBE_NO_CAPTIONS"
    assert error.value.permanent is True


async def test_an_invalid_youtube_url_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        await extract_youtube("https://www.youtube.com/watch?v=trop-court")
    assert error.value.code == "YOUTUBE_INVALID_URL"


# --- image --------------------------------------------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n\x00"


class FakeVisionReader:
    async def read(self, _resource: ImageResourceInput) -> VisionReading:
        return VisionReading(
            text="Compte 512 - banque, solde debiteur de 1 200 EUR.",
            origin=VisionOrigin(provider="anthropic", model_id="model-c"),
        )


async def test_an_image_is_read_by_the_light_model_and_marked_as_a_model_reading() -> None:
    extraction = await extract_image(
        ImageResourceInput(bytes=PNG, mime="image/png", title="Capture du compte 512"),
        FakeVisionReader(),
    )

    assert "Compte 512" in str(extraction["text"])
    assert extraction["origin"] == {
        "task": "light",
        "provider": "anthropic",
        "modelId": "model-c",
    }

    document = await extract_image_document(
        ImageResourceInput(bytes=PNG, mime="image/png", title="Capture du compte 512"),
        reader=FakeVisionReader(),
    )
    assert document.content.content_origin == "model"
    assert document.content.vision is not None
    assert document.content.vision.model_id == "model-c"
    assert document.content.locations[0].anchor == "lecture-ia"
    assert document.content.text[0 : document.content.locations[0].char_end] == document.content.text


async def test_an_unreadable_or_oversized_image_is_refused() -> None:
    with pytest.raises(IngestionError) as mismatch:
        await extract_image(
            ImageResourceInput(bytes=PNG, mime="image/jpeg", title="Capture"), FakeVisionReader()
        )
    assert mismatch.value.code == "IMAGE_UNREADABLE"

    with pytest.raises(IngestionError) as empty:
        await extract_image(
            ImageResourceInput(bytes=b"", mime="image/png", title="Capture"), FakeVisionReader()
        )
    assert empty.value.code == "IMAGE_UNREADABLE"

    with pytest.raises(IngestionError) as too_large:
        await extract_image(
            ImageResourceInput(bytes=b"\x89PNG\r\n\x1a\n" + b"a" * 10_485_760, mime="image/png", title="C"),
            FakeVisionReader(),
        )
    assert too_large.value.code == "IMAGE_TOO_LARGE"


async def test_no_description_is_invented_when_the_model_is_unavailable() -> None:
    class Unavailable:
        async def read(self, _resource: ImageResourceInput) -> VisionReading:
            raise AppError("AI_UNAVAILABLE", "modele absent")

    with pytest.raises(IngestionError) as error:
        await extract_image(ImageResourceInput(bytes=PNG, mime="image/png", title="Capture"), Unavailable())
    assert error.value.code == "IMAGE_VISION_UNAVAILABLE"


async def _empty_stream() -> AsyncIterator[bytes]:
    if False:
        yield b""
