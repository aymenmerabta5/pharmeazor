"""Audit trail, medicine-list merging and INN synonym tests."""
import json

import pandas as pd

from src.medicines.loader import build_rows, inn_variant_terms, split_dci
from src.utils.audit import read_attempts, summarise
from src.utils.inn_synonyms import synonyms_for
from src.utils.text import component_forms, dci_components, normalize
from src.validation.validate import check_medicine_relevance


class TestAuditTrail:
    def test_every_attempt_is_recorded_with_the_required_fields(self, tmp_path, monkeypatch):
        from src.utils import audit

        path = tmp_path / "attempts.jsonl"
        monkeypatch.setattr(audit, "AUDIT_PATH", path)
        audit.log_attempt(medicine_id="MED031", source_id="DAILYMED",
                          target_url="https://dailymed.nlm.nih.gov/x.pdf",
                          method="requests", status="collected:verified",
                          file_path="data/raw/MED031/x.pdf", sha256="abc123",
                          file_size=1234, content_type="application/pdf",
                          check_id="CHK00001", decision="AUTOMATED",
                          reason="identity confirmed", duration_ms=1200, error="")
        attempts = read_attempts(path)
        assert len(attempts) == 1
        record = attempts[0]
        for field in ("timestamp", "medicine_id", "source_id", "target_url",
                      "method", "status", "file_path", "sha256", "error"):
            assert field in record
        assert record["sha256"] == "abc123"

    def test_summary_counts_by_status(self, tmp_path, monkeypatch):
        from src.utils import audit

        path = tmp_path / "attempts.jsonl"
        monkeypatch.setattr(audit, "AUDIT_PATH", path)
        audit.log_attempt(medicine_id="MED031", source_id="DAILYMED", status="gate")
        audit.log_attempt(medicine_id="MED031", source_id="DAILYMED", status="gate")
        audit.log_attempt(medicine_id="MED032", source_id="BDPM_FR", status="collected:verified")
        summary = summarise(read_attempts(path))
        assert summary["attempts"] == 3
        assert summary["by_status"]["gate"] == 2
        assert summary["by_medicine"]["MED031"] == 2


class TestCompositeDci:
    def test_split_combination(self):
        assert split_dci("paracétamol + codéine") == ["paracétamol", "codéine"]

    def test_split_parenthesised(self):
        assert split_dci("cotrimoxazole (sulfaméthoxazole + triméthoprime)") == [
            "cotrimoxazole", "sulfaméthoxazole", "triméthoprime"]

    def test_components_of_a_medicine_record(self):
        med = {"inn": "amoxicilline + acide clavulanique",
               "dci_components": "amoxicilline|acide clavulanique"}
        assert dci_components(med) == ["amoxicilline", "acide clavulanique"]

    def test_variants_start_with_the_base_dci(self):
        terms = inn_variant_terms("amoxicilline + acide clavulanique")
        assert terms[0] == "amoxicilline"
        assert "acide clavulanique" in terms


class TestInnSynonyms:
    def test_french_and_english_inn(self):
        assert "acetaminophen" in synonyms_for("paracétamol")
        assert "ibuprofen" in synonyms_for("ibuprofène")

    def test_component_forms_include_salts_and_synonyms(self):
        forms = component_forms("enalapril")
        assert "enalapril" in forms
        assert "enalapril maleate" in forms
        assert "acetaminophen" in component_forms("paracétamol")


class TestComponentAwareValidation:
    def test_combination_needs_every_substance(self):
        status, note = check_medicine_relevance(
            "ACETAMINOPHEN 500 mg - CODEINE PHOSPHATE 30 mg",
            {"inn": "paracétamol + codéine",
             "dci_components": "paracétamol|codéine"},
        )
        assert status == "verified"

    def test_single_substance_label_is_only_a_review(self):
        status, note = check_medicine_relevance(
            "ACETAMINOPHEN 500 mg tablets",
            {"inn": "paracétamol + codéine",
             "dci_components": "paracétamol|codéine"},
        )
        assert status == "needs_review"
        assert "cod" in note.lower()

    def test_english_label_is_accepted_for_a_french_dci(self):
        status, note = check_medicine_relevance(
            "ACETAMINOPHEN TABLETS 500 mg",
            {"inn": "paracétamol", "dci_components": "paracétamol"},
        )
        assert status == "verified"
        assert "acetaminophen" in note.lower()


class TestRequiredComponents:
    def test_parenthesised_substances_are_required(self):
        from src.utils.text import dci_required_components

        med = {"inn": "cotrimoxazole (sulfaméthoxazole + triméthoprime)",
               "dci_components": "cotrimoxazole|sulfaméthoxazole|triméthoprime"}
        assert dci_required_components(med) == ["sulfaméthoxazole", "triméthoprime"]

    def test_plain_combination_requires_every_substance(self):
        from src.utils.text import dci_required_components

        med = {"inn": "paracétamol + codéine",
               "dci_components": "paracétamol|codéine"}
        assert dci_required_components(med) == ["paracétamol", "codéine"]

    def test_single_substance(self):
        from src.utils.text import dci_required_components

        assert dci_required_components({"inn": "énalapril"}) == ["énalapril"]


class TestDocumentMetadata:
    def test_title_is_taken_from_the_first_meaningful_line(self, tmp_path):
        from src.validation.validate import document_title

        path = tmp_path / "doc.pdf"
        path.write_bytes(b"%PDF-1.7")
        title = document_title(path, "\n\n  RESUME DES CARACTERISTIQUES DU PRODUIT\nENALAPRIL\n")
        assert title.startswith("RESUME DES CARACTERISTIQUES")

    def test_holder_is_read_from_the_anpp_rcp_path(self):
        from src.discovery.anpp import _holder_from_url

        url = "https://rcp.anpp.dz/storage/rcp-pdfs/biopharm-spa/abc-123.pdf"
        assert _holder_from_url(url) == "biopharm spa"
        assert _holder_from_url("https://example.org/x.pdf") == ""


class TestImportMerge:
    def test_merge_keeps_manual_fields(self, tmp_path):
        from src.medicines.loader import import_files
        from config import MEDICINE_COLUMNS
        from src.storage.store import write_table

        csv_path = tmp_path / "list.csv"
        csv_path.write_text("Numéro,Catégorie,Médicament,Code ATC\n"
                            "31,Antihypertenseurs,énalapril,C09AA02\n", encoding="utf-8")
        target = tmp_path / "medicines.csv"

        existing = pd.DataFrame([{
            "medicine_id": "MED031", "name": "énalapril", "inn": "énalapril",
            "inn_variants": "", "dci_components": "", "brand_name": "Renitec",
            "strength_form": "25 mg", "atc": "C09AA02", "class": "Antihypertenseurs",
            "list_number": "31", "source_file": "list.csv",
            "in_algerian_nomenclature": "oui", "remarks": "",
        }], columns=MEDICINE_COLUMNS)
        write_table(target, existing)

        import_files([csv_path], destination=target, merge=True)
        merged = pd.read_csv(target, dtype=str, keep_default_na=False)
        assert len(merged) == 1
        assert merged.iloc[0]["brand_name"] == "Renitec"
        assert merged.iloc[0]["in_algerian_nomenclature"] == "oui"

    def test_replace_mode_overwrites(self, tmp_path):
        from src.medicines.loader import import_files
        from config import MEDICINE_COLUMNS
        from src.storage.store import write_table

        csv_path = tmp_path / "list.csv"
        csv_path.write_text("Numéro,Catégorie,Médicament,Code ATC\n"
                            "1,Antalgiques,paracétamol,N02BE01\n", encoding="utf-8")
        target = tmp_path / "medicines.csv"
        existing = pd.DataFrame([{"medicine_id": "MED031", "name": "énalapril",
                                  "inn": "énalapril", "inn_variants": "",
                                  "dci_components": "", "brand_name": "Renitec",
                                  "strength_form": "", "atc": "", "class": "",
                                  "list_number": "31", "source_file": "",
                                  "in_algerian_nomenclature": "", "remarks": ""}],
                                columns=MEDICINE_COLUMNS)
        write_table(target, existing)
        import_files([csv_path], destination=target, merge=False)
        merged = pd.read_csv(target, dtype=str, keep_default_na=False)
        assert list(merged["medicine_id"]) == ["MED001"]
