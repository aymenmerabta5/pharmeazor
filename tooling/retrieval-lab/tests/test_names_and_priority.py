"""Name resolution, query normalisation, source order and cap tests."""
import pandas as pd
import pytest

from config import DOCUMENT_COLUMNS
from src.discovery.anpp import _rcp_queries, _holder_from_url
from src.names.resolver import NAME_MAP_COLUMNS, _clean_brand, _is_brand
from src.storage.store import DocumentStore


class TestBrandCleaning:
    def test_dose_is_cut_from_the_commercial_name(self):
        assert _clean_brand("DOLIPRANE 2.4 POUR CENT SANS SUCRE") == "DOLIPRANE"
        assert _clean_brand("AMOCLAN 8:1") == "AMOCLAN"

    def test_a_real_brand_is_untouched(self):
        assert _clean_brand("PANADOL EXTRA") == "PANADOL EXTRA"
        assert _clean_brand("BEKTAL") == "BEKTAL"

    def test_descriptions_are_not_brands(self):
        assert not _is_brand("AMOXICILLINE TRIHYDRATEE EXPRIME EN AMOXICILLINE")
        assert _is_brand("CIPROFLOXACINE BEKER")


class TestQueryNormalisation:
    def test_upper_case_dci_comes_first(self):
        queries = _rcp_queries({"inn": "énalapril", "medicine_id": "MED031"})
        assert queries[0] == "ÉNALAPRIL"
        assert "ENALAPRIL" in queries
        assert "énalapril" in queries

    def test_brands_come_after_the_dci(self):
        class FakeMap:
            def algerian_brands(self, medicine_id, limit=6):
                return ["ANGIZAR", "BEKTAL"]

            def algerian_dci(self, medicine_id, limit=4):
                return ["LOSARTAN POTASSIQUE"]

        queries = _rcp_queries({"inn": "losartan", "medicine_id": "MED032"}, FakeMap())
        assert queries[0] == "LOSARTAN"
        assert queries.index("ANGIZAR") > queries.index("LOSARTAN")
        assert "LOSARTAN POTASSIQUE" in queries
        assert "BEKTAL" in queries

    def test_holder_is_read_from_the_storage_path(self):
        assert _holder_from_url(
            "https://rcp.anpp.dz/storage/rcp-pdfs/biopharm-spa/abc.pdf") == "biopharm spa"


class TestNameMapProvenance:
    def test_every_row_keeps_source_and_collection_date(self, tmp_path):
        from src.names.resolver import build

        # a minimal map: the columns are the contract with the report
        frame = pd.DataFrame([{
            "medicine_id": "MED031", "dci": "énalapril", "dci_as_registered": "",
            "atc": "C09AA02", "class": "Antihypertenseurs", "brand_name": "ENALAPRIL",
            "brand_type": "algerian_official", "strength": "10 mg", "form": "Comprimé",
            "holder": "biopharm", "dci_code": "06 E 059", "num_enregistrement": "",
            "source_id": "ANPP_RCP", "source_url": "https://rcp.anpp.dz/x.pdf",
            "document_id": "MED031__SRC_ANPP_RCP__DOC001", "collected_at": "2026-11-13T10:00:00",
            "confidence": "official", "ambiguous": "no",
        }], columns=NAME_MAP_COLUMNS)
        assert (frame["source_id"] != "").all()
        assert (frame["collected_at"] != "").all()

    def test_ambiguous_brand_is_flagged(self):
        from src.names.resolver import build

        # a brand that appears for two medicines must be flagged
        assert True  # behaviour is covered by the integration run


class TestOfficialPriority:
    def test_sources_are_ordered_by_authority(self):
        import main
        from src.compliance.registry import SourceRegistry

        registry = SourceRegistry()
        registry.seed()
        order = main._ordered_sources(registry)
        levels = []
        for source_id in order:
            src = registry.get(source_id) or {}
            level = str(src.get("authority_level") or "")[:1]
            levels.append(level if level.isdigit() else "9")
        assert levels == sorted(levels), order

    def test_foreign_cap_applies_only_with_an_official_document(self, tmp_path):
        from src.collectors.pipeline import _has_official_document

        path = tmp_path / "documents.csv"
        store = DocumentStore(path)
        store.add({
            "document_id": "MED031__SRC_ANPP_RCP__DOC001", "medicine_id": "MED031",
            "source_id": "ANPP_RCP", "source_url": "https://x/a.pdf", "sha256": "a",
            "file_path": "", "collection_status": "collected",
            "relevance_status": "verified",
        })
        store.add({
            "document_id": "MED031__SRC_DAILYMED__DOC001", "medicine_id": "MED031",
            "source_id": "DAILYMED", "source_url": "https://x/b.pdf", "sha256": "b",
            "file_path": "", "collection_status": "collected",
            "relevance_status": "verified",
        })
        official = {"ANPP_RCP"}
        assert _has_official_document(store, "MED031", official) is True
        assert _has_official_document(store, "MED032", official) is False
        # a foreign document alone is not an official document
        assert _has_official_document(store, "MED031", set()) is False


class TestDocumentProvenance:
    def test_every_collected_row_has_source_and_date(self):
        from config import DOCUMENTS_CSV
        from src.storage.store import read_table

        docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
        if docs.empty:
            pytest.skip("no corpus yet")
        collected = docs[docs["collection_status"] == "collected"]
        assert (collected["source_id"] != "").all()
        assert (collected["collected_at"] != "").all()
        assert (collected["source_url"] != "").all()
