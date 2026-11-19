"""Section extraction: pull the clinical sections out of a collected document.

The brief asks for the *original passages* of indications, contraindications,
dosage and interactions to be identified and preserved, so the extractor never
rewrites the text: it slices the document and keeps the wording as it is.

Two extractors, one per file type:

* **HTML** (the ANSM product pages) - parsed with **BeautifulSoup**: the page
  marks its headings with `AmmAnnexeTitre*` (RCP) and `AmmNoticeTitre*`
  (patient notice); every heading owns the elements that follow it.
* **PDF** (the ANPP RCPs and the DailyMed labels) - text with pymupdf, then
  split on the numbered headings of the SmPC.

The output is `data/metadata/sections.csv`: one row per section, with the
document it came from and the URL, so every passage stays traceable.
"""
import re
from pathlib import Path

# canonical section keys -> heading patterns (French and English)
SECTION_PATTERNS = [
    ("denomination", r"d[ée]nomination (?:du |commerciale )?m[ée]dicament|product name|"
                      r"nom (?:commercial|du m[ée]dicament)"),
    ("composition", r"composition (?:qualitative|quantitative)|qualitative and quantitative composition|"
                    r"composition"),
    ("forme", r"forme pharmaceutique|pharmaceutical form|forme et pr[ée]sentation"),
    ("indications", r"indications th[ée]rapeutiques|indications and usage|"
                    r"therapeutic indications|^indications$"),
    ("posologie", r"posologie|dosage and administration|posolog\w* et mode d administration|"
                  r"mode d administration|mode d emploi"),
    ("contre_indications", r"contre-?indications?|contra-?indications"),
    ("mises_en_garde", r"mises en garde|pr[ée]cautions d emploi|special warnings|"
                        r"warnings and precautions|^warnings and precautions$"),
    ("interactions", r"interactions? (?:m[ée]dicamenteuses|other interactions|"
                            r"avec d[' ]?autres?)|drug interactions|^interactions$"),
    ("effets_indesirables", r"effets ind[ée]sirables?|undesirable effects?|"
                             r"adverse (?:effects?|reactions)|^adverse reactions$"),
    ("surdosage", r"surdosage|overdosage"),
    ("grossesse", r"fertilit[ée], grossesse et allaitement|pregnancy and breastfeeding|"
                 r"grossesse"),
    ("proprietes", r"propri[ée]t[ée]s pharmacologiques?|pharmacological properties"),
    ("donnees_cliniques", r"donn[ée]es cliniques?|clinical particulars"),
    ("duree_conservation", r"dur[ée]e de conservation|conservation"),
    ("titulaire", r"titulaire de l autorisation|titulaire"),
]

# the level-1 sections of an SmPC (kept as context)
GENERIC_SECTIONS = ("donnees_cliniques", "proprietes", "duree_conservation",
                     "titulaire", "donnees_pharmaceutiques")

PDF_HEADING_RE = re.compile(
    r"^\s*(\d+(?:\.\d+)*)\.?\s+([A-ZÀ-ÖØ-Þ][^\n]{2,90})\s*$")

# the US labels (SPL) have no numbering: their headings are plain upper case
PDF_HEADING_ALT_RE = re.compile(r"^\s*([A-Z][A-Z0-9 ,/&()\-'.]{2,79})\s*$")


def _is_upper_heading(line: str) -> str:
    """An upper-case-only line that could be a heading of an SPL label."""
    text = line.strip()
    if len(text) < 3 or len(text) > 80:
        return ""
    if text != text.upper():
        return ""
    if not re.search(r"[A-Z]{3}", text):
        return ""
    if text.endswith((".", ")", ":")):
        # a table-of-contents line or a sentence fragment, not a heading
        return ""
    return text


def _key_for(title: str) -> str:
    """The canonical key of a heading (empty when it is not a known section).

    The look-behind matters: "4.3. Contre-indications" must not be taken for
    the *indications* section.
    """
    low = normalize_heading(title)
    for key, pattern in SECTION_PATTERNS:
        if re.search(r"(?<![\w-])(?:" + pattern + ")", low, re.IGNORECASE):
            return key
    return ""


def normalize_heading(title: str) -> str:
    return re.sub(r"\s+", " ", (title or "").replace("’", "'")).strip()


# --------------------------------------------------------------------- HTML
def extract_html_sections(path: Path) -> list:
    """Sections of an HTML document, parsed with BeautifulSoup."""
    from bs4 import BeautifulSoup

    from src.utils.encoding import read_text_auto

    soup = BeautifulSoup(read_text_auto(Path(path)), "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    def is_heading(node) -> bool:
        if not getattr(node, "name", None):
            return False
        classes = node.get("class") or []
        return any(c.startswith("Amm") and "Titre" in c for c in classes)

    headings = []
    for node in soup.find_all(class_=re.compile(r"^Amm(?:Notice|Annexe)Titre")):
        title = normalize_heading(node.get_text(" ", strip=True))
        title = re.sub(r"\s*Redirection vers le haut de page.*$", "", title,
                       flags=re.IGNORECASE).strip()
        level = 0
        for cls in node.get("class") or []:
            match = re.search(r"Titre(\d)$", cls)
            if match:
                level = int(match.group(1))
        headings.append({"node": node, "title": title, "key": _key_for(title),
                         "level": level})

    # the block of text that belongs to each heading (up to the next heading)
    blocks = []
    for entry in headings:
        parts = []
        for sibling in entry["node"].next_siblings:
            if is_heading(sibling):
                break
            text = sibling.get_text(" ", strip=True) if getattr(sibling, "name", None) \
                else str(sibling).strip()
            text = normalize_heading(text)
            if text:
                parts.append(text)
        blocks.append(parts)

    # a known section keeps its sub-sections: the sub-heading titles and their
    # text belong to the parent section
    sections = []
    current = None
    for entry, parts in zip(headings, blocks):
        if entry["key"]:
            if current:
                sections.append(current)
            current = {
                "section_key": entry["key"],
                "section_title": entry["title"],
                "level": 1 if entry["key"] not in GENERIC_SECTIONS else 0,
                "text": list(parts),
                "extractor": "beautifulsoup",
            }
        elif current is not None:
            if entry["title"]:
                current["text"].append(entry["title"])
            current["text"].extend(parts)
    if current:
        sections.append(current)

    out = []
    for section in sections:
        body = "\n".join(section["text"]).strip()
        if not body:
            continue
        section["text"] = body
        out.append(section)
    return out


# ---------------------------------------------------------------------- PDF
def extract_pdf_sections(path: Path) -> list:
    """Sections of a PDF document (text layer), split on the SmPC headings."""
    import pymupdf

    pages = []
    with pymupdf.open(path) as doc:
        for number, page in enumerate(doc, start=1):
            pages.append((number, page.get_text()))
    lines = []
    for number, text in pages:
        for line in text.splitlines():
            lines.append((number, line))

    sections = []
    current = None
    for number, line in lines:
        match = PDF_HEADING_RE.match(line.strip())
        title = match.group(2).strip() if match else _is_upper_heading(line)
        key = _key_for(title) if title else ""
        if key:
            if current:
                sections.append(current)
            current = {
                "section_key": key,
                "section_title": title,
                "level": 1 if key not in GENERIC_SECTIONS else 0,
                "text": [],
                "page": number,
                "extractor": "pymupdf",
            }
        elif current is not None:
            # an unknown upper-case line is content, not a new section
            current["text"].append(line)
    if current:
        sections.append(current)

    out = []
    for section in sections:
        body = "\n".join(section.pop("text")).strip()
        if not body:
            continue
        section["text"] = body
        out.append(section)
    return out


# ----------------------------------------------------------------- dispatch
def extract_document(path: Path) -> list:
    """Extract the sections of a collected document (by file type)."""
    suffix = Path(path).suffix.lower()
    if suffix in (".html", ".htm"):
        return extract_html_sections(Path(path))
    if suffix == ".pdf":
        return extract_pdf_sections(Path(path))
    return []
