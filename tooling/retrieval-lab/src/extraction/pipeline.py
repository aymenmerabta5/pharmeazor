"""Idempotent extraction pipeline over the already-collected corpus.

The pipeline reads the provenance tables, never edits them, and writes two
additive tables:

* ``data/metadata/extractions.csv`` - one row per document/notice record;
* ``data/metadata/extracted_sections.csv`` - one row per canonical section.

Rerunning the command only re-processes documents whose stored extraction is
missing or whose source hash changed, unless ``--refresh`` is given.
"""
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import pandas as pd

from config import (
    DOCUMENTS_CSV, DOCUMENT_COLUMNS, EXTRACTED_SECTION_COLUMNS, EXTRACTIONS_CSV,
    EXTRACTED_SECTIONS_CSV, EXTRACTION_COLUMNS, EXTRACTION_COVERAGE_CSV,
    EXTRACTION_FAILURES_CSV, EXTRACTION_PIPELINE_VERSION, META_DIR,
)
from src.extraction import ai_assist
from src.extraction.models import (
    AI_ASSISTED, CANONICAL_SECTIONS, EXTRACTION_FAILED, FOUND,
    NEEDS_REVIEW, NOT_FOUND_IN_DOCUMENT, PROFESSIONAL_DOCUMENT_TYPES,
    SECTION_LABELS, SectionResult,
)
from src.extraction.section_extractor import extract_document_sections
from src.storage.store import read_table, resolve_path, write_table
from src.utils.logging_setup import get_logger

log = get_logger("pharmeazor.extraction")

NOTICE_COLUMNS = [
    "document_id", "medication_id", "document_type", "original_filename",
    "source_name", "source_id", "source_url", "direct_document_url",
    "manufacturer", "country", "language", "strength", "pharmaceutical_form",
    "revision_or_publication_date", "collection_date", "registration_number",
    "collection_method", "verification_status", "local_file_path",
    "original_file_path", "medicine_name", "brand_name", "dci",
    "notice_sha256", "match_evidence",
]


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _yes(value: bool) -> str:
    return "yes" if value else "no"


def _canonical_rows(document_id: str, parent: str, medicine_id: str,
                    document_type: str, source_document_type: str,
                    source_id: str, source_url: str, language: str,
                    file_path: str, sha: str, status: str,
                    note: str) -> list[dict]:
    """Failure rows so every mandatory section is visibly accounted for."""
    rows = []
    for key, label, required in CANONICAL_SECTIONS:
        rows.append({
            "document_id": document_id, "parent_document_id": parent,
            "medicine_id": medicine_id, "document_type": document_type,
            "source_document_type": source_document_type,
            "source_id": source_id, "source_url": source_url,
            "language": language, "file_path": file_path,
            "source_sha256": sha, "section_key": key,
            "section_label": label, "required": _yes(required),
            "status": status, "original_heading": "", "content": "",
            "content_sha256": "", "content_chars": "0", "page_start": "",
            "page_end": "", "pages": "", "printed_pages": "",
            "extraction_method": "", "review_required": _yes(True),
            "validation_status": "", "numeric_check": "", "table_count": "0",
            "tables_json": "", "notes": note, "extracted_at": "",
        })
    return rows


def _document_row(document_id: str, parent: str, medicine_id: str,
                  document_type: str, source_document_type: str,
                  source_id: str, source_url: str, language: str,
                  file_path: str, sha: str, status: str, method: str,
                  ocr_used: bool, ocr_languages: str, ocr_confidence,
                  ai_used: bool, review: bool, sections_found: int,
                  required_found: int, sections_total: int, notes: str,
                  extracted_at: str) -> dict:
    return {
        "document_id": document_id, "parent_document_id": parent,
        "medicine_id": medicine_id, "document_type": document_type,
        "source_document_type": source_document_type, "source_id": source_id,
        "source_url": source_url, "language": language, "file_path": file_path,
        "source_sha256": sha, "page_count": "", "page_type": "",
        "extraction_status": status, "extraction_method": method,
        "ocr_used": _yes(ocr_used), "ocr_languages": ocr_languages,
        "ocr_confidence": "" if ocr_confidence is None else ocr_confidence,
        "ai_used": _yes(ai_used), "review_required": _yes(review),
        "sections_found": sections_found,
        "sections_required_found": required_found,
        "sections_total": sections_total,
        "pipeline_version": EXTRACTION_PIPELINE_VERSION,
        "extracted_at": extracted_at, "notes": notes,
    }


def _section_row(document_id: str, parent: str, medicine_id: str,
                 document_type: str, source_document_type: str,
                 source_id: str, source_url: str, language: str,
                 file_path: str, sha: str, result: SectionResult,
                 extracted_at: str) -> dict:
    return {
        "document_id": document_id, "parent_document_id": parent,
        "medicine_id": medicine_id, "document_type": document_type,
        "source_document_type": source_document_type, "source_id": source_id,
        "source_url": source_url, "language": language, "file_path": file_path,
        "source_sha256": sha, "section_key": result.section_key,
        "section_label": result.section_label,
        "required": _yes(result.required), "status": result.status,
        "original_heading": result.original_heading,
        "content": result.content,
        "content_sha256": hashlib.sha256(
            (result.content or "").encode("utf-8")).hexdigest()
        if result.content else "",
        "content_chars": len(result.content or ""),
        "page_start": result.page_start or "",
        "page_end": result.page_end or "",
        "pages": ";".join(str(page) for page in result.pages),
        "printed_pages": ";".join(result.printed_pages),
        "extraction_method": result.extraction_method,
        "review_required": _yes(result.review_required),
        "validation_status": result.validation_status,
        "numeric_check": result.numeric_check,
        "table_count": result.table_count,
        "tables_json": result.tables_json,
        "notes": result.notes,
        "extracted_at": extracted_at,
    }


def load_targets(medicine_ids: list[str] | None = None,
                 document_types: list[str] | None = None,
                 source_ids: list[str] | None = None,
                 include_notices: bool = True) -> tuple[list[dict], list[dict]]:
    """Build the extraction target list from the provenance tables."""
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    docs = docs[(docs["collection_status"] == "collected")
                & (docs["relevance_status"] == "verified")
                & (docs["document_type"].isin(PROFESSIONAL_DOCUMENT_TYPES))]
    if medicine_ids:
        docs = docs[docs["medicine_id"].isin(medicine_ids)]
    if document_types:
        docs = docs[docs["document_type"].isin(document_types)]
    if source_ids:
        docs = docs[docs["source_id"].isin(source_ids)]
    professional = docs.to_dict("records")

    notices: list[dict] = []
    notice_path = META_DIR / "notices.csv"
    if include_notices and notice_path.exists():
        frame = read_table(notice_path, NOTICE_COLUMNS)
        if medicine_ids:
            frame = frame[frame["medication_id"].isin(medicine_ids)]
        if document_types and "notice" not in document_types:
            frame = frame.iloc[0:0]
        if source_ids:
            frame = frame[frame["source_id"].isin(source_ids)]
        for row in frame.to_dict("records"):
            original = resolve_path(row.get("original_file_path", ""))
            local = resolve_path(row.get("local_file_path", ""))
            if not original.exists() and not local.exists():
                log.warning("notice file missing %s", row.get("document_id"))
                continue
            notices.append(row)

    def sort_key(row):
        return (row.get("medicine_id") or row.get("medication_id") or "",
                row.get("document_type", ""), row.get("document_id", ""))

    return sorted(professional, key=sort_key), sorted(notices, key=sort_key)


def _already_done(row: dict, existing: pd.DataFrame,
                  sections: pd.DataFrame) -> bool:
    if existing.empty:
        return False
    match = existing[existing["document_id"] == row.get("document_id", "")]
    if match.empty:
        return False
    if sections.empty or not (sections["document_id"] == row.get("document_id", "")).any():
        return False
    current = match.iloc[0]
    if current.get("pipeline_version") != EXTRACTION_PIPELINE_VERSION:
        return False
    if current.get("extraction_status") == EXTRACTION_FAILED:
        return False
    path = resolve_path(row.get("file_path") or row.get("original_file_path")
                        or row.get("local_file_path", ""))
    if not path.exists():
        return False
    expected_sha = row.get("sha256", "")
    if expected_sha and current.get("source_sha256") and expected_sha != current["source_sha256"]:
        return False
    return True


def _drop_document(frame: pd.DataFrame, document_id: str) -> pd.DataFrame:
    if frame.empty:
        return frame
    return frame[frame["document_id"] != document_id].reset_index(drop=True)


def _coverage(extractions: pd.DataFrame, sections: pd.DataFrame) -> pd.DataFrame:
    if extractions.empty:
        return pd.DataFrame()
    rows = []
    keys = [key for key, _, required in CANONICAL_SECTIONS if required]
    for (medicine_id, document_type), group in extractions.groupby(
            ["medicine_id", "document_type"], dropna=False):
        ids = set(group["document_id"])
        subset = sections[sections["document_id"].isin(ids)] if not sections.empty else sections
        row = {
            "medicine_id": medicine_id,
            "document_type": document_type,
            "documents": len(ids),
            "documents_review_required": int((group["review_required"] == "yes").sum()),
            "documents_failed": int((group["extraction_status"] == EXTRACTION_FAILED).sum()),
            "sections_found": int((subset["status"] == FOUND).sum()) if not subset.empty else 0,
            "sections_needs_review": int((subset["status"] == NEEDS_REVIEW).sum()) if not subset.empty else 0,
        }
        for key in keys:
            row[f"found_{key}"] = int(((subset["section_key"] == key)
                                       & (subset["status"] == FOUND)).sum()) if not subset.empty else 0
        row["required_sections_complete"] = (
            "yes" if all(row[f"found_{key}"] > 0 for key in keys) else "no")
        rows.append(row)
    return pd.DataFrame(rows).sort_values(["medicine_id", "document_type"])


def _failure_rows(extractions: pd.DataFrame) -> pd.DataFrame:
    if extractions.empty:
        return pd.DataFrame(columns=EXTRACTION_COLUMNS)
    mask = ((extractions["extraction_status"] == EXTRACTION_FAILED)
            | (extractions["review_required"] == "yes"))
    return extractions[mask].copy()


def run_extraction(medicine_ids: list[str] | None = None, limit: int = 0,
                   refresh: bool = False, include_notices: bool = True,
                   document_types: list[str] | None = None,
                   source_ids: list[str] | None = None,
                   capture_tables: bool = False, ocr_mode: str = "auto",
                   ocr_languages: str = "fra+ara+eng",
                   use_ai: bool = False, quiet: bool = False) -> dict:
    """Run the extraction stage and write the additive tables."""
    professional, notices = load_targets(
        medicine_ids=medicine_ids, document_types=document_types,
        source_ids=source_ids, include_notices=include_notices,
    )
    targets = professional + notices
    if limit:
        targets = targets[:limit]

    extractions = read_table(EXTRACTIONS_CSV, EXTRACTION_COLUMNS)
    sections = read_table(EXTRACTED_SECTIONS_CSV, EXTRACTED_SECTION_COLUMNS)

    ai_status = ai_assist.status()
    if use_ai and not ai_status["available"]:
        log.warning("AI extraction requested but unavailable: %s", ai_status["reason"])

    processed = skipped = failed = 0
    review_docs = 0
    new_extraction_rows: list[dict] = []
    new_section_rows: list[dict] = []

    for index, target in enumerate(targets, start=1):
        document_id = target.get("document_id", "")
        if not refresh and _already_done(target, extractions, sections):
            skipped += 1
            continue

        extracted_at = _now()
        try:
            result = extract_document_sections(
                target, capture_tables=capture_tables, ocr_mode=ocr_mode,
                ocr_languages=ocr_languages, use_ai=use_ai,
            )
        except Exception as exc:  # keep the run going; record the failure
            failed += 1
            log.warning("extraction failed %s: %s", document_id, exc)
            is_notice = target.get("document_type") == "NOTICE"
            note = f"{type(exc).__name__}: {exc}"
            parent = (document_id[:-len("__NOTICE")]
                      if is_notice and document_id.endswith("__NOTICE") else "")
            new_extraction_rows.append(_document_row(
                document_id, parent,
                target.get("medicine_id") or target.get("medication_id", ""),
                "NOTICE" if is_notice else "RCP",
                target.get("document_type", ""), target.get("source_id", ""),
                target.get("source_url", ""), target.get("language", ""),
                target.get("file_path") or target.get("local_file_path", ""),
                "", EXTRACTION_FAILED, "", False, "", None, False, True,
                0, 0, len(CANONICAL_SECTIONS), note, extracted_at,
            ))
            new_section_rows.extend(_canonical_rows(
                document_id, parent,
                target.get("medicine_id") or target.get("medication_id", ""),
                "NOTICE" if is_notice else "RCP",
                target.get("document_type", ""), target.get("source_id", ""),
                target.get("source_url", ""), target.get("language", ""),
                target.get("file_path") or target.get("local_file_path", ""),
                "", EXTRACTION_FAILED, note,
            ))
            if not quiet:
                print(f"[{index}/{len(targets)}] {document_id} EXTRACTION_FAILED")
            continue

        processed += 1
        if result.review_required:
            review_docs += 1
        required_total = sum(1 for section in result.sections if section.required)
        found_required = sum(1 for section in result.sections
                             if section.required and section.status == FOUND)
        new_extraction_rows.append(_document_row(
            result.document_id, result.parent_document_id, result.medication_id,
            result.document_type, result.source_document_type, result.source_id,
            result.source_url, result.language, result.file_path,
            result.source_sha256, result.extraction_status,
            result.extraction_method, result.ocr_used, result.ocr_languages,
            result.ocr_confidence, result.ai_used, result.review_required,
            sum(1 for section in result.sections if section.status == FOUND),
            found_required, required_total, result.notes, extracted_at,
        ))
        # Record page count / type in the same row (they are not section data).
        new_extraction_rows[-1]["page_count"] = result.page_count
        new_extraction_rows[-1]["page_type"] = result.page_type
        for section in result.sections:
            new_section_rows.append(_section_row(
                result.document_id, result.parent_document_id,
                result.medication_id, result.document_type,
                result.source_document_type, result.source_id,
                result.source_url, result.language, result.file_path,
                result.source_sha256, section, extracted_at,
            ))
        if not quiet and (index % 25 == 0 or index == len(targets)):
            print(f"[{index}/{len(targets)}] {document_id} {result.extraction_status}")

    processed_ids = {row["document_id"] for row in new_extraction_rows}
    if processed_ids:
        for document_id in processed_ids:
            extractions = _drop_document(extractions, document_id)
            sections = _drop_document(sections, document_id)
    if new_extraction_rows:
        extractions = pd.concat(
            [extractions, pd.DataFrame(new_extraction_rows, columns=EXTRACTION_COLUMNS)],
            ignore_index=True,
        )
    if new_section_rows:
        sections = pd.concat(
            [sections, pd.DataFrame(new_section_rows, columns=EXTRACTED_SECTION_COLUMNS)],
            ignore_index=True,
        )

    if new_extraction_rows:
        extractions = extractions.sort_values(
            ["medicine_id", "document_type", "document_id"]).reset_index(drop=True)
        sections = sections.sort_values(
            ["medicine_id", "document_type", "document_id", "section_key"]
        ).reset_index(drop=True)
        write_table(EXTRACTIONS_CSV, extractions)
        write_table(EXTRACTED_SECTIONS_CSV, sections)

    coverage = _coverage(extractions, sections)
    if not coverage.empty:
        write_table(EXTRACTION_COVERAGE_CSV, coverage)
    failures = _failure_rows(extractions)
    write_table(EXTRACTION_FAILURES_CSV, failures)

    summary = {
        "targets": len(targets),
        "processed": processed,
        "skipped": skipped,
        "failed": failed,
        "review_documents": review_docs,
        "documents_total": len(extractions),
        "sections_total": len(sections),
        "ai_available": ai_status["available"],
        "ai_reason": ai_status["reason"],
        "extractions_csv": str(EXTRACTIONS_CSV),
        "sections_csv": str(EXTRACTED_SECTIONS_CSV),
        "coverage_csv": str(EXTRACTION_COVERAGE_CSV),
        "failures_csv": str(EXTRACTION_FAILURES_CSV),
    }
    if not quiet:
        print("PHARMEAZOR - structured extraction")
        print("=" * 62)
        for key in ("targets", "processed", "skipped", "failed",
                    "review_documents", "documents_total", "sections_total"):
            print(f"  {key:20s} {summary[key]}")
        print(f"  ai                  {'configured' if ai_status['available'] else 'disabled (' + ai_status['reason'] + ')'}")
        print(f"  extractions         {EXTRACTIONS_CSV}")
        print(f"  sections            {EXTRACTED_SECTIONS_CSV}")
        print(f"  coverage            {EXTRACTION_COVERAGE_CSV}")
        print(f"  review queue        {EXTRACTION_FAILURES_CSV}")
    return summary
