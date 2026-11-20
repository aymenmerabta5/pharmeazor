"""Medicine list loading, storage and reporting tests."""
import pandas as pd

from src.medicines.loader import build_rows, read_csv, read_xlsx
from src.reporting.report import _authority_level
from src.storage.store import DocumentStore, read_table, write_table
from src.utils.text import inn_variants


class TestLoader:
    def test_reads_the_professor_csv(self, tmp_path):
        path = tmp_path / "targetMeds.csv"
        path.write_text(
            "Numéro,Catégorie,Médicament,Code ATC\n"
            "31,Antihypertenseurs,énalapril,C09AA02\n",
            encoding="utf-8",
        )
        rows = read_csv(path)
        assert rows[0]["inn"] == "énalapril"
        assert rows[0]["atc"] == "C09AA02"
        assert rows[0]["list_number"] == 31

    def test_reads_the_professor_xlsx(self, tmp_path):
        from pathlib import Path
        real = Path("data/input/Projet2_Liste_40_medicaments.xlsx")
        if not real.exists():
            return
        rows = read_xlsx(real)
        assert len(rows) == 40
        assert rows[0]["inn"].lower().startswith("parac")
        assert rows[0]["list_number"] == 1
        assert rows[39]["list_number"] == 40

    def test_build_rows_uses_the_list_number_as_id(self):
        rows = build_rows([{"list_number": 31, "class": "Antihypertenseurs",
                            "inn": "énalapril", "atc": "C09AA02",
                            "in_algerian_nomenclature": "", "remarks": ""}],
                          "targetMeds.csv")
        assert rows[0]["medicine_id"] == "MED031"
        assert rows[0]["inn_variants"].startswith("enalapril")


class TestStore:
    def test_document_id_convention(self, tmp_path):
        store = DocumentStore(tmp_path / "documents.csv")
        assert store.next_document_id("MED031", "ANPP_RCP") == "MED031__SRC_ANPP_RCP__DOC001"

    def test_find_file_by_hash_reuses_the_physical_file(self, tmp_path):
        path = tmp_path / "documents.csv"
        store = DocumentStore(path)
        blob = tmp_path / "blob.pdf"
        blob.write_bytes(b"%PDF-1.7")
        store.add({
            "document_id": "MED031__SRC_X__DOC001", "medicine_id": "MED031",
            "source_id": "X", "source_url": "https://x/a.pdf", "sha256": "abc",
            "file_path": str(blob), "collection_status": "collected",
        })
        found = store.find_file_by_hash("abc")
        assert found is not None and found.exists()
        assert store.find_file_by_hash("zzz") is None

    def test_placeholder_rows_are_dropped_when_a_document_arrives(self, tmp_path):
        path = tmp_path / "documents.csv"
        store = DocumentStore(path)
        store.add({
            "document_id": "MED031__SRC_X__DOC001", "medicine_id": "MED031",
            "source_id": "X", "source_url": "https://x/search", "sha256": "",
            "file_path": "", "collection_status": "no_results",
        })
        removed = store.drop_where("MED031", "X", ["no_results"])
        assert removed == 1
        assert store.df.empty

    def test_document_ids_are_monotonic_even_when_a_row_is_not_stored(self, tmp_path):
        # a rerun with --refresh does not store the duplicate row, but the id
        # of the next document must still be a fresh one (otherwise two
        # documents would share a file path and overwrite each other)
        path = tmp_path / "documents.csv"
        store = DocumentStore(path)
        store.add({
            "document_id": "MED031__SRC_X__DOC001", "medicine_id": "MED031",
            "source_id": "X", "source_url": "https://x/a.pdf", "sha256": "a",
            "file_path": "raw/a.pdf", "collection_status": "collected",
        })
        assert store.next_document_id("MED031", "X") == "MED031__SRC_X__DOC002"
        # the row is not stored (duplicate) -> the counter must still advance
        assert store.next_document_id("MED031", "X") == "MED031__SRC_X__DOC002"
        store.add({
            "document_id": "MED031__SRC_X__DOC002", "medicine_id": "MED031",
            "source_id": "X", "source_url": "https://x/b.pdf", "sha256": "b",
            "file_path": "raw/b.pdf", "collection_status": "collected",
        })
        assert store.next_document_id("MED031", "X") == "MED031__SRC_X__DOC003"


class TestReporting:
    def test_authority_level_is_tolerant(self):
        assert _authority_level("1") == "1"
        assert _authority_level("1 - Highest") == "1"
        assert _authority_level("") == ""
