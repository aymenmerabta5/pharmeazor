"""Section extraction tests (BeautifulSoup for HTML, pymupdf for PDF)."""
import pytest

from src.extraction.sections import _key_for, extract_document, extract_html_sections

HTML_SAMPLE = """
<html><body>
<p class="AmmAnnexeTitre1">1. DENOMINATION DU MEDICAMENT</p>
<p class="AmmCorpsTexteGras">NIFEDIPINE ARROW 30 mg</p>
<p class="AmmAnnexeTitre1">4. DONNEES CLINIQUES</p>
<p class="AmmAnnexeTitre2">4.1. Indications therapeutiques</p>
<p class="AmmCorpsTexte">Hypertension artérielle.</p>
<p class="AmmAnnexeTitre2">4.2. Posologie et mode d'administration</p>
<p class="AmmCorpsTexte">Une gélule par jour.</p>
<p class="AmmAnnexeTitre2">4.3. Contre-indications</p>
<p class="AmmCorpsTexte">Ce médicament NE DOIT JAMAIS être utilisé.</p>
<p class="AmmAnnexeTitre2">4.5. Interactions avec d'autres médicaments</p>
<p class="AmmCorpsTexte">Associations contre-indiquées.</p>
</body></html>
"""


class TestSectionKeys:
    def test_contra_indications_is_not_the_indications_section(self):
        assert _key_for("4.3. Contre-indications") == "contre_indications"
        assert _key_for("4.1. Indications therapeutiques") == "indications"

    def test_english_label_headings(self):
        assert _key_for("INDICATIONS AND USAGE") == "indications"
        assert _key_for("DOSAGE AND ADMINISTRATION") == "posologie"
        assert _key_for("CONTRAINDICATIONS") == "contre_indications"
        assert _key_for("ADVERSE REACTIONS") == "effets_indesirables"
        assert _key_for("DRUG INTERACTIONS") == "interactions"

    def test_unknown_headings_have_no_key(self):
        assert _key_for("6.1. Liste des excipients") == ""
        assert _key_for("") == ""


class TestHtmlExtraction:
    @pytest.fixture(scope="class")
    def sections(self, tmp_path_factory):
        path = tmp_path_factory.mktemp("html") / "doc.html"
        path.write_text(HTML_SAMPLE, encoding="utf-8")
        return extract_html_sections(path)

    def test_uses_beautifulsoup(self, sections):
        assert sections and all(s["extractor"] == "beautifulsoup" for s in sections)

    def test_the_four_key_sections_are_found(self, sections):
        keys = {s["section_key"] for s in sections}
        assert {"indications", "posologie", "contre_indications", "interactions"} <= keys

    def test_the_original_passage_is_preserved(self, sections):
        indications = next(s for s in sections if s["section_key"] == "indications")
        assert "Hypertension artérielle." in indications["text"]
        contre = next(s for s in sections if s["section_key"] == "contre_indications")
        assert "NE DOIT JAMAIS" in contre["text"]

    def test_sections_do_not_run_into_each_other(self, sections):
        indications = next(s for s in sections if s["section_key"] == "indications")
        assert "NE DOIT JAMAIS" not in indications["text"]


class TestDispatch:
    def test_unknown_types_return_nothing(self, tmp_path):
        path = tmp_path / "data.bin"
        path.write_bytes(b"\x00\x01")
        assert extract_document(path) == []
