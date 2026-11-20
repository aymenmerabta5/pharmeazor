"""Name resolution: link every active ingredient (DCI) to its brand names.

The project starts from the professor's list of 40 medicines.  This module
builds the bridge between a DCI and the commercial names it is sold under,
which is what the official portals are indexed by, and it is the input of the
name-normalisation component (brief, feature 3).

Brand evidence, in priority order:

  1. algerian_official - the ANPP RCPs already collected (the holder states
     the commercial name and the DCI itself)
  2. algerian_secondary - the Pharm'Net catalogue of the Algerian nomenclature
  3. manual           - what the team records from the official nomenclature
  4. foreign_official - the French open data (CIS_bdpm / CIS_COMPO_bdpm)
  5. foreign_us       - the DailyMed label titles

Every row keeps the source of the evidence and the date it was collected.
"""
import json
import re
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd

from config import (
    CACHE_DIR, DOCUMENTS_CSV, MEDICINES_CSV, META_DIR, DOCUMENT_COLUMNS,
    MEDICINE_COLUMNS,
)
from src.storage.store import read_table, write_table
from src.utils.text import dci_required_components, normalize

NAME_MAP_CSV = META_DIR / "name_map.csv"
NAME_MAP_COLUMNS = [
    "medicine_id", "dci", "dci_as_registered", "atc", "class", "brand_name",
    "brand_type", "strength", "form", "holder", "dci_code", "num_enregistrement",
    "source_id", "source_url", "document_id", "collected_at", "confidence",
    "ambiguous",
]

CACHE = CACHE_DIR / "names"
RCP_HEADERS = CACHE / "rcp_headers.json"

ALGERIAN_TYPES = ("algerian_official", "algerian_secondary", "manual")


# --------------------------------------------------------------- helpers
def _read_cache(path: Path, max_age_days: int = 7):
    if path.exists() and (time.time() - path.stat().st_mtime) < max_age_days * 86400:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def _write_cache(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def _clean_brand(name: str) -> str:
    """'DOLIPRANE 2.4 POUR CENT SANS SUCRE' -> 'DOLIPRANE'.

    The catalogue sometimes stores the presentation inside the commercial
    name; the portal is indexed by the brand itself.
    """
    from src.medicines.rcp import STRENGTH_RE

    value = (name or "").strip()
    cut = len(value)
    match = STRENGTH_RE.search(value)
    if match:
        cut = min(cut, match.start())
    # a dose inside the name: "AMOCLAN 8:1", "DOLIPRANE 2.4 ..."
    dose = re.search(r"\s+\d", value)
    if dose:
        cut = min(cut, dose.start())
    value = value[:cut].strip(" ,;.:-")
    return value or (name or "").strip()


def _is_brand(value: str) -> bool:
    """A commercial name is a short label, not a description."""
    if not value or len(value) > 45 or len(value.split()) > 3:
        return False
    return value.count("/") <= 1


def _matches(dci_text: str, components: list) -> bool:
    """Does a source-side DCI string cover every substance of the medicine?"""
    low = normalize(dci_text)
    if not low:
        return False
    for component in components:
        if not component:
            continue
        if component not in low:
            return False
    return True


# ------------------------------------------------------- evidence sources
def _nomenclature_evidence() -> list:
    """Algerian commercial names from the official national nomenclature.

    The nomenclature file is downloaded by hand (the brief forbids
    automating it), so the evidence is read from the table written by
    `python main.py import-nomenclature`.
    """
    path = META_DIR / "nomenclature_products.csv"
    if not path.exists():
        return []
    rows = []
    for record in read_table(path, [
            "medicine_id", "dci", "dci_as_registered", "brand_name", "dci_code",
            "registration_number", "form", "dosage", "packaging", "list", "holder",
            "country", "registration_date_initial", "registration_date_final",
            "type", "status", "stability", "source_file", "collected_at"]).to_dict("records"):
        brand = (record.get("brand_name") or "").strip()
        if not brand or not _is_brand(brand):
            continue
        rows.append({
            "medicine_id": record["medicine_id"],
            "brand_name": brand,
            "brand_type": "algerian_official",
            "dci_as_registered": record.get("dci_as_registered", ""),
            "strength": record.get("dosage", ""),
            "form": record.get("form", ""),
            "holder": record.get("holder", ""),
            "dci_code": record.get("dci_code", ""),
            "num_enregistrement": record.get("registration_number", ""),
            "source_id": "SANTE_MSP",
            "source_url": record.get("source_file", ""),
            "document_id": record.get("dci_code", ""),
            "collected_at": record.get("collected_at", ""),
            "confidence": "official",
            "status": record.get("status", ""),
        })
    return rows


def _rcp_evidence(documents: pd.DataFrame) -> list:
    """Commercial names stated in the collected official RCPs."""
    from src.medicines.rcp import parse_rcp_header
    from src.storage.store import resolve_path
    from src.validation.validate import extract_text

    headers = _read_cache(RCP_HEADERS) or {}
    rows = []
    for _, doc in documents.iterrows():
        if doc["source_id"] != "ANPP_RCP" or doc["collection_status"] != "collected":
            continue
        key = doc["document_id"]
        header = headers.get(key)
        if header is None:
            path = resolve_path(doc["file_path"])
            if not path.exists():
                continue
            header = parse_rcp_header(extract_text(path))
            headers[key] = header
        if not header.get("commercial_name"):
            continue
        rows.append({
            "medicine_id": doc["medicine_id"],
            "brand_name": header["commercial_name"],
            "brand_type": "algerian_official",
            "dci_as_registered": header.get("declared_dci", ""),
            "strength": header.get("strength", ""),
            "form": header.get("form", ""),
            "holder": doc.get("holder", ""),
            "dci_code": "",
            "num_enregistrement": "",
            "source_id": "ANPP_RCP",
            "source_url": doc.get("source_url", ""),
            "document_id": doc.get("document_id", ""),
            "collected_at": doc.get("collected_at", ""),
            "confidence": "official",
        })
    _write_cache(RCP_HEADERS, headers)
    return rows


def _catalog_evidence(medicines: pd.DataFrame, session, limiter) -> list:
    """Algerian brands from the Pharm'Net catalogue."""
    from src.discovery import pharmnet_catalog

    rows, seen = [], set()
    for _, med in medicines.iterrows():
        components = [normalize(c) for c in dci_required_components(med.to_dict())]
        try:
            products = pharmnet_catalog.search_products(med["inn"], session, limiter)
        except Exception:
            continue
        for product in products:
            brand = _clean_brand(product.get("nom_commercial") or "")
            dci = (product.get("dci") or "").strip()
            if not brand or not _is_brand(brand):
                continue
            if not brand or not _matches(dci, components):
                continue
            key = (med["medicine_id"], brand, dci, product.get("dosage", ""))
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "medicine_id": med["medicine_id"],
                "brand_name": brand,
                "brand_type": "algerian_secondary",
                "dci_as_registered": dci,
                "strength": product.get("dosage", ""),
                "form": product.get("forme", ""),
                "holder": product.get("laboratoire", ""),
                "dci_code": product.get("dci_code", ""),
                "num_enregistrement": "",
                "source_id": "PHARMNET_CATALOG",
                "source_url": f"https://pharmnet-dz.com/?q={brand}",
                "document_id": product.get("id", ""),
                "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "confidence": "register",
            })
    return rows


def _manual_evidence(medicines: pd.DataFrame) -> list:
    """Brands the team recorded from the official nomenclature."""
    rows = []
    for _, med in medicines.iterrows():
        brand = (med.get("brand_name") or "").strip()
        if not brand:
            continue
        rows.append({
            "medicine_id": med["medicine_id"],
            "brand_name": brand,
            "brand_type": "manual",
            "dci_as_registered": "",
            "strength": med.get("strength_form", ""),
            "form": "",
            "holder": "",
            "dci_code": "",
            "num_enregistrement": "",
            "source_id": "MANUAL_NOMENCLATURE",
            "source_url": "https://sante.gov.dz/pharmacie-et-equipements-de-sante/",
            "document_id": "",
            "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "confidence": "manual",
        })
    return rows


def _bdpm_evidence(medicines: pd.DataFrame, session, limiter) -> list:
    """Foreign brands from the French register.

    The *live* product search of the site is used (the static extract it also
    publishes is a 2022 snapshot); the flat files remain as a fallback.
    """
    from src.discovery import bdpm

    rows, seen = [], set()

    def add(med_id, brand, url, form, holder):
        key = (med_id, brand)
        if key in seen or not brand:
            return
        seen.add(key)
        rows.append({
            "medicine_id": med_id,
            "brand_name": brand,
            "brand_type": "foreign_official",
            "dci_as_registered": "",
            "strength": "",
            "form": form,
            "holder": holder,
            "dci_code": "",
            "num_enregistrement": "",
            "source_id": "BDPM_FR",
            "source_url": url,
            "document_id": url.split("/")[2] if len(url.split("/")) > 2 else "",
            "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "confidence": "register",
        })

    for _, med in medicines.iterrows():
        components = [normalize(c) for c in dci_required_components(med.to_dict())]
        products = []
        try:
            for term in [med.get("inn", "")] + medicine_terms(med)[:1]:
                products.extend(bdpm.search_products(term, session, limiter))
        except Exception:
            products = []
        count = 0
        for item in products:
            name = (item.get("value") or "").strip()
            url = item.get("url") or ""
            if not name or not url:
                continue
            low = normalize(name)
            if components and not all(
                    any(contains_token(low, c) for c in [comp]) or comp in low
                    for comp in components):
                continue
            brand = re.split(r"\s+\d", name)[0].strip(" ,;:")
            if not brand or len(brand.split()) > 4 or len(brand) > 45:
                continue
            add(med["medicine_id"], brand, f"{bdpm.BASE}{url}", "", "")
            count += 1
            if count >= 40:
                break

    if rows:
        return rows

    # fallback: the static register extract
    products, compositions = {}, defaultdict(list)
    try:
        for name in bdpm.FILES:
            path = bdpm._download(session, limiter, name)
            data = bdpm._rows(path)
            if name == "CIS_bdpm.txt":
                for row in data:
                    if len(row) > 2:
                        products[row[0]] = row
            else:
                for row in data:
                    if len(row) > 4:
                        compositions[row[0]].append((row[3], row[4]))
    except Exception:
        return []

    brand_substances = defaultdict(set)
    brand_meta = {}
    for pid, subs in compositions.items():
        if pid not in products:
            continue
        row = products[pid]
        brand = re.split(r"\s+\d", row[1])[0].strip()
        for substance, _dose in subs:
            brand_substances[brand].add(normalize(substance))
        brand_meta.setdefault(brand, (row[2], row[3], row[9] if len(row) > 9 else ""))

    for _, med in medicines.iterrows():
        components = [normalize(c) for c in dci_required_components(med.to_dict())]
        for brand, substances in brand_substances.items():
            if not all(any(c in s for s in substances) for c in components):
                continue
            form, route, holder = brand_meta.get(brand, ("", "", ""))
            add(med["medicine_id"], brand, bdpm.FILES["CIS_bdpm.txt"], form, holder)
    return rows


def _dailymed_evidence(documents: pd.DataFrame) -> list:
    """Foreign brands seen in the DailyMed label titles."""
    rows, seen = [], set()
    for _, doc in documents.iterrows():
        if doc["source_id"] != "DAILYMED" or doc["collection_status"] != "collected":
            continue
        title = (doc.get("title") or "").strip()
        brand = title.split("[")[0].strip() if title else ""
        if not brand or len(brand) > 60:
            continue
        key = (doc["medicine_id"], brand)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "medicine_id": doc["medicine_id"],
            "brand_name": brand,
            "brand_type": "foreign_us",
            "dci_as_registered": "",
            "strength": "",
            "form": "",
            "holder": "",
            "dci_code": "",
            "num_enregistrement": "",
            "source_id": "DAILYMED",
            "source_url": doc.get("source_url", ""),
            "document_id": doc.get("document_id", ""),
            "collected_at": doc.get("collected_at", ""),
            "confidence": "register",
        })
    return rows


# ------------------------------------------------------------------ build
def build(destination: Path = NAME_MAP_CSV, session=None, limiter=None) -> pd.DataFrame:
    """(Re)build the name map.  Returns the map as a DataFrame."""
    from src.collectors import http as httpc

    medicines = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    documents = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    if session is None:
        session = httpc.build_session()

    evidence = []
    evidence += _nomenclature_evidence()
    evidence += _rcp_evidence(documents)
    evidence += _catalog_evidence(medicines, session, limiter)
    evidence += _manual_evidence(medicines)
    evidence += _bdpm_evidence(medicines, session, limiter)
    evidence += _dailymed_evidence(documents)

    # a brand that covers several of our DCIs is flagged as ambiguous
    brand_to_dci = defaultdict(set)
    for row in evidence:
        brand_to_dci[normalize(row["brand_name"])].add(row["medicine_id"])

    index = {row["medicine_id"]: row for _, row in medicines.iterrows()}
    rows = []
    for item in evidence:
        med = index.get(item["medicine_id"])
        if med is None:
            continue
        row = {
            "medicine_id": item["medicine_id"],
            "dci": med.get("inn", ""),
            "atc": med.get("atc", ""),
            "class": med.get("class", ""),
        }
        row.update({k: item.get(k, "") for k in NAME_MAP_COLUMNS
                    if k not in row and k not in ("ambiguous",)})
        row["ambiguous"] = "yes" if len(brand_to_dci[normalize(item["brand_name"])]) > 1 else "no"
        rows.append(row)

    frame = pd.DataFrame(rows, columns=NAME_MAP_COLUMNS)
    if not frame.empty:
        frame = frame.sort_values(["medicine_id", "brand_type", "brand_name"])
    write_table(destination, frame)
    return frame


class NameMap:
    """Read-only access to the name map (used by the discovery adapters)."""

    def __init__(self, path: Path = NAME_MAP_CSV):
        self.df = read_table(path, NAME_MAP_COLUMNS) if Path(path).exists() \
            else pd.DataFrame(columns=NAME_MAP_COLUMNS)

    def algerian_brands(self, medicine_id: str, limit: int = 6) -> list:
        """Algerian commercial names, best candidates first.

        A brand of a *combination* product ("APAP IBUPROFENE BEKER" contains
        paracetamol) is a weaker key than the brand of the substance itself,
        so single-substance brands come first.
        """
        if self.df.empty:
            return []
        sub = self.df[(self.df["medicine_id"] == medicine_id)
                      & (self.df["brand_type"].isin(ALGERIAN_TYPES))]
        order = {"algerian_official": 0, "manual": 1, "algerian_secondary": 2}
        sub = sub.assign(_order=sub["brand_type"].map(order).fillna(9))
        sub = sub.assign(_combo=sub["dci_as_registered"].map(
            lambda value: 1 if any(sep in str(value) for sep in ("/", "+")) else 0))
        sub = sub.sort_values(["_order", "_combo", "brand_name"])
        out = []
        for brand in sub["brand_name"]:
            if brand and brand not in out:
                out.append(brand)
            if len(out) >= limit:
                break
        return out

    def algerian_dci(self, medicine_id: str, limit: int = 4) -> list:
        """The DCI spellings used in the Algerian registers (with salt)."""
        if self.df.empty:
            return []
        out = []
        for row in self.df[(self.df["medicine_id"] == medicine_id)
                           & (self.df["brand_type"] == "algerian_secondary")].itertuples():
            value = (getattr(row, "dci_as_registered", "") or "").strip()
            if not value or len(value.split()) > 6 or len(value) > 60:
                continue
            if value not in out:
                out.append(value)
            if len(out) >= limit:
                break
        return out

    def brands_for(self, medicine_id: str) -> list:
        if self.df.empty:
            return []
        sub = self.df[self.df["medicine_id"] == medicine_id]
        return sorted({b for b in sub["brand_name"] if b})
