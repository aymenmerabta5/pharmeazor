"""Document-type-aware heading detection and section splitting.

RCP/SmPC and patient notices are deliberately separate profiles.  A heading is
never matched across the two profiles, so an RCP cannot become a notice (or the
reverse) because of a shared word such as "indications".
"""
import re

from src.extraction.models import (
    DOCUMENT_CLASS_NOTICE, DOCUMENT_CLASS_RCP, DetectedSection, HeadingCandidate,
    ParsedDocument, REQUIRED_SECTIONS,
)
from src.extraction.text_utils import (
    fold, heading_number, looks_like_upper_heading, normalise_heading,
)

# Canonical key -> folded heading pattern.  Specific keys come first so that
# "contre-indications" cannot be taken for "indications".
RCP_PATTERNS = [
    ("contre_indications",
     r"^(?:contre[- ]?indications?|contra[- ]?indications?|contraindications?|"
     r"do not use)$"),
    ("effets_indesirables",
     r"^(?:effets? indesirables?|undesirable effects?|"
     r"adverse (?:effects?|reactions?)|side effects?|"
     r"stop use and ask a doctor(?: if)?)$"),
    ("interactions",
     r"^(?:interactions?(?: medicamenteuses?)?(?: et autres formes d interactions?)?|"
     r"interactions? avec d autres(?: medicaments?)?"
     r"(?: et autres formes d interactions?)?|"
     r"drug interactions?|other medicines|prise d autres medicaments)$"),
    ("grossesse",
     r"^(?:fertilite grossesse et allaitement|grossesse et allaitement|"
     r"pregnancy(?: and breastfeeding| and lactation)?|"
     r"use in specific populations|الحمل والرضاعة|الحمل)$"),
    ("surdosage", r"^(?:surdosage|overdosage|الجرعة الزائدة)$"),
    ("indications",
     r"^(?:indications? therapeutiques?|therapeutic indications?|"
     r"indications? and usage|indications?|uses|"
     r"ما هو|دواعي الاستعمال|الاستعمالات العلاجية)$"),
    ("posologie",
     r"^(?:posologie(?: et mode d administration)?|dosage and administration|"
     r"dosage|dosage regimen|mode d administration|mode d emploi|directions?|"
     r"طريقة الاستعمال|الجرعة)$"),
    ("mises_en_garde",
     r"^(?:mises? en garde(?: speciales?)?"
     r"(?: et precautions?(?: particulieres?)? d emploi)?|"
     r"precautions?(?: particulieres?)? d emploi|"
     r"special warnings?(?: and precautions? for use)?|"
     r"warnings? and precautions?|warnings?|precautions?|boxed warning|"
     r"ask a doctor(?: or pharmacist)? before use\b.*|"
     r"when using this product|keep out of reach of children\.?|"
     r"تحذيرات|احتياطات)$"),
    ("proprietes",
     r"^(?:proprietes pharmacologiques?|pharmacological properties?|"
     r"clinical pharmacology|mechanism of action|الخواص الدوائية)$"),
    ("duree_conservation",
     r"^(?:duree de conservation\b.*|"
     r"precautions? particulieres? de conservation\b.*|"
     r"conditions? de conservation\b.*|conservation|storage|"
     r"storage and handling|"
     r"how supplied(?: storage and handling)?|التخزين|شروط التخزين)$"),
    ("denomination",
     r"^(?:denomination(?: du| commerciale)? medicament|product name|"
     r"nom commercial|nom du medicament|اسم المنتج)$"),
    ("composition",
     r"^(?:composition(?: qualitative| quantitative)?|"
     r"qualitative and quantitative composition|التركيب)$"),
    ("forme",
     r"^(?:forme pharmaceutique|pharmaceutical form|dosage form|"
     r"dosage forms and strengths|الشكل الصيدلاني)$"),
    ("donnees_cliniques", r"^(?:donnees cliniques|clinical particulars)$"),
    ("titulaire",
     r"^(?:titulaire de l autorisation|marketing authorisation holder|"
     r"titulaire)$"),
]

# Headings that close the previous section even when they are not one of the
# ten output sections.  This is what stops WARNINGS/PRECAUTIONS/table headers
# from being swallowed by the preceding section.
RCP_BOUNDARIES = [
    r"^boxed warning$", r"^warnings?$", r"^precautions?$", r"^description$",
    r"^clinical pharmacology$", r"^microbiology$",
    r"^nonclinical toxicology$", r"^how supplied(?: storage and handling)?$",
    r"^storage and handling$", r"^patient information$",
    r"^patient counselling information$", r"^patient counseling information$",
    r"^information for the patient$", r"^instructions for use$",
    r"^medication guide$", r"^reference(?:s)?$", r"^animal pharmacology$",
    r"^clinical studies$", r"^dosage forms and strengths$",
    r"^other information$", r"^inactive ingredients$", r"^drug facts$",
    r"^principal display panel$", r"^product information$",
    r"^active ingredient(?:/active moiety)?$", r"^purposes?$",
    r"^questions or comments\??$",
    r"^دواعي الاستعمال$", r"^موانع الاستعمال$", r"^الجرعة$",
    r"^الآثار الجانبية$",
]

# Notice-specific headings.  The parent "what should I know before" question
# is a container; its sub-headings become contraindications/warnings/
# interactions/pregnancy.  When no sub-heading exists, the container itself is
# stored as warnings, never silently discarded.
NOTICE_PATTERNS = [
    ("contre_indications",
     r"ne prenez jamais|n utilisez jamais|n utiliser jamais|"
     r"ne pas (?:prendre|utiliser)|do not (?:take|use)|"
     r"who should not (?:take|use)|when (?:you )?should not|"
     r"موانع الاستعمال|ممنوع الاستعمال"),
    ("interactions",
     r"autres medicaments|prise d autres medicaments|drug interactions?|"
     r"other medicines|taking other medicines|interactions?|"
     r"tell your (?:doctor|healthcare provider|health care provider) about "
     r"all (?:of )?(?:the )?(?:medicines|medications) you take|"
     r"التداخلات الدوائية|التفاعلات الدوائية"),
    ("grossesse",
     r"grossesse|allaitement|pregnancy|breastfeeding|breast feeding|"
     r"الحمل|الرضاعة"),
    ("effets_indesirables",
     r"effets? indesirables?|possible side effects|the possible side effects|"
     r"side effects?|adverse (?:effects?|reactions?)|"
     r"الآثار الجانبية|الأعراض الجانبية"),
    ("posologie",
     r"comment (?:utiliser|prendre)|how (?:should|do|to) (?:i )?(?:take|use)|"
     r"how to use|dosage|طريقة الاستعمال|الجرعة"),
    ("duree_conservation",
     r"comment conserver|how (?:should|do|to) (?:i )?(?:store|keep)|"
     r"storing|storage|التخزين|شروط التخزين"),
    # Packaging/contents comes before "qu'est-ce que": section 6 of a French
    # notice often contains "Qu'est-ce que <drug> et contenu de l'emballage",
    # which is a package list, not a therapeutic indication.
    ("notice_package",
     r"contenu de l emballage|ce que contient|what is in the (?:box|package)|"
     r"what (?:is|are) in\b.*|what are the ingredients|محتوى العبوة"),
    # The "most important information" question is a warning container, not the
    # drug description; it must be tested before the generic "what is ...?"
    # indication heading.
    ("mises_en_garde",
     r"faites attention|mises en garde|avertissements|warnings?|"
     r"important information|what is the most important information|"
     r"before (?:taking|you take|you use)|"
     r"tell your healthcare provider|when taking|while taking|"
     r"what should i (?:tell|know)|تحذيرات|احتياطات"),
    ("indications",
     r"qu est ce que|dans quels cas|what is .* (?:used|indicated)|"
     r"what is .* for|what are .* for|"
     # DailyMed patient leaflets title their first section "What is <drug>?" or
     # "What are <drug>?"; the exclusion keeps the warning and ingredient
     # questions (matched above) out of this section.
     r"what (?:is|are) (?!the most important|the possible|possible side).{1,120}|"
     r"ما هو|دواعي الاستعمال"),
    ("notice_before",
     r"quelles sont les informations|what should i know before|"
     r"before you take|before taking|before you use|قبل الاستعمال"),
    ("notice_other",
     r"autres informations|general information|more information|"
     r"other information|معلومات أخرى"),
]

_RCP_PATTERNS = [(key, re.compile(pattern)) for key, pattern in RCP_PATTERNS]
_RCP_BOUNDARIES = [re.compile(pattern) for pattern in RCP_BOUNDARIES]
_NOTICE_PATTERNS = [(key, re.compile(pattern)) for key, pattern in NOTICE_PATTERNS]

_NUMBER_PREFIX = re.compile(r"^\s*\d+(?:\.\d+)*\s*[-.)]?\s*")
_TRAILING_PAREN = re.compile(r"\s*\([^()]*\)\s*$")
_EMPTY_BODY_NOTE = "heading found but the section body is empty"

# DailyMed SPL records append a structured product-data table to the leaflet
# (DOSAGE: TABLET..., ROUTE: ORAL, Packaging, Marketing Information ...).
# These labels are not document headings and must stop the current section
# instead of opening a new one.
_SPL_METADATA = re.compile(
    r"^\s*(?:dosage|route of administration|active ingredients?|"
    r"inactive ingredients|product type|item code(?: \(source\))?|"
    r"product characteristics|packaging|marketing information|labeler|"
    r"principal display panel|product information|revised|"
    r"distributed by|manufactured by|manufactured for|marketed by)\b\s*:",
    re.IGNORECASE)
_SPL_METADATA_TITLES = {
    "product information", "product type", "packaging", "marketing information",
    "product characteristics", "principal display panel", "inactive ingredients",
    "active ingredient", "active ingredient/active moiety",
    "active ingredients", "questions or comments",
}


def _match_any(text: str, patterns: list) -> str:
    for key, pattern in patterns:
        if pattern.search(text):
            return key
    return ""


def _title_for_match(title: str) -> str:
    value = _NUMBER_PREFIX.sub("", title or "")
    previous = None
    while value != previous:
        previous = value
        value = _TRAILING_PAREN.sub("", value)
    return value.strip()


def key_for(title: str, profile: str = DOCUMENT_CLASS_RCP) -> str:
    """Return the canonical section key of a heading, or ''. """
    folded = fold(_title_for_match(title))
    if not folded:
        return ""
    if profile == DOCUMENT_CLASS_NOTICE:
        key = _match_any(folded, _NOTICE_PATTERNS)
        if key == "notice_before":
            return "mises_en_garde"
        if key in ("notice_package", "notice_other"):
            return ""
        return key
    return _match_any(folded, _RCP_PATTERNS)


def is_boundary(title: str, profile: str = DOCUMENT_CLASS_RCP) -> bool:
    folded = fold(_title_for_match(title))
    if not folded:
        return False
    if profile == DOCUMENT_CLASS_NOTICE:
        return bool(_match_any(folded, _NOTICE_PATTERNS)) or bool(
            _SPL_METADATA.match(title or "")) or folded in _SPL_METADATA_TITLES
    if key_for(title, profile):
        return True
    return any(pattern.search(folded) for pattern in _RCP_BOUNDARIES)


_QUESTION_START = re.compile(
    r"^(?:\d+\s+)?(?:what|how|comment|que\b|qu\b|quelles?\b|quels?\b|"
    r"dans quels cas|who should|when should|why|which)\b")


def _is_notice_question(text: str, folded: str) -> bool:
    # The question must start the line.  A cross-reference such as
    # 'tablets. "See What are the possible side effects ...?"' contains a
    # question mark but is body text, not a heading.
    if not _QUESTION_START.match(folded):
        return False
    if "?" in (text or ""):
        return True
    return bool(re.match(r"^\s*(?:\d+|[ivx]+)\s*[.)]\s*", text or ""))


def _plausible_notice_heading(text: str, folded: str) -> bool:
    """A short notice sub-heading, not a sentence and not a cross-reference."""
    if len(text) > 140:
        return False
    if text.rstrip().endswith((".", ";", ",")):
        return False
    if re.search(r"[\]\)]\s*[a-z]", text):
        return False
    if re.match(r"^warning\s+\d", folded):
        return False
    words = re.findall(r"[^\W\d_]+(?:['’\-][^\W\d_]+)*", text, re.UNICODE)
    if not words or len(words) > 16:
        return False
    strong = re.match(
        r"^(?:autres medicaments|prise d autres|grossesse|allaitement|fertilite|"
        r"ne prenez jamais|n utilisez jamais|ne pas (?:prendre|utiliser)|"
        r"do not (?:take|use)|"
        r"who should not|faites attention|mises? en garde|avertissements?|"
        r"warnings?|important information|before (?:taking|you take|you use)|"
        r"tell your healthcare provider|when taking|while taking|"
        r"when using this product|"
        r"comment|how (?:should|do|to)|what (?:is|are)|quelles?|quels?|"
        r"dans quels cas|qu est ce|effets? indesirables|"
        r"the possible side effects|possible side effects|side effects?|"
        r"adverse reactions?|storage|conservation)", folded)
    if re.search(r"\b(?:see|voir|cf\.|report|tell your|informez|should|must|"
                 r"may|can|could|will|would)\b", folded) and not strong:
        return False
    if not strong and not text.isupper() and len(words) >= 3:
        capitalised = sum(1 for word in words if word[0].isupper())
        if capitalised / len(words) < 0.5:
            return False
    return True


def _numbered_candidate(text: str, folded: str, block,
                        key: str, profile: str, index: int):
    """Accept a numbered line only when its wording is heading-like."""
    number, level = heading_number(text)
    if not number:
        return None
    body = _NUMBER_PREFIX.sub("", text).strip()
    boundary = bool(key) or is_boundary(text, profile)
    if not body or len(body) > 160:
        return None
    if body.rstrip().endswith((".", ";", ",")) and not boundary:
        return None
    if "[" in body or "]" in body:
        return None
    if re.search(r"\b(?:see|voir|cf)\b", folded):
        return None
    if number.count(".") == 0:
        # Top-level headings are upper-case in US labels and SmPCs; a lower
        # prose line such as "17 ans (34 patients ...)" is not a heading.
        if not body.isupper() and not key and not boundary:
            return None
        if len(body.split()) > 12 and not key:
            return None
    else:
        if not re.match(r"^[A-ZÀ-ÖØ-Þ\u0600-\u06ff]", body):
            return None
        if len(body.split()) > 16 and not key:
            return None
    return HeadingCandidate(text, key, level, block.page, index, True, "numbered")


def _candidate(block, profile: str, index: int) -> HeadingCandidate | None:
    text = normalise_heading(block.text)
    if not text:
        return None
    folded = fold(text)
    if block.kind == "heading":
        key = key_for(text, profile)
        level = block.level or 1
        return HeadingCandidate(text, key, level, block.page, index,
                                bool(key) or is_boundary(text, profile),
                                block.source or "html_class")

    key = key_for(text, profile)

    # Patient notices: a question mark, then a short sub-heading such as
    # "Autres médicaments et ...".  Body sentences are not headings.
    if profile == DOCUMENT_CLASS_NOTICE:
        if _SPL_METADATA.match(text) or folded in _SPL_METADATA_TITLES:
            return HeadingCandidate(text, "", 1, block.page, index, True,
                                    "notice_metadata")
        raw_key = _match_any(folded, _NOTICE_PATTERNS)
        if (raw_key in ("notice_package", "notice_other")
                and _plausible_notice_heading(text, folded)):
            return HeadingCandidate(text, "", 1, block.page, index, True,
                                    "notice_boundary")
        # Upper-case section titles in a US patient leaflet ("GENERAL
        # INFORMATION ABOUT ...", "WHAT IS IN ...") close the previous section
        # even when they are not one of the five mandatory sections.
        if looks_like_upper_heading(text) and is_boundary(text, profile):
            return HeadingCandidate(text, key, 1, block.page, index, True,
                                    "notice_boundary")
        if _is_notice_question(text, folded) and len(text) <= 220:
            number, level = heading_number(text)
            if not level:
                level = 1
            container = key in ("mises_en_garde",)
            return HeadingCandidate(text, key,
                                    level if level > 1 else (2 if container else 1),
                                    block.page, index, True, "notice_question")
        # DailyMed patient leaflets introduce the interaction list with a bold
        # lead-in sentence ("Tell your doctor about all the medicines you
        # take, including ...").  It is structural even though it ends with a
        # comma or a full stop, so it opens the interactions section.
        if (key == "interactions" and block.bold and len(text) <= 200
                and folded.startswith("tell your ")):
            return HeadingCandidate(text, key, 2, block.page, index, True,
                                    "notice_interaction_heading")
        if key and _plausible_notice_heading(text, folded):
            number, level = heading_number(text)
            return HeadingCandidate(text, key, level or 2, block.page, index,
                                    True, "notice_heading")

    # A numbered line is a structural boundary even when it is not one of our
    # canonical sections (for example 4.7 or 5.7).  It must close the previous
    # section instead of being swallowed as content.
    numbered = _numbered_candidate(text, folded, block, key, profile, index)
    if numbered:
        return numbered

    if profile == DOCUMENT_CLASS_RCP and looks_like_upper_heading(text):
        boundary = bool(key) or is_boundary(text, profile)
        if boundary:
            return HeadingCandidate(text, key, 1, block.page, index, True, "upper")

    # A known title is only trusted when it is bold and title-like; body lines
    # such as "surdosage de paracétamol." also contain a section word.
    candidate_boundary = bool(key) or is_boundary(text, profile)
    otc_short_heading = folded in {"keep out of reach of children"}
    if (profile == DOCUMENT_CLASS_RCP and candidate_boundary and len(text) <= 120
            and block.bold and block.size >= 11.0
            and (otc_short_heading
                 or not text.rstrip().endswith((".", ";", ",")))
            and not re.search(r"\b(?:see|voir|cf)\b", folded)):
        number, level = heading_number(text)
        return HeadingCandidate(text, key, level or 1, block.page, index,
                                True, "font_heading")
    return None


def _detection_start(parsed: ParsedDocument, profile: str) -> int:
    """Skip the US highlights/TOC and read the full prescribing information."""
    if profile != DOCUMENT_CLASS_RCP or parsed.page_type != "PDF":
        return 0
    blocks = parsed.blocks
    if not any(fold(block.text).startswith("highlights of prescribing information")
               for block in blocks):
        return 0
    for index, block in enumerate(blocks):
        folded = fold(block.text)
        if (folded.startswith("full prescribing information")
                and "contents" not in folded):
            return index
    return 0


def detect_sections(parsed: ParsedDocument,
                    profile: str = DOCUMENT_CLASS_RCP) -> list[DetectedSection]:
    """Split a parsed document into canonical sections, preserving block order."""
    by_page = {page.number: page for page in parsed.pages}
    start_index = _detection_start(parsed, profile)
    sections: list[DetectedSection] = []
    current: dict | None = None
    current_level = 0
    current_container = False
    seen_heading = False

    def close():
        nonlocal current, current_level, current_container
        if current and current["blocks"]:
            pages = sorted({block.page for block in current["blocks"]})
            printed = [by_page[p].printed_label for p in pages
                       if p in by_page and by_page[p].printed_label]
            sections.append(DetectedSection(
                section_key=current["key"],
                original_heading=current["heading"],
                level=current["level"],
                blocks=current["blocks"],
                page_start=current["page_start"],
                page_end=max(pages) if pages else current["page_start"],
                printed_pages=printed,
                notes=current.get("notes", ""),
            ))
        elif current and not current["blocks"]:
            # a heading with no body is still recorded as a reviewable section
            sections.append(DetectedSection(
                section_key=current["key"],
                original_heading=current["heading"],
                level=current["level"],
                blocks=[],
                page_start=current["page_start"],
                page_end=current["page_start"],
                printed_pages=[by_page[current["page_start"]].printed_label]
                if current["page_start"] in by_page
                and by_page[current["page_start"]].printed_label else [],
                notes=_EMPTY_BODY_NOTE,
            ))
        current = None
        current_level = 0
        current_container = False

    for index, block in enumerate(parsed.blocks):
        if index < start_index:
            continue
        if not (block.text or "").strip():
            continue
        candidate = _candidate(block, profile, index)
        if candidate:
            seen_heading = True
            # A heading with the same canonical key is a sub-heading of the
            # current section: keep its wording instead of restarting.
            if current and candidate.key and candidate.key == current["key"]:
                current["blocks"].append(block)
                continue
            if candidate.key:
                if current:
                    close()
                current = {
                    "key": candidate.key,
                    "heading": candidate.title,
                    "level": candidate.level,
                    "page_start": candidate.page,
                    "blocks": [],
                }
                current_level = candidate.level
                current_container = candidate.key == "mises_en_garde" and profile == DOCUMENT_CLASS_NOTICE
            elif candidate.boundary:
                # A deeper unknown numbered heading (5.1, 5.2 ...) is part of
                # the current section body.  Only a heading at the same or a
                # higher level closes the current canonical section.
                if current and candidate.level > current_level:
                    current["blocks"].append(block)
                    continue
                if current:
                    close()
                current = None
                current_level = 0
                current_container = False
            elif current:
                # An unkeyed heading that is not a boundary (rare) stays in
                # the section as content; it must not silently end it.
                current["blocks"].append(block)
            continue

        if current:
            current["blocks"].append(block)

    if current:
        close()

    # Merge repeated occurrences of the same canonical key (for example
    # WARNINGS and PRECAUTIONS in a US label) into one record.  The wording of
    # each heading stays visible in original_heading.
    merged: dict[str, DetectedSection] = {}
    order: list[str] = []
    for section in sections:
        if section.section_key not in REQUIRED_SECTIONS:
            continue
        if section.section_key not in merged:
            merged[section.section_key] = section
            order.append(section.section_key)
            continue
        first = merged[section.section_key]
        first.blocks.extend(section.blocks)
        headings = [part.strip() for part in first.original_heading.split(" | ")]
        if section.original_heading and section.original_heading not in headings:
            first.original_heading = f"{first.original_heading} | {section.original_heading}"
        first.page_end = max(first.page_end, section.page_end)
        first.printed_pages = sorted(set(first.printed_pages + section.printed_pages))
        if section.notes and section.notes != _EMPTY_BODY_NOTE:
            first.notes = "; ".join(filter(None, [first.notes, section.notes]))
        if first.blocks and _EMPTY_BODY_NOTE in first.notes:
            first.notes = "; ".join(note for note in first.notes.split("; ")
                                    if note and note != _EMPTY_BODY_NOTE)
    return [merged[key] for key in order]
