"""Human-use check: is this document a medicine for human consumption?

The project is about medicines for people, so every collected document has to
answer that question.  The check combines three kinds of evidence:

* **veterinary signals** - "usage vétérinaire", "administré aux animaux",
  animal species...  Such a document does not belong in a human corpus.
* **the structure of a SmPC / patient notice** - "DENOMINATION DU MEDICAMENT",
  "COMPOSITION", "INDICATIONS THERAPEUTIQUES"... A document that has it is a
  medicine document.
* **administrative signals** - "rappel de lot", "décision", "note", "liste des
  lots rappelés" *without* the structure of a SmPC: a regulatory act about a
  product, not the product's SmPC.

The result is one of

    HUMAN_MEDICINE            a SmPC / patient notice for a human medicine
    VETERINARY                a veterinary product
    NOT_A_MEDICINE_DOCUMENT   a regulatory or administrative document
    UNDETERMINED              no readable text, or no signal at all
"""
import re
from pathlib import Path

# --- veterinary -----------------------------------------------------------
# Decisive: the document says the product is not for humans.  Only these
# quarantine a document.
VETERINARY_DECISIVE = [
    r"not\s+for\s+use\s+in\s+humans",
    r"for\s+veterinary\s+use\s+only",
    r"veterinary\s+prescription\s+only",
    r"for\s+use\s+in\s+(?:cattle|sheep|dogs|cats|pigs|horses|bovine|feline|canine)\s+only",
    r"r[ée]serv[ée]\s+[àa]\s+l['’]usage\s+v[ée]t[ée]rinaire",
    r"destin[ée]\s+[àa]\s+l['’]usage\s+v[ée]t[ée]rinaire",
    r"[àa]\s+usage\s+v[ée]t[ée]rinaire",
    r"m[ée]dicament\s+v[ée]t[ée]rinaire",
    r"administr[ée]\s+aux\s+animaux",
    r"usage\s+animal",
    r"injectable\s+pour\s+animaux",
]

# Weak: standard SmPC boilerplate (the pre-clinical section talks about
# "espèces animales", some labels warn to consult a veterinarian).  These only
# send a document to the review queue, they never quarantine it.
VETERINARY_WEAK = [
    r"esp[èe]ces\s+animales",
    r"licensed\s+veterinarian",
    r"\b(?:bovins|ovins|caprins|porcins|[ée]quins|volailles|canins|f[ée]lins|chatons)\b",
    r"v[ée]t[ée]rinaire",
    r"veterinary",
    r"animal\s+studies",
    r"[ée]tudes?\s+(?:chez\s+l['’]animal|animales)",
]

# --- human ---------------------------------------------------------------
HUMAN_PATTERNS = [
    r"[àa]\s+usage\s+humain",
    r"r[ée]serv[ée]e?\s+[àa]\s+l['’]usage\s+humain",
    r"administr[ée]\s+par\s+voie\s+orale",
    r"population\s+p[ée]diatrique",
    r"patients",
    r"adulte\s+et\s+enfant",
    r"human\s+use",
    r"for\s+adults\s+and\s+children",
    # a listing of a product that is not an approved medicine, but is for people
    r"not\s+reviewed\s+and\s+approved\s+by\s+(?:the\s+)?fda",
    r"fda\s+has\s+not\s+evaluated",
]

# a register extract (the national nomenclature, the French register files):
# it lists medicines, it does not describe one
REGISTER_DOCUMENT_TYPES = ("nomenclature", "composition")

# --- structure of a medicine document ------------------------------------
MEDICINE_DOCUMENT_PATTERNS = [
    r"r[ée]sum[ée]\s+des\s+caract[ée]ristiques\s+du\s+produit",
    r"r[ée]sum[ée]\s+des\s+caract[ée]ristiques\s+du\s+m[ée]dicament",
    r"d[ée]nomination\s+du\s+m[ée]dicament",
    r"1\.\s*denomination\s+du\s+m[ée]dicament",
    r"composition\s+qualitative\s+et\s+quantitative",
    r"qualitative\s+and\s+quantitative\s+composition",
    r"indications\s+th[ée]rapeutiques",
    r"indications\s+and\s+usage",
    r"posologie\s+et\s+mode\s+d['’]administration",
    r"dosage\s+and\s+administration",
    r"contre-?indications",
    r"notice\s+patient",
    r"patient\s+information",
    r"summary\s+of\s+product\s+characteristics",
    r"product\s+name",
    r"clinical\s+pharmacology",
    r"adverse\s+reactions",
    r"drug\s+interactions",
    r"warnings\s+and\s+precautions",
    r"pharmaceutical\s+form",
    r"how\s+supplied",
    r"active\s+ingredient",
]

# --- administrative / regulatory acts ------------------------------------
ADMINISTRATIVE_PATTERNS = [
    r"rappel\s+de\s+lot",
    r"rappel\s+des\s+lots",
    r"liste\s+des\s+lots\s+rappel[ée]s",
    r"retrait\s+de\s+lot",
    r"r[ée]amnarration\s+du\s+lot",
    r"d[ée]cision\s+n[°o]\s*\d",
    r"arr[êe]t[ée]\s+n[°o]\s*\d",
    r"note\s+n[°o]\s*\d",
    r"communiqu[ée]\s+(?:n[°o]\s*)?\d",
    r"avis\s+de\s+la\s+direction",
    r"liste\s+des\s+produits\s+en\s+rappel",
]

HUMAN_MEDICINE = "HUMAN_MEDICINE"
VETERINARY = "VETERINARY"
NOT_A_MEDICINE_DOCUMENT = "NOT_A_MEDICINE_DOCUMENT"
REGISTER_RECORD = "REGISTER_RECORD"
UNDETERMINED = "UNDETERMINED"

# a register extract (the national nomenclature, the BDPM register files) is
# not a medicine document: it lists medicines, it does not describe one
REGISTER_MARKERS = [
    r"nomenclature\s+nationale\s+des\s+produits\s+pharmaceutiques",
    r"nom\s+de\s+marque\s+.*\bdci\b.*\bcode\b",
    r"base\s+de\s+donn[ée]es\s+publique\s+des\s+m[ée]dicaments",
    r"liste\s+des\s+produits\s+pharmaceutiques",
]


def _hits(text: str, patterns: list) -> list:
    low = (text or "").lower()
    return [p for p in patterns if re.search(p, low, re.IGNORECASE)]


def _snippets(text: str, patterns: list, width: int = 46) -> list:
    """The text that matched, not the pattern - the report has to be readable."""
    low = (text or "").lower()
    found = []
    for pattern in patterns:
        match = re.search(pattern, low, re.IGNORECASE)
        if not match:
            continue
        start = max(0, match.start() - width // 2)
        snippet = re.sub(r"\s+", " ", (text or "")[start:match.end() + width // 2]).strip()
        if snippet and snippet not in found:
            found.append(snippet)
    return found


def classify_usage(text: str, title: str = "", document_type: str = "") -> dict:
    """Classify a document by the use of the product it describes."""
    haystack = f"{title or ''}\n{text or ''}"

    if not (text or "").strip():
        return {"status": UNDETERMINED, "confidence": "none",
                "evidence": "no readable text (scanned document?)"}

    # a register extract is not a medicine document
    if (document_type or "").strip().lower() in REGISTER_DOCUMENT_TYPES:
        return {"status": REGISTER_RECORD, "confidence": "high",
                "evidence": f"registration record ({document_type}), not an SmPC"}

    decisive = _hits(haystack, VETERINARY_DECISIVE)
    weak = _hits(haystack, VETERINARY_WEAK)
    structure = _hits(haystack, MEDICINE_DOCUMENT_PATTERNS)
    administrative = _hits(haystack, ADMINISTRATIVE_PATTERNS)
    human = _hits(haystack, HUMAN_PATTERNS)
    register = _hits(haystack, REGISTER_MARKERS)

    # the document states it is not for humans
    if decisive:
        return {"status": VETERINARY, "confidence": "high",
                "evidence": "declared for veterinary use: "
                            + "; ".join(_snippets(haystack, decisive, 60)[:2])}

    if register and not structure:
        return {"status": REGISTER_RECORD, "confidence": "high",
                "evidence": "registration record of medicines: "
                            + "; ".join(_snippets(haystack, register)[:2])}

    if structure:
        status = HUMAN_MEDICINE
        confidence = "high"
        evidence = ("medicine document structure: "
                    + "; ".join(_snippets(haystack, structure)[:2]))
        if human:
            evidence += " | human use: " + "; ".join(_snippets(haystack, human)[:2])
        if administrative:
            evidence += (" | mentions a regulatory act: "
                         + "; ".join(_snippets(haystack, administrative)[:2]))
        if weak:
            evidence += (" | animal wording (boilerplate): "
                         + "; ".join(_snippets(haystack, weak)[:2]))
        return {"status": status, "confidence": confidence, "evidence": evidence}

    if weak and not human:
        # animal wording without the structure of a medicine document
        return {"status": VETERINARY, "confidence": "medium",
                "evidence": "animal wording without SmPC structure: "
                            + "; ".join(_snippets(haystack, weak, 60)[:3])}

    if administrative:
        return {"status": NOT_A_MEDICINE_DOCUMENT, "confidence": "high",
                "evidence": "regulatory act without SmPC structure: "
                            + "; ".join(_snippets(haystack, administrative, 60)[:3])}

    if human:
        return {"status": HUMAN_MEDICINE, "confidence": "medium",
                "evidence": "human use: " + "; ".join(_snippets(haystack, human)[:3])}

    return {"status": UNDETERMINED, "confidence": "none",
            "evidence": "no medicine-document or veterinary signal"}


def document_text(path: Path, max_pages: int = 12, limit: int = 120000) -> str:
    """The readable text of a document (the whole label, not only the cover)."""
    suffix = Path(path).suffix.lower()
    try:
        if suffix == ".pdf":
            import pymupdf
            with pymupdf.open(path) as doc:
                text = "\n".join(page.get_text() for page in list(doc)[:max_pages])
        elif suffix in (".html", ".htm"):
            from bs4 import BeautifulSoup

            from src.utils.encoding import read_text_auto
            soup = BeautifulSoup(read_text_auto(path), "html.parser")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            text = soup.get_text(" ", strip=True)
        else:
            from src.utils.encoding import read_text_auto
            text = read_text_auto(path)
    except Exception:
        return ""
    return text[:limit]
