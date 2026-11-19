"""Patient-notice tests: extraction, discrimination and matching."""
import pytest

from src.notice.extractors import extract_notice, is_patient_notice
from src.notice.matcher import (
    COMBINATION_MATCH, EXACT_MATCH, PARTIAL_MATCH, UNVERIFIED, classify,
)

NOTICE_HTML = """
<html><head></head><body>
<p>Résumé des Caractéristiques du Produit</p>
<p>DCI : paracétamol</p>
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0//FR">
<HTML><HEAD>
<META name="organization" content="ANSM">
<META name="description" content="Notice patient">
<TITLE>Notice patient</TITLE>
</HEAD><BODY>
<p>Titre : Dénomination du médicament : DOLIPRANE 500 mg, comprimé</p>
<p>Qu'est-ce que ce médicament ? Un antalgique.</p>
<p>Comment prendre ce médicament ? Suivez la posologie du RCP.</p>
<p>Titulaire de l'autorisation de mise sur le marché LABORATOIRES XYZ 12 RUE DU TEST 75000 PARIS</p>
<p>ANSM - Mis à jour le : 13/11/2023</p>
</BODY></HTML>
</body></html>
"""

RCP_HTML = """
<html><body><p>Résumé des Caractéristiques du Produit</p>
<p>1. DENOMINATION DU MEDICAMENT : DOLIPRANE 500 mg, comprimé</p>
<p>4.1. Indications thérapeutiques : douleurs</p></body></html>
"""


class TestNoticeDetection:
    def test_a_notice_is_recognised(self):
        text = ("Notice patient Qu'est-ce que ce médicament ? Comment prendre "
                "ce médicament ? Titulaire de l'autorisation de mise sur le marché X")
        assert is_patient_notice(text)

    def test_an_rcp_is_not_a_notice(self):
        text = ("Résumé des caractéristiques du produit 1. DENOMINATION DU "
                "MEDICAMENT 4.1. Indications thérapeutiques")
        assert not is_patient_notice(text)

    def test_the_page_title_alone_is_not_enough(self):
        assert not is_patient_notice("Notice patient")


class TestHtmlExtraction:
    @pytest.fixture(scope="class")
    def extracted(self, tmp_path_factory):
        path = tmp_path_factory.mktemp("notice") / "page.html"
        path.write_text(NOTICE_HTML, encoding="utf-8")
        return extract_notice(path)

    def test_the_notice_is_extracted(self, extracted):
        assert extracted
        assert "Qu'est-ce que ce médicament" in extracted["text"]
        assert "Résumé des Caractéristiques" not in extracted["text"]

    def test_the_metadata_is_read(self, extracted):
        assert extracted["revision_date"] == "2023-11-13"
        assert extracted["holder"].startswith("LABORATOIRES XYZ")
        assert extracted["language"] == "fr"

    def test_a_page_without_a_notice_yields_nothing(self, tmp_path):
        path = tmp_path / "rcp.html"
        path.write_text(RCP_HTML, encoding="utf-8")
        assert extract_notice(path) == {}


class TestMatching:
    medicine = {"inn": "paracétamol", "dci_components": "paracétamol"}
    notice = ("Dénomination du médicament : DOLIPRANE 500 mg, comprimé "
              "Qu'est-ce que ce médicament ? paracétamol")

    def test_exact_match(self):
        expected = [{"brand_name": "DOLIPRANE 500 mg, comprimé", "strength": "500 mg",
                     "form": "comprimé"}]
        verdict = classify(self.notice, self.medicine, expected)
        assert verdict["status"] == EXACT_MATCH

    def test_partial_match_when_the_brand_differs(self):
        expected = [{"brand_name": "DAFALGAN 500 mg", "strength": "500 mg",
                     "form": "comprimé"}]
        verdict = classify(self.notice, self.medicine, expected)
        assert verdict["status"] == PARTIAL_MATCH
        assert "brand" in verdict["evidence"]["reason"]

    def test_combination_match(self):
        # the record is a single substance, the notice adds another one
        medicine = {"inn": "nifédipine", "dci_components": "nifédipine"}
        notice = ("Dénomination du médicament : ATENOLOL/NIFEDIPINE BIOGARAN 50 mg/20 mg, "
                  "gélule Qu'est-ce que ce médicament ? aténolol nifédipine")
        verdict = classify(notice, medicine, [{"brand_name": "X", "strength": "", "form": ""}])
        assert verdict["status"] == COMBINATION_MATCH

    def test_unverified_when_the_substance_is_absent(self):
        notice = "Dénomination du médicament : IBUPROFENE 400 mg, comprimé"
        verdict = classify(notice, self.medicine, [{"brand_name": "X", "strength": "",
                                                   "form": ""}])
        assert verdict["status"] == UNVERIFIED

    def test_a_missing_strength_is_partial(self):
        expected = [{"brand_name": "DOLIPRANE", "strength": "1 g", "form": "comprimé"}]
        verdict = classify(self.notice, self.medicine, expected)
        assert verdict["status"] == PARTIAL_MATCH
        assert "strength" in verdict["evidence"]["reason"]


class TestBrandCore:
    def test_the_dose_and_the_form_are_dropped(self):
        from src.notice.matcher import _brand_core

        assert _brand_core("NIFEDIPINE ARROW L.P. 30 mg, comprimé").startswith("NIFEDIPINE ARROW")
        assert _brand_core("DOLIPRANE") == "DOLIPRANE"
        assert _brand_core("") == ""
