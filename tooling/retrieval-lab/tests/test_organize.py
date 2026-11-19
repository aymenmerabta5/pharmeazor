"""The file migration: medicine names, shared files, manifest, idempotency."""
import pandas as pd

from config import DOCUMENT_COLUMNS, MEDICINE_COLUMNS
from src.storage import organize
from src.storage.store import read_table, write_table


def _prepare(tmp_path, monkeypatch):
    data = tmp_path / "data"
    raw = data / "raw"
    quarantine = data / "quarantine"
    meta = data / "metadata"
    reports = data / "reports"
    for directory in (raw, quarantine, meta, reports):
        directory.mkdir(parents=True)

    meds_csv = data / "input" / "medicines.csv"
    docs_csv = meta / "documents.csv"
    manifest_csv = meta / "file_renames.csv"

    for name, value in {
        "ROOT": tmp_path,
        "RAW_DIR": raw,
        "QUARANTINE_DIR": quarantine,
        "META_DIR": meta,
        "REPORTS_DIR": reports,
        "MEDICINES_CSV": meds_csv,
        "DOCUMENTS_CSV": docs_csv,
        "FILE_RENAMES_CSV": manifest_csv,
    }.items():
        monkeypatch.setattr(organize, name, value)
    monkeypatch.setattr(organize.naming, "RAW_DIR", raw)
    monkeypatch.setattr(organize.naming, "QUARANTINE_DIR", quarantine)

    meds = pd.DataFrame([
        {"medicine_id": "MED001", "name": "paracétamol", "inn": "paracétamol"},
        {"medicine_id": "MED002", "name": "ibuprofène", "inn": "ibuprofène"},
    ])[MEDICINE_COLUMNS[:3]]
    write_table(meds_csv, meds)

    old_doc = raw / "MED001" / "MED001__SRC_DAILYMED__DOC001.pdf"
    old_doc.parent.mkdir(parents=True)
    old_doc.write_bytes(b"%PDF-1.7\nfirst")
    old_html = raw / "MED002" / "MED002__SRC_BDPM_FR__DOC001.html"
    old_html.parent.mkdir(parents=True)
    old_html.write_text("<html>ibuprofene</html>", encoding="utf-8")
    old_register = raw / "SANTE_MSP" / "nomenclature_algerienne.xlsx"
    old_register.parent.mkdir(parents=True)
    old_register.write_bytes(b"nomenclature")
    old_notice = raw / "MED001" / "notices" / "MED001__SRC_BDPM_FR__DOC001__NOTICE.txt"
    old_notice.parent.mkdir(parents=True)
    old_notice.write_text("NOTICE PARACETAMOL", encoding="utf-8")
    (meta / "coverage_report.csv").write_text("medicine_id,coverage_ok\nMED001,yes\n",
                                               encoding="utf-8")

    docs = pd.DataFrame([
        {"document_id": "MED001__SRC_DAILYMED__DOC001", "medicine_id": "MED001",
         "source_id": "DAILYMED", "title": "AC FAST", "document_type": "label",
         "file_path": "data/raw/MED001/MED001__SRC_DAILYMED__DOC001.pdf",
         "collection_status": "collected", "relevance_status": "verified"},
        {"document_id": "MED002__SRC_BDPM_FR__DOC001", "medicine_id": "MED002",
         "source_id": "BDPM_FR", "title": "IBUPROFENE ALMUS 200 mg",
         "document_type": "smpc",
         "file_path": "data/raw/MED002/MED002__SRC_BDPM_FR__DOC001.html",
         "collection_status": "collected", "relevance_status": "verified"},
        {"document_id": "MED001__SRC_SANTE_MSP__DOC001", "medicine_id": "MED001",
         "source_id": "SANTE_MSP",
         "title": "Nomenclature nationale des produits pharmaceutiques - paracétamol",
         "document_type": "nomenclature",
         "file_path": "data/raw/SANTE_MSP/nomenclature_algerienne.xlsx",
         "collection_status": "collected", "relevance_status": "verified"},
        {"document_id": "MED002__SRC_SANTE_MSP__DOC001", "medicine_id": "MED002",
         "source_id": "SANTE_MSP",
         "title": "Nomenclature nationale des produits pharmaceutiques - ibuprofène",
         "document_type": "nomenclature",
         "file_path": "data/raw/SANTE_MSP/nomenclature_algerienne.xlsx",
         "collection_status": "collected", "relevance_status": "verified"},
    ])
    write_table(docs_csv, docs)

    notices = pd.DataFrame([{
        "document_id": "MED001__SRC_BDPM_FR__DOC001__NOTICE",
        "medication_id": "MED001", "source_id": "BDPM_FR",
        "original_filename": "MED001__SRC_BDPM_FR__DOC001.html",
        "local_file_path": "data/raw/MED001/notices/MED001__SRC_BDPM_FR__DOC001__NOTICE.txt",
        "original_file_path": "data/raw/MED001/MED001__SRC_DAILYMED__DOC001.pdf",
    }])
    write_table(meta / "notices.csv", notices)
    return raw, quarantine, meta, reports, docs_csv, manifest_csv


def test_migration_renames_and_keeps_provenance(tmp_path, monkeypatch):
    raw, quarantine, meta, reports, docs_csv, manifest_csv = _prepare(tmp_path, monkeypatch)

    summary = organize.organize(dry_run=False)

    assert summary["moves"] == 5
    assert (raw / "paracetamol" / "paracetamol__dailymed__doc001__ac-fast.pdf").exists()
    assert (raw / "ibuprofene" /
            "ibuprofene__bdpm-fr__doc001__ibuprofene-almus-200-mg.html").exists()
    assert (raw / "_shared" /
            "sante-msp__nomenclature-nationale-des-produits-pharmaceutiques.xlsx").exists()
    assert (raw / "paracetamol" / "notices" /
            "paracetamol__bdpm-fr__doc001__notice.txt").exists()
    assert (reports / "coverage_report.csv").exists()
    assert not (raw / "MED001").exists()
    assert not (raw / "SANTE_MSP").exists()

    docs = read_table(docs_csv, DOCUMENT_COLUMNS)
    paths = dict(zip(docs["document_id"], docs["file_path"]))
    assert paths["MED001__SRC_DAILYMED__DOC001"] == \
        "data/raw/paracetamol/paracetamol__dailymed__doc001__ac-fast.pdf"
    assert paths["MED002__SRC_BDPM_FR__DOC001"] == \
        "data/raw/ibuprofene/ibuprofene__bdpm-fr__doc001__ibuprofene-almus-200-mg.html"
    assert paths["MED001__SRC_SANTE_MSP__DOC001"] == \
        "data/raw/_shared/sante-msp__nomenclature-nationale-des-produits-pharmaceutiques.xlsx"

    notices = pd.read_csv(meta / "notices.csv", dtype=str, keep_default_na=False)
    assert notices.loc[0, "local_file_path"] == \
        "data/raw/paracetamol/notices/paracetamol__bdpm-fr__doc001__notice.txt"
    assert notices.loc[0, "original_file_path"] == \
        "data/raw/paracetamol/paracetamol__dailymed__doc001__ac-fast.pdf"
    assert notices.loc[0, "original_filename"] == "MED001__SRC_BDPM_FR__DOC001.html"

    manifest = pd.read_csv(manifest_csv, dtype=str, keep_default_na=False)
    assert len(manifest) == 5
    assert set(manifest["kind"]) == {"document", "register", "notice", "report"}
    assert (manifest["sha256"] != "").sum() == 5


def test_migration_is_idempotent(tmp_path, monkeypatch):
    _, _, _, _, _, manifest_csv = _prepare(tmp_path, monkeypatch)

    organize.organize(dry_run=False)
    first = pd.read_csv(manifest_csv, dtype=str, keep_default_na=False)

    second_summary = organize.organize(dry_run=False)
    second = pd.read_csv(manifest_csv, dtype=str, keep_default_na=False)

    assert second_summary["moves"] == 0
    assert len(second) == len(first)
