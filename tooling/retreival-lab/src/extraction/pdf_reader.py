"""PDF reading with a selectable-text fast path and an OCR fallback."""
import re
from pathlib import Path

from src.extraction.models import Block, Page, ParsedDocument
from src.extraction.ocr_processor import OCRError, ocr_pdf_page
from src.extraction.text_utils import detect_printed_page, json_dumps

MIN_TEXT_CHARS = 40
_BARE_NUMBER = re.compile(r"^\d+(?:\.\d+)*\s*[.)-]$")


def _merge_numbered_heading_lines(blocks: list[Block]) -> list[Block]:
    """Join '4.2-' and 'Posologie ...' when the PDF splits a heading in two."""
    merged: list[Block] = []
    index = 0
    while index < len(blocks):
        block = blocks[index]
        if (_BARE_NUMBER.fullmatch((block.text or "").strip())
                and index + 1 < len(blocks)):
            following = blocks[index + 1]
            if (following.page == block.page and len(following.text) <= 140
                    and not re.match(r"^\d", following.text.strip())):
                merged.append(Block(
                    text=f"{block.text.strip()} {following.text.strip()}",
                    page=block.page, kind="text",
                    bold=block.bold or following.bold,
                    size=max(block.size, following.size),
                    source="pdf",
                ))
                index += 2
                continue
        merged.append(block)
        index += 1
    return merged


_BULLET_ONLY = re.compile(r"^[•·▪◦‣∙\-–—]+$")
_BULLET_CHARS = "•·▪◦‣∙"


def _visual_drug_facts_order(items: list[tuple[Block, tuple]]) -> list[tuple[Block, tuple]]:
    """Reconstruct the reading order of a multi-column Drug Facts label.

    PyMuPDF returns the bullet glyphs and the text they introduce as separate
    text streams, sometimes far apart in content order.  Pair each lone bullet
    with the text line on its right, then sort by physical position.  This is
    only used when the first page says "Drug Facts"; ordinary RCPs keep the
    producer's order.
    """
    bullets = [(block, bbox) for block, bbox in items
               if _BULLET_ONLY.fullmatch(block.text.strip())]
    body = [(block, bbox) for block, bbox in items
            if not _BULLET_ONLY.fullmatch(block.text.strip())]
    for bullet, bullet_box in bullets:
        target = None
        for index, (block, box) in enumerate(body):
            if (abs(bullet_box[1] - box[1]) <= 3
                    and abs(bullet_box[3] - box[3]) <= 10
                    and box[0] > bullet_box[0]):
                target = index
                break
        if target is None:
            body.append((bullet, bullet_box))
            continue
        block, box = body[target]
        body[target] = (Block(
            text=f"{bullet.text.strip().split()[0]} {block.text}",
            page=block.page, kind=block.kind, level=block.level,
            heading_key=block.heading_key, heading_title=block.heading_title,
            bold=block.bold, size=block.size, source=block.source,
        ), box)
    body.sort(key=lambda item: (round(item[1][1], 1), round(item[1][0], 1)))
    return body


def _page_blocks(page, page_number: int,
                 visual_order: bool = False) -> list[Block]:
    """Text lines of a page, carrying font size/bold for heading detection."""
    items: list[tuple[Block, tuple]] = []
    data = page.get_text("dict")
    for raw_block in data.get("blocks", []):
        if raw_block.get("type") != 0:
            continue
        for line in raw_block.get("lines", []):
            spans = line.get("spans", [])
            text = "".join(span.get("text", "") for span in spans).strip()
            if not text:
                continue
            sizes = [float(span.get("size") or 0) for span in spans]
            bold = any((int(span.get("flags") or 0) & 16)
                       or "bold" in str(span.get("font", "")).lower()
                       for span in spans)
            items.append((Block(
                text=text,
                page=page_number,
                kind="text",
                bold=bold,
                size=max(sizes) if sizes else 0.0,
                source="pdf",
            ), line.get("bbox") or (0, 0, 0, 0)))
    if visual_order:
        items = _visual_drug_facts_order(items)
    blocks = [block for block, _ in items]
    return _merge_numbered_heading_lines(blocks)


def _ocr_blocks(text: str, page_number: int) -> list[Block]:
    return [Block(text=line.strip(), page=page_number, kind="text",
                  source="ocr")
            for line in (text or "").splitlines() if line.strip()]


def read_pdf(path: Path, ocr_mode: str = "auto",
             languages: str = "fra+ara+eng") -> ParsedDocument:
    """Read a PDF, page by page, OCR only when the text layer is empty."""
    import pymupdf

    pages: list[Page] = []
    confidences: list[float] = []
    used_languages: set[str] = set()
    ocr_used = False
    warnings: list[str] = []

    with pymupdf.open(path) as doc:
        first_text = (doc[0].get_text("text") or "").lower() if len(doc) else ""
        visual_order = "drug facts" in first_text
        for number, page in enumerate(doc, start=1):
            text = page.get_text("text") or ""
            page_ocr = False
            confidence = None
            needs_ocr = ocr_mode == "force" or (
                ocr_mode != "never" and len(text.strip()) < MIN_TEXT_CHARS)
            if needs_ocr:
                try:
                    result = ocr_pdf_page(page, languages=languages)
                    text = result.text
                    confidence = result.confidence
                    page_ocr = True
                    ocr_used = True
                    used_languages.add(result.languages)
                    if confidence is not None:
                        confidences.append(confidence)
                except OCRError as exc:
                    warnings.append(f"page {number}: {exc}")

            try:
                label = page.get_label() or ""
            except Exception:
                label = ""
            printed = detect_printed_page(text, label)
            blocks = (_ocr_blocks(text, number) if page_ocr
                      else _page_blocks(page, number, visual_order=visual_order))
            pages.append(Page(
                number=number,
                text=text,
                printed_label=printed,
                ocr_used=page_ocr,
                ocr_confidence=confidence,
                blocks=blocks,
            ))

    mean_confidence = round(sum(confidences) / len(confidences), 2) if confidences else None
    return ParsedDocument(
        path=str(path),
        suffix=path.suffix.lower(),
        pages=pages,
        page_type="PDF",
        ocr_used=ocr_used,
        ocr_languages="+".join(sorted(used_languages)),
        ocr_confidence=mean_confidence,
        encoding_warning="; ".join(warnings),
    )


def capture_pdf_tables(path: Path, page_numbers: list[int]) -> list[dict]:
    """Extract table structure for the pages a section actually uses."""
    import pymupdf

    out: list[dict] = []
    wanted = set(page_numbers)
    with pymupdf.open(path) as doc:
        for number, page in enumerate(doc, start=1):
            if number not in wanted:
                continue
            try:
                found = page.find_tables()
            except Exception:
                continue
            for table in found.tables:
                try:
                    rows = [[(cell or "").strip() for cell in row]
                            for row in table.extract()]
                except Exception:
                    continue
                rows = [row for row in rows if any(cell for cell in row)]
                if not rows:
                    continue
                out.append({
                    "page": number,
                    "rows": rows,
                    "row_count": len(rows),
                    "column_count": max(len(row) for row in rows),
                })
    return out


def tables_json(tables: list[dict]) -> str:
    return json_dumps(tables) if tables else ""
