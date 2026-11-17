#!/usr/bin/env python3
"""Read a document from the pharmeazor agent sandbox.

This script is the sandbox-side implementation of the `extract_document` agent
tool. Every input arrives through the environment, so no caller-supplied value
is ever interpolated into a shell command:

    PHARMEAZOR_DOCUMENT_PATH   required, path of the document to read
    PHARMEAZOR_MAX_PAGES       optional, maximum number of pages to read
    PHARMEAZOR_MAX_CHARACTERS  optional, maximum characters of text to return

The script prints exactly one JSON object on stdout. Diagnostics go to stderr.
"""

from __future__ import annotations

import json
import os
import sys

ENV_PATH = "PHARMEAZOR_DOCUMENT_PATH"
ENV_MAX_PAGES = "PHARMEAZOR_MAX_PAGES"
ENV_MAX_CHARACTERS = "PHARMEAZOR_MAX_CHARACTERS"

DEFAULT_MAX_CHARACTERS = 200_000

EXIT_OK = 0
EXIT_INPUT = 2
EXIT_NO_TEXT = 3


def fail(code: int, message: str) -> "NoReturn":
    """Report a fatal problem on stderr and stop with the given exit code."""
    sys.stderr.write(message.rstrip() + "\n")
    raise SystemExit(code)


def positive_int_env(name: str, fallback: int) -> int:
    """Read a positive integer from the environment, ignoring unusable values."""
    raw = os.environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        value = int(raw)
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def document_path() -> str:
    """Read the document path from the environment."""
    path = os.environ.get(ENV_PATH, "").strip()
    if not path:
        fail(EXIT_INPUT, "%s is not set" % ENV_PATH)
    if not os.path.isfile(path):
        fail(EXIT_INPUT, "the document does not exist: %s" % path)
    return path


def pdf_metadata(reader: object) -> dict:
    """Return the PDF metadata as plain strings."""
    raw = getattr(reader, "metadata", None)
    if not raw:
        return {}
    metadata = {}
    for key, value in dict(raw).items():
        if value is None:
            continue
        metadata[str(key).lstrip("/")] = str(value)
    return metadata


def read_pdf_with_pdfminer(path: str, max_pages: int) -> tuple[list[str], list[str]]:
    """Extract PDF text with pdfminer.six, which recovers layouts pypdf misses."""
    from io import StringIO

    from pdfminer.converter import TextConverter
    from pdfminer.layout import LAParams
    from pdfminer.pdfdocument import PDFDocument
    from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
    from pdfminer.pdfpage import PDFPage
    from pdfminer.pdfparser import PDFParser

    warnings: list[str] = []
    pages: list[str] = []
    with open(path, "rb") as handle:
        parser = PDFParser(handle)
        document = PDFDocument(parser)
        resources = PDFResourceManager()
        for page in PDFPage.create_pages(document):
            if max_pages and len(pages) >= max_pages:
                break
            output = StringIO()
            device = TextConverter(resources, output, laparams=LAParams())
            PDFPageInterpreter(resources, device).process_page(page)
            pages.append(output.getvalue())
    return pages, warnings


def read_pdf(path: str, max_pages: int) -> dict:
    """Read a PDF and return its pages, metadata, and warnings."""
    from pypdf import PdfReader

    reader = PdfReader(path)
    warnings: list[str] = []
    encrypted = bool(reader.is_encrypted)
    if encrypted:
        try:
            reader.decrypt("")
        except Exception as error:  # noqa: BLE001 - the message becomes a warning
            warnings.append("the PDF is encrypted and could not be opened: %s" % error)

    total = len(reader.pages)
    limit = min(total, max_pages) if max_pages else total
    texts: list[str] = []
    for index in range(limit):
        try:
            texts.append(reader.pages[index].extract_text() or "")
        except Exception as error:  # noqa: BLE001 - one broken page must not lose the document
            texts.append("")
            warnings.append("page %d could not be read: %s" % (index + 1, error))

    if not any(text.strip() for text in texts):
        fallback, fallback_warnings = read_pdf_with_pdfminer(path, max_pages)
        if any(text.strip() for text in fallback):
            warnings.append("pypdf recovered no text; the text below comes from pdfminer.six")
            texts = fallback
            warnings.extend(fallback_warnings)
        elif encrypted:
            warnings.append(
                "the PDF is encrypted and no password was supplied, so no text could be read"
            )
        else:
            warnings.append(
                "the PDF has no text layer, so it is probably a scan; "
                "the sandbox has no OCR engine"
            )

    return {
        "kind": "pdf",
        "pageCount": total,
        "pages": [
            {"page": index + 1, "text": text} for index, text in enumerate(texts)
        ],
        "metadata": pdf_metadata(reader),
        "warnings": warnings,
    }


def read_docx(path: str) -> dict:
    """Read a Word document and return its paragraphs and tables."""
    import docx

    document = docx.Document(path)
    blocks: list[str] = []
    for paragraph in document.paragraphs:
        if paragraph.text.strip():
            blocks.append(paragraph.text)
    for table_index, table in enumerate(document.tables, start=1):
        blocks.append("--- table %d ---" % table_index)
        for row in table.rows:
            blocks.append(" | ".join(cell.text.strip() for cell in row.cells))
    core = document.core_properties
    metadata = {
        "title": core.title or "",
        "author": core.author or "",
        "subject": core.subject or "",
    }
    return {
        "kind": "docx",
        "pageCount": None,
        "pages": [],
        "blocks": blocks,
        "metadata": metadata,
        "warnings": [],
    }


def read_xlsx(path: str) -> dict:
    """Read a spreadsheet and return every sheet as tab-separated rows."""
    import openpyxl

    workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
    blocks: list[str] = []
    for sheet in workbook.worksheets:
        blocks.append("--- sheet %s ---" % sheet.title)
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if cell is None else str(cell) for cell in row]
            if any(cell.strip() for cell in cells):
                blocks.append("\t".join(cells))
    workbook.close()
    return {
        "kind": "xlsx",
        "pageCount": None,
        "pages": [],
        "blocks": blocks,
        "metadata": {},
        "warnings": [],
    }


def read_document(path: str, max_pages: int) -> dict:
    """Read a supported document and return a uniform result."""
    lowered = path.lower()
    if lowered.endswith(".pdf"):
        return read_pdf(path, max_pages)
    if lowered.endswith(".docx"):
        return read_docx(path)
    if lowered.endswith(".xlsx"):
        return read_xlsx(path)
    fail(
        EXIT_INPUT,
        "unsupported document type: %s (supported: .pdf, .docx, .xlsx)" % path,
    )


def document_text(result: dict) -> str:
    """Render the extracted content as one text block."""
    if result["pages"]:
        return "\n".join(
            "----- page %d -----\n%s" % (page["page"], page["text"])
            for page in result["pages"]
        )
    return "\n".join(result.get("blocks", []))


def main() -> int:
    """Read the requested document and print the result as JSON."""
    path = document_path()
    max_pages = positive_int_env(ENV_MAX_PAGES, 0)
    max_characters = positive_int_env(ENV_MAX_CHARACTERS, DEFAULT_MAX_CHARACTERS)

    result = read_document(path, max_pages)
    text = document_text(result)
    truncated = len(text) > max_characters
    if truncated:
        text = text[:max_characters]

    payload = {
        "path": path,
        "kind": result["kind"],
        "pageCount": result["pageCount"],
        "extractedPages": len(result["pages"]) if result["pages"] else None,
        "metadata": result["metadata"],
        "characters": len(text),
        "truncated": truncated,
        "text": text,
        "warnings": result["warnings"],
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return EXIT_OK


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001 - the message becomes the tool error
        fail(EXIT_INPUT, "the document could not be read: %s" % error)
