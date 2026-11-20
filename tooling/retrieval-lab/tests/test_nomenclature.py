"""Official Algerian nomenclature: parsing and matching tests."""
import os
from pathlib import Path

import pytest

from src.medicines.xlsx import find_header, read_rows, sheet_names
from src.utils.text import contains_token, normalize

# Operator-supplied workbook; never committed. Point the environment variable at
# a local copy to run the register tests.
NOMENCLATURE = Path(
    os.environ.get("PHARMEAZOR_NOMENCLATURE_XLSX", "nomenclature_algerienne.xlsx")
)
requires_nomenclature = pytest.mark.skipif(
    not NOMENCLATURE.exists(),
    reason=f"official nomenclature workbook not found: {NOMENCLATURE}",
)


class TestXlsxReader:
    @requires_nomenclature
    def test_reads_the_sheets(self):
        import zipfile

        with zipfile.ZipFile(NOMENCLATURE) as archive:
            names = sheet_names(archive)
        assert names[0].startswith("Nomenclature")
        assert any("Non" in n for n in names)
        assert any("Retrait" in n for n in names)

    @requires_nomenclature
    def test_finds_the_header_row(self):
        rows = read_rows(NOMENCLATURE)
        index = find_header(rows, ["DENOMINATION COMMUNE INTERNATIONALE", "NOM DE MARQUE"])
        assert index > 0
        header = {str(v).upper() for v in rows[index].values()}
        assert any("DENOMINATION COMMUNE INTERNATIONALE" in v for v in header)
        assert any("NOM DE MARQUE" in v for v in header)


@pytest.fixture(scope="module")
def nomenclature():
    from src.medicines.nomenclature import Nomenclature

    return Nomenclature(NOMENCLATURE)


@requires_nomenclature
class TestNomenclatureMatching:
    def test_the_register_is_loaded(self, nomenclature):
        assert len(nomenclature.main) > 5000
        assert nomenclature.withdrawn_records
        assert nomenclature.non_renewed_records

    def test_single_substance_matches(self, nomenclature):
        summary = nomenclature.summary({"inn": "énalapril", "dci_components": "énalapril"})
        assert summary["present"] == "oui"
        assert summary["products"] >= 1
        assert "ENALAPRIL MYLAN" in summary["brands"]

    def test_combination_needs_both_substances(self, nomenclature):
        summary = nomenclature.summary({
            "inn": "paracétamol + codéine",
            "dci_components": "paracétamol|codéine"})
        assert summary["present"] == "oui"
        # a paracetamol-only product is not a combination product
        single = nomenclature.summary({
            "inn": "paracétamol", "dci_components": "paracétamol"})
        assert single["products"] > summary["products"]

    def test_slash_and_plus_are_tokenised(self, nomenclature):
        assert nomenclature._matches("PARACETAMOL/CODEINE", ["paracetamol", "codeine"])
        assert nomenclature._matches("SULFAMETHOXAZOLE + TRIMETHOPRIME",
                                     ["sulfamethoxazole", "trimethoprim" + "e"])
        assert not nomenclature._matches("PARACETAMOL", ["paracetamol", "codeine"])

    def test_a_withdrawn_substance_is_to_be_verified(self, nomenclature):
        summary = nomenclature.summary({"inn": "nifédipine", "dci_components": "nifédipine"})
        assert summary["present"] == "a verifier"
        assert summary["products"] == 0
        assert summary["historical"], "the withdrawn products must still be listed"

    def test_statuses_are_reported(self, nomenclature):
        summary = nomenclature.summary({"inn": "énalapril", "dci_components": "énalapril"})
        assert set(summary["statuses"]) <= {"enregistre", "retrait", "non renouvele"}


class TestTokenHelpers:
    def test_normalisation_strips_accents(self):
        assert normalize("ÉNALAPRIL") == "enalapril"

    def test_token_matching_respects_word_boundaries(self):
        assert contains_token("paracetamol 500 mg", "paracetamol")
        assert not contains_token("paraffine", "paracetamol")
