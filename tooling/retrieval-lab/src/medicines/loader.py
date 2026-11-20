"""Load the medicine list into data/input/medicines.csv.

Supported inputs
----------------
* a CSV list (columns: Numero, Categorie, Medicament, Code ATC)
* an XLSX list (columns: N, Classe, DCI (nom de la substance),
  Code ATC (indicatif), Present dans la nomenclature algerienne ?, Remarques)

Both are read with the standard library only (the xlsx is a zip of XML).
The medicine id keeps the source list number: MED031 ... MED040.
"""
import csv
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from config import MEDICINES_CSV, MEDICINE_COLUMNS
from src.storage.store import write_table
from src.utils.text import normalize

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\xa0", " ")).strip()


def _row_number(value: str, fallback: int) -> int:
    digits = re.sub(r"\D", "", value or "")
    return int(digits) if digits else fallback


def read_csv(path: Path) -> list:
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for index, raw in enumerate(reader, start=1):
            keys = {normalize(k or ""): k for k in raw}
            def pick(*names):
                for n in names:
                    key = keys.get(normalize(n))
                    if key and _clean(raw.get(key, "")):
                        return _clean(raw.get(key, ""))
                return ""
            number = _row_number(pick("numero", "n", "no", "num"), index)
            rows.append({
                "list_number": number,
                "class": pick("categorie", "classe", "class", "therapeutic class"),
                "inn": pick("medicament", "dci (nom de la substance)", "dci", "substance"),
                "atc": pick("code atc", "atc", "code atc (indicatif)"),
                "in_algerian_nomenclature": pick("present dans la nomenclature algerienne ?",
                                                 "present dans la nomenclature", "nomenclature"),
                "remarks": pick("remarques", "remarks", "notes"),
            })
    return rows


def read_xlsx(path: Path) -> list:
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        sroot = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in sroot.iter(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows, index = [], 0
    for row in root.iter(f"{NS}row"):
        values = {}
        for cell in row.iter(f"{NS}c"):
            ref = cell.get("r") or ""
            column = re.sub(r"\d", "", ref)
            ctype = cell.get("t")
            if ctype == "inlineStr":
                node = cell.find(f"{NS}is")
                text = "".join(t.text or "" for t in node.iter(f"{NS}t")) if node is not None else ""
            else:
                v = cell.find(f"{NS}v")
                text = v.text if v is not None else ""
                if ctype == "s" and text and text.isdigit():
                    text = shared[int(text)]
            values[column] = _clean(text)
        if not any(values.values()):
            continue
        index += 1
        raw_number = values.get("A", "")
        if not re.match(r"^\s*\d+", raw_number):
            continue  # header row (or a row without a list number)
        number = _row_number(raw_number, index)
        rows.append({
            "list_number": number,
            "class": values.get("B", ""),
            "inn": values.get("C", ""),
            "atc": values.get("D", ""),
            "in_algerian_nomenclature": values.get("E", ""),
            "remarks": values.get("F", ""),
        })
    return rows


def split_dci(inn: str) -> list:
    """Split a DCI expression into its searchable components.

    'paracetamol + codeine'                -> ['paracetamol + codeine', 'paracetamol', 'codeine']
    'cotrimoxazole (sulfamethoxazole + trimethoprim)'
                                           -> ['cotrimoxazole', 'sulfamethoxazole', 'trimethoprim']
    """
    raw = _clean(inn)
    if not raw:
        return []
    parts = []
    head = raw.split("(", 1)[0].strip()
    for chunk in head.split("+"):
        chunk = chunk.strip()
        if chunk:
            parts.append(chunk)
    if "(" in raw:
        inside = raw.split("(", 1)[1].rstrip(")")
        for chunk in inside.split("+"):
            chunk = chunk.strip()
            if chunk:
                parts.append(chunk)
    ordered = []
    for part in parts:
        if part not in ordered:
            ordered.append(part)
    return ordered


def inn_variant_terms(inn: str) -> list:
    """Search terms for one DCI expression (base first, then components/salts)."""
    from src.utils.text import inn_variants, normalize

    terms = []
    for part in split_dci(inn):
        for variant in inn_variants(part):
            if variant not in terms:
                terms.append(variant)
    return terms


def build_rows(raw_rows: list, source_file: str) -> list:
    rows = []
    for raw in raw_rows:
        inn = raw["inn"]
        if not inn:
            continue
        rows.append({
            "medicine_id": f"MED{raw['list_number']:03d}",
            "name": inn,
            "inn": inn,
            "inn_variants": "|".join(inn_variant_terms(inn)[:20]),
            "dci_components": "|".join(split_dci(inn)),
            "brand_name": "",
            "strength_form": "",
            "atc": raw["atc"],
            "class": raw["class"],
            "list_number": str(raw["list_number"]),
            "source_file": source_file,
            "in_algerian_nomenclature": raw["in_algerian_nomenclature"],
            "remarks": raw["remarks"],
        })
    return rows


def import_files(paths: list, destination: Path = MEDICINES_CSV,
                 merge: bool = True) -> list:
    """Import the medicine list.

    With ``merge`` (the default) the new rows are merged into the existing
    table: rows that already exist are refreshed from the file, and the data
    the team entered by hand (brand name, strength, nomenclature verdict,
    remarks) is preserved.  ``merge=False`` replaces the table.
    """
    import pandas as pd

    rows = []
    for path in paths:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(p)
        if p.suffix.lower() == ".xlsx":
            raw = read_xlsx(p)
        else:
            raw = read_csv(p)
        rows.extend(build_rows(raw, p.name))

    incoming = {}
    for row in rows:
        incoming[row["medicine_id"]] = row

    if merge and destination.exists():
        existing = pd.read_csv(destination, dtype=str, keep_default_na=False)
        existing = existing[[c for c in MEDICINE_COLUMNS if c in existing.columns]]
        for c in MEDICINE_COLUMNS:
            if c not in existing.columns:
                existing[c] = ""
        kept = []
        for _, old in existing.iterrows():
            mid = old["medicine_id"]
            new = incoming.get(mid)
            if new is None:
                kept.append(old.to_dict())
                continue
            merged = dict(new)
            # never lose what the team recorded by hand
            for field in ("brand_name", "strength_form", "in_algerian_nomenclature",
                          "remarks"):
                if not str(merged.get(field, "")).strip() and str(old.get(field, "")).strip():
                    merged[field] = old[field]
            kept.append(merged)
            incoming.pop(mid, None)
        rows = kept + list(incoming.values())

    seen, unique = set(), []
    for row in rows:
        if row["medicine_id"] in seen:
            continue
        seen.add(row["medicine_id"])
        unique.append(row)
    unique.sort(key=lambda r: r["medicine_id"])

    write_table(destination, pd.DataFrame(unique, columns=MEDICINE_COLUMNS))
    return unique
