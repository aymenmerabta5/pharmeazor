"""Shared models and constants for the information-extraction stage.

The extraction stage is additive: it consumes the identifiers and file paths
already stored by the collection stage and never rewrites a collected document,
a document row or a notice row.
"""
from dataclasses import dataclass, field
from typing import Any

# ------------------------------------------------------------------ statuses
FOUND = "FOUND"
NOT_FOUND_IN_DOCUMENT = "NOT_FOUND_IN_DOCUMENT"
EXTRACTION_FAILED = "EXTRACTION_FAILED"
NEEDS_REVIEW = "NEEDS_REVIEW"

SECTION_STATUSES = (FOUND, NOT_FOUND_IN_DOCUMENT, EXTRACTION_FAILED, NEEDS_REVIEW)

# --------------------------------------------------------------- methods
TEXT_EXTRACTION = "TEXT_EXTRACTION"
OCR = "OCR"
HEADING_BASED = "HEADING_BASED"
AI_ASSISTED = "AI_ASSISTED"
MANUAL_REVIEW = "MANUAL_REVIEW"

EXTRACTION_METHODS = (TEXT_EXTRACTION, OCR, HEADING_BASED, AI_ASSISTED, MANUAL_REVIEW)

# ----------------------------------------------------------- document classes
DOCUMENT_CLASS_RCP = "RCP"
DOCUMENT_CLASS_NOTICE = "NOTICE"

PROFESSIONAL_DOCUMENT_TYPES = ("smpc", "label")
NON_CLINICAL_DOCUMENT_TYPES = ("nomenclature", "composition")

# ------------------------------------------------------------------ sections
# (key, English label, mandatory for the project brief)
CANONICAL_SECTIONS = [
    ("indications", "Therapeutic indications", True),
    ("posologie", "Dosage and administration", True),
    ("contre_indications", "Contraindications", True),
    ("interactions", "Drug interactions", True),
    ("effets_indesirables", "Adverse effects", True),
    ("mises_en_garde", "Special warnings and precautions", False),
    ("grossesse", "Pregnancy and breastfeeding", False),
    ("proprietes", "Pharmacological properties", False),
    ("duree_conservation", "Storage conditions", False),
    ("surdosage", "Overdosage", False),
]

MANDATORY_SECTION_KEYS = [key for key, _, required in CANONICAL_SECTIONS if required]
SECTION_LABELS = {key: label for key, label, _ in CANONICAL_SECTIONS}
REQUIRED_SECTIONS = {key: required for key, _, required in CANONICAL_SECTIONS}

# --------------------------------------------------------------- dataclasses
@dataclass
class Block:
    """One heading, paragraph, line or table in reading order."""
    text: str
    page: int
    kind: str = "text"                 # text | heading | table
    level: int = 0                     # heading level when known
    heading_key: str = ""              # canonical key when already known
    heading_title: str = ""
    bold: bool = False
    size: float = 0.0
    table_rows: list[list[str]] = field(default_factory=list)
    source: str = ""                   # html_class | numbered | upper | notice | text


@dataclass
class Page:
    number: int                        # physical page, 1-based
    text: str
    printed_label: str = ""
    ocr_used: bool = False
    ocr_confidence: float | None = None
    blocks: list[Block] = field(default_factory=list)


@dataclass
class ParsedDocument:
    path: str
    suffix: str
    pages: list[Page]
    page_type: str                     # PDF | HTML | TEXT
    ocr_used: bool = False
    ocr_languages: str = ""
    ocr_confidence: float | None = None
    encoding_warning: str = ""
    tables: list[dict[str, Any]] = field(default_factory=list)

    @property
    def page_count(self) -> int:
        return len(self.pages)

    @property
    def blocks(self) -> list[Block]:
        return [block for page in self.pages for block in page.blocks]

    @property
    def text(self) -> str:
        return "\n".join(page.text for page in self.pages)


@dataclass
class DetectedSection:
    section_key: str
    original_heading: str
    level: int
    blocks: list[Block]
    page_start: int
    page_end: int
    printed_pages: list[str]
    notes: str = ""


@dataclass
class SectionResult:
    section_key: str
    section_label: str
    required: bool
    status: str
    original_heading: str = ""
    content: str = ""
    pages: list[int] = field(default_factory=list)
    page_start: int = 0
    page_end: int = 0
    printed_pages: list[str] = field(default_factory=list)
    extraction_method: str = HEADING_BASED
    review_required: bool = False
    validation_status: str = ""
    numeric_check: str = ""
    table_count: int = 0
    tables_json: str = ""
    notes: str = ""


@dataclass
class DocumentExtraction:
    document_id: str
    medication_id: str
    document_type: str                 # RCP | NOTICE
    source_document_type: str          # smpc | label | NOTICE
    source_id: str
    source_url: str
    language: str
    file_path: str
    source_sha256: str
    page_count: int
    page_type: str
    extraction_status: str
    extraction_method: str
    ocr_used: bool
    ocr_languages: str
    ocr_confidence: float | None
    review_required: bool
    sections: list[SectionResult]
    notes: str = ""
    parent_document_id: str = ""
    notice_local_path: str = ""
    notice_verification_status: str = ""
    ai_used: bool = False
    ai_model: str = ""


@dataclass
class HeadingCandidate:
    title: str
    key: str
    level: int
    page: int
    index: int
    boundary: bool
    source: str
