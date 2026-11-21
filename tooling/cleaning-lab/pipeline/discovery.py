"""Recursive discovery and reconciliation of the raw collection tree.

The cleaning pipeline is driven by the collection metadata
(``documents.csv``), which is the provenance contract. This module adds the
loading-phase audit on top of it: it walks the raw tree *on disk*, so every
physical file is accounted for even when no metadata row points at it.

Every discovered file ends up in exactly one fate bucket:

* ``cleaned`` - produced at least one clean artifact (artifacts later marked
  duplicates are tracked, never deleted, and remain attached to the file);
* ``structured`` - exported as a reference table (nomenclature, registers);
* ``skipped`` - deliberately not cleaned, with a reason (e.g. a scanned PDF
  that needs OCR);
* ``failed`` - the extractor raised; the inventory records the error;
* ``missing`` - the metadata points at a file that is not on disk; the
  discovery walk only sees files that exist, so this case is surfaced by the
  inventory and skipped reports rather than by this audit's CSV;
* ``excluded_row`` - a metadata row points at the file, but the collection
  lab did not accept it (not collected, or identity-rejected); such files are
  deliberately outside the corpus and stay on disk untouched;
* ``patient_notice`` - a notice ``.txt`` the collection lab carved out of an
  already-collected parent document. The notice files are collection-stage
  derivatives, not sources of truth: the parent artifact is what enters the
  corpus. Each notice is therefore measured against its parent's cleaned
  body (following dedupe canonicals) with character-trigram containment,
  which tolerates the word-splitting artifacts of the carving step, and
  reported instead of being ingested a second time;
* ``orphan`` - on disk but absent from every metadata table.

The raw tree is only ever read here; nothing in it is modified.
"""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .text_utils import normalize_key

SUPPORTED_SUFFIXES = frozenset({".pdf", ".html", ".htm", ".txt", ".xlsx", ".csv"})
_RAW_PREFIX = "data/raw/"
_NOTICE_SEPARATOR_RE = re.compile(r"^-{10,}\s*$", re.MULTILINE)
# BDPM notice .txt files start with "Notice patient ANSM - Mis à jour le : D/M/Y"
# before the clinical text; the date is already preserved as revision metadata.
_NOTICE_PROLOGUE_RE = re.compile(
    r"^\s*(?:notice\s+patient|patient\s+notice)\s+ANSM\s*[-–—]\s*Mis\s+[àa]\s+jour\s+le\s*:?\s*[\d/]+\s*",
    re.IGNORECASE,
)
# Containment thresholds for the carved-notice coverage check. The .txt files
# lose a few characters at PDF line breaks ("a refill" becomes "a re ll"), so
# exact windows are meaningless; trigram containment is not.
_CONTAINMENT_SUBSUMED = 0.90
_CONTAINMENT_MOSTLY = 0.70
_MAX_DEDUPE_HOPS = 5


def _normalize_rel(path: str | Path) -> str:
    """Forward slashes, no leading ``./``, no ``data/raw/`` prefix."""
    rel = str(path).replace("\\", "/").strip()
    rel = re.sub(r"^(\./)+", "", rel)
    if rel.startswith(_RAW_PREFIX):
        rel = rel[len(_RAW_PREFIX) :]
    return rel


def discover_raw_files(raw_root: Path) -> list[dict[str, Any]]:
    """Walk ``raw_root`` recursively and describe every file found."""
    files: list[dict[str, Any]] = []
    if not raw_root.exists():
        return files
    for path in sorted(raw_root.rglob("*")):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        files.append(
            {
                "rel_path": path.relative_to(raw_root).as_posix(),
                "suffix": suffix,
                "supported": suffix in SUPPORTED_SUFFIXES,
                "bytes": path.stat().st_size,
            }
        )
    return files


def load_notices(notices_csv: Path | None) -> dict[str, dict[str, Any]]:
    """Index the collection lab's notice table by normalized local path."""
    index: dict[str, dict[str, Any]] = {}
    if notices_csv is None or not notices_csv.exists():
        return index
    with notices_csv.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            local = _normalize_rel(row.get("local_file_path", ""))
            if not local:
                continue
            index[local] = {
                "document_id": row.get("document_id", ""),
                "medicine_id": row.get("medication_id", ""),
                "source_id": row.get("source_id", ""),
                "parent_path": _normalize_rel(row.get("original_file_path", "")),
                "verification_status": row.get("verification_status", ""),
            }
    return index


def load_document_paths(documents_csv: Path | None) -> dict[str, list[dict[str, str]]]:
    """Index every ``documents.csv`` row by file path, whatever its status.

    The cleaning inventory only holds rows the collection accepted; this
    index covers the rest too, so a file on disk that the collector rejected
    is reported as an excluded row instead of a false orphan.
    """
    index: dict[str, list[dict[str, str]]] = {}
    if documents_csv is None or not documents_csv.exists():
        return index
    with documents_csv.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            rel = _normalize_rel(row.get("file_path", ""))
            if not rel:
                continue
            index.setdefault(rel, []).append(
                {
                    "document_id": row.get("document_id", ""),
                    "collection_status": row.get("collection_status", ""),
                    "relevance_status": row.get("relevance_status", ""),
                }
            )
    return index


def read_text_best_effort(path: Path) -> str:
    """Decode a raw text file, falling back the way the registers do."""
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _notice_body(text: str) -> str:
    """Drop the header the collection notice-extractor prepended."""
    match = _NOTICE_SEPARATOR_RE.search(text)
    text = text[match.end() :] if match else text
    return _NOTICE_PROLOGUE_RE.sub("", text, count=1)


def _trigrams(text: str) -> set[str]:
    packed = normalize_key(text).replace(" ", "")
    return {packed[index : index + 3] for index in range(max(0, len(packed) - 2))}


def _body_of_markdown(path: Path) -> str:
    """The Markdown body without the YAML front matter."""
    text = path.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---\n", 3)
        if end != -1:
            return text[end + 5 :]
    return text


def _parent_bodies(
    parent_path: str,
    manifest_by_file: dict[str, list[dict[str, Any]]],
    by_artifact: dict[str, dict[str, Any]],
    output_root: Path,
    cache: dict[str, list[tuple[str, str]]],
) -> list[tuple[str, str]]:
    """``[(artifact_id, normalized body)]`` for one parent raw file.

    A parent whose artifacts were all marked duplicates keeps no output of
    its own; the text lives in the canonical that replaced it, so dedupe
    chains are followed before giving up.
    """
    if parent_path in cache:
        return cache[parent_path]
    bodies: list[tuple[str, str]] = []
    seen: set[str] = set()
    for row in manifest_by_file.get(parent_path, []):
        current: dict[str, Any] | None = row
        hops = 0
        while (
            current is not None
            and current.get("status") == "duplicate"
            and hops < _MAX_DEDUPE_HOPS
        ):
            current = by_artifact.get(current.get("duplicate_of") or "")
            hops += 1
        if current is None or current.get("artifact_id") in seen:
            continue
        output_path = current.get("output_path")
        if not output_path:
            continue
        path = output_root / output_path
        if path.exists():
            seen.add(current["artifact_id"])
            bodies.append((current["artifact_id"], normalize_key(_body_of_markdown(path))))
    cache[parent_path] = bodies
    return bodies


def notice_coverage(
    notice_path: Path,
    parent_bodies: list[tuple[str, str]],
) -> dict[str, Any]:
    """Fraction of the carved notice's text present in a parent artifact.

    Character-trigram containment, not exact matching: the carved ``.txt``
    files lose characters at PDF line breaks, and one broken word would fail
    a whole exact window while saying nothing about the cleaned corpus.
    """
    grams = _trigrams(_notice_body(read_text_best_effort(notice_path)))
    if not grams:
        return {"containment": 0.0, "artifact_id": "", "empty": True}
    best_fraction = 0.0
    best_artifact = ""
    for artifact_id, body in parent_bodies:
        packed = body.replace(" ", "")
        hit = sum(1 for gram in grams if gram in packed)
        fraction = hit / len(grams)
        if fraction > best_fraction:
            best_fraction = fraction
            best_artifact = artifact_id
    return {"containment": round(best_fraction, 4), "artifact_id": best_artifact, "empty": False}


def build_discovery(
    settings: Any,
    *,
    inventory: list[dict[str, Any]],
    manifest: list[dict[str, Any]],
    output_root: Path,
) -> dict[str, Any]:
    """Audit the raw tree against the pipeline output and write the report.

    Returns a JSON-ready summary; the per-file detail is written to
    ``reports/discovery.csv``. Called at the end of a clean run, after the
    manifest and the Markdown documents exist on disk.
    """
    raw_root = settings.data_root / "data" / "raw"
    discovered = discover_raw_files(raw_root)

    inventory_by_path: dict[str, dict[str, Any]] = {
        _normalize_rel(row.get("rel_path", "")): row
        for row in inventory
        if row.get("rel_path")
    }
    notices_by_path = load_notices(getattr(settings.paths, "notices_csv", None))
    documents_by_path = load_document_paths(settings.paths.documents_csv)

    manifest_by_file: dict[str, list[dict[str, Any]]] = {}
    by_artifact: dict[str, dict[str, Any]] = {}
    for row in manifest:
        if row.get("artifact_type") != "document":
            continue
        by_artifact[row["artifact_id"]] = row
        for original in row.get("original_files") or []:
            manifest_by_file.setdefault(_normalize_rel(original), []).append(row)

    body_cache: dict[str, list[tuple[str, str]]] = {}
    rows: list[dict[str, Any]] = []
    needs_review: list[dict[str, Any]] = []
    mostly_covered: list[dict[str, Any]] = []
    orphan_files: list[str] = []
    missing_files: list[str] = []
    failed_files: list[str] = []

    for found in discovered:
        rel = found["rel_path"]
        record: dict[str, Any] = {
            "rel_path": rel,
            "suffix": found["suffix"],
            "supported": found["supported"],
            "bytes": found["bytes"],
            "fate": "",
            "status": "",
            "reason": "",
            "artifact_ids": "",
            "document_ids": "",
            "notice_document_id": "",
            "notice_parent_path": "",
            "notice_containment": "",
            "notice_covered_in": "",
        }
        inventory_row = inventory_by_path.get(rel)
        notice_row = notices_by_path.get(rel)
        if inventory_row is not None:
            status = inventory_row.get("status", "")
            produced = [
                f"{row['artifact_id']}:{row.get('status', '')}"
                for row in manifest_by_file.get(rel, [])
            ]
            record["fate"] = "cleaned" if status == "clean" else status
            record["status"] = status
            record["reason"] = inventory_row.get("reason", "") or ""
            record["artifact_ids"] = ";".join(produced)
            if status == "failed":
                failed_files.append(rel)
            elif status == "missing":
                missing_files.append(rel)
        elif notice_row is not None:
            parent = notice_row["parent_path"]
            bodies = _parent_bodies(
                parent, manifest_by_file, by_artifact, output_root, body_cache
            )
            coverage = notice_coverage(settings.data_root / "data" / "raw" / rel, bodies)
            record["fate"] = "patient_notice"
            record["notice_document_id"] = notice_row["document_id"]
            record["notice_parent_path"] = parent
            record["notice_containment"] = coverage["containment"]
            record["notice_covered_in"] = coverage["artifact_id"]
            detail = {
                "document_id": notice_row["document_id"] or rel,
                "containment": coverage["containment"],
                "parent": parent,
            }
            if not bodies:
                record["status"] = "needs_review"
                record["reason"] = "parent_not_in_corpus"
                needs_review.append({**detail, "reason": "parent_not_in_corpus"})
            elif coverage["empty"]:
                record["status"] = "needs_review"
                record["reason"] = "empty_notice_file"
                needs_review.append({**detail, "reason": "empty_notice_file"})
            elif coverage["containment"] >= _CONTAINMENT_SUBSUMED:
                record["status"] = "subsumed_in_parent"
            elif coverage["containment"] >= _CONTAINMENT_MOSTLY:
                record["status"] = "mostly_in_parent"
                mostly_covered.append(detail)
            else:
                record["status"] = "needs_review"
                record["reason"] = "low_containment"
                needs_review.append({**detail, "reason": "low_containment"})
        elif rel in documents_by_path:
            metadata_rows = documents_by_path[rel]
            states = sorted(
                {
                    f"{row.get('collection_status', '') or 'unknown'}/{row.get('relevance_status', '') or '-'}"
                    for row in metadata_rows
                }
            )
            record["fate"] = "excluded_row"
            record["status"] = ";".join(states)
            record["reason"] = "collection_metadata_row_not_in_corpus"
            record["document_ids"] = ";".join(
                row.get("document_id", "") for row in metadata_rows
            )
        else:
            record["fate"] = "orphan"
            record["reason"] = "no_metadata_row"
            orphan_files.append(rel)
        rows.append(record)

    reports_dir = output_root / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    columns = [
        "rel_path",
        "suffix",
        "supported",
        "bytes",
        "fate",
        "status",
        "reason",
        "artifact_ids",
        "document_ids",
        "notice_document_id",
        "notice_parent_path",
        "notice_containment",
        "notice_covered_in",
    ]
    with (reports_dir / "discovery.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    supported = [found for found in discovered if found["supported"]]
    fates = Counter(row["fate"] for row in rows)
    notice_rows = [row for row in rows if row["fate"] == "patient_notice"]
    quarantine_root = settings.data_root / "data" / "quarantine"
    quarantined = (
        [
            path.relative_to(quarantine_root).as_posix()
            for path in sorted(quarantine_root.rglob("*"))
            if path.is_file()
        ]
        if quarantine_root.exists()
        else []
    )
    return {
        "raw_root": str(raw_root),
        "files_discovered": len(discovered),
        "supported_files": len(supported),
        "unsupported_files": len(discovered) - len(supported),
        "fates": dict(sorted(fates.items())),
        "patient_notices": {
            "total": len(notice_rows),
            "subsumed_in_parent": sum(
                1 for row in notice_rows if row["status"] == "subsumed_in_parent"
            ),
            "mostly_in_parent": mostly_covered,
            "needs_review": needs_review,
        },
        "orphan_files": orphan_files,
        "missing_files": missing_files,
        "failed_files": failed_files,
        "quarantined_out_of_corpus": quarantined,
        "reports": {"discovery_csv": "reports/discovery.csv"},
    }
