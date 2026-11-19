"""Patient-notice pipeline: find, extract, match, store, report.

For every medication record of the corpus:

1. look for a patient notice on the Algerian manufacturer sites (priority 1)
   and inside the documents already collected (ANSM product pages, US labels);
2. keep only what is genuinely a *patient* notice (never an RCP/SmPC);
3. match it to the medication: substance, brand, strength, form, manufacturer,
   country -> EXACT_MATCH / PARTIAL_MATCH / COMBINATION_MATCH / UNVERIFIED;
4. store the notice with its full metadata and link it to the medication;
5. report the medications for which no notice could be found.

The existing RCP records are never modified.
"""
import hashlib
import re
import time
from pathlib import Path

import pandas as pd

from config import (
    DOCUMENTS_CSV, DOCUMENT_COLUMNS, MEDICINES_CSV, MEDICINE_COLUMNS, META_DIR,
    NOTICE_REPORT_CSV, NOTICE_LINK_PATTERNS, ROOT,
)
from src.compliance.registry import host_of
from src.notice.discover import discover_notices
from src.notice.extractors import extract_notice, is_patient_notice
from src.notice.matcher import (
    COMBINATION_MATCH, EXACT_MATCH, PARTIAL_MATCH, UNVERIFIED,
)
from src.storage.naming import notice_path
from src.storage.store import DocumentStore, read_table, write_table
from src.utils.encoding import read_text_auto
from src.utils.hashing import sha256_file
from src.utils.text import normalize

NOTICE_COLUMNS = [
    "document_id", "medication_id", "document_type", "original_filename",
    "source_name", "source_id", "source_url", "direct_document_url",
    "manufacturer", "country", "language", "strength", "pharmaceutical_form",
    "revision_or_publication_date", "collection_date", "registration_number",
    "collection_method", "verification_status", "local_file_path",
    "original_file_path", "medicine_name", "brand_name", "dci",
    "notice_sha256", "match_evidence",
]

SOURCE_NAMES = {
    "BDPM_FR": "Base de donnees publique des medicaments (ANSM, France)",
    "DAILYMED": "DailyMed (U.S. National Library of Medicine)",
    "ANPP_RCP": "ANPP - RCP portal (Algeria)",
    "BEKER": "Laboratoires BEKER (Algerian manufacturer)",
}

COUNTRY_NAMES = {"DZ": "Algeria", "FR": "France", "US": "United States", "EU": "European Union"}


def _brands_for(medicine_id: str, name_map) -> list:
    if name_map is None or name_map.df.empty:
        return []
    sub = name_map.df[(name_map.df["medicine_id"] == medicine_id)
                      & (name_map.df["brand_type"].isin(
                          ("algerian_official", "algerian_secondary", "manual")))]
    return sorted({b for b in sub["brand_name"] if b})


def _write_notice_file(medicine, source_id: str, document_id: str, title: str,
                       text: str, source_url: str, original_file: str) -> Path:
    path = notice_path(medicine, source_id, document_id, suffix=".txt")
    path.parent.mkdir(parents=True, exist_ok=True)
    header = (f"PATIENT NOTICE - {title}\n"
              f"source: {source_url}\n"
              f"extracted from: {original_file}\n"
              f"collected: {time.strftime('%Y-%m-%dT%H:%M:%S')}\n"
              f"{'-' * 70}\n")
    path.write_text(header + text, encoding="utf-8")
    return path


ACCESSIBILITY_NOISE = re.compile(
    r"Redirection vers le haut de page", re.IGNORECASE)


def _clean_notice_text(text: str) -> str:
    """Remove the accessibility boilerplate the pages repeat."""
    cleaned = ACCESSIBILITY_NOISE.sub(" ", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def _expected_identity(mid: str, med) -> list:
    """The products the official nomenclature records for this medicine.

    A medicine is sold under several brands, strengths and forms; a notice is
    an exact match when it matches one of them.
    """
    products = []
    path = META_DIR / "nomenclature_products.csv"
    if path.exists():
        table = read_table(path, ["medicine_id", "brand_name", "form", "dosage",
                                 "status", "dci_code", "registration_number"])
        sub = table[table["medicine_id"] == mid]
        registered = sub[sub["status"] == "enregistre"]
        if len(registered):
            sub = registered
        else:
            # not registered any more: the withdrawn products still carry the
            # commercial name, strength and form of the medicine
            sub = sub
        for _, row in sub.iterrows():
            products.append({
                "brand_name": row["brand_name"],
                "strength": row["dosage"],
                "form": row["form"],
                "status": row["status"],
                "registration_number": row["registration_number"],
                "dci_code": row["dci_code"],
            })
    if not products:
        products.append({"brand_name": med.get("brand_name", ""),
                         "strength": med.get("strength_form", ""),
                         "form": "", "status": "", "registration_number": "",
                         "dci_code": ""})
    return products


LINK_COLUMNS = ["notice_document_id", "notice_status", "notice_source",
                "notice_collected_at"]


def _link_to_medicines(frame: pd.DataFrame, meds: pd.DataFrame) -> None:
    """Write the notice reference into the medication record."""
    if not len(frame):
        return
    table = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    for column in LINK_COLUMNS:
        if column not in table.columns:
            table[column] = ""
    for _, med in meds.iterrows():
        mid = med["medicine_id"]
        sub = frame[frame["medication_id"] == mid] if len(frame) else frame
        if not len(sub):
            continue
        # the best notice wins: an exact match before a partial one
        order = [EXACT_MATCH, PARTIAL_MATCH, COMBINATION_MATCH, UNVERIFIED]
        best = None
        for status in order:
            candidate = sub[sub["verification_status"] == status]
            if len(candidate):
                best = candidate.iloc[0]
                break
        index = table.index[table["medicine_id"] == mid]
        if not len(index) or best is None:
            continue
        table.at[index[0], "notice_document_id"] = best["document_id"]
        table.at[index[0], "notice_status"] = best["verification_status"]
        table.at[index[0], "notice_source"] = best["source_id"]
        table.at[index[0], "notice_collected_at"] = best["collection_date"]
    write_table(MEDICINES_CSV, table)


def run(medicines=None, session=None, limiter=None, store=None,
        refresh: bool = False) -> dict:
    """Collect the patient notices of every medication.  Returns the report."""
    from src.collectors import http as httpc
    from src.names.resolver import NameMap
    from src.utils.rate_limit import RateLimiter

    if session is None:
        session = httpc.build_session()
    if limiter is None:
        limiter = RateLimiter()
    if store is None:
        store = DocumentStore()

    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    if medicines:
        wanted = set(medicines)
        meds = meds[meds["medicine_id"].isin(wanted)]
    name_map = NameMap()
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    collected = docs[(docs["collection_status"] == "collected")
                     & (docs["relevance_status"] == "verified")]

    rows = []
    seen_hashes = {}
    duplicates_avoided = 0
    attempts = []

    for _, med in meds.iterrows():
        mid = med["medicine_id"]
        medicine = med.to_dict()
        brands = _brands_for(mid, name_map)
        expected = _expected_identity(mid, med)

        # 1. the notices carried by the documents already collected
        for _, doc in collected[collected["medicine_id"] == mid].iterrows():
            path = ROOT / doc["file_path"]
            if not path.exists():
                continue
            if doc["source_id"] == "SANTE_MSP":
                continue        # the nomenclature is a register, not a notice
            try:
                notice = extract_notice(path)
            except Exception:
                notice = {}
            if not notice:
                continue
            notice["text"] = _clean_notice_text(notice["text"])
            digest = sha256_file(path)
            notice_digest = hashlib.sha256(notice["text"].encode("utf-8")).hexdigest()
            if notice_digest in seen_hashes:
                duplicates_avoided += 1
                continue
            seen_hashes[notice_digest] = doc["document_id"]

            verdict = classify_notice(notice, medicine, expected)
            record = _record(mid, med, doc, notice, verdict, digest,
                             method="extracted-from-collected-document")
            # the notice is kept as a text file next to the original document
            local = _write_notice_file(med, doc["source_id"], record["document_id"],
                                       record["brand_name"] or notice.get("title", ""),
                                       notice["text"], doc.get("source_url", ""),
                                       doc["file_path"])
            record["local_file_path"] = str(local.relative_to(ROOT).as_posix())
            rows.append(record)
            if verdict["status"] == EXACT_MATCH:
                break      # the exact notice is enough for this medicine

        # 2. the Algerian manufacturers
        for candidate in discover_notices(medicine, brands, session, limiter):
            attempts.append({"medicine_id": mid, **candidate})
            if candidate["kind"] != "document":
                continue
            rows.append(_download_notice(mid, med, candidate, expected,
                                         session, limiter))

    frame = pd.DataFrame(rows, columns=NOTICE_COLUMNS)
    write_table(META_DIR / "notices.csv", frame)

    # link the notice to its medication record (the RCP records stay untouched)
    _link_to_medicines(frame, meds)

    report = build_report(frame, meds, attempts, duplicates_avoided)

    # the attempts are evidence: which Algerian pages were checked and what
    # they publish (or do not publish)
    if attempts:
        write_table(META_DIR / "notice_attempts.csv", pd.DataFrame(attempts))
    report["attempt_summary"] = _attempt_summary(attempts)
    write_table(NOTICE_REPORT_CSV, pd.DataFrame(report["per_medicine"]))
    return report


def _attempt_summary(attempts: list) -> dict:
    summary = {}
    for attempt in attempts:
        key = f"{attempt.get('source_id', '')}:{attempt.get('kind', '')}"
        summary[key] = summary.get(key, 0) + 1
    return summary


def classify_notice(notice: dict, medicine: dict, expected: dict) -> dict:
    from src.notice.matcher import classify

    return classify(notice.get("text", ""), medicine, expected)


def _record(mid: str, med, doc, notice: dict, verdict: dict, digest: str,
            method: str) -> dict:
    document_id = f"{doc['document_id']}__NOTICE"
    return {
        "document_id": document_id,
        "medication_id": mid,
        "document_type": "NOTICE",
        "original_filename": Path(doc["file_path"]).name,
        "source_name": SOURCE_NAMES.get(doc["source_id"], doc["source_id"]),
        "source_id": doc["source_id"],
        "source_url": doc.get("source_url", ""),
        "direct_document_url": doc.get("final_url", ""),
        "manufacturer": notice.get("holder", "") or doc.get("holder", ""),
        "country": COUNTRY_NAMES.get(doc.get("country", ""), doc.get("country", "")),
        "language": notice.get("language", ""),
        "strength": (notice.get("strength", "")
                     or verdict["evidence"].get("product_strength", "")),
        "pharmaceutical_form": verdict["evidence"].get("product_form", ""),
        "revision_or_publication_date": notice.get("revision_date", ""),
        "collection_date": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "registration_number": verdict["evidence"].get("matched_product", {}).get(
            "registration_number", ""),
        "collection_method": method,
        "verification_status": verdict["status"],
        "local_file_path": "",
        "original_file_path": doc["file_path"],
        "medicine_name": med.get("name", ""),
        "brand_name": verdict["evidence"].get("product_name", ""),
        "dci": med.get("inn", ""),
        "notice_sha256": digest,
        "match_evidence": verdict["evidence"].get("reason", ""),
    }


def _download_notice(mid: str, med, candidate: dict, expected: dict,
                     session, limiter) -> dict:
    """Download a notice published by a manufacturer and store it."""
    from src.notice.matcher import classify
    from src.utils.encoding import read_text_auto

    url = candidate["url"]
    if limiter:
        limiter.wait(host_of(url))
    try:
        response = session.get(url, timeout=90)
    except Exception as exc:
        return {"document_id": "", "medication_id": mid, "document_type": "NOTICE",
                "verification_status": UNVERIFIED, "match_evidence": f"download failed: {exc}"}
    if response.status_code != 200:
        return {"document_id": "", "medication_id": mid, "document_type": "NOTICE",
                "verification_status": UNVERIFIED,
                "match_evidence": f"HTTP {response.status_code}"}

    suffix = Path(url).suffix.lower() or ".bin"
    document_id = f"{mid}__SRC_{candidate['source_id']}__NOTICE_001"
    target = notice_path(med, candidate["source_id"], document_id, suffix)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(response.content)

    text = ""
    if suffix in (".html", ".htm"):
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(read_text_auto(target), "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        text = " ".join(soup.get_text(" ", strip=True).split())
    elif suffix == ".pdf":
        import pymupdf
        with pymupdf.open(target) as doc:
            text = "\n".join(page.get_text() for page in doc)
    else:
        text = read_text_auto(target)

    # the downloaded file must really be a patient notice
    if not is_patient_notice(text):
        target.unlink(missing_ok=True)
        return {"document_id": "", "medication_id": mid, "document_type": "NOTICE",
                "verification_status": UNVERIFIED,
                "match_evidence": "the published document is not a patient notice"}

    verdict = classify(text, med.to_dict(), expected)
    return {
        "document_id": document_id,
        "medication_id": mid,
        "document_type": "NOTICE",
        "original_filename": target.name,
        "source_name": candidate.get("source_name", candidate["source_id"]),
        "source_id": candidate["source_id"],
        "source_url": url,
        "direct_document_url": url,
        "manufacturer": "",
        "country": "Algeria",
        "language": "fr",
        "strength": verdict["evidence"].get("product_strength", ""),
        "pharmaceutical_form": verdict["evidence"].get("product_form", ""),
        "revision_or_publication_date": "",
        "collection_date": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "registration_number": "",
        "collection_method": "requests",
        "verification_status": verdict["status"],
        "local_file_path": str(target.relative_to(ROOT).as_posix()),
        "original_file_path": str(target.relative_to(ROOT).as_posix()),
        "medicine_name": med.get("name", ""),
        "brand_name": verdict["evidence"].get("product_name", ""),
        "dci": med.get("inn", ""),
        "notice_sha256": sha256_file(target),
        "match_evidence": verdict["evidence"].get("reason", ""),
    }


def build_report(frame: pd.DataFrame, meds: pd.DataFrame, attempts: list,
                 duplicates_avoided: int) -> dict:
    """The report the brief asks for."""
    per_medicine = []
    for _, med in meds.iterrows():
        mid = med["medicine_id"]
        sub = frame[frame["medication_id"] == mid] if len(frame) else frame
        statuses = dict(sub["verification_status"].value_counts()) if len(sub) else {}
        linked = len(sub)
        foreign = int((sub["country"] != "Algeria").sum()) if len(sub) else 0
        per_medicine.append({
            "medicine_id": mid,
            "medication_id": mid,
            "medicine_name": med.get("name", ""),
            "dci": med.get("inn", ""),
            "notices_found": linked,
            "exact": statuses.get(EXACT_MATCH, 0),
            "partial": statuses.get(PARTIAL_MATCH, 0),
            "combination": statuses.get(COMBINATION_MATCH, 0),
            "unverified": statuses.get(UNVERIFIED, 0),
            "foreign_supplementary": foreign,
            "algerian": linked - foreign,
            "notice_status": _medicine_status(statuses, linked),
            "needs_review": "yes" if statuses.get(UNVERIFIED, 0) else "no",
        })
    coverage = pd.DataFrame(per_medicine)
    summary = {
        "medications_investigated": len(meds),
        "notices_found": int(len(frame)),
        "notices_linked": int(len(frame)),
        "exact_match": int((frame["verification_status"] == EXACT_MATCH).sum()) if len(frame) else 0,
        "partial_match": int((frame["verification_status"] == PARTIAL_MATCH).sum()) if len(frame) else 0,
        "combination_match": int((frame["verification_status"] == COMBINATION_MATCH).sum()) if len(frame) else 0,
        "unverified": int((frame["verification_status"] == UNVERIFIED).sum()) if len(frame) else 0,
        "foreign_supplementary": int((frame["country"] != "Algeria").sum()) if len(frame) else 0,
        "algerian_notices": int((frame["country"] == "Algeria").sum()) if len(frame) else 0,
        "duplicates_avoided": duplicates_avoided,
        "algerian_source_attempts": len(attempts),
        "no_notice_found": int((coverage["notice_status"] == "NOT_FOUND").sum()) if len(coverage) else 0,
        "needs_manual_review": int((coverage["needs_review"] == "yes").sum()) if len(coverage) else 0,
    }
    return {"summary": summary, "per_medicine": per_medicine,
            "attempts": attempts, "coverage": coverage}


def _medicine_status(statuses: dict, linked: int) -> str:
    if linked == 0:
        return "NOT_FOUND"
    if statuses.get(EXACT_MATCH):
        return "EXACT_MATCH"
    if statuses.get(PARTIAL_MATCH):
        return "PARTIAL_MATCH"
    if statuses.get(COMBINATION_MATCH):
        return "COMBINATION_MATCH"
    return "UNVERIFIED"
