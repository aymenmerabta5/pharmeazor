"""Structured reference data: the official nomenclature and BDPM registers.

These rows are *not* forced into prose. They are exported as normalized
CSV/JSONL so the database can hold them as reference tables, while a derived
Markdown document per medicine makes them retrievable too.
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import openpyxl

from .extractors import Block
from .sections import classify_heading
from .text_utils import (
    clean_inline,
    normalize_date,
    normalize_key,
    sha256_bytes,
    stable_id,
)

# ---------------------------------------------------------------------------
# Medicine identity
# ---------------------------------------------------------------------------


@dataclass
class Medicine:
    medicine_id: str
    inn: str
    name: str
    atc: str = ""
    therapeutic_class: str = ""
    variants: list[str] = field(default_factory=list)
    components: list[str] = field(default_factory=list)


def load_medicines(path: Path) -> list[Medicine]:
    import pandas as pd

    frame = pd.read_csv(path, dtype=str).fillna("")
    medicines: list[Medicine] = []
    for _, row in frame.iterrows():
        variants = [
            clean_inline(item)
            for item in str(row.get("inn_variants", "")).split("|")
            if clean_inline(item)
        ]
        components = [
            clean_inline(item)
            for item in re.split(r"[/,;+|]", str(row.get("dci_components", "")))
            if clean_inline(item)
        ]
        medicines.append(
            Medicine(
                medicine_id=clean_inline(row["medicine_id"]),
                inn=clean_inline(row.get("inn", "")),
                name=clean_inline(row.get("name", "")),
                atc=clean_inline(row.get("atc", "")),
                therapeutic_class=clean_inline(row.get("class", "")),
                variants=variants,
                components=components,
            )
        )
    return medicines


def _medicine_terms(medicine: Medicine) -> set[str]:
    terms = {medicine.inn, medicine.name, *medicine.variants, *medicine.components}
    normalized = {normalize_key(term) for term in terms if term}
    # Drop pathological short terms; every target INN is longer than 4 chars.
    return {term for term in normalized if len(term) >= 5}


class MedicineMatcher:
    """Compiled, reusable medicine-name matcher.

    The BDPM registers contain tens of thousands of rows. Recomputing the term
    set per row is both slow and error-prone, so the term index and the
    alternation regex are built once.
    """

    def __init__(self, medicines: Iterable[Medicine]):
        term_to_medicines: dict[str, set[str]] = {}
        # A true combination such as "paracétamol + codéine" must contain both
        # components. Products labelled with a single common name (e.g.
        # cotrimoxazole) are not forced to spell out both salts.
        self._required_components: dict[str, list[str]] = {}
        for medicine in medicines:
            for term in _medicine_terms(medicine):
                term_to_medicines.setdefault(term, set()).add(medicine.medicine_id)
            common_name = medicine.inn.split("(")[0]
            components = [
                normalize_key(component)
                for component in medicine.components
                if len(normalize_key(component)) >= 5
            ]
            if " + " in common_name and len(components) >= 2:
                self._required_components[medicine.medicine_id] = components
        self._term_to_medicines = term_to_medicines
        terms = sorted(term_to_medicines, key=len, reverse=True)
        if terms:
            pattern = "|".join(re.escape(term) for term in terms)
            self._regex: re.Pattern[str] | None = re.compile(
                rf"(?<![a-z0-9])(?:{pattern})(?![a-z0-9])"
            )
        else:
            self._regex = None

    def match(self, text: str) -> list[str]:
        if not text or self._regex is None:
            return []
        normalized = f" {normalize_key(text)} "
        found: set[str] = set()
        for match in self._regex.finditer(normalized):
            found.update(self._term_to_medicines.get(match.group(0), set()))
        if not found:
            return []
        verified: list[str] = []
        for medicine_id in sorted(found):
            required = self._required_components.get(medicine_id, [])
            if required and not all(f" {component} " in normalized for component in required):
                continue
            verified.append(medicine_id)
        return verified


def match_medicines(
    text: str,
    medicines: Iterable[Medicine],
    *,
    matcher: MedicineMatcher | None = None,
) -> list[str]:
    return (matcher or MedicineMatcher(medicines)).match(text)


# ---------------------------------------------------------------------------
# Official Algerian nomenclature (SANTE_MSP)
# ---------------------------------------------------------------------------

_NOMENCLATURE_HEADER_MAP = (
    ("N°ENREGISTREMENT", "registration_number"),
    ("N°", "row_number"),
    ("CODE", "dci_code"),
    ("DENOMINATION COMMUNE INTERNATIONALE", "dci"),
    ("NOM DE MARQUE", "brand"),
    ("FORME", "form"),
    ("DOSAGE", "dosage"),
    ("CONDITIONNEMENT", "pack"),
    ("LISTE", "schedule"),
    ("LABORATOIRES DETENTEUR", "holder"),
    ("PAYS DU LABORATOIRE", "holder_country"),
    ("DATE D'ENREGISTREMENT INITIAL", "registered_initial"),
    ("DATE D'ENREGISTREMENT FINAL", "registered_final"),
    ("DATE D ENREGISTREMENT FINAL", "registered_final"),
    ("DATE DE RETRAIT", "withdrawal_date"),
    ("MOTIF DE RETRAIT", "withdrawal_reason"),
    ("TYPE", "product_type"),
    ("STATUT", "status"),
    ("DUREE DE STABILITE", "shelf_life"),
)

_SHEET_STATUS = {
    "Nomenclature Aout 2026": "registered",
    "Non Renouvelés ": "non_renewed",
    "Retraits": "withdrawn",
}


def _clean_header(value: Any) -> str:
    return normalize_key(str(value or "")).upper()


def _map_header(header: str) -> str:
    key = _clean_header(header)
    if not key:
        return ""
    # The bare "N°" header normalises to "N"; never let that one-letter prefix
    # capture "NOM DE MARQUE". Exact matches are resolved first, then long
    # prefixes.
    for prefix, field_name in _NOMENCLATURE_HEADER_MAP:
        if key == _clean_header(prefix):
            return field_name
    for prefix, field_name in _NOMENCLATURE_HEADER_MAP:
        normalized = _clean_header(prefix)
        if len(normalized) >= 5 and key.startswith(normalized):
            return field_name
    return ""


def _find_header_row(rows: list[tuple[Any, ...]]) -> int | None:
    for index, row in enumerate(rows[:40]):
        values = [str(value or "") for value in row]
        if sum(1 for value in values if value.strip()) >= 8 and any(
            "N°" in value or "ENREGISTREMENT" in value.upper() for value in values
        ):
            return index
    return None


def parse_nomenclature(path: Path, medicines: list[Medicine]) -> list[dict[str, Any]]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    matcher = MedicineMatcher(medicines)
    records: list[dict[str, Any]] = []
    for sheet in workbook.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        header_index = _find_header_row(rows)
        if header_index is None:
            continue
        mapped_headers = [_map_header(value) for value in rows[header_index]]
        status = _SHEET_STATUS.get(sheet.title.strip(), "registered")
        for row_number, row in enumerate(rows[header_index + 1 :], start=header_index + 2):
            values = [value for value in row]
            if not any(value is not None and str(value).strip() for value in values):
                continue
            record: dict[str, Any] = {
                "source_id": "SANTE_MSP",
                "source_sheet": sheet.title.strip(),
                "sheet_status": status,
                "excel_row": row_number,
            }
            for header, value in zip(mapped_headers, values, strict=False):
                if not header:
                    continue
                if isinstance(value, str):
                    value = clean_inline(value)
                elif value is None:
                    value = ""
                elif isinstance(value, (int, float)):
                    value = clean_inline(str(value))
                record[header] = value
            if not record.get("dci") and not record.get("brand"):
                continue
            record["registered_initial"] = normalize_date(record.get("registered_initial"))
            record["registered_final"] = normalize_date(record.get("registered_final"))
            record["withdrawal_date"] = normalize_date(record.get("withdrawal_date"))
            record["medicine_ids"] = matcher.match(
                " ".join(
                    str(record.get(key) or "")
                    for key in ("dci", "brand", "holder")
                )
            )
            record["in_scope"] = bool(record["medicine_ids"])
            record["is_combination"] = bool(re.search(r"[/+]", str(record.get("dci") or "")))
            record["authority_level"] = 2
            record["product_uid"] = stable_id(
                "SANTE_MSP",
                sheet.title,
                record.get("registration_number"),
                record.get("dci_code"),
                record.get("brand"),
                record.get("dosage"),
                record.get("pack"),
            )
            records.append(record)
    workbook.close()
    return records


def write_nomenclature_outputs(
    records: list[dict[str, Any]],
    output_dir: Path,
    *,
    collected_at: str | None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "nomenclature_products.csv"
    jsonl_path = output_dir / "nomenclature_products.jsonl"
    columns = [
        "product_uid",
        "source_id",
        "source_file",
        "collected_at",
        "authority_level",
        "source_sheet",
        "sheet_status",
        "excel_row",
        "in_scope",
        "is_combination",
        "medicine_ids",
        "row_number",
        "registration_number",
        "dci_code",
        "dci",
        "brand",
        "form",
        "dosage",
        "pack",
        "schedule",
        "holder",
        "holder_country",
        "registered_initial",
        "registered_final",
        "product_type",
        "status",
        "shelf_life",
        "p1",
        "p2",
        "obs",
        "withdrawal_date",
        "withdrawal_reason",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            record.setdefault("collected_at", collected_at)
            row = dict(record)
            row["medicine_ids"] = ";".join(record.get("medicine_ids") or [])
            writer.writerow(row)
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    return {
        "artifact_id": "SANTE_MSP__NOMENCLATURE__PRODUCTS",
        "artifact_type": "structured_reference",
        "path": str(csv_path),
        "jsonl_path": str(jsonl_path),
        "rows": len(records),
        "source_id": "SANTE_MSP",
        "authority_level": 2,
        "medicine_ids": sorted(
            {med for record in records for med in (record.get("medicine_ids") or [])}
        ),
        "collected_at": collected_at,
        "description": "Official Algerian nomenclature, all three sheets (registered, non-renewed, withdrawn).",
    }


def _product_bullet(record: dict[str, Any]) -> str:
    fields = [
        ("DCI", record.get("dci")),
        ("Forme", record.get("form")),
        ("Dosage", record.get("dosage")),
        ("Conditionnement", record.get("pack")),
        ("Liste", record.get("schedule")),
        ("Titulaire", record.get("holder")),
        ("Pays", record.get("holder_country")),
        (
            "Enregistrement",
            " → ".join(
                item
                for item in (record.get("registered_initial"), record.get("registered_final"))
                if item
            ),
        ),
        ("Association", "oui" if record.get("is_combination") else ""),
        ("Type", record.get("product_type")),
        ("Statut", record.get("status")),
        ("Stabilité", record.get("shelf_life")),
        ("Date de retrait", record.get("withdrawal_date")),
        ("Motif de retrait", record.get("withdrawal_reason")),
        ("N° enregistrement", record.get("registration_number")),
    ]
    detail = " · ".join(f"{label}: {value}" for label, value in fields if value)
    brand = record.get("brand") or record.get("dci") or "Produit"
    return f"- **{brand}** — {detail}"


def build_nomenclature_documents(
    records: list[dict[str, Any]],
    medicines: list[Medicine],
    *,
    source_document_ids: dict[str, list[str]],
    collected_at: str | None,
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    groups = [
        ("registered", "Produits enregistrés (nomenclature au 31 août 2026)"),
        ("non_renewed", "Produits non renouvelés"),
        ("withdrawn", "Produits retirés"),
    ]
    for medicine in medicines:
        rows = [row for row in records if medicine.medicine_id in (row.get("medicine_ids") or [])]
        if not rows:
            continue
        blocks: list[Block] = [
            Block(
                "para",
                "Source officielle : Ministère de l'Industrie Pharmaceutique, "
                "Nomenclature nationale des produits pharmaceutiques à usage de la médecine humaine, "
                "au 31 août 2026. Données d'identification produit ; elles ne remplacent pas le RCP.",
            )
        ]
        counts = []
        for status, heading in groups:
            subset = [row for row in rows if row.get("sheet_status") == status]
            counts.append(f"{len(subset)} {heading.split(' (')[0].lower()}")
            if not subset:
                continue
            blocks.append(Block("heading", heading, level=1, code=f"nomenclature_{status}"))
            subset.sort(key=lambda item: (normalize_key(item.get("brand", "")), normalize_key(item.get("dosage", ""))))
            for row in subset:
                blocks.append(Block("bullet", _product_bullet(row)))
        blocks.insert(
            1,
            Block(
                "para",
                f"Cette fiche recense {len(rows)} produit(s) de la nomenclature officielle "
                f"contenant ou correspondant à {medicine.inn} ({', '.join(counts)}).",
            ),
        )
        document_id = f"{medicine.medicine_id}__SRC_SANTE_MSP__NOMENCLATURE"
        documents.append(
            {
                "document_id": document_id,
                "part_id": "nomenclature",
                "source_id": "SANTE_MSP",
                "title": f"Nomenclature nationale — {medicine.inn}",
                "blocks": blocks,
                "document_type": "nomenclature",
                "language": "fr",
                "country": "DZ",
                "medicine_ids": [medicine.medicine_id],
                "source_document_ids": sorted(set(source_document_ids.get(medicine.medicine_id, []))),
                "collected_at": collected_at,
                "publication_date": "2026-08-31",
                "original_files": sorted({row.get("source_file", "") for row in rows if row.get("source_file")}),
                "warnings": [] if rows else [f"no_nomenclature_products_for:{medicine.medicine_id}"],
                "method": "sante_msp:xlsx",
                "extra": {"product_count": len(rows)},
            }
        )
    return documents


# ---------------------------------------------------------------------------
# Pharm'Net catalogue (PHARMNET_CATALOG)
# ---------------------------------------------------------------------------

_PHARMNET_STATUS_GROUPS = (
    ("registered", "Produits enregistrés"),
    ("non_renewed", "Produits non renouvelés"),
    ("withdrawn", "Produits retirés"),
)


def parse_pharmnet_catalogue(
    path: Path,
    medicines: list[Medicine],
    *,
    authority_level: int = 2,
) -> list[dict[str, Any]]:
    """Read the catalogue snapshot and attach the medicine identity.

    The catalogue is a product register: brand, DCI, code, form, dosage,
    pack, holder and registration dates.  It carries no clinical sections and
    no leaflet URL, so nothing here may be treated as an SmPC.

    It ranks at level 2: a register of the Algerian nomenclature, one notch
    below the official ministry list, and never a clinical authority.
    """
    import pandas as pd

    frame = pd.read_csv(path, dtype=str).fillna("")
    matcher = MedicineMatcher(medicines)
    records: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        record: dict[str, Any] = {
            "source_id": "PHARMNET_CATALOG",
            "product_id": clean_inline(str(row.get("product_id", ""))),
            "registration_number": clean_inline(str(row.get("registration_number", ""))),
            "dci_code": clean_inline(str(row.get("dci_code", ""))),
            "dci": clean_inline(str(row.get("dci", ""))),
            "brand": clean_inline(str(row.get("brand", ""))),
            "form": clean_inline(str(row.get("form", ""))),
            "dosage": clean_inline(str(row.get("dosage", ""))),
            "pack": clean_inline(str(row.get("pack", ""))),
            "schedule": clean_inline(str(row.get("schedule", ""))),
            "holder": clean_inline(str(row.get("holder", ""))),
            "holder_country": clean_inline(str(row.get("holder_country", ""))),
            "registered_initial": normalize_date(row.get("registered_initial")),
            "registered_final": normalize_date(row.get("registered_final")),
            "product_type": clean_inline(str(row.get("product_type", ""))),
            "status": clean_inline(str(row.get("status", ""))).lower() or "registered",
            "shelf_life_months": clean_inline(str(row.get("shelf_life_months", ""))),
            "observation": clean_inline(str(row.get("observation", ""))),
            "authority_level": authority_level,
        }
        if not record["dci"] and not record["brand"]:
            continue
        record["medicine_ids"] = matcher.match(
            " ".join(record[key] for key in ("dci", "brand", "holder"))
        )
        record["in_scope"] = bool(record["medicine_ids"])
        record["is_combination"] = bool(re.search(r"[/+]", record["dci"]))
        record["product_uid"] = stable_id(
            "PHARMNET_CATALOG",
            record["product_id"],
            record["registration_number"],
            record["brand"],
            record["dosage"],
            record["pack"],
        )
        records.append(record)
    return records


def write_pharmnet_outputs(
    records: list[dict[str, Any]],
    output_dir: Path,
    *,
    collected_at: str | None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "pharmnet_products.csv"
    jsonl_path = output_dir / "pharmnet_products.jsonl"
    columns = [
        "product_uid",
        "source_id",
        "collected_at",
        "authority_level",
        "in_scope",
        "is_combination",
        "medicine_ids",
        "product_id",
        "registration_number",
        "dci_code",
        "dci",
        "brand",
        "form",
        "dosage",
        "pack",
        "schedule",
        "holder",
        "holder_country",
        "registered_initial",
        "registered_final",
        "product_type",
        "status",
        "shelf_life_months",
        "observation",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            record.setdefault("collected_at", collected_at)
            row = dict(record)
            row["medicine_ids"] = ";".join(record.get("medicine_ids") or [])
            writer.writerow(row)
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
    return {
        "artifact_id": "PHARMNET_CATALOG__NOMENCLATURE__PRODUCTS",
        "artifact_type": "structured_reference",
        "path": str(csv_path),
        "jsonl_path": str(jsonl_path),
        "rows": len(records),
        "source_id": "PHARMNET_CATALOG",
        "authority_level": 2,
        "medicine_ids": sorted(
            {med for record in records for med in (record.get("medicine_ids") or [])}
        ),
        "collected_at": collected_at,
        "description": (
            "Public Pharm'Net catalogue of the Algerian nomenclature: "
            "registered, non-renewed and withdrawn products."
        ),
    }


def _pharmnet_bullet(record: dict[str, Any]) -> str:
    fields = [
        ("DCI", record.get("dci")),
        ("Forme", record.get("form")),
        ("Dosage", record.get("dosage")),
        ("Conditionnement", record.get("pack")),
        ("Liste", record.get("schedule")),
        ("Titulaire", record.get("holder")),
        ("Pays", record.get("holder_country")),
        (
            "Enregistrement",
            " → ".join(
                item
                for item in (record.get("registered_initial"), record.get("registered_final"))
                if item
            ),
        ),
        ("Association", "oui" if record.get("is_combination") else ""),
        ("Type", record.get("product_type")),
        ("Stabilité (mois)", record.get("shelf_life_months")),
        ("Observation", record.get("observation")),
        ("N° enregistrement", record.get("registration_number")),
    ]
    detail = " · ".join(f"{label}: {value}" for label, value in fields if value)
    brand = record.get("brand") or record.get("dci") or "Produit"
    return f"- **{brand}** — {detail}"


def build_pharmnet_documents(
    records: list[dict[str, Any]],
    medicines: list[Medicine],
    *,
    source_document_ids: dict[str, list[str]],
    collected_at: str | None,
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for medicine in medicines:
        rows = [row for row in records if medicine.medicine_id in (row.get("medicine_ids") or [])]
        if not rows:
            continue
        blocks: list[Block] = [
            Block(
                "para",
                "Source secondaire : catalogue public Pharm'Net de la nomenclature "
                "nationale algérienne, données mises à jour le 8 septembre 2026. "
                "Données d'identification produit ; elles ne remplacent pas le RCP "
                "et n'ont pas valeur de source officielle.",
            )
        ]
        counts = []
        for status, heading in _PHARMNET_STATUS_GROUPS:
            subset = [row for row in rows if row.get("status") == status]
            counts.append(f"{len(subset)} {heading.lower()}")
            if not subset:
                continue
            blocks.append(
                Block("heading", heading, level=1, code=f"nomenclature_{status}")
            )
            subset.sort(
                key=lambda item: (
                    normalize_key(item.get("brand", "")),
                    normalize_key(item.get("dosage", "")),
                )
            )
            for row in subset:
                blocks.append(Block("bullet", _pharmnet_bullet(row)))
        blocks.insert(
            1,
            Block(
                "para",
                f"Cette fiche recense {len(rows)} produit(s) du catalogue Pharm'Net "
                f"contenant ou correspondant à {medicine.inn} "
                f"({', '.join(counts)}).",
            ),
        )
        document_id = f"{medicine.medicine_id}__SRC_PHARMNET_CATALOG__NOMENCLATURE"
        documents.append(
            {
                "document_id": document_id,
                "part_id": "nomenclature",
                "source_id": "PHARMNET_CATALOG",
                "title": f"Catalogue Pharm'Net de la nomenclature — {medicine.inn}",
                "blocks": blocks,
                "document_type": "nomenclature",
                "language": "fr",
                "country": "DZ",
                "medicine_ids": [medicine.medicine_id],
                "source_document_ids": sorted(
                    set(source_document_ids.get(medicine.medicine_id, []))
                ),
                "collected_at": collected_at,
                "publication_date": "2026-09-08",
                "original_files": sorted(
                    {row.get("source_file", "") for row in rows if row.get("source_file")}
                ),
                "warnings": [],
                "method": "pharmnet_catalog:csv",
                "extra": {"product_count": len(rows)},
            }
        )
    return documents


# ---------------------------------------------------------------------------
# BDPM register dumps
# ---------------------------------------------------------------------------

_BDPM_REGISTER_MAP = (
    ("CIS_COMPO_BDPM", "composition"),
    ("CIS_ATC_BDPM", "atc"),
    ("CIS_GENER_BDPM", "generic_group"),
    ("CIS_CPD_BDPM", "presentation"),
    ("CIS_MITM_BDPM", "marketing"),
    ("CIS_BDPM", "cis"),
)

_BDPM_COLUMNS: dict[str, list[str]] = {
    "cis": [
        "cis",
        "name",
        "form",
        "route",
        "status",
        "procedure",
        "marketing_status",
        "marketing_date",
        "column_9",
        "column_10",
        "holder",
        "generic",
    ],
    # The collector's CIS_COMPO dump carries eight columns (form, substance
    # code and line number included), not the five-column public layout.
    "composition": [
        "cis",
        "form",
        "substance_code",
        "designation",
        "dosage",
        "reference",
        "nature",
        "number",
    ],
    "atc": ["cis", "atc_code", "atc_label"],
    "generic_group": ["group_id", "group_label", "cis", "generic_type", "generic_number"],
    "presentation": [
        "cis",
        "presentation",
        "status",
        "marketing_date",
        "price",
        "price_note",
        "reimbursement",
        "column_8",
    ],
    "marketing": ["cis", "holder", "column_3", "column_4"],
}


def _decode_register(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp1252", errors="replace")


def _register_kind(title: str, path: Path) -> str:
    haystack = f"{title} {path.name}".upper()
    for needle, kind in _BDPM_REGISTER_MAP:
        if needle in haystack:
            return kind
    return "other"


def bdpm_register_kind(title: str, path: Path) -> str:
    """Public wrapper so the orchestrator can order CIS before composition."""
    return _register_kind(title, path)


def parse_bdpm_register(
    path: Path,
    *,
    title: str,
    medicines: list[Medicine],
    cis_to_medicines: dict[str, set[str]] | None = None,
) -> list[dict[str, Any]]:
    text = _decode_register(path)
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    rows = list(reader)
    matcher = MedicineMatcher(medicines)
    if not rows:
        return []
    kind = _register_kind(title, path)
    header_row: list[str] | None = None
    first = [clean_inline(value) for value in rows[0]]
    if first and (first[0].upper().startswith("CIS") or "NOM" in first[0].upper()):
        header_row = first
        rows = rows[1:]
    if header_row:
        columns = [normalize_key(value).replace(" ", "_") or f"column_{i + 1}" for i, value in enumerate(header_row)]
    else:
        columns = list(_BDPM_COLUMNS.get(kind, [f"column_{i + 1}" for i in range(max(len(row) for row in rows))]))

    records: list[dict[str, Any]] = []
    inherited_map: dict[str, set[str]] = {
        key: set(value) for key, value in (cis_to_medicines or {}).items()
    }
    for index, row in enumerate(rows, start=1):
        if not any(value.strip() for value in row):
            continue
        record: dict[str, Any] = {
            "register": kind,
            "row_number": index,
            "authority_level": 3,
        }
        for position, value in enumerate(row):
            key = columns[position] if position < len(columns) else f"column_{position + 1}"
            record[key] = clean_inline(value)
        searchable = " ".join(
            str(record.get(key, ""))
            for key in ("name", "designation", "atc_label", "group_label", "presentation", "holder")
        )
        medicine_ids = matcher.match(searchable)
        record["medicine_ids"] = medicine_ids
        if record.get("cis") and medicine_ids:
            inherited_map.setdefault(record["cis"], set()).update(medicine_ids)
        records.append(record)

    # A composition row often names only the active substance; inherit the
    # medicine identity from the parent CIS row when that is available.
    for record in records:
        if record["register"] == "composition":
            inherited = inherited_map.get(record.get("cis", ""), set())
            if inherited:
                record["medicine_ids"] = sorted(set(record["medicine_ids"]) | inherited)
    # Only the 40 in-scope medicines are imported. Keeping the full BDPM
    # register would add ~50k rows with no retrieval value for this project.
    records = [record for record in records if record["medicine_ids"]]
    return records, inherited_map


def write_bdpm_outputs(
    records: list[dict[str, Any]],
    output_dir: Path,
    *,
    source_document_ids: list[str],
    collected_at: str | None,
) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts: list[dict[str, Any]] = []
    by_register: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        by_register.setdefault(record["register"], []).append(record)
    for register, subset in sorted(by_register.items()):
        csv_path = output_dir / f"bdpm_{register}.csv"
        columns = ["register", "medicine_ids", "row_number"]
        for record in subset:
            for key in record:
                if key not in columns and key != "medicine_ids":
                    columns.append(key)
        with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
            writer.writeheader()
            for record in subset:
                row = dict(record)
                row["medicine_ids"] = ";".join(record.get("medicine_ids") or [])
                writer.writerow(row)
        artifacts.append(
            {
                "artifact_id": f"BDPM_FR__REGISTER__{register.upper()}",
                "artifact_type": "structured_reference",
                "path": str(csv_path),
                "rows": len(subset),
                "source_id": "BDPM_FR",
                "authority_level": 3,
                "medicine_ids": sorted(
                    {med for record in subset for med in (record.get("medicine_ids") or [])}
                ),
                "collected_at": collected_at,
                "source_document_ids": source_document_ids,
                "description": f"BDPM register extract ({register}) filtered to the 40 target medicines.",
            }
        )
    return artifacts
