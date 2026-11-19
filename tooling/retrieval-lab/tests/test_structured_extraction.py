"""Tests for the structured, document-type-aware extraction stage."""
from src.extraction.models import (
    DOCUMENT_CLASS_NOTICE, DOCUMENT_CLASS_RCP, Block, Page, ParsedDocument,
)
from src.extraction.pdf_reader import _merge_numbered_heading_lines
from src.extraction.section_detector import (
    _candidate, detect_sections, key_for,
)
from src.extraction.section_extractor import _strip_notice_toc
from src.extraction.validator import (
    NUMBERS_CHANGED, NUMBERS_OK, VERBATIM_FAILED, VERBATIM_OK,
    check_numbers, check_verbatim,
)


def _parsed(blocks, page_type="HTML"):
    return ParsedDocument(
        path="sample.html", suffix=".html",
        pages=[Page(number=1, text="\n".join(b.text for b in blocks),
                    blocks=blocks)],
        page_type=page_type,
    )


def _block(text, bold=False, size=12.0, page=1):
    return Block(text=text, page=page, bold=bold, size=size, source="pdf")


class TestNoticeHeadings:
    def test_french_contraindication_heading(self):
        assert key_for("N'utilisez jamais KETOPROFENE 2,5%, gel :",
                       DOCUMENT_CLASS_NOTICE) == "contre_indications"
        assert key_for("Ne prenez jamais CE MEDICAMENT :",
                       DOCUMENT_CLASS_NOTICE) == "contre_indications"

    def test_package_contents_is_not_an_indication(self):
        title = ("Qu'est-ce que KETOPROFENE 2,5%, gel et contenu de "
                 "l'emballage extérieur")
        assert key_for(title, DOCUMENT_CLASS_NOTICE) == ""

    def test_cross_reference_is_not_a_heading(self):
        block = _block('tablets. “See What are the possible side effects of '
                       'azithromycin tablets?” If', bold=True)
        assert _candidate(block, DOCUMENT_CLASS_NOTICE, 0) is None

    def test_real_question_is_still_a_heading(self):
        block = _block("What are the possible side effects of azithromycin "
                       "tablets?", bold=True)
        candidate = _candidate(block, DOCUMENT_CLASS_NOTICE, 0)
        assert candidate is not None
        assert candidate.key == "effets_indesirables"

    def test_numbered_question_heading_is_kept(self):
        block = _block("2. Quelles sont les informations à connaître avant "
                       "d'utiliser CE MEDICAMENT ?", bold=True)
        candidate = _candidate(block, DOCUMENT_CLASS_NOTICE, 0)
        assert candidate is not None
        assert candidate.key == "mises_en_garde"

    def test_bare_what_is_heading_is_an_indication(self):
        assert key_for("What is nebivolol tablet?",
                       DOCUMENT_CLASS_NOTICE) == "indications"
        assert key_for("What are amlodipine and benazepril hydrochloride "
                       "capsules?", DOCUMENT_CLASS_NOTICE) == "indications"

    def test_warning_and_ingredient_questions_are_not_indications(self):
        assert key_for("What is the most important information I should know "
                       "about PRESTALIA?", DOCUMENT_CLASS_NOTICE) == "mises_en_garde"
        assert key_for("What are the possible side effects of azithromycin "
                       "tablets?", DOCUMENT_CLASS_NOTICE) == "effets_indesirables"
        assert key_for("What are the ingredients in azithromycin tablets?",
                       DOCUMENT_CLASS_NOTICE) == ""

    def test_interaction_lead_in_sentence_opens_interactions(self):
        block = _block("Tell your doctor about all the medicines you take. "
                       "Include prescription and non-", bold=True)
        candidate = _candidate(block, DOCUMENT_CLASS_NOTICE, 0)
        assert candidate is not None
        assert candidate.key == "interactions"

    def test_general_information_is_a_boundary(self):
        block = _block("GENERAL INFORMATION ABOUT NEBIVOLOL TABLETS",
                       bold=True)
        candidate = _candidate(block, DOCUMENT_CLASS_NOTICE, 0)
        assert candidate is not None
        assert candidate.key == ""
        assert candidate.boundary is True


class TestNoticeTableOfContents:
    def test_duplicated_toc_is_removed(self):
        blocks = [
            Block("Que contient cette notice ?", 1, kind="heading",
                  source="html_class"),
            Block("1. Qu'est-ce que le médicament ?", 1, source="html"),
            Block("2. Quelles sont les informations à connaître ?", 1,
                  source="html"),
            Block("3. Comment utiliser le médicament ?", 1, source="html"),
            Block("4. Quels sont les effets indésirables ?", 1, source="html"),
            Block("1. QU'EST-CE QUE LE MEDICAMENT ?", 1, source="html"),
            Block("Le médicament est utilisé contre la douleur.", 1,
                  source="html"),
        ]
        cleaned = _strip_notice_toc(_parsed(blocks))
        texts = [block.text for block in cleaned.blocks]
        assert not any(text.startswith(("1. Qu'est", "2. Quelles", "3. Comment",
                                        "4. Quels")) for text in texts)
        assert "1. QU'EST-CE QUE LE MEDICAMENT ?" in texts
        assert "Le médicament est utilisé contre la douleur." in texts

    def test_single_copy_is_not_removed(self):
        blocks = [
            Block("1. Qu'est-ce que le médicament ?", 1, source="html"),
            Block("2. Quelles sont les informations ?", 1, source="html"),
            Block("3. Comment utiliser le médicament ?", 1, source="html"),
            Block("Le médicament est utilisé contre la douleur.", 1,
                  source="html"),
        ]
        cleaned = _strip_notice_toc(_parsed(blocks))
        assert len(cleaned.blocks) == len(blocks)


class TestSplMetadata:
    def test_dosage_table_is_a_boundary_not_a_heading(self):
        block = _block("DOSAGE: TABLET, FILM COATED")
        candidate = _candidate(block, DOCUMENT_CLASS_NOTICE, 0)
        assert candidate is not None
        assert candidate.key == ""
        assert candidate.boundary is True

    def test_packaging_table_does_not_extend_the_leaflet(self):
        blocks = [
            _block("How should I take losartan potassium tablets?", bold=True),
            _block("Take one tablet once daily."),
            _block("DOSAGE: TABLET, FILM COATED", bold=True),
            _block("Packaging"),
            _block("# Item Code Package Description"),
        ]
        sections = detect_sections(_parsed(blocks), DOCUMENT_CLASS_NOTICE)
        posologie = next(s for s in sections if s.section_key == "posologie")
        body = "\n".join(block.text for block in posologie.blocks)
        assert "Take one tablet once daily." in body
        assert "Item Code" not in body

    def test_active_ingredients_plural_stops_storage(self):
        blocks = [
            _block("How should I store nebivolol tablets?", bold=True),
            _block("Store at room temperature."),
            _block("Active ingredients: nebivolol", bold=True),
            _block("Inactive ingredients: lactose."),
        ]
        sections = detect_sections(_parsed(blocks), DOCUMENT_CLASS_NOTICE)
        storage = next(s for s in sections
                       if s.section_key == "duree_conservation")
        body = "\n".join(block.text for block in storage.blocks)
        assert "Store at room temperature." in body
        assert "Active ingredients" not in body


class TestOtcDrugFacts:
    def test_drug_facts_headings_are_mapped(self):
        blocks = [
            _block("Uses", bold=True),
            _block("temporarily relieves minor aches and pains."),
            _block("Warnings", bold=True),
            _block("Allergy alert: may cause a severe reaction."),
            _block("Do not use", bold=True),
            _block("if the child has had an allergic reaction."),
            _block("Stop use and ask a doctor if", bold=True),
            _block("the child has stomach pain."),
            _block("Directions", bold=True),
            _block("take 5 mL every 6 hours."),
            _block("Other information", bold=True),
            _block("store at 20-25 C."),
            _block("Principal Display Panel", bold=True),
            _block("carton artwork text"),
        ]
        sections = {section.section_key: section
                    for section in detect_sections(_parsed(blocks),
                                                   DOCUMENT_CLASS_RCP)}
        assert {"indications", "mises_en_garde", "contre_indications",
                "effets_indesirables", "posologie"} <= set(sections)
        posologie = "\n".join(block.text for block in sections["posologie"].blocks)
        assert "take 5 mL every 6 hours." in posologie
        assert "store at 20-25 C." not in posologie
        assert "carton artwork text" not in posologie

    def test_singular_use_fragment_is_not_an_indication_heading(self):
        block = _block("use", bold=True)
        assert _candidate(block, DOCUMENT_CLASS_RCP, 0) is None


class TestPdfHeadingFragments:
    def test_number_and_title_are_joined(self):
        blocks = [_block("4.2-"), _block("Posologie et mode d'administration")]
        merged = _merge_numbered_heading_lines(blocks)
        assert len(merged) == 1
        assert merged[0].text == "4.2- Posologie et mode d'administration"


class TestValidation:
    def test_verbatim_pass(self):
        source = "La dose est de 500 mg deux fois par jour."
        status, _ = check_verbatim("La dose est de 500 mg deux fois par jour.",
                                   source)
        assert status == VERBATIM_OK

    def test_verbatim_failure_keeps_the_passage_untouched(self):
        content = "La dose est de 1000 mg deux fois par jour."
        status, note = check_verbatim(
            content, "La dose est de 500 mg deux fois par jour.")
        assert status == VERBATIM_FAILED
        assert content == "La dose est de 1000 mg deux fois par jour."
        assert "not found" in note

    def test_numbers_pass_and_change(self):
        source = "Prendre 500 mg toutes les 6 heures."
        assert check_numbers("500 mg", source)[0] == NUMBERS_OK
        assert check_numbers("1000 mg", source)[0] == NUMBERS_CHANGED
