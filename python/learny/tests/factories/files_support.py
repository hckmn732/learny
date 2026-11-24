"""Byte builders of the upload tests.

A test file is built in memory, never committed: the PDF assembler is the one (a valid `/Pages` tree
with `/Count` pages, no font and no text, so `pypdf` reads exactly the expected page count), and the
image helpers only write the signatures `file-type` recognises, which is what `detect_mime` reads.
"""


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


def assemble_pdf(pages: list[tuple[tuple[str, ...], bool]]) -> bytes:
    """A valid PDF whose page count is `len(pages)`."""
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


def build_pdf(pages: int) -> bytes:
    """A valid PDF of exactly `pages` pages."""
    return assemble_pdf([((), False) for _ in range(pages)])


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff\xe0"
GIF_SIGNATURE = b"GIF89a"
EXE_SIGNATURE = b"MZ\x90\x00"


def pad(data: bytes, size: int) -> bytes:
    """`data` grown with zero bytes up to `size` (already long enough: returned as is)."""
    return data if len(data) >= size else data + b"\x00" * (size - len(data))


def build_image(format_name: str, size: int = 1024) -> bytes:
    """Bytes whose signature announces `format_name`, padded to `size`."""
    if format_name == "png":
        return pad(PNG_SIGNATURE, size)
    if format_name == "jpeg":
        return pad(JPEG_SIGNATURE, size)
    if format_name == "webp":
        return pad(b"RIFF" + (size - 8).to_bytes(4, "little") + b"WEBP", size)
    if format_name == "heic":
        return pad(b"\x00\x00\x00\x18ftypheic", size)
    if format_name == "gif":
        return pad(GIF_SIGNATURE, size)
    if format_name == "exe":
        return pad(EXE_SIGNATURE, size)
    raise AssertionError(f"unknown format: {format_name}")
