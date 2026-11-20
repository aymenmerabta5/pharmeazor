"""Build the clean PHARMEAZOR corpus.

Usage (from ``tooling/clearning-lab/``):

    python run.py                 # clean + preview chunks + validate
    python run.py --no-chunks     # clean + validate only
    python run.py --only-med MED031
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

from settings import DEFAULT_CONFIG, Settings, load_settings

from .chunking import preview as chunk_preview
from .dedupe import deduplicate
from .extractors import ExtractedPart, extract_bdpm_html, extract_pdf, render_markdown
from .sections import KEY_CODES, classify_heading
from .structured import (
    Medicine,
    bdpm_register_kind,
    build_nomenclature_documents,
    load_medicines,
    parse_bdpm_register,
    parse_nomenclature,
    write_bdpm_outputs,
    write_nomenclature_outputs,
)
from .text_utils import (
    clean_inline,
    normalize_date,
    normalize_key,
    sha256_file,
    sha256_text,
)

CLEANER_VERSION = "1.0.0"
SOURCE_TOKEN_RE = re.compile(r"__SRC_([A-Z0-9_]+?)__")
STRENGTH_RE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ml|cl|l|ui|iu|%|mg/ml|mg/g)"
    r"(?:\s*/\s*\d+(?:[.,]\d+)?\s*(?:mg|g|ml|%))?",
    re.IGNORECASE,
)


def extract_strengths(*values: str | None) -> list[str]:
    found: set[str] = set()
    for value in values:
        if not value:
            continue
        for match in STRENGTH_RE.finditer(str(value)):
            found.add(re.sub(r"\s+", "", match.group(0)).upper())
    return sorted(found)


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------


def infer_source_id(row: dict[str, Any], known_sources: dict[str, Any]) -> str:
    source = clean_inline(str(row.get("source_id", "")))
    if source in known_sources:
        return source
    match = SOURCE_TOKEN_RE.search(str(row.get("document_id", "")))
    if match and match.group(1) in known_sources:
        return match.group(1)
    return source or "UNKNOWN"


def load_groups(
    settings: Settings,
    *,
    only_med: str | None = None,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
    documents_path = settings.paths.documents_csv
    if not documents_path.exists():
        raise FileNotFoundError(
            f"raw collection not found: {documents_path}\n"
            "The cleaning lab reads the corpus produced by the sibling retrieval "
            "lab. Run the collection stage first:\n"
            "  cd tooling/retrieval-lab && python main.py init\n"
            "  cd tooling/retrieval-lab && python main.py collect-all\n"
            "or point --data-root / PHARMEAZOR_DATA_ROOT at an existing collection."
        )
    frame = pd.read_csv(documents_path, dtype=str).fillna("")
    known_sources = settings.sources
    groups: dict[str, dict[str, Any]] = {}
    excluded: list[dict[str, Any]] = []

    for row in frame.to_dict("records"):
        medicine_id = clean_inline(str(row.get("medicine_id", "")))
        if only_med and medicine_id != only_med:
            continue
        status = clean_inline(str(row.get("collection_status", "")))
        relevance = clean_inline(str(row.get("relevance_status", "")))
        if status != "collected":
            excluded.append(
                {
                    "document_id": row.get("document_id", ""),
                    "medicine_id": medicine_id,
                    "source_id": row.get("source_id", ""),
                    "status": status or "unknown",
                    "reason": "not_collected",
                }
            )
            continue
        if relevance and relevance != "verified":
            excluded.append(
                {
                    "document_id": row.get("document_id", ""),
                    "medicine_id": medicine_id,
                    "source_id": row.get("source_id", ""),
                    "status": relevance,
                    "reason": "relevance_rejected",
                    "notes": row.get("reviewer_notes", ""),
                }
            )
            continue

        rel_path = clean_inline(str(row.get("file_path", ""))).replace("\\", "/")
        if not rel_path:
            excluded.append(
                {
                    "document_id": row.get("document_id", ""),
                    "medicine_id": medicine_id,
                    "source_id": row.get("source_id", ""),
                    "status": "missing_path",
                    "reason": "empty_file_path",
                }
            )
            continue
        group = groups.setdefault(
            rel_path,
            {
                "rel_path": rel_path,
                "abs_path": settings.data_root / rel_path,
                "source_ids": set(),
                "document_ids": [],
                "medicine_ids": set(),
                "language": set(),
                "document_types": set(),
                "titles": set(),
                "brand_names": set(),
                "strength_forms": set(),
                "holders": set(),
                "source_urls": set(),
                "final_urls": set(),
                "collected_ats": set(),
                "publication_dates": set(),
                "publication_dates_raw": set(),
                "sha256s": set(),
                "review_notes": set(),
                "rows": [],
            },
        )
        source_id = infer_source_id(row, known_sources)
        group["source_ids"].add(source_id)
        group["document_ids"].append(clean_inline(str(row.get("document_id", ""))))
        group["medicine_ids"].add(medicine_id)
        for field_name, target in (
            ("language", "language"),
            ("document_type", "document_types"),
            ("title", "titles"),
            ("brand_name", "brand_names"),
            ("strength_form", "strength_forms"),
            ("holder", "holders"),
            ("source_url", "source_urls"),
            ("final_url", "final_urls"),
            ("collected_at", "collected_ats"),
            ("sha256", "sha256s"),
            ("reviewer_notes", "review_notes"),
        ):
            value = clean_inline(str(row.get(field_name, "")))
            if value:
                group[target].add(value)
        publication_raw = clean_inline(str(row.get("publication_date", "")))
        if publication_raw:
            group["publication_dates_raw"].add(publication_raw)
            parsed = normalize_date(publication_raw)
            if parsed:
                group["publication_dates"].add(parsed)
        group["rows"].append(row)

    for group in groups.values():
        group["document_ids"] = sorted(set(group["document_ids"]))
        group["medicine_ids"] = sorted(set(group["medicine_ids"]))
        group["source_id"] = sorted(group["source_ids"])[0] if group["source_ids"] else "UNKNOWN"
    return groups, excluded


# ---------------------------------------------------------------------------
# Artifact construction
# ---------------------------------------------------------------------------


def _first(values: set[str], default: str = "") -> str:
    return sorted(values)[0] if values else default


def _latest_date(values: set[str]) -> str | None:
    parsed = [value for value in values if value]
    return max(parsed) if parsed else None


def _revision_date(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"(\d{1,2}/\d{1,2}/\d{4})", value)
    if match:
        return normalize_date(match.group(1))
    return normalize_date(value)


def _medicine_lookup(medicines: list[Medicine]) -> dict[str, Medicine]:
    return {medicine.medicine_id: medicine for medicine in medicines}


def _provenance(group: dict[str, Any], source_info: dict[str, Any]) -> str:
    collected = _latest_date(group["collected_ats"])
    published = _latest_date(group["publication_dates"])
    pieces = [
        f"Source: {source_info['source_name']} (autorité {source_info['authority_level']}/4)",
        f"collecté le {collected[:10]}" if collected else "date de collecte inconnue",
    ]
    if published:
        pieces.append(f"publié le {published}")
    language = _first(group["language"], "?")
    pieces.append(f"langue: {language}")
    return " · ".join(pieces)


def build_artifact(
    group: dict[str, Any],
    part: ExtractedPart,
    *,
    settings: Settings,
    medicines_by_id: dict[str, Medicine],
) -> dict[str, Any]:
    medicine_ids = group["medicine_ids"]
    medicine_names = [medicines_by_id[mid].inn for mid in medicine_ids if mid in medicines_by_id]
    inn = "; ".join(name for name in medicine_names if name)
    source_info = settings.source_info(group["source_id"])
    document_id = group["document_ids"][0]
    artifact_id = f"{document_id}__{part.part_id}"
    title = part.title or _first(group["titles"], "Document sans titre")
    normalized_title = normalize_key(title)
    if normalized_title.startswith(("annexe", "resume des caracteristiques", "document sans titre")):
        # ANPP cover pages are named "ANNEXE I"; the real product name is in
        # the denomination section. If extraction missed it, fall back to the
        # medicine identity rather than keeping a meaningless title.
        title = f"{inn} {_first(group['strength_forms'])}".strip() or title
    provenance = _provenance(group, source_info)
    body, sections = render_markdown(
        title,
        part.blocks,
        provenance=provenance,
        drop_line_patterns=settings.drop_line_patterns,
        drop_section_codes=settings.drop_section_codes,
    )
    body = body.strip() + "\n"
    present = sorted(
        {str(section["code"]) for section in sections if str(section["code"]) in KEY_CODES}
    )
    warnings = sorted(set(part.warnings) | set(group.get("warnings", [])))
    collected_at = _latest_date(group["collected_ats"])
    publication_date = _latest_date(group["publication_dates"])
    return {
        "schema_version": "1.0",
        "artifact_id": artifact_id,
        "artifact_type": "document",
        "document_id": document_id,
        "part_id": part.part_id,
        "source_id": group["source_id"],
        **source_info,
        "document_type": _first(group["document_types"], "unknown"),
        "language": _first(group["language"], "?"),
        "country": source_info.get("jurisdiction", ""),
        "medicine_ids": medicine_ids,
        "medicine_names": medicine_names,
        "inn": inn,
        "brand_name": _first(group["brand_names"]),
        "strength_form": _first(group["strength_forms"]),
        "strengths": extract_strengths(title, _first(group["strength_forms"])),
        "holder": _first(group["holders"]),
        "title": title,
        "source_urls": sorted(group["source_urls"]),
        "publication_date": publication_date,
        "publication_date_raw": _first(group["publication_dates_raw"]),
        "collected_at": collected_at,
        "revision_date": _revision_date(part.text_revision_date),
        "sha256_raw": _first(group["sha256s"]),
        "sha256_actual": group.get("sha256_actual", ""),
        "original_files": [group["rel_path"]],
        "source_document_ids": group["document_ids"],
        "content_sha256": sha256_text(body),
        "char_count": len(body),
        "word_count": len(re.findall(r"\b[\wÀ-ÿ'-]+\b", body)),
        "section_count": len(sections),
        "sections": sections,
        "key_sections_present": present,
        "key_sections_missing": sorted(KEY_CODES - set(present)),
        "status": "clean",
        "duplicate_of": None,
        "similarity": None,
        "warnings": warnings,
        "method": part.method,
        "cleaner_version": CLEANER_VERSION,
        "cleaned_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "body": body,
    }


def build_derived_artifact(
    document: dict[str, Any],
    *,
    settings: Settings,
    group: dict[str, Any],
    medicines_by_id: dict[str, Medicine],
) -> dict[str, Any]:
    source_info = settings.source_info(document["source_id"])
    title = document["title"]
    body, sections = render_markdown(
        title,
        document["blocks"],
        provenance=_provenance(group, source_info),
        drop_line_patterns=settings.drop_line_patterns,
        drop_section_codes=settings.drop_section_codes,
    )
    body = body.strip() + "\n"
    present = sorted(
        {str(section["code"]) for section in sections if str(section["code"]) in KEY_CODES}
    )
    artifact = {
        "schema_version": "1.0",
        "artifact_id": document["document_id"],
        "artifact_type": "document",
        "document_id": document["document_id"],
        "part_id": document["part_id"],
        "source_id": document["source_id"],
        **source_info,
        "document_type": document["document_type"],
        "language": document["language"],
        "country": document["country"],
        "medicine_ids": document["medicine_ids"],
        "medicine_names": [
            medicines_by_id[mid].inn for mid in document["medicine_ids"] if mid in medicines_by_id
        ],
        "inn": "; ".join(
            medicines_by_id[mid].inn for mid in document["medicine_ids"] if mid in medicines_by_id
        ),
        "brand_name": "",
        "strength_form": "",
        "strengths": [],
        "holder": "",
        "title": title,
        "source_urls": sorted(group["source_urls"]),
        "publication_date": document.get("publication_date"),
        "publication_date_raw": document.get("publication_date"),
        "collected_at": document.get("collected_at"),
        "revision_date": None,
        "sha256_raw": group.get("sha256_actual", ""),
        "sha256_actual": group.get("sha256_actual", ""),
        "original_files": document.get("original_files") or [group["rel_path"]],
        "source_document_ids": document.get("source_document_ids") or [],
        "content_sha256": sha256_text(body),
        "char_count": len(body),
        "word_count": len(re.findall(r"\b[\wÀ-ÿ'-]+\b", body)),
        "section_count": len(sections),
        "sections": sections,
        "key_sections_present": present,
        "key_sections_missing": sorted(KEY_CODES - set(present)),
        "status": "clean",
        "duplicate_of": None,
        "similarity": None,
        "warnings": document.get("warnings", []),
        "method": document.get("method", "derived"),
        "cleaner_version": CLEANER_VERSION,
        "cleaned_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "body": body,
    }
    return artifact


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------


def reset_output(output_root: Path) -> None:
    for name in ("documents", "structured", "preview", "reports"):
        target = output_root / name
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True, exist_ok=True)


MANIFEST_EXCLUDE = {"body"}


def manifest_row(artifact: dict[str, Any], *, output_path: str | None) -> dict[str, Any]:
    row = {key: value for key, value in artifact.items() if key not in MANIFEST_EXCLUDE}
    row["output_path"] = output_path
    return row


def write_markdown(artifact: dict[str, Any], documents_dir: Path) -> str:
    path = documents_dir / f"{artifact['artifact_id']}.md"
    front_matter = {
        key: value
        for key, value in artifact.items()
        if key not in {"body", "status", "duplicate_of", "similarity"}
    }
    front_matter["status"] = artifact["status"]
    if artifact.get("duplicate_of"):
        front_matter["duplicate_of"] = artifact["duplicate_of"]
        front_matter["similarity"] = artifact["similarity"]
    front_matter["content_sha256"] = artifact["content_sha256"]
    header = yaml.safe_dump(
        front_matter,
        sort_keys=False,
        allow_unicode=True,
        width=1000,
        default_flow_style=False,
    ).strip()
    path.write_text(f"---\n{header}\n---\n\n{artifact['body']}", encoding="utf-8", newline="\n")
    return str(path.relative_to(documents_dir.parent))


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: _csv_value(row.get(key)) for key in columns})


def _csv_value(value: Any) -> Any:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


# ---------------------------------------------------------------------------
# Coverage and reports
# ---------------------------------------------------------------------------


def build_coverage(
    artifacts: list[dict[str, Any]],
    medicines: list[Medicine],
    structured_artifacts: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    clinical_types = {"smpc", "label", "composition", "smpc_notice"}
    structured_artifacts = structured_artifacts or []
    for medicine in medicines:
        all_documents = [
            artifact
            for artifact in artifacts
            if artifact.get("status") == "clean"
            and medicine.medicine_id in artifact.get("medicine_ids", [])
        ]
        # A filtered BDPM register or the official nomenclature is a real
        # source for the medicine even though it is not a clinical prose
        # document. Count it for source coverage, never for section coverage.
        all_documents.extend(
            artifact
            for artifact in structured_artifacts
            if medicine.medicine_id in artifact.get("medicine_ids", [])
        )
        clinical_documents = [
            artifact
            for artifact in all_documents
            if artifact.get("document_type") in clinical_types
        ]
        sources = sorted({artifact["source_id"] for artifact in all_documents})
        has_anpp = any(artifact["source_id"] == "ANPP_RCP" for artifact in all_documents)
        key_counts = {
            code: sum(
                1 for artifact in clinical_documents if code in artifact.get("key_sections_present", [])
            )
            for code in sorted(KEY_CODES)
        }
        missing = sorted(code for code, count in key_counts.items() if count == 0)
        rows.append(
            {
                "medicine_id": medicine.medicine_id,
                "inn": medicine.inn,
                "therapeutic_class": medicine.therapeutic_class,
                "n_documents": len(all_documents),
                "n_clinical_documents": len(clinical_documents),
                "n_sources": len(sources),
                "sources": ";".join(sources),
                "has_algerian_official": any(
                    artifact["authority_level"] <= 2 for artifact in all_documents
                ),
                "has_anpp_smpc": has_anpp,
                **{f"docs_with_{code}": count for code, count in key_counts.items()},
                "missing_key_sections": ";".join(missing),
                "total_chars": sum(artifact.get("char_count", 0) for artifact in all_documents),
            }
        )
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def run(
    *,
    config_path: Path = DEFAULT_CONFIG,
    data_root_override: str | None = None,
    output_root_override: str | None = None,
    only_med: str | None = None,
    no_chunks: bool = False,
    no_dedupe: bool = False,
) -> dict[str, Any]:
    settings = load_settings(
        config_path,
        data_root_override=data_root_override,
        output_root_override=output_root_override,
    )
    output_root = settings.output_root
    reset_output(output_root)
    documents_dir = output_root / "documents"
    structured_dir = output_root / "structured"
    reports_dir = output_root / "reports"
    preview_dir = output_root / "preview"

    medicines = load_medicines(settings.paths.medicines_csv)
    medicines_by_id = _medicine_lookup(medicines)
    groups, excluded_rows = load_groups(settings, only_med=only_med)

    artifacts: list[dict[str, Any]] = []
    inventory: list[dict[str, Any]] = []
    structured_artifacts: list[dict[str, Any]] = []
    xlsx_groups: list[dict[str, Any]] = []
    bdpm_groups: list[dict[str, Any]] = []

    for rel_path, group in sorted(groups.items()):
        abs_path: Path = group["abs_path"]
        base_inventory = {
            "rel_path": rel_path,
            "source_id": group["source_id"],
            "document_ids": group["document_ids"],
            "medicine_ids": group["medicine_ids"],
            "document_type": _first(group["document_types"]),
            "language": _first(group["language"]),
            "collected_at": _latest_date(group["collected_ats"]),
        }
        if not abs_path.exists():
            inventory.append({**base_inventory, "status": "missing", "reason": "file_not_found"})
            continue
        group["sha256_actual"] = sha256_file(abs_path)
        declared = {value for value in group["sha256s"] if value}
        if declared and group["sha256_actual"] not in declared:
            group["warnings"] = ["sha256_mismatch_between_metadata_and_file"]
        suffix = abs_path.suffix.lower()
        if suffix == ".xlsx":
            group["kind"] = "xlsx"
            xlsx_groups.append(group)
            inventory.append(
                {
                    **base_inventory,
                    "status": "structured",
                    "reason": "official_nomenclature_workbook",
                    "sha256_actual": group["sha256_actual"],
                }
            )
            continue
        if suffix == ".txt" and group["source_id"] == "BDPM_FR":
            group["kind"] = "bdpm_register"
            group["title"] = _first(group["titles"])
            bdpm_groups.append(group)
            inventory.append(
                {
                    **base_inventory,
                    "status": "structured",
                    "reason": "bdpm_register_dump",
                    "sha256_actual": group["sha256_actual"],
                }
            )
            continue
        try:
            if suffix == ".pdf":
                part = extract_pdf(
                    abs_path,
                    source_id=group["source_id"],
                    language=_first(group["language"], "fr"),
                    fallback_title=_first(group["titles"]),
                    brand=_first(group["brand_names"]),
                    strength=_first(group["strength_forms"]),
                )
                parts = [part]
            elif suffix in {".html", ".htm"}:
                parts = extract_bdpm_html(abs_path)
            else:
                inventory.append(
                    {**base_inventory, "status": "skipped", "reason": f"unsupported_suffix:{suffix}"}
                )
                continue
        except Exception as error:  # noqa: BLE001 - one bad file must not stop the corpus
            inventory.append(
                {
                    **base_inventory,
                    "status": "failed",
                    "reason": f"extractor_error:{type(error).__name__}:{error}",
                }
            )
            continue
        if not parts:
            inventory.append({**base_inventory, "status": "failed", "reason": "no_extractable_content"})
            continue
        produced: list[str] = []
        skipped_reason = ""
        for part in parts:
            artifact = build_artifact(
                group,
                part,
                settings=settings,
                medicines_by_id=medicines_by_id,
            )
            # A scanned PDF has only page headers as text. Embedding that stub
            # is worse than reporting it for OCR, so it is excluded explicitly.
            if any(str(warning).startswith("low_text_density") for warning in artifact["warnings"]) and artifact[
                "char_count"
            ] < 2500:
                skipped_reason = "needs_ocr:low_text_density"
                continue
            if artifact["char_count"] < 300:
                artifact["warnings"].append("too_short_after_cleaning")
            artifacts.append(artifact)
            produced.append(artifact["artifact_id"])
        inventory.append(
            {
                **base_inventory,
                "status": "skipped" if skipped_reason and not produced else "clean",
                "reason": skipped_reason,
                "artifact_ids": produced,
                "sha256_actual": group["sha256_actual"],
            }
        )

    # ---- structured SANTE_MSP workbook -----------------------------------
    for group in xlsx_groups:
        path = group["abs_path"]
        collected_at = _latest_date(group["collected_ats"])
        records = parse_nomenclature(path, medicines)
        for record in records:
            record["source_file"] = group["rel_path"]
        structured_artifacts.append(
            write_nomenclature_outputs(records, structured_dir, collected_at=collected_at)
        )
        source_document_ids: dict[str, list[str]] = defaultdict(list)
        for row in group["rows"]:
            source_document_ids[clean_inline(str(row.get("medicine_id", "")))].append(
                clean_inline(str(row.get("document_id", "")))
            )
        documents = build_nomenclature_documents(
            records,
            medicines,
            source_document_ids=source_document_ids,
            collected_at=collected_at,
        )
        for document in documents:
            artifacts.append(
                build_derived_artifact(
                    document,
                    settings=settings,
                    group=group,
                    medicines_by_id=medicines_by_id,
                )
            )

    # ---- structured BDPM register dumps ----------------------------------
    # The file name is not enough: the register type is in the document title
    # (e.g. "BDPM CIS_COMPO_bdpm.txt - ..."). Parse CIS first so composition
    # rows can inherit medicine identity through their CIS code.
    bdpm_groups.sort(
        key=lambda item: 0
        if bdpm_register_kind(item.get("title", ""), item["abs_path"]) == "cis"
        else 1
    )
    cis_to_medicines: dict[str, set[str]] = {}
    bdpm_records: list[dict[str, Any]] = []
    for group in bdpm_groups:
        kind = bdpm_register_kind(group.get("title", ""), group["abs_path"])
        records, inherited = parse_bdpm_register(
            group["abs_path"],
            title=group.get("title", ""),
            medicines=medicines,
            cis_to_medicines=cis_to_medicines if kind == "composition" else None,
        )
        cis_to_medicines.update(inherited)
        bdpm_records.extend(records)
    if bdpm_records:
        source_document_ids = sorted(
            {document_id for group in bdpm_groups for document_id in group["document_ids"]}
        )
        structured_artifacts.extend(
            write_bdpm_outputs(
                bdpm_records,
                structured_dir,
                source_document_ids=source_document_ids,
                collected_at=_latest_date(
                    {value for group in bdpm_groups for value in group["collected_ats"]}
                ),
            )
        )

    # ---- dedupe and status ------------------------------------------------
    if no_dedupe or not settings.dedupe.enabled:
        duplicate_info = {
            artifact["artifact_id"]: type(
                "Info",
                (),
                {"status": "clean", "duplicate_of": None, "similarity": None, "reason": None},
            )()
            for artifact in artifacts
        }
    else:
        duplicate_info = deduplicate(
            artifacts,
            shingle_words=settings.dedupe.shingle_words,
            near_threshold=settings.dedupe.near_threshold,
            official_threshold=settings.dedupe.official_threshold,
        )
    manifest: list[dict[str, Any]] = []
    for artifact in artifacts:
        info = duplicate_info[artifact["artifact_id"]]
        artifact["status"] = info.status
        artifact["duplicate_of"] = info.duplicate_of
        artifact["similarity"] = info.similarity
        if info.status == "duplicate":
            artifact["warnings"] = sorted(set(artifact["warnings"]) | {f"duplicate:{info.reason}"})
            manifest.append(manifest_row(artifact, output_path=None))
        else:
            output_path = write_markdown(artifact, documents_dir)
            manifest.append(manifest_row(artifact, output_path=output_path))

    for artifact in structured_artifacts:
        normalized = dict(artifact)
        if normalized.get("path"):
            normalized["path"] = str(Path(normalized["path"]).resolve().relative_to(output_root))
        if normalized.get("jsonl_path"):
            normalized["jsonl_path"] = str(
                Path(normalized["jsonl_path"]).resolve().relative_to(output_root)
            )
        normalized["output_path"] = normalized["path"]
        normalized["status"] = "clean"
        manifest.append(normalized)

    # ---- reports ----------------------------------------------------------
    manifest.sort(key=lambda row: row["artifact_id"])
    write_jsonl(output_root / "manifest.jsonl", manifest)
    write_jsonl(output_root / "inventory.jsonl", inventory)
    write_jsonl(output_root / "excluded.jsonl", excluded_rows)
    write_csv(
        reports_dir / "skipped.csv",
        [
            row
            for row in inventory
            if row.get("status") in {"skipped", "failed", "missing"}
        ],
        [
            "rel_path",
            "source_id",
            "document_ids",
            "medicine_ids",
            "document_type",
            "status",
            "reason",
        ],
    )

    report_rows = []
    for row in manifest:
        report_rows.append(
            {
                "artifact_id": row.get("artifact_id"),
                "artifact_type": row.get("artifact_type"),
                "status": row.get("status"),
                "source_id": row.get("source_id"),
                "authority_level": row.get("authority_level"),
                "medicine_ids": row.get("medicine_ids"),
                "language": row.get("language"),
                "document_type": row.get("document_type"),
                "title": row.get("title"),
                "char_count": row.get("char_count"),
                "section_count": row.get("section_count"),
                "sections": row.get("sections"),
                "key_sections_present": row.get("key_sections_present"),
                "key_sections_missing": row.get("key_sections_missing"),
                "duplicate_of": row.get("duplicate_of"),
                "similarity": row.get("similarity"),
                "warnings": row.get("warnings"),
                "output_path": row.get("output_path"),
            }
        )
    write_csv(
        reports_dir / "cleaning_report.csv",
        report_rows,
        [
            "artifact_id",
            "artifact_type",
            "status",
            "source_id",
            "authority_level",
            "medicine_ids",
            "language",
            "document_type",
            "title",
            "char_count",
            "section_count",
            "sections",
            "key_sections_present",
            "key_sections_missing",
            "duplicate_of",
            "similarity",
            "warnings",
            "output_path",
        ],
    )

    clean_artifacts = [artifact for artifact in artifacts if artifact["status"] == "clean"]
    duplicates = [artifact for artifact in artifacts if artifact["status"] == "duplicate"]
    write_csv(
        reports_dir / "duplicates.csv",
        [
            {
                "artifact_id": artifact["artifact_id"],
                "duplicate_of": artifact["duplicate_of"],
                "similarity": artifact["similarity"],
                "source_id": artifact["source_id"],
                "medicine_ids": artifact["medicine_ids"],
                "title": artifact["title"],
                "char_count": artifact["char_count"],
            }
            for artifact in duplicates
        ],
        [
            "artifact_id",
            "duplicate_of",
            "similarity",
            "source_id",
            "medicine_ids",
            "title",
            "char_count",
        ],
    )
    coverage = build_coverage(artifacts, medicines, structured_artifacts)
    write_csv(
        reports_dir / "coverage.csv",
        coverage,
        [
            "medicine_id",
            "inn",
            "therapeutic_class",
            "n_documents",
            "n_clinical_documents",
            "n_sources",
            "sources",
            "has_algerian_official",
            "has_anpp_smpc",
            "docs_with_indications",
            "docs_with_dosage",
            "docs_with_contraindications",
            "docs_with_interactions",
            "missing_key_sections",
            "total_chars",
        ],
    )
    coverage_gaps = []
    for row in coverage:
        reasons = []
        if int(row["n_sources"]) < 3:
            reasons.append("fewer_than_3_sources")
        if not row["has_algerian_official"]:
            reasons.append("no_algerian_official_source")
        if not row["has_anpp_smpc"]:
            reasons.append("no_anpp_smpc")
        if row["missing_key_sections"]:
            reasons.append("missing_key_sections")
        if reasons:
            coverage_gaps.append({**row, "gaps": ";".join(reasons)})
    write_csv(
        reports_dir / "coverage_gaps.csv",
        coverage_gaps,
        [
            "medicine_id",
            "inn",
            "n_documents",
            "n_clinical_documents",
            "n_sources",
            "sources",
            "has_algerian_official",
            "has_anpp_smpc",
            "missing_key_sections",
            "gaps",
        ],
    )

    summary = {
        "cleaner_version": CLEANER_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_root": str(settings.data_root),
        "counts": {
            "raw_file_groups": len(groups),
            "excluded_rows": len(excluded_rows),
            "clean_documents": len(clean_artifacts),
            "duplicates": len(duplicates),
            "structured_artifacts": len(structured_artifacts),
            "manifest_rows": len(manifest),
            "inventory_rows": len(inventory),
        },
        "by_source": dict(
            Counter(artifact["source_id"] for artifact in clean_artifacts).most_common()
        ),
        "by_language": dict(Counter(artifact["language"] for artifact in clean_artifacts).most_common()),
        "by_document_type": dict(
            Counter(artifact["document_type"] for artifact in clean_artifacts).most_common()
        ),
        "key_section_coverage": {
            code: sum(1 for artifact in clean_artifacts if code in artifact["key_sections_present"])
            for code in sorted(KEY_CODES)
        },
        "medicines_without_clean_document": [
            medicine.medicine_id
            for medicine in medicines
            if not any(
                medicine.medicine_id in artifact["medicine_ids"] for artifact in clean_artifacts
            )
        ],
        "coverage_gaps": coverage_gaps,
        "coverage": coverage,
    }

    if not no_chunks:
        summary["chunk_preview"] = chunk_preview(
            [(artifact["artifact_id"], artifact["body"], _chunk_metadata(artifact)) for artifact in clean_artifacts],
            preview_dir,
            tokenizer_name=settings.chunking.tokenizer,
            chunk_size=settings.chunking.chunk_size_tokens,
            chunk_overlap=settings.chunking.chunk_overlap_tokens,
            sample_per_document=settings.chunking.preview_chunks_per_document,
            merge_min_tokens=settings.chunking.merge_min_tokens,
        )

    (reports_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    print(
        f"clean documents: {len(clean_artifacts)} | duplicates removed: {len(duplicates)} | "
        f"structured artifacts: {len(structured_artifacts)} | excluded rows: {len(excluded_rows)}"
    )
    for artifact in structured_artifacts:
        print(f"  structured: {artifact['artifact_id']} ({artifact.get('rows', '?')} rows) -> {artifact['path']}")
    print(f"output: {output_root}")
    return summary


def _chunk_metadata(artifact: dict[str, Any]) -> dict[str, Any]:
    return {
        "document_id": artifact["document_id"],
        "source_id": artifact["source_id"],
        "authority_level": artifact["authority_level"],
        "document_type": artifact["document_type"],
        "language": artifact["language"],
        "medicine_ids": artifact["medicine_ids"],
        "publication_date": artifact["publication_date"],
        "collected_at": artifact["collected_at"],
    }
