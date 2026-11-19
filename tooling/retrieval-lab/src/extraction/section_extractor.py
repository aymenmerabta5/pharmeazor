"""Build the structured extraction result for one existing document record."""
import re
from pathlib import Path

from config import ROOT
from src.extraction import ai_assist
from src.extraction.html_reader import read_html
from src.extraction.models import (
    AI_ASSISTED, CANONICAL_SECTIONS, DOCUMENT_CLASS_NOTICE, DOCUMENT_CLASS_RCP,
    EXTRACTION_FAILED, FOUND, HEADING_BASED, NEEDS_REVIEW,
    NOT_FOUND_IN_DOCUMENT, OCR, REQUIRED_SECTIONS, SECTION_LABELS, Block,
    DetectedSection, DocumentExtraction, Page, ParsedDocument, SectionResult,
)
from src.extraction.pdf_reader import capture_pdf_tables, read_pdf, tables_json
from src.extraction.section_detector import detect_sections
from src.extraction.text_utils import (
    detect_language, fold, json_dumps, strip_notice_header,
)
from src.extraction.validator import (
    association_note, validate_sections,
)
from src.utils.hashing import sha256_file

MIN_STRUCTURE_CHARS = 500


def _read_text_file(path: Path) -> ParsedDocument:
    from src.utils.encoding import read_text_auto

    text = strip_notice_header(read_text_auto(path))
    blocks = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            blocks.append(Block(text=line, page=1, source="text"))
    return ParsedDocument(
        path=str(path), suffix=path.suffix.lower(),
        pages=[Page(number=1, text=text, blocks=blocks)],
        page_type="TEXT",
    )


_PATIENT_START = re.compile(
    r"(?i)^(?:patient information|medication guide|patient counselling "
    r"information|patient counseling information)\b")
_PATIENT_END = re.compile(
    r"(?i)^(?:package label|principal display panel|package/label)\b")


def _patient_section(parsed: ParsedDocument) -> ParsedDocument | None:
    """Keep only the patient leaflet at the end of a full-label PDF.

    DailyMed often stores a patient-counselling leaflet inside the same PDF as
    the professional label.  The notice must never contain professional
    passages, so detection starts at the last patient-information heading and
    stops at the package label.
    """
    blocks = parsed.blocks
    start = None
    for index, block in enumerate(blocks):
        text = (block.text or "").strip()
        if len(text) <= 90 and _PATIENT_START.match(text):
            start = index
    if start is None:
        return None

    end = len(blocks)
    for index in range(start + 1, len(blocks)):
        text = (blocks[index].text or "").strip()
        if _PATIENT_END.match(text):
            end = index
            break

    selected = blocks[start:end]
    if len(" ".join(block.text for block in selected)) < 200:
        return None

    by_page: dict[int, list[Block]] = {}
    for block in selected:
        by_page.setdefault(block.page, []).append(block)
    pages = []
    original = {page.number: page for page in parsed.pages}
    for number in sorted(by_page):
        source = original[number]
        pages.append(Page(
            number=number,
            text="\n".join(block.text for block in by_page[number]),
            printed_label=source.printed_label,
            ocr_used=source.ocr_used,
            ocr_confidence=source.ocr_confidence,
            blocks=by_page[number],
        ))
    return ParsedDocument(
        path=parsed.path, suffix=parsed.suffix, pages=pages,
        page_type=parsed.page_type, ocr_used=parsed.ocr_used,
        ocr_languages=parsed.ocr_languages,
        ocr_confidence=parsed.ocr_confidence,
        encoding_warning=parsed.encoding_warning,
    )


_TOC_NUMBER = re.compile(r"^\s*(\d+)\s*[.)]?\s+(.{2,})$")


def _strip_notice_toc(parsed: ParsedDocument) -> ParsedDocument:
    """Drop the duplicated table of contents on BDPM notice pages.

    The ANSM page lists the six notice questions under "Que contient cette
    notice ?" and then repeats the leaflet with the actual content.  Keeping
    the list would create empty sections and leak a contents line into the
    storage section, so only the second, complete copy is read.
    """
    blocks = parsed.blocks
    start = None
    for index, block in enumerate(blocks):
        if fold(block.text).startswith("que contient cette notice"):
            start = index
            break
    if start is None:
        return parsed

    entries: list[int] = []
    previous = 0
    index = start + 1
    while index < len(blocks):
        text = (blocks[index].text or "").strip()
        if not text:
            index += 1
            continue
        match = _TOC_NUMBER.match(text)
        if not match or len(text) > 160:
            break
        number = int(match.group(1))
        if entries and number <= previous:
            break
        entries.append(index)
        previous = number
        index += 1
    if len(entries) < 3:
        return parsed

    following = entries[-1] + 1
    while following < len(blocks) and not (blocks[following].text or "").strip():
        following += 1
    if following >= len(blocks):
        return parsed
    next_text = (blocks[following].text or "").strip()
    match = _TOC_NUMBER.match(next_text)
    restarts = bool(match) and int(match.group(1)) <= previous
    upper = next_text.isupper() or "redirection vers le haut de page" in fold(next_text)
    if not (restarts or upper):
        return parsed

    removed = set(entries)
    kept = [block for position, block in enumerate(blocks)
            if position not in removed]
    if not kept:
        return parsed
    pages = [Page(number=page.number,
                  text="\n".join(block.text for block in kept
                                 if block.page == page.number),
                  printed_label=page.printed_label,
                  ocr_used=page.ocr_used,
                  ocr_confidence=page.ocr_confidence,
                  blocks=[block for block in kept
                          if block.page == page.number])
             for page in parsed.pages]
    parsed.pages = pages
    return parsed


def _read_notice_source(path: Path, local_path: Path | None = None) -> ParsedDocument:
    suffix = path.suffix.lower()
    parsed = None
    if suffix in (".html", ".htm"):
        parsed = _strip_notice_toc(read_html(path, heading_prefix="AmmNoticeTitre"))
    elif suffix == ".pdf":
        parsed = read_pdf(path, ocr_mode="never")
        # A DailyMed patient-counselling notice is carved out of a full label
        # PDF.  Reading the whole PDF would mix professional-label passages
        # into the notice, which the brief forbids.  Prefer the patient leaflet
        # inside the PDF; the stored notice text is only a fallback because it
        # is often a truncated fragment of that leaflet.
        patient = _patient_section(parsed)
        if patient is not None:
            return patient
        if local_path and local_path.exists():
            return _read_text_file(local_path)
    else:
        parsed = _read_text_file(path)

    # The BDPM pages embed the notice after the SmPC.  If the class-based
    # reader cannot see the notice headings, fall back to the flattened notice
    # text that the notice pipeline already writes (still the same content).
    if not parsed.blocks and local_path and local_path.exists():
        return _read_text_file(local_path)
    return parsed


def _content_for(blocks) -> str:
    return "\n".join(block.text for block in blocks if (block.text or "").strip()).strip()


def _pages_for(blocks) -> list[int]:
    return sorted({block.page for block in blocks if (block.text or "").strip()})


def _section_method(parsed: ParsedDocument, pages: list[int], fallback: str) -> str:
    if parsed.ocr_used:
        by_page = {page.number: page for page in parsed.pages}
        if any(by_page.get(page) and by_page[page].ocr_used for page in pages):
            return OCR
    return fallback


def _tables_for(section: DetectedSection, parsed: ParsedDocument,
                path: Path, capture_tables: bool) -> list[dict]:
    tables = []
    for block in section.blocks:
        if block.kind == "table" and block.table_rows:
            tables.append({"page": block.page, "rows": block.table_rows,
                           "row_count": len(block.table_rows),
                           "column_count": max(len(row) for row in block.table_rows)})
    if capture_tables and parsed.page_type == "PDF":
        pages = _pages_for(section.blocks)
        tables.extend(capture_pdf_tables(path, pages))
    # de-duplicate identical page/rows pairs
    unique = []
    seen = set()
    for table in tables:
        key = (table.get("page"), json_dumps(table.get("rows")))
        if key in seen:
            continue
        seen.add(key)
        unique.append(table)
    return unique


def _empty_result(key: str, status: str, note: str) -> SectionResult:
    return SectionResult(
        section_key=key, section_label=SECTION_LABELS[key],
        required=REQUIRED_SECTIONS[key], status=status, notes=note,
    )


def _ai_result(section_key: str, section_label: str, required: bool,
               suggestion: "ai_assist.AISuggestion") -> SectionResult:
    page = suggestion.page_hint
    pages = [page] if isinstance(page, int) and page > 0 else []
    return SectionResult(
        section_key=section_key, section_label=section_label, required=required,
        status=FOUND, original_heading=suggestion.heading,
        content=suggestion.quote, pages=pages,
        page_start=pages[0] if pages else 0,
        page_end=pages[-1] if pages else 0,
        extraction_method=AI_ASSISTED, review_required=True,
        notes=ai_assist.ai_note(suggestion),
    )


def extract_document_sections(doc: dict, capture_tables: bool = False,
                              ocr_mode: str = "auto",
                              ocr_languages: str = "fra+ara+eng",
                              use_ai: bool = False) -> DocumentExtraction:
    """Extract one existing document/notice record; never modify it."""
    document_type = doc.get("document_type", "")
    is_notice = document_type == "NOTICE"
    profile = DOCUMENT_CLASS_NOTICE if is_notice else DOCUMENT_CLASS_RCP

    # notices can be read from the original HTML/PDF so page numbers survive;
    # the flattened local .txt is the fallback.
    if is_notice:
        original = doc.get("original_file_path", "")
        local = doc.get("local_file_path", "")
        candidates = [p for p in (original, local) if p]
        path = next((ROOT / p for p in candidates if (ROOT / p).exists()), None)
        if path is None:
            raise FileNotFoundError(f"notice file not found: {original or local}")
        parsed = _read_notice_source(path, ROOT / local if local else None)
    else:
        path = ROOT / doc.get("file_path", "")
        if not path.exists():
            raise FileNotFoundError(f"document file not found: {path}")
        suffix = path.suffix.lower()
        if suffix in (".html", ".htm"):
            parsed = read_html(path, heading_prefix="AmmAnnexeTitre")
        elif suffix == ".pdf":
            parsed = read_pdf(path, ocr_mode=ocr_mode, languages=ocr_languages)
        else:
            parsed = _read_text_file(path)

    language = detect_language(parsed.text, doc.get("language", ""))
    sections = detect_sections(parsed, profile)
    by_key = {section.section_key: section for section in sections}
    ai_used = False
    ai_model = ""
    ai_notes: list[str] = []

    results: list[SectionResult] = []
    for key, label, required in CANONICAL_SECTIONS:
        section = by_key.get(key)
        if section is None:
            if not sections and len(parsed.text.strip()) > MIN_STRUCTURE_CHARS:
                # Absence cannot be asserted when the document structure was
                # not recognised at all.  Ask a human instead of claiming
                # NOT_FOUND_IN_DOCUMENT for any section, optional included.
                status = NEEDS_REVIEW
                note = ("no document-type heading was detected; "
                        "absence of this section cannot be asserted")
                result = _empty_result(key, status, note)
                result.review_required = True
            else:
                note = ("no matching heading found"
                        if sections else "no document-type heading was detected")
                result = _empty_result(key, NOT_FOUND_IN_DOCUMENT, note)
            results.append(result)
            continue

        content = _content_for(section.blocks)
        pages = _pages_for(section.blocks)
        if not pages:
            pages = [section.page_start] if section.page_start else []
        if not content:
            result = SectionResult(
                section_key=key, section_label=label, required=required,
                status=NEEDS_REVIEW, original_heading=section.original_heading,
                pages=pages, page_start=section.page_start,
                page_end=section.page_end,
                printed_pages=section.printed_pages,
                extraction_method=HEADING_BASED, review_required=True,
                notes=(section.notes or "section heading found but body is empty"),
            )
            results.append(result)
            continue
        if not re.search(r"[^\W\d_]{3,}", content, re.UNICODE):
            # Reading order can collapse a section to detached bullet glyphs or
            # bare numbers.  Such a passage is verbatim but unusable, so ask a
            # human to inspect the page instead of calling it FOUND.
            results.append(SectionResult(
                section_key=key, section_label=label, required=required,
                status=NEEDS_REVIEW, original_heading=section.original_heading,
                pages=pages, page_start=section.page_start,
                page_end=section.page_end,
                printed_pages=section.printed_pages,
                extraction_method=HEADING_BASED, review_required=True,
                notes=("section body contains no readable words; "
                       "review the source page"),
            ))
            continue

        tables = _tables_for(section, parsed, path, capture_tables)
        method = _section_method(parsed, pages, HEADING_BASED)
        result = SectionResult(
            section_key=key, section_label=label, required=required,
            status=FOUND, original_heading=section.original_heading,
            content=content, pages=pages, page_start=section.page_start,
            page_end=section.page_end, printed_pages=section.printed_pages,
            extraction_method=method,
            review_required=bool(parsed.encoding_warning),
            table_count=len(tables),
            tables_json=tables_json(tables),
            notes=section.notes,
        )
        results.append(result)

    # Gemini is only a fallback for mandatory sections the structural pass did
    # not find.  Every proposal is verified verbatim by ai_assist.
    if use_ai and ai_assist.status()["available"]:
        for index, result in enumerate(results):
            if not result.required or result.status != NOT_FOUND_IN_DOCUMENT:
                continue
            suggestion = ai_assist.assist_section(
                parsed.text, result.section_key, result.section_label,
                document_id=doc.get("document_id", ""),
                document_sha=doc.get("sha256") or doc.get("notice_sha256", ""),
            )
            if suggestion:
                results[index] = _ai_result(result.section_key,
                                            result.section_label,
                                            result.required, suggestion)
                ai_used = True
                ai_model = suggestion.model
                ai_notes.append(f"{result.section_key}: {ai_assist.ai_note(suggestion)}")

    summary = validate_sections(
        results, parsed.text, ocr_used=parsed.ocr_used,
        ocr_confidence=parsed.ocr_confidence,
        ocr_languages=parsed.ocr_languages,
    )

    method = HEADING_BASED
    if ai_used:
        method = AI_ASSISTED
    if parsed.ocr_used:
        method = OCR
    found_required = sum(1 for r in results if r.required and r.status == FOUND)
    required_total = sum(1 for r in results if r.required)
    review = any(r.review_required for r in results if r.status != NOT_FOUND_IN_DOCUMENT)
    if not sections and len(parsed.text.strip()) > MIN_STRUCTURE_CHARS:
        review = True
    status = "EXTRACTED" if found_required == required_total else "PARTIAL"
    if not parsed.text.strip():
        status = EXTRACTION_FAILED
        review = True

    actual_sha = sha256_file(path) if path.exists() else ""
    parent = ""
    if is_notice and doc.get("document_id", "").endswith("__NOTICE"):
        parent = doc["document_id"][:-len("__NOTICE")]

    notes = []
    if parsed.encoding_warning:
        notes.append(parsed.encoding_warning)
    if parsed.ocr_used:
        notes.append(f"OCR used ({parsed.ocr_languages}, mean confidence "
                     f"{parsed.ocr_confidence})")
    notes.extend(ai_notes)
    association = ""
    if not is_notice:
        association = association_note(
            doc.get("sha256", ""), actual_sha,
            doc.get("file_path", ""),
            str(path.relative_to(ROOT).as_posix()) if path.is_relative_to(ROOT) else str(path),
        )
    if association:
        notes.append(association)
        review = True
    if summary.notes:
        notes.extend(note for note in summary.notes if note not in notes)

    return DocumentExtraction(
        document_id=doc.get("document_id", ""),
        medication_id=doc.get("medicine_id") or doc.get("medication_id", ""),
        document_type=profile,
        source_document_type=document_type,
        source_id=doc.get("source_id", ""),
        source_url=doc.get("source_url", ""),
        language=language,
        file_path=str(path.relative_to(ROOT).as_posix()) if path.is_relative_to(ROOT) else str(path),
        source_sha256=actual_sha,
        page_count=parsed.page_count,
        page_type=parsed.page_type,
        extraction_status=status,
        extraction_method=method,
        ocr_used=parsed.ocr_used,
        ocr_languages=parsed.ocr_languages,
        ocr_confidence=parsed.ocr_confidence,
        review_required=review,
        sections=results,
        notes="; ".join(dict.fromkeys(notes)),
        parent_document_id=parent,
        notice_local_path=doc.get("local_file_path", ""),
        notice_verification_status=doc.get("verification_status", ""),
        ai_used=ai_used,
        ai_model=ai_model,
    )
