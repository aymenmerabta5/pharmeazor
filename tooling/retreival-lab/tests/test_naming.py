"""Human-readable corpus names: deterministic, medicine-first, traceable."""
from src.storage.naming import (
    doc_token, document_filename, free_path, label_from_values, medicine_slug,
    notice_filename, shared_product_filename, shared_register_path, slugify,
)


class TestSlugs:
    def test_accents_and_separators_are_folded(self):
        assert slugify("Kétoprofène + codéine") == "ketoprofene-codeine"
        assert slugify("  ACIDE  ACÉTYLSALICYLIQUE  ") == "acide-acetylsalicylique"

    def test_medicine_slug_uses_the_name(self):
        assert medicine_slug({"medicine_id": "MED011", "name": "Kétoprofène + codéine"}) \
            == "ketoprofene-codeine"
        assert medicine_slug({"medicine_id": "MED001", "name": "paracétamol"}) == "paracetamol"

    def test_doc_token_keeps_the_identifier(self):
        assert doc_token("MED001__SRC_DAILYMED__DOC002") == "doc002"
        assert doc_token("MED001__SRC_BDPM_FR__DOC002__NOTICE") == "doc002"
        assert doc_token("MED001__SRC_BEKER__NOTICE_001") == "notice001"


class TestFileNames:
    def test_document_name_starts_with_the_medicine(self):
        name = document_filename(
            {"name": "paracétamol"}, "DAILYMED",
            "MED001__SRC_DAILYMED__DOC002", "AC FAST", ".pdf")
        assert name == "paracetamol__dailymed__doc002__ac-fast.pdf"
        assert "med001" not in name.lower()

    def test_generic_title_falls_back_to_the_holder(self):
        label = label_from_values("", "ANNEXE I", "biopharm spa")
        assert label == "biopharm spa"
        name = document_filename(
            {"name": "énalapril"}, "ANPP_RCP",
            "MED031__SRC_ANPP_RCP__DOC001", label, ".pdf")
        assert name == "enalapril__anpp-rcp__doc001__biopharm-spa.pdf"

    def test_product_title_is_kept(self):
        label = label_from_values("", "ATENOLOL/NIFEDIPINE BIOGARAN 50 mg/20 mg", "")
        assert label.startswith("ATENOLOL/NIFEDIPINE")

    def test_notice_name(self):
        assert notice_filename(
            {"name": "paracétamol"}, "BDPM_FR",
            "MED001__SRC_BDPM_FR__DOC002__NOTICE") \
            == "paracetamol__bdpm-fr__doc002__notice.txt"
        assert notice_filename(
            {"name": "paracétamol"}, "BEKER",
            "MED001__SRC_BEKER__NOTICE_001", ".pdf") \
            == "paracetamol__beker__notice001.pdf"

    def test_shared_product_lists_every_owner(self):
        name = shared_product_filename(
            [{"name": "losartan"}, {"name": "losartan + hydrochlorothiazide"}],
            "DAILYMED", "MED032__SRC_DAILYMED__DOC002", "LOTREL", ".pdf")
        assert name.startswith("losartan+losartan-hydrochlorothiazide__dailymed__doc002")

    def test_shared_register_is_not_patient_specific(self):
        path = shared_register_path(
            "SANTE_MSP", "Nomenclature nationale des produits pharmaceutiques - paracétamol",
            ".xlsx")
        assert path.parent.name == "_shared"
        assert path.name == \
            "sante-msp__nomenclature-nationale-des-produits-pharmaceutiques.xlsx"


class TestNoOverwrite:
    def test_free_path_keeps_the_existing_file(self, tmp_path):
        original = tmp_path / "paracetamol__dailymed__doc001.pdf"
        original.write_bytes(b"first")
        second = free_path(original)
        assert second.name == "paracetamol__dailymed__doc001__2.pdf"
        second.write_bytes(b"second")
        assert original.read_bytes() == b"first"
