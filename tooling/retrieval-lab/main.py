#!/usr/bin/env python3
"""PHARMEAZOR collection CLI.

  python main.py init
  python main.py import-meds [--csv data/input/targetMeds.csv]
                             [--xlsx data/input/Projet2_Liste_40_medicaments.xlsx]
  python main.py sources
  python main.py source-audit
  python main.py approve --source DAILYMED --decision permitted --reviewer "your name"
  python main.py check   --source ANPP_RCP --url https://rcp.anpp.dz/
  python main.py recon   --source ANPP_RCP --url https://rcp.anpp.dz/
  python main.py discover --med MED031 [--source DAILYMED]
  python main.py collect  --med MED031 [--source DAILYMED] [--refresh]
  python main.py collect-all [--source DAILYMED] [--limit 3] [--refresh]
  python main.py report
  python main.py organize-files [--dry-run]
  python main.py status
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import pandas as pd

from config import (
    CACHE_DIR, CHECKS_CSV, DATA_DIR,
    DOCUMENTS_CSV, INPUT_DIR, LOG_DIR, MANUAL_ACTIONS_CSV,
    MEDICINES_CSV, META_DIR, NEEDS_ATTENTION_CSV,
    PROFESSORS_LIST_CSV, QUARANTINE_DIR, RAW_DIR, RECON_DIR, REPORTS_DIR,
    ROOT, SECTION_COVERAGE_CSV, SOURCES_CSV, TARGETS_CSV,
    USAGE_REPORT_CSV, DOCUMENT_COLUMNS, MEDICINE_COLUMNS,
    SOURCE_COLUMNS, TARGET_COLUMNS, AUTOMATED, MANUAL, EXCLUDED,
)
from src.compliance.registry import SourceRegistry
from src.storage.store import DocumentStore, read_table, write_table
from src.utils.logging_setup import get_logger
from src.utils.rate_limit import RateLimiter

log = get_logger("pharmeazor.main")

DEFAULT_SOURCES = ["ANPP_RCP", "ANPP_SITE", "SANTE_MSP", "BDPM_FR", "DAILYMED", "EMA",
                   "PHARMNET", "PHARMNET_CATALOG"]


def _ordered_sources(registry, requested=None):
    """Official sources first (authority 1 -> 4); the rest in registry order."""
    wanted = list(requested or DEFAULT_SOURCES)
    order = {sid: i for i, sid in enumerate(wanted)}

    def key(source_id):
        src = registry.get(source_id) or {}
        level = str(src.get("authority_level") or "").strip()
        level = level[0] if level[:1].isdigit() else "9"
        return (level, order.get(source_id, 99))

    return sorted([s for s in wanted if s in order], key=key)


# ----------------------------------------------------------------- commands
def cmd_init(_args):
    for d in (INPUT_DIR, RAW_DIR, QUARANTINE_DIR, META_DIR, REPORTS_DIR,
              LOG_DIR, RECON_DIR, CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
    for path, cols in ((SOURCES_CSV, SOURCE_COLUMNS),
                       (DOCUMENTS_CSV, DOCUMENT_COLUMNS),
                       (CHECKS_CSV, ["check_id", "source_id", "target_url", "checked_at",
                                     "robots_status", "robots_can_fetch", "terms_conclusion",
                                     "decision", "reason", "reviewer"])):
        if not path.exists():
            write_table(path, pd.DataFrame(columns=cols))
    if not MEDICINES_CSV.exists():
        write_table(MEDICINES_CSV, pd.DataFrame(columns=MEDICINE_COLUMNS))
    if not TARGETS_CSV.exists():
        write_table(TARGETS_CSV, pd.DataFrame(columns=TARGET_COLUMNS))
    registry = SourceRegistry()
    added = registry.seed()
    print(f"Initialised data/ tree, empty tables and {added} source registry row(s).")
    print("Next: python main.py source-audit   (fetch robots.txt evidence)")
    print("      python main.py approve --source <ID> --decision permitted --reviewer <name>")


def cmd_import_meds(args):
    from src.medicines.loader import import_files

    paths = []
    if args.csv:
        paths += list(args.csv)
    if args.xlsx:
        paths += list(args.xlsx)
    if not paths:
        raise SystemExit(
            "import-meds needs at least one input file: "
            "pass --csv <targetMeds.csv> and/or --xlsx <medicine-list.xlsx>"
        )
    rows = import_files(paths, merge=not args.replace)
    print(f"Imported {len(rows)} medicines -> {MEDICINES_CSV}")
    for r in rows:
        print(f"  {r['medicine_id']:8s} {r['inn']:<52s} {r['atc']:<10s} {r['class']}")


def cmd_sources(_args):
    registry = SourceRegistry()
    registry.seed()
    srcs = read_table(SOURCES_CSV, SOURCE_COLUMNS)
    if srcs.empty:
        print("no sources")
        return
    for _, s in srcs.iterrows():
        print(f"{s['source_id']:<12} authority={s['authority_level']:<3} "
              f"mode={s['allowed_mode']:<10} review={s['review_status']:<8} "
              f"terms={s['terms_conclusion']:<10} {s['base_domain']}")


def cmd_source_audit(_args):
    """Fetch robots.txt for every source and store the evidence for review."""
    from src.compliance.registry import SourceRegistry
    from src.compliance.robots import check_robots

    registry = SourceRegistry()
    registry.seed()
    for _, s in read_table(SOURCES_CSV, SOURCE_COLUMNS).iterrows():
        sid = s["source_id"]
        info = check_robots(s["robots_url"], f"https://{s['base_domain']}/")
        registry.update_source(
            sid,
            robots_checked_at=info.get("fetched_at", ""),
            robots_rules=info.get("rules", ""),
        )
        print(f"{sid:<12} robots={info['status']:<28} rules: {info.get('rules','')}")
        print(f"{'':<12} terms to review: {s['terms_url']}")


def cmd_approve(args):
    """Record a human terms-of-use review for a source."""
    registry = SourceRegistry()
    registry.seed()
    decision = args.decision.lower()
    if decision not in ("permitted", "manual", "excluded"):
        print("decision must be one of: permitted, manual, excluded")
        return
    allowed_mode = {"permitted": AUTOMATED, "manual": MANUAL, "excluded": EXCLUDED}[decision]
    review_status = "approved" if decision in ("permitted", "manual") else "excluded"
    registry.update_source(
        args.source,
        allowed_mode=allowed_mode,
        review_status=review_status,
        terms_conclusion=decision,
        terms_checked_at=pd.Timestamp.now().strftime("%Y-%m-%dT%H:%M:%S"),
        reviewer=args.reviewer,
        last_reviewed_at=pd.Timestamp.now().strftime("%Y-%m-%d"),
        next_review_date=args.next_review or "",
        notes=args.notes or "",
    )
    print(f"{args.source}: mode={allowed_mode} terms={decision} reviewer={args.reviewer}")


def cmd_set_brand(args):
    """Record the Algerian brand name found in the manual nomenclature."""
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    meds = meds[meds["medicine_id"] == args.med]
    if meds.empty:
        print(f"unknown medicine id {args.med}")
        return
    meds.loc[:, "brand_name"] = args.brand
    if args.strength:
        meds.loc[:, "strength_form"] = args.strength
    if args.nomenclature:
        meds.loc[:, "in_algerian_nomenclature"] = args.nomenclature
    if args.remarks:
        meds.loc[:, "remarks"] = args.remarks
    write_table(MEDICINES_CSV, meds)
    print(f"{args.med}: brand={args.brand!r} strength={args.strength!r} "
          f"in_algerian_nomenclature={args.nomenclature!r}")


def cmd_manual_actions(_args):
    path = MANUAL_ACTIONS_CSV
    if not path.exists():
        print("no manual actions recorded")
        return
    df = read_table(path, ["medicine_id", "source_id", "url", "instruction",
                           "recorded_at", "status", "notes"])
    print(df.to_string(index=False))


def cmd_check(args):
    registry = SourceRegistry()
    d = registry.evaluate(args.source, args.url, reviewer=args.reviewer)
    print(f"DECISION : {d.decision}")
    print(f"REASON   : {d.reason}")
    print(f"CHECK ID : {d.check_id}")
    if d.robots_rules:
        print(f"ROBOTS   : {d.robots_rules}")


def cmd_recon(args):
    registry = SourceRegistry()
    decision = registry.evaluate(args.source, args.url, reviewer=args.reviewer)
    if decision.decision != AUTOMATED:
        print(f"REFUSED: compliance gate says {decision.decision} - {decision.reason}")
        print("Review the source (source-audit / approve) before running reconnaissance.")
        return
    from src.reconnaissance.inspect_site import recon
    note = recon(args.url, args.source, headless=not args.headed)
    print(f"Saved recon note: {note['screenshot'].replace('.png', '.json')}")
    print(f"title={note['title']!r} links={len(note['all_links_sample'])} "
          f"document_links={len(note['document_links'])}")


def _medicines(args):
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    if meds.empty:
        print("no medicines loaded - run: python main.py import-meds")
        return []
    if getattr(args, "med", None):
        meds = meds[meds["medicine_id"] == args.med]
        if meds.empty:
            print(f"unknown medicine id {args.med}")
            return []
    return meds.to_dict("records")


def cmd_discover(args):
    from src.collectors import http as httpc
    from src.discovery import registry as discovery_registry

    meds = _medicines(args)
    if not meds:
        return
    session = httpc.build_session()
    limiter = RateLimiter()
    registry = SourceRegistry()
    sources = _ordered_sources(registry, [args.source] if args.source else None)
    for med in meds:
        print(f"== {med['medicine_id']} {med['inn']}")
        for source_id in sources:
            try:
                candidates = discovery_registry.discover(source_id, med, session, limiter,
                                                         max_results=args.limit)
            except Exception as exc:
                print(f"   {source_id:<12} ERROR {exc}")
                continue
            print(f"   {source_id:<12} {len(candidates)} candidate(s)")
            for c in candidates:
                print(f"      - {c.document_type:<12} {c.title[:60]}")
                print(f"        {c.url}")


def cmd_collect(args):
    from src.collectors import http as httpc
    from src.collectors.pipeline import collect_medicine

    meds = _medicines(args)
    if not meds:
        return
    registry, store = SourceRegistry(), DocumentStore()
    limiter = RateLimiter()
    session = httpc.build_session()
    sources = _ordered_sources(registry, [args.source] if args.source else None)
    for med in meds:
        rows = collect_medicine(med, sources, registry, store, limiter,
                                session=session, refresh=args.refresh,
                                max_per_source=args.limit)
        ok = sum(1 for r in rows if r.get("collection_status") == "collected")
        print(f"{med['medicine_id']} {med['inn']}: {ok}/{len(rows)} row(s) collected")


def cmd_collect_all(args):
    from src.collectors import http as httpc
    from src.collectors.pipeline import collect_medicine

    meds = _medicines(args)
    if not meds:
        return
    if args.limit:
        meds = meds[: args.limit]
    registry, store = SourceRegistry(), DocumentStore()
    limiter = RateLimiter()
    session = httpc.build_session()
    sources = _ordered_sources(registry, [args.source] if args.source else None)
    total = 0
    for med in meds:
        rows = collect_medicine(med, sources, registry, store, limiter,
                                session=session, refresh=args.refresh,
                                max_per_source=args.per_source)
        collected = [r for r in rows if r.get("collection_status") == "collected"]
        total += len(collected)
        print(f"{med['medicine_id']} {med['inn']}: {len(collected)} collected, "
              f"{len(rows)} rows")
    print(f"done: {total} document(s) collected")


def cmd_revalidate(_args):
    """Re-check the identity of already collected files (no new requests)."""
    from src.storage.store import resolve_path
    from src.utils.text import dci_components, dci_head, dci_required_components
    from src.validation.validate import check_medicine_relevance, extract_text

    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS).set_index("medicine_id").to_dict("index")
    store = DocumentStore()
    changed = 0
    for _, row in store.df.iterrows():
        if row["collection_status"] != "collected":
            continue
        path = resolve_path(row["file_path"])
        if not path.exists():
            continue
        med = meds.get(row["medicine_id"], {})
        text = extract_text(path)
        relevance, note = check_medicine_relevance(text, {
            "inn": row["matched_inn"] or med.get("inn", ""),
            "name": med.get("name", ""),
            "brand_name": row["brand_name"],
            # the strength declared by the document itself, if any
            "strength": row["strength_form"],
            "country": row["country"],
            "dci_components": dci_components(med),
            "dci_required": dci_required_components(med),
            "dci_head": dci_head(med),
        })
        if relevance != row["relevance_status"]:
            store.update(row["document_id"], relevance_status=relevance,
                         reviewer_notes=(row["reviewer_notes"] + " | " if row["reviewer_notes"] else "") + note)
            changed += 1
        elif row["relevance_status"] in ("rejected", "needs_review") and note:
            store.update(row["document_id"], reviewer_notes=note)
            changed += 1
    print(f"revalidated {len(store.df)} row(s), {changed} status change(s)")


def cmd_audit(args):
    """Show the structured audit trail (one JSON record per attempt)."""
    from src.utils.audit import read_attempts, summarise

    attempts = read_attempts()
    summary = summarise(attempts)
    print(f"attempts : {summary['attempts']}  ({summary['first']} -> {summary['last']})")
    for status, n in sorted(summary["by_status"].items()):
        print(f"  {status:<28} {n}")
    print("per source:")
    for source, n in sorted(summary["by_source"].items()):
        print(f"  {source:<14} {n}")
    if args.last:
        for a in attempts[-args.last:]:
            print(f"  {a['timestamp']} {a['medicine_id']:<8} {a['source_id']:<12} "
                  f"{a['status']:<24} {a['target_url'][:80]}")
    if args.errors:
        print("errors:")
        for a in attempts:
            if a.get("error"):
                print(f"  {a['timestamp']} {a['medicine_id']:<8} {a['source_id']:<12} "
                      f"{a['error'][:100]}")


def cmd_extract_brands(args):
    """Read the commercial names out of the collected official RCPs.

    The professor's list asks for the "nom commercial rencontre" and the
    "source consultee"; the ANPP RCPs carry both.  The result also unlocks
    the brand-based ANPP dossier adapter.
    """
    from src.medicines.rcp import parse_rcp_header
    from src.storage.store import resolve_path
    from src.validation.validate import extract_text

    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    rcps = docs[(docs["source_id"] == "ANPP_RCP")
                & (docs["collection_status"] == "collected")]

    rows, by_medicine = [], {}
    for _, doc in rcps.iterrows():
        path = resolve_path(doc["file_path"])
        if not path.exists():
            continue
        header = parse_rcp_header(extract_text(path))
        if not header["commercial_name"]:
            continue
        row = {
            "medicine_id": doc["medicine_id"],
            "document_id": doc["document_id"],
            "commercial_name": header["commercial_name"],
            "strength": header["strength"],
            "form": header["form"],
            "declared_dci": header["declared_dci"],
            "holder": doc["holder"],
            "source_url": doc["source_url"],
        }
        rows.append(row)
        by_medicine.setdefault(doc["medicine_id"], []).append(row)

    out = META_DIR / "brand_evidence.csv"
    write_table(out, pd.DataFrame(rows))

    updated = 0
    for index in meds.index:
        found = by_medicine.get(meds.at[index, "medicine_id"], [])
        if not found:
            continue
        brands = []
        for f in found:
            name = f["commercial_name"]
            if name not in brands:
                brands.append(name)
        strengths = [f["strength"] for f in found if f["strength"]]
        holders = [f["holder"] for f in found if f["holder"]]
        note = (f"nom commercial rencontre: {', '.join(brands[:4])} "
                f"(source: ANPP RCP{' / ' + ', '.join(sorted(set(holders))[:2]) if holders else ''})")
        if not meds.at[index, "brand_name"]:
            meds.at[index, "brand_name"] = brands[0]
            updated += 1
        if strengths and not meds.at[index, "strength_form"]:
            meds.at[index, "strength_form"] = strengths[0]
        if note not in meds.at[index, "remarks"]:
            previous = meds.at[index, "remarks"]
            meds.at[index, "remarks"] = (previous + " | " if previous else "") + note
    write_table(MEDICINES_CSV, meds)

    print(f"brand evidence -> {out} ({len(rows)} RCP headers parsed)")
    print(f"medicines updated with a commercial name: {updated}")
    for mid, found in sorted(by_medicine.items()):
        names = sorted({f['commercial_name'] for f in found})
        print(f"  {mid}: {', '.join(names[:3])}")


def cmd_import_nomenclature(args):
    """Import the official Algerian nomenclature (downloaded by hand).

    Writes the per-product table, fills the professor's column E and records
    the Algerian commercial names (the keys of the official portals).
    """
    import shutil
    from pathlib import Path as _Path

    from src.medicines.nomenclature import Nomenclature
    from src.utils.hashing import sha256_file

    path = _Path(args.file)
    if not path.exists():
        print(
            f"file not found: {path}\n"
            "The official nomenclature is downloaded by hand and supplied with "
            "--file; it is not part of the repository."
        )
        return
    nomenclature = Nomenclature(path)
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    collected_at = __import__("time").strftime("%Y-%m-%dT%H:%M:%S")

    rows = []
    for _, med in meds.iterrows():
        summary = nomenclature.summary(med.to_dict())
        for record in summary["records"] + summary["historical"]:
            rows.append({
                "medicine_id": med["medicine_id"],
                "dci": med["inn"],
                "dci_as_registered": record.get("dci", ""),
                "brand_name": record.get("brand", ""),
                "dci_code": record.get("code", ""),
                "registration_number": record.get("registration_number", ""),
                "form": record.get("form", ""),
                "dosage": record.get("dosage", ""),
                "packaging": record.get("packaging", ""),
                "list": record.get("list", ""),
                "holder": record.get("holder", ""),
                "country": record.get("country", ""),
                "registration_date_initial": record.get("registration_date_initial", ""),
                "registration_date_final": record.get("registration_date_final", ""),
                "type": record.get("type", ""),
                "status": nomenclature.status_of(record),
                "stability": record.get("stability", ""),
                "source_file": path.name,
                "collected_at": collected_at,
            })

    out = META_DIR / "nomenclature_products.csv"
    write_table(out, pd.DataFrame(rows))

    # the verdict per medicine (column E) and the primary brand
    present = {}
    for _, med in meds.iterrows():
        present[med["medicine_id"]] = nomenclature.summary(med.to_dict())

    # the file the team downloaded is an official source (authority 2):
    # keep one copy in the shared register folder and give every medicine a
    # provenance row for it
    from src.storage.naming import shared_register_path

    stored = shared_register_path(
        "SANTE_MSP", "Nomenclature nationale des produits pharmaceutiques",
        path.suffix.lower())
    stored.parent.mkdir(parents=True, exist_ok=True)
    if not stored.exists() or stored.stat().st_size != path.stat().st_size:
        shutil.copy2(path, stored)
    digest = sha256_file(stored)
    file_path = str(stored.relative_to(ROOT).as_posix())

    store = DocumentStore()
    checks = read_table(CHECKS_CSV, ["check_id", "source_id", "target_url", "checked_at",
                                     "robots_status", "robots_can_fetch", "terms_conclusion",
                                     "decision", "reason", "reviewer"])
    manual_checks = checks[checks["source_id"] == "SANTE_MSP"]
    check_id = manual_checks["check_id"].iloc[-1] if not manual_checks.empty else ""

    for _, med in meds.iterrows():
        summary = present[med["medicine_id"]]
        if not summary["products"]:
            continue
        row = {c: "" for c in DOCUMENT_COLUMNS}
        row.update({
            "document_id": store.next_document_id(med["medicine_id"], "SANTE_MSP"),
            "medicine_id": med["medicine_id"],
            "search_term": med["inn"],
            "matched_inn": med["inn"],
            "title": f"Nomenclature nationale des produits pharmaceutiques - {med['inn']}",
            "document_type": "nomenclature",
            "language": "fr",
            "country": "DZ",
            "source_id": "SANTE_MSP",
            "source_url": path.name,
            "final_url": path.name,
            "collection_method": "manual-download",
            "collected_at": collected_at,
            "publication_date": "2026-08",
            "file_path": file_path,
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "file_size": str(stored.stat().st_size),
            "sha256": digest,
            "compliance_check_id": check_id,
            "allowed_scope": "",
            "collection_status": "collected",
            "relevance_status": "verified",
            "reviewer_notes": (
                f"nomenclature officielle (Aout 2026): {summary['products']} produit(s) "
                f"pour {med['inn']} ({summary['present']}); "
                f"marques: {', '.join(summary['brands'][:6])}"
            ),
        })
        store.add(row)
    # the manual download is done: the placeholder rows are superseded
    store.drop_where_any("SANTE_MSP", ["MANUAL", "REVIEW_REQUIRED"])

    # column E + the primary brand of each medicine
    for _, med in meds.iterrows():
        summary = present[med["medicine_id"]]
        index = meds.index[meds["medicine_id"] == med["medicine_id"]]
        if len(index) == 0:
            continue
        i = index[0]
        if summary["brands"]:
            meds.at[i, "brand_name"] = summary["brands"][0]
        if summary["strengths"]:
            meds.at[i, "strength_form"] = summary["strengths"][0]
        meds.at[i, "in_algerian_nomenclature"] = summary["present"]
        note = (f"{summary['products']} produit(s) dans la nomenclature officielle"
                f" ({len(summary['brands'])} marques"
                + (f": {', '.join(summary['brands'][:4])}" if summary["brands"] else "")
                + f"); statuts: {', '.join(summary['statuses']) or 'enregistre'}"
                + f"; titulaires: {', '.join(summary['holders'][:3])}" if summary["holders"] else "")
        if summary["present"] != "oui":
            note += f"; historique: {len(summary['historical'])} produit(s) retires/non renouveles"
        meds.at[i, "remarks"] = (meds.at[i, "remarks"] + " | " if meds.at[i, "remarks"] else "") + note
    write_table(MEDICINES_CSV, meds)

    counts = {}
    for mid, summary in present.items():
        counts[summary["present"]] = counts.get(summary["present"], 0) + 1
    print(f"nomenclature -> {out} ({len(rows)} registered products)")
    print("column E verdicts:", counts)
    print(f"medicines with an Algerian brand: "
          f"{sum(1 for s in present.values() if s['brands'])}/{len(present)}")
    for mid, summary in sorted(present.items()):
        if summary["present"] != "oui":
            print(f"   {mid}: {summary['present']} "
                  f"({len(summary['historical'])} historical products)")


def cmd_export_list(args):
    """Fill the professor's list with what the corpus already proves.

    Column E ("Présent dans la nomenclature algérienne ?") stays a manual
    verdict; column F ("Remarques") is filled with the sources found, the
    brand names encountered and the document counts.
    """
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    srcs = read_table(SOURCES_CSV, SOURCE_COLUMNS)
    authority = {row["source_id"]: row["authority_level"] for _, row in srcs.iterrows()}
    from src.reporting.report import ALGERIAN_BRAND_TYPES, _brands_for, _name_map

    name_map = _name_map()

    rows = []
    for _, med in meds.iterrows():
        mid = med["medicine_id"]
        sub = docs[(docs["medicine_id"] == mid)
                   & (docs["collection_status"] == "collected")
                   & (docs["relevance_status"] == "verified")]
        notes = []
        for source_id in sorted(set(sub["source_id"])):
            part = sub[sub["source_id"] == source_id]
            label = f"{source_id} (autorite {authority.get(source_id, '?')}) x{len(part)}"
            holders = sorted({h for h in part["holder"] if h})
            if holders:
                label += f" [{', '.join(holders[:3])}]"
            notes.append(label)

        brands = _brands_for(name_map, mid)
        algerian = [b for b in brands if b["brand_type"] in ALGERIAN_BRAND_TYPES]
        if algerian:
            names = ", ".join(b["brand_name"] for b in algerian[:5])
            origin = algerian[0]
            notes.append(f"noms commerciaux algeriens: {names} "
                         f"(source: {origin['source_id']}, collecte: {origin['collected_at'][:10]})")
        else:
            notes.append("nom commercial algerien: a confirmer sur la nomenclature officielle")
        brands_str = sorted({b["brand_name"] for b in brands if b["brand_type"] != "algerian_secondary"})
        if brands_str:
            notes.append(f"marques etrangeres connues: {len(brands_str)}")

        verdict = med.get("in_algerian_nomenclature", "") or "a verifier"
        rows.append({
            "Numero": med.get("list_number", ""),
            "Classe": med.get("class", ""),
            "DCI (nom de la substance)": med.get("inn", ""),
            "Code ATC (indicatif)": med.get("atc", ""),
            "Present dans la nomenclature algerienne ?": verdict,
            "Remarques": "; ".join(notes) or "aucun document collecte",
        })

    out = PROFESSORS_LIST_CSV
    write_table(out, pd.DataFrame(rows))
    print(f"Written {out} ({len(rows)} medicines)")
    print(f"Column E (nomenclature algerienne) still to be confirmed manually: "
          f"{sum(1 for r in rows if r['Present dans la nomenclature algerienne ?'] in ('', 'a verifier'))}")


def cmd_resolve_names(_args):
    """Build the DCI -> brand name map (name-normalisation input)."""
    from src.collectors import http as httpc
    from src.names.resolver import build
    from src.utils.rate_limit import RateLimiter

    session = httpc.build_session()
    limiter = RateLimiter()
    frame = build(session=session, limiter=limiter)
    if frame.empty:
        print("name map is empty")
        return
    algerian = frame[frame["brand_type"].isin(
        ["algerian_official", "algerian_secondary", "manual"])]
    per_medicine = algerian.groupby("medicine_id")["brand_name"].nunique()
    print(f"name map -> data/metadata/name_map.csv ({len(frame)} rows)")
    for kind, n in frame["brand_type"].value_counts().items():
        print(f"  {kind:20s} {n}")
    print(f"medicines with at least one Algerian brand: {len(per_medicine)}/{frame['medicine_id'].nunique()}")
    print(f"ambiguous brands (several DCIs): "
          f"{frame[frame['ambiguous'] == 'yes']['brand_name'].nunique()}")


def cmd_names(args):
    """Show the name map."""
    from src.names.resolver import NameMap

    name_map = NameMap()
    if name_map.df.empty:
        print("no name map yet - run: python main.py resolve-names")
        return
    if args.med:
        sub = name_map.df[name_map.df["medicine_id"] == args.med]
    else:
        sub = name_map.df
    if args.algerian:
        sub = sub[sub["brand_type"].isin(
            ["algerian_official", "algerian_secondary", "manual"])]
    columns = ["medicine_id", "brand_name", "brand_type", "strength", "holder",
               "dci_code", "source_id", "collected_at", "ambiguous"]
    print(sub[[c for c in columns if c in sub.columns]].head(args.limit).to_string(index=False))


def cmd_verify(_args):
    """Check the corpus integrity: files exist, hashes match, ids are unique."""
    from collections import defaultdict

    from src.storage.store import resolve_path
    from src.utils.hashing import sha256_file

    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    collected = docs[docs["collection_status"] == "collected"]
    problems = []

    missing, mismatched, shared = [], [], defaultdict(set)
    multi = set()
    ids = defaultdict(int)
    for _, row in collected.iterrows():
        ids[row["document_id"]] += 1
        path = resolve_path(row["file_path"])
        if not path.exists():
            missing.append((row["document_id"], row["file_path"]))
            continue
        shared[row["file_path"]].add(row["sha256"])
        if row["sha256"] and sha256_file(path) != row["sha256"]:
            mismatched.append((row["document_id"], row["file_path"]))
    for file_path, hashes in list(shared.items()):
        if len(hashes) > 1:
            multi.add(file_path)

    duplicates = [doc_id for doc_id, n in ids.items() if n > 1]

    print(f"collected rows : {len(collected)}")
    print(f"distinct files : {len(shared)}")
    print(f"missing files  : {len(missing)}")
    print(f"hash mismatch  : {len(mismatched)}")
    print(f"duplicate ids  : {len(duplicates)}")
    print(f"files with 2 hashes: {len(multi)}")
    for item in missing[:5]:
        print("   missing   ", item)
    for item in mismatched[:5]:
        print("   mismatch  ", item)
    for item in duplicates[:5]:
        print("   duplicate id", item)
    for file_path in list(multi)[:5]:
        print("   two hashes ", file_path)
    ok = not (missing or mismatched or duplicates or multi)
    print("CORPUS OK" if ok else "CORPUS HAS PROBLEMS")
    return 0 if ok else 1

def _url_from_search_cache(source_id: str, title: str, text: str = "") -> str:
    """Find the original URL of a document in the search cache of its source."""
    import json

    from src.discovery import bdpm

    if source_id == "BDPM_FR":
        cache = CACHE_DIR / "bdpm"
        if not cache.exists():
            return ""
        needle = (title or "").strip().lower()
        for path in sorted(cache.glob("search_*.json")):
            try:
                items = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            for item in items:
                name = (item.get("value") or "").strip()
                if not name:
                    continue
                if (needle and name.lower() in needle) or \
                        (text and name.lower() in text.lower()[:6000]):
                    return f"{bdpm.BASE}{item.get('url', '')}"
        return ""
    if source_id == "ANPP_RCP":
        cache = CACHE_DIR / "anpp" / "search_index.json"
        if cache.exists():
            try:
                items = json.loads(cache.read_text(encoding="utf-8"))
            except Exception:
                items = {}
            for urls in items.values():
                for url in urls:
                    if url.lower().endswith(".pdf"):
                        return url
    return ""


def _url_for_row(row, text: str = "") -> str:
    """Recover the original URL of a stored document."""
    from src.discovery import bdpm
    from src.storage.store import resolve_path
    from src.validation.validate import extract_text

    if not text:
        path = resolve_path(row.get("file_path", ""))
        if path.exists() and path.suffix.lower() in (".html", ".htm"):
            text = extract_text(path)[:8000]
    name = Path(row.get("file_path", "")).name
    if row.get("source_id") == "ANPP_RCP":
        cache = CACHE_DIR / "anpp" / "search_index.json"
        if cache.exists():
            try:
                items = json.loads(cache.read_text(encoding="utf-8"))
            except Exception:
                items = {}
            for urls in items.values():
                for url in urls:
                    if url.rsplit("/", 1)[-1].lower() == name.lower():
                        return url
    return _url_from_search_cache(row.get("source_id", ""), row.get("title", ""), text)


def _document_identity(path: Path, meds: dict, source_ids) -> tuple:
    """Recover (medicine_id, source_id, document_id) from a file name.

    Understands both the historical `MED001__SRC_DAILYMED__DOC002.pdf` and the
    human-readable `paracetamol__daily-med__doc002__ac-fast.pdf`.
    """
    from src.storage.naming import medicine_slug, source_slug

    stem = path.stem
    match = re.match(r"^(MED\d+)__SRC_(.+?)__DOC\d+$", stem)
    if match:
        return match.group(1), match.group(2), stem

    parts = stem.split("__")
    if len(parts) < 3 or "+" in parts[0]:
        return "", "", ""
    medicine_id = next((mid for mid, med in meds.items()
                        if medicine_slug(med) == parts[0]), "")
    source_id = next((sid for sid in source_ids
                      if source_slug(sid) == parts[1]), "")
    token = re.fullmatch(r"doc(\d+)", parts[2])
    if not (medicine_id and source_id and token):
        return "", "", ""
    document_id = f"{medicine_id}__SRC_{source_id}__DOC{int(token.group(1)):03d}"
    return medicine_id, source_id, document_id


def _recover_orphan(store: DocumentStore, meds: dict, source_ids, path: Path) -> str:
    """A quarantined file that lost its row: validate it and put it back."""
    from bs4 import BeautifulSoup

    from src.storage.naming import document_path, free_path, label_from_values
    from src.storage.store import resolve_path
    from src.utils.hashing import sha256_file
    from src.validation.validate import (
        check_medicine_relevance, extract_text, verify_file_integrity,
    )
    from src.utils.text import dci_components, dci_head, dci_required_components

    medicine_id, source_id, document_id = _document_identity(path, meds, source_ids)
    if not document_id:
        return ""
    med = meds.get(medicine_id)
    if not med:
        return ""

    ok_file, issue = verify_file_integrity(path, {"content_type": "", "file_size": path.stat().st_size})
    if not ok_file:
        return ""
    text = extract_text(path)
    expected = {
        "inn": med.get("inn", ""),
        "name": med.get("name", ""),
        "brand_name": "",
        "strength": "",
        "country": "",
        "dci_components": dci_components(med),
        "dci_required": dci_required_components(med),
        "dci_head": dci_head(med),
    }
    relevance, note = check_medicine_relevance(text, expected)
    if relevance != "verified":
        return ""

    # the page carries its own canonical URL
    url = ""
    title = ""
    if path.suffix.lower() in (".html", ".htm"):
        from src.utils.encoding import read_text_auto
        soup = BeautifulSoup(read_text_auto(path), "html.parser")
        link = soup.find("link", rel="canonical")
        if link and link.get("href"):
            url = link["href"]
        if soup.title and soup.title.string:
            title = soup.title.string.strip()[:200]
        if not url:
            url = _url_from_search_cache(source_id, title, read_text_auto(path))

    label = label_from_values("", med.get("inn", ""), "")
    target = free_path(document_path(med, source_id, document_id,
                                     suffix=path.suffix.lower(), label=label))
    target.parent.mkdir(parents=True, exist_ok=True)
    path.replace(target)

    row = {c: "" for c in DOCUMENT_COLUMNS}
    row.update({
        "document_id": document_id,
        "medicine_id": medicine_id,
        "search_term": med.get("inn", ""),
        "matched_inn": med.get("inn", ""),
        "title": title or med.get("inn", ""),
        "document_type": "smpc",
        "language": "fr",
        "country": "FR",
        "source_id": source_id,
        "source_url": url,
        "final_url": url,
        "collection_method": "requests",
        "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "file_path": str(target.relative_to(ROOT).as_posix()),
        "content_type": "text/html",
        "file_size": str(target.stat().st_size),
        "sha256": sha256_file(target),
        "collection_status": "collected",
        "relevance_status": "verified",
        "reviewer_notes": note + " (restored from quarantine)",
    })
    store.add(row)
    return document_id


def cmd_reconcile(_args):
    """Reconcile the corpus with the files on disk.

    * a quarantined file that passes the (current) validation rules is put
      back into the corpus - e.g. the HTML product pages that an older rule
      had blocked;
    * a row whose file was deleted by hand is either re-pointed to the
      quarantine copy (the document was rejected) or dropped.
    """
    from src.storage.naming import document_path, free_path, label_from_values
    from src.storage.store import resolve_path
    from src.validation.validate import (
        check_medicine_relevance, extract_text, verify_file_integrity,
    )
    from src.utils.text import dci_components, dci_head, dci_required_components

    store = DocumentStore()
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS).set_index("medicine_id").to_dict("index")
    source_ids = list(read_table(SOURCES_CSV, SOURCE_COLUMNS)["source_id"])
    restored, repointed, dropped = [], [], []

    # 1. quarantined files that are valid today
    for path in sorted(Path(QUARANTINE_DIR).glob("*")):
        if not path.is_file():
            continue
        rows = store.df[store.df["file_path"].str.endswith(path.name)]
        if rows.empty:
            continue
        row = rows.iloc[-1]
        med = meds.get(row["medicine_id"], {})
        text = extract_text(path)
        ok_file, issue = verify_file_integrity(path, {"content_type": row["content_type"],
                                                       "file_size": row["file_size"]})
        expected = {
            "inn": row["matched_inn"] or med.get("inn", ""),
            "name": med.get("name", ""),
            "brand_name": row["brand_name"],
            "strength": row["strength_form"],
            "country": row["country"],
            "dci_components": dci_components(med),
            "dci_required": dci_required_components(med),
            "dci_head": dci_head(med),
        }
        relevance, note = check_medicine_relevance(text, expected) if ok_file else ("rejected", issue)
        if relevance == "verified":
            label = label_from_values(row["brand_name"], row["title"], row["holder"])
            target = free_path(document_path(med, row["source_id"], row["document_id"],
                                             suffix=path.suffix.lower(), label=label))
            target.parent.mkdir(parents=True, exist_ok=True)
            path.replace(target)
            store.update(row["document_id"],
                         file_path=str(target.relative_to(ROOT).as_posix()),
                         collection_status="collected",
                         relevance_status="verified",
                         reviewer_notes=note)
            restored.append((row["document_id"], path.name))
        else:
            store.update(row["document_id"],
                         reviewer_notes=(row["reviewer_notes"] + " | " if row["reviewer_notes"] else "")
                         + f"kept in quarantine: {issue or note}")
            repointed.append((row["document_id"], path.name))

    # 2. rows whose file disappeared
    for _, row in store.df.iterrows():
        if row["collection_status"] != "collected":
            continue
        if resolve_path(row["file_path"]).exists():
            continue
        name = Path(row["file_path"]).name
        quarantined = QUARANTINE_DIR / name
        if quarantined.exists():
            store.update(row["document_id"],
                         file_path=str(quarantined.relative_to(ROOT)),
                         reviewer_notes=(row["reviewer_notes"] + " | " if row["reviewer_notes"] else "")
                         + "file removed from the corpus (rejected by validation)")
            repointed.append((row["document_id"], name))
        else:
            store.df = store.df[store.df["document_id"] != row["document_id"]]
            dropped.append(row["document_id"])
    if dropped:
        from src.storage.store import write_table
        write_table(DOCUMENTS_CSV, store.df)

    # 2a. rows whose source_id was mangled (fixed by the id convention)
    for _, row in store.df.iterrows():
        match = re.match(r"^(MED\d+)__SRC_(.+?)__DOC\d+$", row["document_id"])
        if not match:
            continue
        wanted = match.group(2)
        if row["source_id"] != wanted:
            store.update(row["document_id"], source_id=wanted)

    # 2b. rows whose original URL was lost (recovered from the search cache)
    for _, row in store.df.iterrows():
        if row["collection_status"] != "collected" or row["source_url"]:
            continue
        url = _url_for_row(row)
        if url:
            store.update(row["document_id"], source_url=url, final_url=url)

    # 3. quarantined files without any row (they were valid all along)
    for path in sorted(Path(QUARANTINE_DIR).glob("*")):
        if not path.is_file():
            continue
        if not store.df["file_path"].str.endswith(path.name).any():
            recovered = _recover_orphan(store, meds, source_ids, path)
            if recovered:
                restored.append((recovered, path.name))

    print(f"restored from quarantine : {len(restored)}")
    for item in restored:
        print("   +", item[0], item[1])
    print(f"kept in quarantine       : {len(repointed)}")
    for item in repointed:
        print("   -", item[0], item[1])
    print(f"rows dropped (file gone) : {len(dropped)}")
    for item in dropped:
        print("   x", item)


def cmd_extract(args):
    """Extract the clinical sections of the collected documents.

    HTML documents are parsed with BeautifulSoup, PDFs with pymupdf; the
    original passages are preserved verbatim and stay linked to their
    document and URL.

    Legacy mode (default) keeps writing ``data/metadata/sections.csv`` and
    ``data/reports/section_coverage.csv``.  ``--structured`` runs the additive
    document-type-aware pipeline (RCP + notices, page references, statuses,
    validation and optional OCR/AI fallback) into new tables.
    """
    if getattr(args, "structured", False):
        from src.extraction.pipeline import run_extraction

        medicine_ids = ([args.med] if args.med else None)
        document_types = None
        if getattr(args, "doctype", ""):
            document_types = [part.strip().lower()
                              for part in args.doctype.split(",") if part.strip()]
            document_types = ["notice" if value in ("notice", "notices")
                              else value for value in document_types]
        source_ids = ([args.source] if getattr(args, "source", "") else None)
        summary = run_extraction(
            medicine_ids=medicine_ids, limit=args.limit,
            refresh=getattr(args, "refresh", False),
            include_notices=not getattr(args, "no_notices", False),
            document_types=document_types, source_ids=source_ids,
            capture_tables=getattr(args, "tables", False),
            ocr_mode=getattr(args, "ocr", "auto"),
            use_ai=getattr(args, "ai", False),
        )
        return 0 if summary["failed"] == 0 else 1

    from src.extraction.sections import extract_document
    from src.storage.store import resolve_path

    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    docs = docs[(docs["collection_status"] == "collected")
                & (docs["relevance_status"] == "verified")]
    if args.med:
        docs = docs[docs["medicine_id"] == args.med]
    if args.limit:
        docs = docs.head(args.limit)

    rows = []
    for _, doc in docs.iterrows():
        path = resolve_path(doc["file_path"])
        if not path.exists():
            continue
        try:
            sections = extract_document(path)
        except Exception as exc:
            log.warning("extraction failed %s: %s", doc["document_id"], exc)
            continue
        for section in sections:
            rows.append({
                "document_id": doc["document_id"],
                "medicine_id": doc["medicine_id"],
                "source_id": doc["source_id"],
                "source_url": doc["source_url"],
                "document_title": doc["title"],
                "section_key": section["section_key"],
                "section_title": section["section_title"],
                "level": section.get("level", 1),
                "char_count": len(section["text"]),
                "extractor": section.get("extractor", ""),
                "text": section["text"],
            })

    out = META_DIR / "sections.csv"
    write_table(out, pd.DataFrame(rows))

    # which of the four sections the brief asks for does each medicine have?
    frame = pd.DataFrame(rows)
    keys = ["indications", "posologie", "contre_indications", "interactions"]
    coverage = []
    for medicine_id, sub in frame.groupby("medicine_id") if len(frame) else []:
        found = {k: int((sub["section_key"] == k).sum()) for k in keys}
        coverage.append({
            "medicine_id": medicine_id,
            "documents": sub["document_id"].nunique(),
            "sections": len(sub),
            **found,
            "complete": "yes" if all(found[k] > 0 for k in keys) else "no",
            "sources": "; ".join(sorted(set(sub["source_id"]))),
        })
    coverage_out = SECTION_COVERAGE_CSV
    write_table(coverage_out, pd.DataFrame(coverage))

    print(f"sections -> {out} ({len(rows)} sections from {frame['document_id'].nunique() if len(frame) else 0} documents)")
    if coverage:
        cov = pd.DataFrame(coverage)
        print(f"coverage  -> {coverage_out}")
        print(f"medicines with the four key sections: "
              f"{(cov['complete'] == 'yes').sum()}/{len(cov)}")
        print(cov.to_string(index=False))


def cmd_extract_eval(args):
    """Build the 20-notice evaluation set and score the structured extractor."""
    from src.extraction.evaluation import run_evaluation

    summary = run_evaluation(
        size=args.size, refresh_sample=args.refresh_sample,
        provisional=not args.no_provisional,
    )
    return 0 if summary["scored_rows"] else 1


def cmd_notices(args):
    """Look for the patient notice of every medication and report."""
    from src.notice.pipeline import run

    report = run(medicines=args.med or None, refresh=args.refresh)
    summary = report["summary"]
    print("PHARMEAZOR - patient notice report")
    print("=" * 62)
    for key, value in summary.items():
        print(f"  {key:28s} {value}")
    print()
    coverage = report["coverage"]
    if len(coverage):
        missing = coverage[coverage.notice_status == "NOT_FOUND"]
        print(f"medicines without a notice ({len(missing)}):")
        for _, row in missing.iterrows():
            print(f"   {row['medicine_id']} {row['medicine_name']}")
        partial = coverage[coverage.notice_status.isin(["PARTIAL_MATCH", "COMBINATION_MATCH", "UNVERIFIED"])]
        print(f"medicines needing a human check ({len(partial)}):")
        for _, row in partial.iterrows():
            print(f"   {row['medicine_id']} {row['medicine_name']:<34s} {row['notice_status']}")
    if report.get("attempt_summary"):
        print("algerian sources searched:")
        for key, count in sorted(report["attempt_summary"].items()):
            print(f"   {key:34s} {count}")
    print()
    print("notices -> data/metadata/notices.csv | report -> data/reports/notice_report.csv")
    print("attempts -> data/metadata/notice_attempts.csv")


def cmd_check_usage(_args):
    """Check every collected document: human medicine, veterinary or other."""
    import time as _time

    from src.storage.store import resolve_path
    from src.validation.usage import (
        HUMAN_MEDICINE, NOT_A_MEDICINE_DOCUMENT, REGISTER_RECORD, UNDETERMINED,
        VETERINARY, classify_usage, document_text,
    )

    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    collected = docs[docs.collection_status == "collected"]
    checked_at = _time.strftime("%Y-%m-%dT%H:%M:%S")

    rows = []
    for _, doc in collected.iterrows():
        path = resolve_path(doc["file_path"])
        if not path.exists():
            continue
        text = document_text(path)
        verdict = classify_usage(text, doc.get("title", ""), doc.get("document_type", ""))
        rows.append({
            "document_id": doc["document_id"],
            "medicine_id": doc["medicine_id"],
            "source_id": doc["source_id"],
            "document_type": doc.get("document_type", ""),
            "title": doc.get("title", ""),
            "usage_status": verdict["status"],
            "confidence": verdict["confidence"],
            "evidence": verdict["evidence"],
            "file_path": doc["file_path"],
            "source_url": doc.get("source_url", ""),
            "checked_at": checked_at,
        })

    frame = pd.DataFrame(rows)
    out = USAGE_REPORT_CSV

    counts = frame["usage_status"].value_counts().to_dict() if len(frame) else {}
    reviewable = [NOT_A_MEDICINE_DOCUMENT, UNDETERMINED]

    print("PHARMEAZOR - human use check")
    print("=" * 62)
    print(f"  documents checked        {len(frame)}")
    print(f"  HUMAN_MEDICINE           {counts.get(HUMAN_MEDICINE, 0)}")
    print(f"  REGISTER_RECORD          {counts.get(REGISTER_RECORD, 0)}")
    print(f"  VETERINARY               {counts.get(VETERINARY, 0)}")
    print(f"  NOT_A_MEDICINE_DOCUMENT  {counts.get(NOT_A_MEDICINE_DOCUMENT, 0)}")
    print(f"  UNDETERMINED             {counts.get(UNDETERMINED, 0)}")
    print()

    # a veterinary product does not belong in a human-medicine corpus
    veterinary = frame[frame["usage_status"] == VETERINARY] if len(frame) else frame
    if len(veterinary):
        from src.storage.store import DocumentStore
        from src.validation.validate import quarantine_file

        print("  veterinary documents:")
        for _, row in veterinary.iterrows():
            print(f"   {row['document_id']:<42s} [{row['confidence']}] {row['evidence'][:62]}")
            print(f"       {row['title'][:78]}")
        print()

        store = DocumentStore()
        for index, row in veterinary.iterrows():
            if row["confidence"] != "high":
                continue          # a weak signal only goes to the review queue
            path = resolve_path(row["file_path"])
            if not path.exists():
                continue
            quarantined = quarantine_file(path, "veterinary product")
            new_path = str(quarantined.relative_to(ROOT).as_posix())
            store.update(row["document_id"],
                         relevance_status="rejected",
                         file_path=new_path,
                         reviewer_notes=(row["evidence"]))
            frame.loc[index, "file_path"] = new_path
            print(f"  QUARANTINED {row['document_id']}")
        print()

    write_table(out, frame)

    flagged = frame[frame["usage_status"].isin(reviewable + [VETERINARY])] if len(frame) else frame

    if len(flagged):
        print("documents to review:")
        for _, row in flagged.head(20).iterrows():
            print(f"   {row['document_id']:<42s} {row['usage_status']:<22s} {row['evidence'][:56]}")
        if len(flagged) > 20:
            print(f"   ... and {len(flagged) - 20} more (see the report)")
    print()
    print(f"usage report -> {out}")

    # the flagged documents join the review queue
    if len(flagged):
        attention = read_table(NEEDS_ATTENTION_CSV,
                                ["document_id", "medicine_id", "source_id", "relevance_status",
                                 "reviewer_notes", "title", "file_path"])
        known = set(attention["document_id"]) if len(attention) else set()
        new_rows = []
        for _, row in flagged.iterrows():
            if row["document_id"] in known:
                continue
            new_rows.append({
                "document_id": row["document_id"], "medicine_id": row["medicine_id"],
                "source_id": row["source_id"], "relevance_status": row["usage_status"],
                "reviewer_notes": row["evidence"], "title": row["title"],
                "file_path": row["file_path"],
            })
        if new_rows:
            attention = pd.concat([attention, pd.DataFrame(new_rows)], ignore_index=True)
            write_table(NEEDS_ATTENTION_CSV, attention)
            print(f"{len(new_rows)} document(s) added to needs_attention.csv")


def cmd_organize_files(args):
    """Give every corpus file a medicine name (one-time, no deletion)."""
    from src.storage.organize import organize

    summary = organize(dry_run=args.dry_run)
    return 0 if summary else 1


def cmd_report(_args):
    from src.reporting.report import build_coverage_report
    build_coverage_report()


def cmd_status(_args):
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    print(f"medicines   : {len(meds)}")
    if docs.empty:
        print("documents   : 0")
        return
    print(f"documents   : {len(docs)}")
    for status, n in docs["collection_status"].value_counts().items():
        print(f"  {status:<22} {n}")
    for status, n in docs["relevance_status"].value_counts().items():
        print(f"  relevance={status:<15} {n}")
    print("per medicine:")
    for mid, sub in docs.groupby("medicine_id"):
        verified = ((sub["collection_status"] == "collected")
                    & (sub["relevance_status"] == "verified")).sum()
        print(f"  {mid}: {verified} verified / {len(sub)} rows "
              f"({', '.join(sorted(set(sub['source_id'])))}")


# -------------------------------------------------------------------- parser
def build_parser():
    p = argparse.ArgumentParser(prog="pharmeazor")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init").set_defaults(func=cmd_init)

    m = sub.add_parser("import-meds")
    m.add_argument("--csv", nargs="*")
    m.add_argument("--xlsx", nargs="*")
    m.add_argument("--replace", action="store_true",
                   help="replace the medicine table instead of merging into it")
    m.set_defaults(func=cmd_import_meds)

    sub.add_parser("sources").set_defaults(func=cmd_sources)
    sub.add_parser("source-audit").set_defaults(func=cmd_source_audit)
    sub.add_parser("manual-actions").set_defaults(func=cmd_manual_actions)

    b = sub.add_parser("set-brand")
    b.add_argument("--med", required=True)
    b.add_argument("--brand", required=True)
    b.add_argument("--strength", default="")
    b.add_argument("--nomenclature", default="", choices=["", "oui", "non", "a verifier"])
    b.add_argument("--remarks", default="")
    b.set_defaults(func=cmd_set_brand)

    a = sub.add_parser("approve")
    a.add_argument("--source", required=True)
    a.add_argument("--decision", default="permitted", choices=["permitted", "manual", "excluded"])
    a.add_argument("--reviewer", default="team")
    a.add_argument("--notes", default="")
    a.add_argument("--next-review", dest="next_review", default="")
    a.set_defaults(func=cmd_approve)

    c = sub.add_parser("check")
    c.add_argument("--source", required=True)
    c.add_argument("--url", required=True)
    c.add_argument("--reviewer", default="cli")
    c.set_defaults(func=cmd_check)

    r = sub.add_parser("recon")
    r.add_argument("--source", required=True)
    r.add_argument("--url", required=True)
    r.add_argument("--headed", action="store_true")
    r.add_argument("--reviewer", default="cli")
    r.set_defaults(func=cmd_recon)

    d = sub.add_parser("discover")
    d.add_argument("--med")
    d.add_argument("--source")
    d.add_argument("--limit", type=int, default=5)
    d.set_defaults(func=cmd_discover)

    c = sub.add_parser("collect")
    c.add_argument("--med")
    c.add_argument("--source")
    c.add_argument("--limit", type=int, default=4)
    c.add_argument("--refresh", action="store_true")
    c.set_defaults(func=cmd_collect)

    c = sub.add_parser("collect-all")
    c.add_argument("--med")
    c.add_argument("--source")
    c.add_argument("--limit", type=int, default=0, help="only the first N medicines")
    c.add_argument("--per-source", dest="per_source", type=int, default=4)
    c.add_argument("--refresh", action="store_true")
    c.set_defaults(func=cmd_collect_all)

    sub.add_parser("report").set_defaults(func=cmd_report)
    org = sub.add_parser("organize-files")
    org.add_argument("--dry-run", dest="dry_run", action="store_true",
                     help="show the planned moves without touching a file")
    org.set_defaults(func=cmd_organize_files)
    sub.add_parser("verify").set_defaults(func=cmd_verify)
    nt = sub.add_parser("notices")
    nt.add_argument("--med", nargs="*")
    nt.add_argument("--refresh", action="store_true")
    nt.set_defaults(func=cmd_notices)
    sub.add_parser("check-usage").set_defaults(func=cmd_check_usage)
    sub.add_parser("reconcile").set_defaults(func=cmd_reconcile)
    e = sub.add_parser("extract")
    e.add_argument("--med")
    e.add_argument("--limit", type=int, default=0)
    e.add_argument("--structured", action="store_true",
                   help="run the additive document-type-aware extraction stage")
    e.add_argument("--doctype", default="",
                   help="comma-separated smpc,label,notice (structured mode)")
    e.add_argument("--source", default="",
                   help="restrict structured extraction to one source_id")
    e.add_argument("--refresh", action="store_true",
                   help="re-extract documents even when an up-to-date result exists")
    e.add_argument("--no-notices", action="store_true",
                   help="structured mode: skip patient notices")
    e.add_argument("--tables", action="store_true",
                   help="structured mode: capture PDF table structure (slower)")
    e.add_argument("--ocr", choices=("auto", "force", "never"), default="auto",
                   help="structured mode: OCR policy for scanned pages")
    e.add_argument("--ai", action="store_true",
                   help="structured mode: use the configured Gemini fallback")
    e.set_defaults(func=cmd_extract)
    ev = sub.add_parser("extract-eval")
    ev.add_argument("--size", type=int, default=20)
    ev.add_argument("--refresh-sample", action="store_true")
    ev.add_argument("--no-provisional", action="store_true",
                    help="do not generate the provisional reference")
    ev.set_defaults(func=cmd_extract_eval)
    sub.add_parser("export-list").set_defaults(func=cmd_export_list)
    sub.add_parser("extract-brands").set_defaults(func=cmd_extract_brands)
    sub.add_parser("resolve-names").set_defaults(func=cmd_resolve_names)

    n = sub.add_parser("names")
    n.add_argument("--med")
    n.add_argument("--algerian", action="store_true")
    n.add_argument("--limit", type=int, default=30)
    n.set_defaults(func=cmd_names)

    nom = sub.add_parser("import-nomenclature")
    nom.add_argument(
        "--file",
        required=True,
        help="official nomenclature workbook downloaded by hand",
    )
    nom.set_defaults(func=cmd_import_nomenclature)
    sub.add_parser("revalidate").set_defaults(func=cmd_revalidate)
    sub.add_parser("status").set_defaults(func=cmd_status)

    a = sub.add_parser("audit")
    a.add_argument("--last", type=int, default=0)
    a.add_argument("--errors", action="store_true")
    a.set_defaults(func=cmd_audit)
    return p


if __name__ == "__main__":
    args = build_parser().parse_args()
    sys.exit(args.func(args) or 0)
