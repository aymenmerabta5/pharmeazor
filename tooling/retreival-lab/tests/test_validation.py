"""Text normalisation, identity validation and file integrity tests."""
from pathlib import Path

import pytest

from src.utils.text import (
    contains_token, inn_variants, match_terms, normalize, strength_variants,
)
from src.validation.validate import (
    check_medicine_relevance, extension_for, verify_file_integrity,
)


class TestNormalisation:
    def test_accents_are_removed(self):
        assert normalize("énalapril") == "enalapril"
        assert normalize("méthyldopa") == "methyldopa"

    def test_token_boundaries(self):
        assert contains_token("paracetamol 500 mg comprimé", "paracétamol")
        assert not contains_token("paraffine liquide", "paracetamol")

    def test_inn_variants_start_with_the_bare_dci(self):
        variants = inn_variants("énalapril")
        assert variants[0] == "enalapril"
        assert any(v.startswith("enalapril ") for v in variants)

    def test_strength_variants(self):
        assert "500 mg" in strength_variants("500 mg")
        assert "500mg" in strength_variants("500 mg")

    def test_match_terms_contains_name_and_inn(self):
        terms = [t.lower() for t in match_terms({"inn": "losartan", "name": "Cozaar"})]
        assert any("losartan" in t for t in terms)
        assert any("cozaar" in t for t in terms)


class TestRelevance:
    def test_verified_when_dci_present(self):
        status, note = check_medicine_relevance(
            "ENALAPRIL MALEATE 20 mg comprimé - RCP - France",
            {"inn": "énalapril", "name": "énalapril"},
        )
        assert status == "verified"

    def test_rejected_when_no_identity_term(self):
        status, note = check_medicine_relevance(
            "PARACETAMOL 500 mg comprimé", {"inn": "énalapril", "name": "énalapril"})
        assert status == "rejected"

    def test_needs_review_when_brand_missing(self):
        status, note = check_medicine_relevance(
            "ENALAPRIL 20 mg", {"inn": "énalapril", "brand_name": "Renitec"})
        assert status == "needs_review"
        assert "brand" in note.lower()

    def test_not_checked_without_text(self):
        assert check_medicine_relevance("", {"inn": "énalapril"})[0] == "not_checked"

    def test_foreign_leaflet_cannot_pass_as_algerian(self):
        status, note = check_medicine_relevance(
            "ENALAPRIL 20 mg - United States - FDA label",
            {"inn": "énalapril", "country": "DZ"},
        )
        assert status == "needs_review"
        assert "alger" in note.lower() or "DZ" in note

    def test_foreign_jurisdiction_is_only_a_hint(self):
        status, note = check_medicine_relevance(
            "ENALAPRIL 20 mg comprimé", {"inn": "énalapril", "country": "FR"})
        assert status == "verified"

    def test_the_medicine_brand_is_not_required_in_a_foreign_document(self):
        # the caller only passes what the document itself declares
        from src.collectors.pipeline import _expected_identity
        from src.discovery.base import Candidate

        medicine = {"inn": "losartan", "name": "losartan", "brand_name": "LAZARTAN"}
        candidate = Candidate(url="https://x/y.pdf", brand_name="LOSARTAN POTASSIUM TABLET")
        expected = _expected_identity(medicine, candidate)
        assert expected["brand_name"] == "LOSARTAN POTASSIUM TABLET"
        assert expected["strength"] == ""

        status, note = check_medicine_relevance(
            "LOSARTAN POTASSIUM TABLET 50 mg", expected)
        assert status == "verified"

    def test_a_brand_declared_by_the_document_is_checked(self):
        status, note = check_medicine_relevance(
            "PARACETAMOL 500 mg comprimé",
            {"inn": "paracétamol", "brand_name": "DOLIPRANE",
             "dci_components": "paracétamol"})
        assert status == "needs_review"
        assert "brand" in note.lower()

    def test_a_long_brand_is_not_treated_as_a_brand(self):
        status, note = check_medicine_relevance(
            "ACETAMINOPHEN TABLET 500 mg",
            {"inn": "paracétamol", "brand_name": "ACETAMINOPHEN TABLET FILM COATED 500 MG",
             "dci_components": "paracétamol"})
        assert status == "verified"


class TestRcpHeader:
    def test_commercial_name_strength_and_form(self):
        from src.medicines.rcp import parse_rcp_header

        text = (
            "1- Dénomination du médicament :\n"
            "1-1 Dénomination commerciale, dosage et forme pharmaceutique :\n"
            "CIPROFLOXACINE BEKER®\n"
            "750 mg\n"
            "Comprimé pelliculé\n"
            "1-2 Dénomination commune internationale (DCI) :\n"
            "Ciprofloxacine.\n"
        )
        header = parse_rcp_header(text)
        assert header["commercial_name"] == "CIPROFLOXACINE BEKER"
        assert header["strength"] == "750 mg"
        assert header["form"] == "Comprimé"
        assert header["declared_dci"] == "Ciprofloxacine"

    def test_brand_with_dosage_is_trimmed(self):
        from src.medicines.rcp import parse_rcp_header

        text = ("Dénomination commerciale, dosage et forme pharmaceutique\n"
                "DOLIPRANE 2.4 POUR CENT SANS SUCRE, SUSPENSION BUVABLE\n")
        header = parse_rcp_header(text)
        assert header["commercial_name"].startswith("DOLIPRANE")
        assert "SUSPENSION" not in header["commercial_name"]


class TestFileIntegrity:
    def test_pdf_signature_is_required(self, tmp_path):
        fake = tmp_path / "doc.pdf"
        fake.write_bytes(b"<html>not a pdf</html>")
        ok, issue = verify_file_integrity(fake, {"content_type": "application/pdf"})
        assert not ok
        assert "%PDF-" in issue

    def test_real_pdf_passes(self, tmp_path):
        real = tmp_path / "doc.pdf"
        real.write_bytes(b"%PDF-1.7\n%fake")
        ok, issue = verify_file_integrity(real, {"content_type": "application/pdf"})
        assert ok and issue == ""

    def test_html_error_page_is_detected_for_text_files(self, tmp_path):
        fake = tmp_path / "doc.txt"
        fake.write_bytes(b"<!DOCTYPE html><html>404</html>")
        ok, issue = verify_file_integrity(fake, {"content_type": "text/html"})
        assert not ok

    def test_extension_comes_from_content_type(self):
        assert extension_for({"content_type": "application/pdf"}) == "pdf"
        assert extension_for({"content_type": "text/plain; charset=utf-8"}) == "txt"
        assert extension_for({"content_type": "application/octet-stream"},
                             "https://x/y.pdf") == "pdf"


class TestQuarantine:
    """Quarantining must be repeatable: a re-run never renames a document."""

    def test_a_file_already_quarantined_keeps_its_name(self, tmp_path, monkeypatch):
        quarantine = tmp_path / "quarantine"
        quarantine.mkdir()
        monkeypatch.setattr("src.validation.validate.QUARANTINE_DIR", quarantine)

        from src.validation.validate import quarantine_file

        source = tmp_path / "doc.pdf"
        source.write_bytes(b"%PDF-1.7\n%fake")

        first = quarantine_file(source, "veterinary product")
        assert first.parent == quarantine
        second = quarantine_file(first, "veterinary product")
        assert second == first
        assert [p.name for p in quarantine.iterdir()] == ["doc.pdf"]

    def test_a_name_clash_gets_a_stable_suffix(self, tmp_path, monkeypatch):
        quarantine = tmp_path / "quarantine"
        quarantine.mkdir()
        monkeypatch.setattr("src.validation.validate.QUARANTINE_DIR", quarantine)

        from src.validation.validate import quarantine_file

        kept = quarantine / "doc.pdf"
        kept.write_bytes(b"%PDF-1.7\n%other")
        source = tmp_path / "doc.pdf"
        source.write_bytes(b"%PDF-1.7\n%fake")

        moved = quarantine_file(source, "veterinary product")
        assert moved.parent == quarantine
        assert moved != kept
        assert kept.exists()
