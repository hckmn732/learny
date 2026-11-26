"""Figures of a deposited PDF (QA 2026-11-26): the images a course shows next to its text.

Two sources, in this order:

- the raster images embedded in the pages, without the decorations repeated on many pages
  (logos, backgrounds) nor the tiny ones (icons, bullets);
- a rendering of every page that mentions a figure, a diagram or a table but holds no usable
  image: vector drawings cannot be extracted, so the page itself is drawn as an image.

The files go to the private `resources` bucket next to the document, with the service role, under
`<owner>/<resource>/figure-<n>.<ext>`. Nothing here is logged and nothing raises: a document whose figures
cannot be read keeps its text.
"""

# ruff: noqa: S112 - an unreadable image or page is skipped silently: its content is never logged.

import hashlib
import io
import logging
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, replace
from typing import Any
from urllib.parse import quote

import httpx

from learny.platform.storage import parse_owned_path
from learny.shared.config import Settings

MIN_WIDTH = 200
MIN_HEIGHT = 150
MIN_BYTES = 1500
REPEATED_ON_PAGES = 3
MAX_FIGURES = 150
# An image object counts when it covers between 1.5 % and 85 % of the page (not a bullet, not
# a scanned page or a background).
IMAGE_MIN_SHARE = 0.015
IMAGE_MAX_SHARE = 0.85
CROP_MARGIN = 0.02
RENDER_SCALE = 2.0
JPEG_QUALITY = 82
UPLOAD_TIMEOUT_SECONDS = 30.0

_MENTION = re.compile(r"\b(figure|fig\.|sch[ée]ma|tableau|illustration)\s*n?°?\s*\d", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class Figure:
    """One figure: its page, its bytes and what it is (`image` zone of a page, `page` whole page)."""

    page: int
    data: bytes
    mime: str
    width: int
    height: int
    kind: str
    caption: str = ""


def _jpeg(image: Any) -> tuple[bytes, int, int]:
    """An image as a compact JPEG (photos, scans) with its size."""
    converted = image.convert("RGB")
    buffer = io.BytesIO()
    converted.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buffer.getvalue(), converted.width, converted.height


def _image_pages(reader: Any) -> set[int]:
    """The pages that hold a distinct raster image (decorations repeated on many pages excluded)."""
    seen_on: Counter[str] = Counter()
    found: list[tuple[int, str]] = []
    for number, page in enumerate(reader.pages, start=1):
        try:
            images = list(page.images)
        except Exception:  # an unreadable page keeps its text
            continue
        for image_file in images:
            try:
                image = image_file.image
                raw = image_file.data
            except Exception:  # an unsupported encoding is skipped
                continue
            if image is None or image.width < MIN_WIDTH or image.height < MIN_HEIGHT:
                continue
            if len(raw) < MIN_BYTES:
                continue
            digest = hashlib.sha1(raw, usedforsecurity=False).hexdigest()
            seen_on[digest] += 1
            found.append((number, digest))
    return {number for number, digest in found if seen_on[digest] <= REPEATED_ON_PAGES}


def _mention_pages(reader: Any) -> set[int]:
    """The pages whose text announces a figure, a diagram or a table."""
    pages: set[int] = set()
    for number, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            continue
        if _MENTION.search(text):
            pages.add(number)
    return pages


def _image_box(page: Any, pdfium: Any) -> tuple[float, float, float, float] | None:
    """The union of the image objects of a page, decorations covering the page excluded."""
    width, height = page.get_size()
    area = width * height
    box: list[float] | None = None
    for item in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE], max_depth=2):
        try:
            left, bottom, right, top = item.get_bounds()
        except Exception:
            continue
        share = max(0.0, right - left) * max(0.0, top - bottom) / area if area else 0.0
        if share < IMAGE_MIN_SHARE or share > IMAGE_MAX_SHARE:
            continue
        if box is None:
            box = [left, bottom, right, top]
        else:
            box = [min(box[0], left), min(box[1], bottom), max(box[2], right), max(box[3], top)]
    if box is None:
        return None
    # A margin keeps the labels and the caption printed around the drawing.
    margin_x, margin_y = width * CROP_MARGIN, height * CROP_MARGIN * 2
    return (
        max(0.0, box[0] - margin_x),
        max(0.0, box[1] - margin_y),
        min(width, box[2] + margin_x),
        min(height, box[3] + margin_y),
    )


def _render(document: Any, number: int, pdfium: Any) -> Figure | None:
    """One figure of a page: the zone of its images, or the whole page for a vector drawing."""
    page = document[number - 1]
    try:
        width, height = page.get_size()
        box = _image_box(page, pdfium)
        if box is None:
            bitmap = page.render(scale=RENDER_SCALE)
            kind = "page"
        else:
            left, bottom, right, top = box
            bitmap = page.render(scale=RENDER_SCALE, crop=(left, bottom, width - right, height - top))
            kind = "image"
        encoded, out_width, out_height = _jpeg(bitmap.to_pil())
    except Exception:
        return None
    finally:
        page.close()
    return Figure(page=number, data=encoded, mime="image/jpeg", width=out_width, height=out_height, kind=kind)


def extract_pdf_figures(data: bytes) -> list[Figure]:
    """One figure per illustrated page, in page order, at most `MAX_FIGURES`; empty on failure."""
    try:
        import pypdfium2 as pdfium  # type: ignore[import-untyped]
        from pypdf import PdfReader
    except ImportError:
        return []
    previous = logging.getLogger("pypdf").level
    logging.getLogger("pypdf").setLevel(logging.CRITICAL)
    try:
        reader = PdfReader(io.BytesIO(data))
        wanted = sorted(_image_pages(reader) | _mention_pages(reader))[:MAX_FIGURES]
    except Exception:
        return []
    finally:
        logging.getLogger("pypdf").setLevel(previous)
    figures: list[Figure] = []
    try:
        document = pdfium.PdfDocument(data)
    except Exception:
        return []
    try:
        for number in wanted:
            figure = _render(document, number, pdfium)
            if figure is not None:
                figures.append(figure)
    finally:
        document.close()
    return figures


# The model reading of a page: is there a drawing, where, and what does it show (QA 2026-11-26).
VISION_MARGIN = 0.04
THUMBNAIL_MAX_SIDE = 1100
MIN_BOX_SHARE = 0.02


def thumbnail(figure: Figure) -> bytes:
    """A light copy of the figure for the vision model."""
    from PIL import Image

    image = Image.open(io.BytesIO(figure.data)).convert("RGB")
    image.thumbnail((THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_SIDE))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    return buffer.getvalue()


def _box(raw: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        left, top, right, bottom = (float(value) for value in raw)
    except (TypeError, ValueError):
        return None
    if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
        return None
    if (right - left) * (bottom - top) < MIN_BOX_SHARE:
        return None
    return left, top, right, bottom


def apply_reading(figure: Figure, reading: Any) -> Figure | None:
    """The figure cropped to the drawing the model found; `None` for a page of text only.

    Without a usable reading (model failure, malformed answer) the figure is kept as it is: an
    image is never lost because the model could not be read.
    """
    if not isinstance(reading, dict):
        return figure
    if reading.get("hasFigure") is False:
        return None
    caption = " ".join(str(reading.get("caption") or "").split())[:160]
    box = _box(reading.get("box"))
    if box is None:
        return replace(figure, caption=caption)
    try:
        from PIL import Image

        image = Image.open(io.BytesIO(figure.data))
        width, height = image.size
        left, top, right, bottom = box
        cropped = image.crop(
            (
                int(max(0.0, left - VISION_MARGIN) * width),
                int(max(0.0, top - VISION_MARGIN) * height),
                int(min(1.0, right + VISION_MARGIN) * width),
                int(min(1.0, bottom + VISION_MARGIN) * height),
            )
        )
        data, out_width, out_height = _jpeg(cropped)
    except Exception:
        return replace(figure, caption=caption)
    return replace(figure, data=data, width=out_width, height=out_height, kind="image", caption=caption)


def figure_path(owner_id: str, resource_id: str, index: int, mime: str) -> str:
    extension = "png" if mime == "image/png" else "jpg"
    return f"{owner_id}/{resource_id}/figure-{index}.{extension}"


async def upload_figures(
    settings: Settings, owner_id: str, resource_id: str, figures: Sequence[Figure]
) -> list[dict[str, Any]]:
    """Stores the figures and returns their metadata entries (`n`, `page`, `kind`, `path`…)."""
    base = f"{settings.supabase_url.rstrip('/')}/storage/v1" if settings.supabase_url else ""
    anon_key = settings.supabase_anon_key
    service_key = settings.supabase_service_role_key
    if not base or not anon_key or not service_key:
        return []
    entries: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=UPLOAD_TIMEOUT_SECONDS, trust_env=False) as client:
        for index, figure in enumerate(figures):
            path = figure_path(owner_id, resource_id, index, figure.mime)
            encoded = "/".join(quote(segment, safe="") for segment in path.split("/"))
            try:
                response = await client.post(
                    f"{base}/object/resources/{encoded}",
                    headers={
                        "apikey": anon_key,
                        "authorization": f"Bearer {service_key}",
                        "content-type": figure.mime,
                        "x-upsert": "true",
                    },
                    content=figure.data,
                )
            except httpx.HTTPError:
                continue
            if response.status_code >= 400:
                continue
            entries.append(
                {
                    "n": index,
                    "page": figure.page,
                    "kind": figure.kind,
                    "mime": figure.mime,
                    "width": figure.width,
                    "height": figure.height,
                    "path": path,
                    "caption": figure.caption,
                }
            )
    return entries


async def read_figure(settings: Settings, owner_id: str, path: str) -> bytes | None:
    """The bytes of a stored figure, bound to its owner; `None` when it is missing."""
    owned = parse_owned_path(path, owner_id)
    base = f"{settings.supabase_url.rstrip('/')}/storage/v1" if settings.supabase_url else ""
    if owned is None or not base or not owned.name.startswith("figure-"):
        return None
    encoded = "/".join(quote(segment, safe="") for segment in path.split("/"))
    try:
        async with httpx.AsyncClient(timeout=UPLOAD_TIMEOUT_SECONDS, trust_env=False) as client:
            response = await client.get(
                f"{base}/object/authenticated/resources/{encoded}",
                headers={
                    "apikey": settings.supabase_anon_key,
                    "authorization": f"Bearer {settings.supabase_service_role_key}",
                },
            )
    except httpx.HTTPError:
        return None
    if response.status_code >= 400:
        return None
    return response.content


__all__ = [
    "Figure",
    "apply_reading",
    "extract_pdf_figures",
    "figure_path",
    "read_figure",
    "thumbnail",
    "upload_figures",
]
