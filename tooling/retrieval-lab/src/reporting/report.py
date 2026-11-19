"""Coverage + audit reporting (project-level collection targets).

The coverage rule of the brief is "at least 3 sources per medicine, including
one official source".  Only *verified* documents count towards coverage; a
document that still needs human review is reported separately so the number
cannot be inflated by files that were never validated.
"""
from pathlib import Path

import pandas as pd

from config import (
    BRAND_GAP_CSV, COVERAGE_REPORT_CSV, DOCUMENTS_CSV, MEDICINES_CSV,
    NEEDS_ATTENTION_CSV, PENDING_REVIEW_CSV, SOURCE_HEALTH_CSV,
    SOURCES_CSV, DOCUMENT_COLUMNS, SOURCE_COLUMNS, MEDICINE_COLUMNS,
    AUTHORITY_NAMES, AUTHORITY_OFFICIAL_ALGERIAN, AUTHORITY_OFFICIAL_NOMENCLATURE,
)
from src.storage.store import read_table, write_table

PENDING_STATUSES = [
    "MANUAL", "REVIEW_REQUIRED", "EXCLUDED", "failed", "no_results",
    "no_document_links", "blocked_by_validation", "discovery_failed",
]

ALGERIAN_BRAND_TYPES = ("algerian_official", "algerian_secondary", "manual")


def _name_map():
    """The DCI -> brand name map (empty when it has not been built yet)."""
    from src.names.resolver import NAME_MAP_CSV, NAME_MAP_COLUMNS

    if not Path(NAME_MAP_CSV).exists():
        return pd.DataFrame(columns=NAME_MAP_COLUMNS)
    return read_table(NAME_MAP_CSV, NAME_MAP_COLUMNS)


def _brands_for(name_map, medicine_id: str) -> list:
    """The brands of a medicine, best evidence first.

    A brand of a combination product ("APAP IBUPROFENE BEKER" contains
    paracetamol) comes after the brand of the substance itself.
    """
    if name_map.empty:
        return []
    sub = name_map[name_map["medicine_id"] == medicine_id]
    order = {"algerian_official": 0, "manual": 1, "algerian_secondary": 2,
             "foreign_official": 3, "foreign_us": 4}
    sub = sub.assign(_order=sub["brand_type"].map(order).fillna(9))
    combo = "dci_as_registered" in sub.columns
    if combo:
        sub = sub.assign(_combo=sub["dci_as_registered"].map(
            lambda value: 1 if any(sep in str(value) for sep in ("/", "+")) else 0))
        sub = sub.sort_values(["_order", "_combo", "brand_name"])
    else:
        sub = sub.sort_values(["_order", "brand_name"])
    out = []
    for row in sub.to_dict("records"):
        if row["brand_name"] and row["brand_name"] not in [o["brand_name"] for o in out]:
            out.append(row)
    return out


def _authority_level(value: str) -> str:
    """'1' / '1 - Highest' / 'official Algerian' -> '1' (tolerant of labels)."""
    text = (value or "").strip()
    if not text:
        return ""
    if text[0].isdigit():
        return text[0]
    for level in AUTHORITY_NAMES:
        if text.lower() == AUTHORITY_NAMES[level].lower():
            return level
    return text


def build_coverage_report(min_sources: int = 3) -> "object":
    import pandas as pd

    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    srcs = read_table(SOURCES_CSV, SOURCE_COLUMNS)
    name_map = _name_map()

    src_meta = {}
    for _, row in srcs.iterrows():
        src_meta[row["source_id"]] = {
            "authority_level": _authority_level(row["authority_level"]),
            "source_name": row["source_name"],
            "source_type": row["source_type"],
            "review_status": row["review_status"],
        }

    rows = []
    for _, med in meds.iterrows():
        mid = med["medicine_id"]
        sub = docs[docs["medicine_id"] == mid]
        verified = sub[(sub["collection_status"] == "collected")
                       & (sub["relevance_status"] == "verified")]
        review = sub[(sub["collection_status"] == "collected")
                     & (sub["relevance_status"].isin(["needs_review", "not_checked"]))]
        rejected = sub[sub["relevance_status"] == "rejected"]

        verified_sources = sorted(set(verified["source_id"]))
        # the brief lists two official Algerian levels: the ANPP SmPCs (1) and
        # the official ministry nomenclature (2).  Either satisfies "at least
        # one official source".
        official = sorted({
            s for s in verified_sources
            if src_meta.get(s, {}).get("authority_level")
            in (AUTHORITY_OFFICIAL_ALGERIAN, AUTHORITY_OFFICIAL_NOMENCLATURE)
        })

        brands = _brands_for(name_map, mid)
        algerian = [b for b in brands if b["brand_type"] in ALGERIAN_BRAND_TYPES]
        rows.append({
            "medicine_id": mid,
            "name": med.get("name", ""),
            "inn": med.get("inn", ""),
            "atc": med.get("atc", ""),
            "class": med.get("class", ""),
            "verified_documents": len(verified),
            "verified_sources": len(verified_sources),
            "official_sources": len(official),
            "source_ids": "; ".join(verified_sources),
            "needs_review": len(review),
            "rejected": len(rejected),
            "documents_total": len(sub),
            "brands_known": len(brands),
            "algerian_brands": len(algerian),
            "algerian_brand": algerian[0]["brand_name"] if algerian else "",
            "brand_source": algerian[0]["source_id"] if algerian else "",
            "brand_collected_at": algerian[0]["collected_at"] if algerian else "",
            "brand_gap": "yes" if not algerian else "no",
            "coverage_ok": "yes" if (len(verified_sources) >= min_sources
                                     and len(official) >= 1) else "no",
        })

    report = pd.DataFrame(rows)
    write_table(COVERAGE_REPORT_CSV, report)

    pending = docs[docs["collection_status"].isin(PENDING_STATUSES)]
    # a placeholder is superseded as soon as the same source delivered a
    # document for that medicine
    delivered = set(zip(docs[docs["collection_status"] == "collected"]["medicine_id"],
                        docs[docs["collection_status"] == "collected"]["source_id"]))
    if not pending.empty:
        pending = pending[[pair not in delivered
                           for pair in zip(pending["medicine_id"], pending["source_id"])]]
    write_table(PENDING_REVIEW_CSV, pending)

    # documents that were stored but whose identity is not proven yet
    attention = docs[(docs["collection_status"] == "collected")
                     & (docs["relevance_status"] != "verified")]
    write_table(NEEDS_ATTENTION_CSV, attention)

    # the medicines that still wait for an Algerian brand name
    gaps = report[report["brand_gap"] == "yes"][
        ["medicine_id", "name", "inn", "atc", "class", "verified_sources",
         "official_sources", "brands_known"]]
    write_table(BRAND_GAP_CSV, gaps)

    health = []
    for _, s in srcs.iterrows():
        sid = s["source_id"]
        sub = docs[docs["source_id"] == sid]
        health.append({
            "source_id": sid,
            "source_name": s["source_name"],
            "base_domain": s["base_domain"],
            "authority_level": _authority_level(s["authority_level"]),
            "authority": AUTHORITY_NAMES.get(_authority_level(s["authority_level"]), ""),
            "allowed_mode": s["allowed_mode"],
            "review_status": s["review_status"],
            "terms_conclusion": s["terms_conclusion"],
            "robots_checked_at": s["robots_checked_at"],
            "robots_rules": s["robots_rules"],
            "next_review_date": s["next_review_date"],
            "documents": len(sub),
            "verified": len(sub[(sub["collection_status"] == "collected")
                                & (sub["relevance_status"] == "verified")]),
        })
    write_table(SOURCE_HEALTH_CSV, pd.DataFrame(health))

    ok = int((report["coverage_ok"] == "yes").sum()) if not report.empty else 0
    verified_total = int(((docs["collection_status"] == "collected")
                           & (docs["relevance_status"] == "verified")).sum())
    print(f"Coverage report : {COVERAGE_REPORT_CSV}")
    print(f"Pending review  : {PENDING_REVIEW_CSV}")
    print(f"Needs attention : {NEEDS_ATTENTION_CSV}")
    print(f"Source health   : {SOURCE_HEALTH_CSV}")
    print(f"Verified documents: {verified_total} | medicines with full coverage "
          f"(>= {min_sources} verified sources incl. 1 official): {ok}/{len(report)}")
    if not report.empty:
        print(report.to_string(index=False))
    return report
