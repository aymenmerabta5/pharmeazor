"""Validation of extracted passages against the document they came from.

The rules are deliberately mechanical and conservative:

* **verbatim** - every stored line must be present in the source text after
  whitespace-only normalisation;
* **numbers** - every numeric expression with a unit in the passage must still
  be present in the source text;
* **OCR** - a page read by OCR is flagged for review when confidence is low;
* **association** - the stored SHA-256 must be the hash of the file the
  metadata row points at.

No function here changes the stored wording.  A failed check changes the
status/review flag, never the passage.
"""
from dataclasses import dataclass, field
import re

from src.extraction.models import (
    FOUND, NEEDS_REVIEW, OCR, SectionResult,
)
from src.extraction.text_utils import numeric_signature

VERBATIM_OK = "VERBATIM_OK"
VERBATIM_FAILED = "VERBATIM_FAILED"
NOT_CHECKED = "NOT_CHECKED"
NUMBERS_OK = "NUMBERS_OK"
NUMBERS_CHANGED = "NUMBERS_CHANGED"
NO_NUMBERS = "NO_NUMBERS"

_WS = re.compile(r"\s+")


def normalise_for_check(text: str) -> str:
    return _WS.sub(" ", (text or "").replace("\u00a0", " ")).strip()


def _checkable_parts(content: str) -> list[str]:
    """Lines/cells that are long enough for a meaningful containment test."""
    parts: list[str] = []
    for line in (content or "").splitlines():
        line = normalise_for_check(line)
        if not line:
            continue
        cells = [cell.strip() for cell in line.split(" | ")] if " | " in line else [line]
        for cell in cells:
            cell = re.sub(r"^[•·▪◦*\-–—]+\s*", "", cell)
            if len(cell) >= 20:
                parts.append(cell)
    return parts


def check_verbatim(content: str, source_text: str) -> tuple[str, str]:
    """Return (status, note).  Whitespace and line wrapping are ignored."""
    if not (content or "").strip():
        return NOT_CHECKED, "empty passage"
    source = normalise_for_check(source_text)
    if not source:
        return NOT_CHECKED, "empty source text"
    parts = _checkable_parts(content)
    if not parts:
        whole = normalise_for_check(content)
        if whole and whole in source:
            return VERBATIM_OK, ""
        return VERBATIM_FAILED, "short passage not found in source"
    missing = [part for part in parts if part not in source]
    if not missing:
        return VERBATIM_OK, ""
    sample = "; ".join(missing[:2])[:220]
    return VERBATIM_FAILED, f"{len(missing)}/{len(parts)} passage part(s) not found in source: {sample}"


def check_numbers(content: str, source_text: str) -> tuple[str, str]:
    """Return (status, note).  Numbers are compared exactly as printed."""
    numbers = numeric_signature(content)
    if not numbers:
        return NO_NUMBERS, ""
    source = normalise_for_check(source_text).lower()
    missing = [value for value in numbers if value not in source]
    if not missing:
        return NUMBERS_OK, ""
    return NUMBERS_CHANGED, "numeric expression(s) not found in source: " + ", ".join(missing[:8])


def ocr_review_note(ocr_used: bool, confidence: float | None,
                    languages: str) -> str:
    if not ocr_used:
        return ""
    if confidence is None:
        return "OCR used without a confidence value; human check required"
    if confidence < 60:
        return (f"low OCR confidence ({confidence}); human check required"
                + (f", languages {languages}" if languages else ""))
    return f"OCR used (confidence {confidence}); spot-check advised"


@dataclass
class ValidationSummary:
    checked: int = 0
    verbatim_ok: int = 0
    verbatim_failed: int = 0
    numbers_ok: int = 0
    numbers_changed: int = 0
    notes: list[str] = field(default_factory=list)


def validate_sections(results: list[SectionResult], source_text: str,
                      ocr_used: bool = False,
                      ocr_confidence: float | None = None,
                      ocr_languages: str = "") -> ValidationSummary:
    """Attach validation status to every FOUND section and flag review needs."""
    summary = ValidationSummary()
    ocr_note = ocr_review_note(ocr_used, ocr_confidence, ocr_languages)

    for result in results:
        if result.status != FOUND:
            continue
        summary.checked += 1
        verbatim, verbatim_note = check_verbatim(result.content, source_text)
        numbers, numbers_note = check_numbers(result.content, source_text)
        result.validation_status = verbatim
        result.numeric_check = numbers
        notes = [note for note in (verbatim_note, numbers_note) if note]
        if verbatim == VERBATIM_FAILED:
            summary.verbatim_failed += 1
            result.review_required = True
            result.status = NEEDS_REVIEW
        else:
            summary.verbatim_ok += 1
        if numbers == NUMBERS_CHANGED:
            summary.numbers_changed += 1
            result.review_required = True
            result.status = NEEDS_REVIEW
        elif numbers == NUMBERS_OK:
            summary.numbers_ok += 1
        if ocr_note:
            result.review_required = True
            notes.append(ocr_note)
        if result.extraction_method == OCR:
            result.review_required = True
        if notes:
            result.notes = "; ".join(filter(None, [result.notes] + notes))
        summary.notes.extend(notes)

    if ocr_note:
        summary.notes.append(ocr_note)
    return summary


def association_note(expected_sha: str, actual_sha: str,
                     expected_path: str, actual_path: str) -> str:
    """Empty when the metadata row and the file on disk agree."""
    notes = []
    if expected_sha and actual_sha and expected_sha != actual_sha:
        notes.append("SHA-256 differs from the metadata row")
    if expected_path and actual_path and expected_path != actual_path:
        notes.append("file path differs from the metadata row")
    return "; ".join(notes)
