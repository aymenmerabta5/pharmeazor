"""Validate the clean corpus and its traceability back to the raw inventory."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

from .clean_corpus import BASE_DIR, DEFAULT_CONFIG, resolve_data_root
from .sections import KEY_CODES
from .text_utils import sha256_text

FORBIDDEN_BODY_STRINGS = (
    "Redirection vers le haut de page",
    "Prix hors honoraire",
    "Cliquez ici pour accéder au glossaire",
    "Service médical rendu",
    "Amélioration du service médical rendu",
)

REQUIRED_FRONT_MATTER = (
    "artifact_id",
    "document_id",
    "source_id",
    "authority_level",
    "medicine_ids",
    "language",
    "content_sha256",
    "sections",
    "key_sections_present",
    "key_sections_missing",
    "publication_date",
    "collected_at",
    "original_files",
    "source_document_ids",
)


def parse_front_matter(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError("missing YAML front matter")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("unterminated YAML front matter")
    metadata = yaml.safe_load(text[4:end])
    body = text[end + 5 :].lstrip("\n")
    return metadata or {}, body


def validate(
    *,
    config_path: Path = DEFAULT_CONFIG,
    output_root: str | Path | None = None,
) -> dict[str, Any]:
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    data_root = resolve_data_root(config_path, None, config["data_root"])
    root = Path(output_root or (BASE_DIR / config["output_root"])).resolve()
    reports_dir = root / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    warnings: list[str] = []

    manifest_path = root / "manifest.jsonl"
    if not manifest_path.exists():
        return {"ok": False, "errors": ["manifest.jsonl missing"], "warnings": []}
    manifest = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines() if line]
    documents = [row for row in manifest if row.get("artifact_type") == "document"]
    structured = [row for row in manifest if row.get("artifact_type") == "structured_reference"]

    seen_ids: set[str] = set()
    covered_raw_ids: set[str] = set()
    body_checks: list[dict[str, Any]] = []
    missing_sections: dict[str, list[str]] = defaultdict(list)

    for row in documents:
        artifact_id = row["artifact_id"]
        if artifact_id in seen_ids:
            errors.append(f"duplicate artifact_id: {artifact_id}")
        seen_ids.add(artifact_id)
        for raw_id in row.get("source_document_ids") or []:
            covered_raw_ids.add(raw_id)
        for key in REQUIRED_FRONT_MATTER:
            if key not in row:
                errors.append(f"{artifact_id}: missing manifest field {key}")
        if row.get("status") == "duplicate":
            if not row.get("duplicate_of"):
                errors.append(f"{artifact_id}: duplicate without duplicate_of")
            continue
        output_path = row.get("output_path")
        if not output_path:
            errors.append(f"{artifact_id}: clean document without output_path")
            continue
        path = root / output_path
        if not path.exists():
            errors.append(f"{artifact_id}: output file missing: {output_path}")
            continue
        try:
            metadata, body = parse_front_matter(path)
        except Exception as error:  # noqa: BLE001
            errors.append(f"{artifact_id}: unreadable front matter: {error}")
            continue
        for key in REQUIRED_FRONT_MATTER:
            if key not in metadata:
                errors.append(f"{artifact_id}: front matter missing {key}")
        if metadata.get("content_sha256") != sha256_text(body):
            errors.append(f"{artifact_id}: content_sha256 mismatch")
        if len(body.strip()) < 300:
            warnings.append(f"{artifact_id}: body shorter than 300 chars")
        if not body.lstrip().startswith("# "):
            errors.append(f"{artifact_id}: body does not start with an H1 title")
        forbidden = [needle for needle in FORBIDDEN_BODY_STRINGS if needle in body]
        if forbidden:
            errors.append(f"{artifact_id}: forbidden boilerplate remains: {forbidden}")
        if row.get("document_type") != "nomenclature":
            missing = [
                code for code in sorted(KEY_CODES) if code not in row.get("key_sections_present", [])
            ]
            if missing:
                missing_sections[artifact_id] = missing
                warnings.append(f"{artifact_id}: missing key sections {missing}")
        body_checks.append(
            {
                "artifact_id": artifact_id,
                "chars": len(body),
                "sections": len(metadata.get("sections") or []),
                "source_id": metadata.get("source_id"),
                "duplicate_of": metadata.get("duplicate_of"),
            }
        )

    for row in structured:
        for raw_id in row.get("source_document_ids") or []:
            covered_raw_ids.add(raw_id)
        path = root / row["output_path"] if row.get("output_path") else None
        if path and not path.exists():
            errors.append(f"{row['artifact_id']}: structured artifact missing: {row['output_path']}")

    # Raw inventory traceability: every collected + verified row must be
    # covered, explicitly excluded, or recorded with a failure reason.
    raw_path = data_root / config["paths"]["documents_csv"]
    raw = pd.read_csv(raw_path, dtype=str).fillna("")
    excluded_rows: dict[str, str] = {}
    excluded_path = root / "excluded.jsonl"
    if excluded_path.exists():
        for line in excluded_path.read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            item = json.loads(line)
            excluded_rows[item.get("document_id", "")] = item.get("reason", "excluded")
    inventory_status: dict[str, str] = {}
    inventory_path = root / "inventory.jsonl"
    if inventory_path.exists():
        for line in inventory_path.read_text(encoding="utf-8").splitlines():
            if not line:
                continue
            item = json.loads(line)
            for document_id in item.get("document_ids") or []:
                inventory_status[document_id] = item.get("status", "")

    uncovered: list[str] = []
    for row in raw.to_dict("records"):
        if row.get("collection_status") != "collected":
            continue
        if row.get("relevance_status") not in {"", "verified"}:
            continue
        document_id = row.get("document_id", "")
        if document_id in covered_raw_ids:
            continue
        if document_id in excluded_rows:
            continue
        if inventory_status.get(document_id) in {"failed", "missing", "skipped"}:
            continue
        uncovered.append(document_id)
    if uncovered:
        errors.append(f"{len(uncovered)} collected document(s) not accounted for: {uncovered[:10]}")

    # Medicine coverage.
    medicines = pd.read_csv(data_root / config["paths"]["medicines_csv"], dtype=str).fillna("")
    clinical_documents = [
        row
        for row in documents
        if row.get("status") == "clean" and row.get("document_type") != "nomenclature"
    ]
    source_documents = [row for row in documents if row.get("status") == "clean"]
    medicine_sources: dict[str, set[str]] = defaultdict(set)
    medicine_documents: Counter[str] = Counter()
    for row in source_documents:
        for medicine_id in row.get("medicine_ids") or []:
            medicine_documents[medicine_id] += 1
            medicine_sources[medicine_id].add(row.get("source_id", ""))
    # A filtered BDPM register or the official nomenclature counts as a source
    # for identity/equivalence, exactly as in reports/coverage.csv.
    for row in structured:
        for medicine_id in row.get("medicine_ids") or []:
            medicine_sources[medicine_id].add(row.get("source_id", ""))
    missing_medicines = [
        row["medicine_id"] for row in medicines.to_dict("records") if medicine_documents[row["medicine_id"]] == 0
    ]
    if missing_medicines:
        errors.append(f"medicines without a clean document: {missing_medicines}")
    thin_medicines = [
        {
            "medicine_id": row["medicine_id"],
            "inn": row["inn"],
            "documents": medicine_documents[row["medicine_id"]],
            "sources": sorted(medicine_sources[row["medicine_id"]]),
        }
        for row in medicines.to_dict("records")
        if 0 < len(medicine_sources[row["medicine_id"]]) < 3
    ]

    # Chunk preview checks.
    chunk_stats: dict[str, Any] | None = None
    stats_path = root / "preview" / "chunk_stats.json"
    if stats_path.exists():
        chunk_stats = json.loads(stats_path.read_text(encoding="utf-8"))
        if chunk_stats.get("chunks", 0) == 0:
            errors.append("chunk preview produced zero chunks")
        if chunk_stats.get("too_large", 0) > 0:
            errors.append(f"{chunk_stats['too_large']} preview chunk(s) exceed the token limit")
        if chunk_stats.get("documents", 0) != len(
            [row for row in documents if row.get("status") == "clean"]
        ):
            warnings.append("chunk preview document count differs from clean document count")

    result = {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "counts": {
            "manifest_rows": len(manifest),
            "documents": len(documents),
            "clean_documents": sum(1 for row in documents if row.get("status") == "clean"),
            "duplicates": sum(1 for row in documents if row.get("status") == "duplicate"),
            "structured_artifacts": len(structured),
            "covered_raw_documents": len(covered_raw_ids),
            "uncovered_raw_documents": len(uncovered),
            "medicines_without_documents": len(missing_medicines),
        },
        "sources": dict(Counter(row.get("source_id") for row in clinical_documents).most_common()),
        "missing_key_sections": missing_sections,
        "thin_medicines": thin_medicines,
        "body_checks": body_checks,
        "chunk_preview": (
            {key: value for key, value in chunk_stats.items() if key != "per_document"}
            if chunk_stats
            else None
        ),
    }
    (reports_dir / "validation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result
