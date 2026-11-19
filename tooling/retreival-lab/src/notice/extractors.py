"""Patient-notice extraction.

A *patient notice* (notice patient, notice d'information, package leaflet,
patient information leaflet) is the document written **for patients**.  It is
not an RCP/SmPC.  This module finds the notice inside a collected document and
tells the two apart.

Two shapes are handled:

* **HTML** (the ANSM product pages) embed the notice as a second, complete
  HTML document inside the page (`<META name="description" content="Notice
  patient">` ... `<TITLE>Notice patient</TITLE>`), after the RCP.
* **PDF** (the US SPL labels) end with a "PATIENT INFORMATION" section.

The extracted notice keeps the wording of the original: nothing is rewritten.
"""
import re
from pathlib import Path

# a document that is written for patients
NOTICE_MARKERS = [
    r"notice\s+patient",
    r"notice\s+d'information",
    r"informations\s+destin[ée]es\s+au\s+patient",
    r"qu'?est-ce\s+que\s+(?:ce\s+m[ée]dicament|ce\s+médicament)",
    r"comment\s+prendre\s+ce\s+m[ée]dicament",
    r"patient\s+information",
    r"patient\s+counselling\s+information",
    r"package\s+leaflet",
    r"read\s+this\s+(?:leaflet|patient)",
]

# markers that only name the document: they are not enough on their own
WEAK_MARKERS = {
    r"notice\s+patient",
    r"patient\s+information",
    r"patient\s+counselling\s+information",
    r"package\s+leaflet",
}

# a document that is the professional summary (RCP / SmPC)
RCP_MARKERS = [
    r"r[ée]sum[ée]\s+des\s+caract[ée]ristiques\s+du\s+produit",
    r"r[ée]sum[ée]\s+des\s+caract[ée]ristiques\s+du\s+m[ée]dicament",
    r"summary\s+of\s+product\s+characteristics",
]


def _matches_any(text: str, patterns: list) -> list:
    low = (text or "").lower()
    return [p for p in patterns if re.search(p, low, re.IGNORECASE)]


def notice_signals(text: str) -> dict:
    """Which notice / RCP markers a text carries."""
    return {
        "notice_markers": _matches_any(text, NOTICE_MARKERS),
        "rcp_markers": _matches_any(text, RCP_MARKERS),
    }


def is_patient_notice(text: str) -> bool:
    """True when the text carries patient-notice markers.

    A professional summary alone is not a notice.  When a document contains
    both (a full label that ends with the patient information), the order
    decides: the notice markers come first.
    """
    signals = notice_signals(text)
    if not signals["notice_markers"]:
        return False
    low = (text or "").lower()
    first_notice = min((low.find(m.lower()) for m in signals["notice_markers"]
                        if low.find(m.lower()) >= 0), default=-1)
    first_rcp = min((low.find(m.lower()) for m in signals["rcp_markers"]
                     if low.find(m.lower()) >= 0), default=-1)
    if first_rcp >= 0 and (first_notice < 0 or first_rcp < first_notice):
        return False
    strong = [m for m in signals["notice_markers"] if m not in WEAK_MARKERS]
    if strong:
        return True
    return first_rcp < 0 and len(text or "") > 400


# --------------------------------------------------------------------- HTML
REVISION_RE = re.compile(r"Mis\s*à\s*jour\s*le\s*:?\s*([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})", re.IGNORECASE)
HOLDER_RE = re.compile(
    r"titulaire\s+de\s+l[\u2019']?autorisation\s+de\s+mise\s+sur\s+le\s+march[ée]\s*:?\s*([^.;]{3,90})",
    re.IGNORECASE)


def _notice_metadata(text: str) -> dict:
    """The revision date and the holder printed on the notice."""
    meta = {"revision_date": "", "holder": ""}
    match = REVISION_RE.search(text or "")
    if match:
        day, month, year = match.group(1).split("/")
        meta["revision_date"] = f"{year}-{month}-{day}"
    match = HOLDER_RE.search(text or "")
    if match:
        holder = re.sub(r"\s+", " ", match.group(1)).strip(" .,:;")
        # the line often continues with the address (a number): keep the name
        holder = re.split(r"\s+\d", holder)[0].strip(" .,:;")
        meta["holder"] = holder.split(" - ")[0].strip(" .,:;")[:80]
    return meta


def extract_notice_from_html(path: Path) -> dict:
    """The patient notice embedded in an ANSM product page."""
    from bs4 import BeautifulSoup

    from src.utils.encoding import read_text_auto

    html = read_text_auto(Path(path))
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    # the notice is a complete HTML document embedded in the page
    for meta in soup.find_all("meta", attrs={"name": "description"}):
        if "notice" not in str(meta.get("content", "")).lower():
            continue
        root = meta.find_parent("html")
        if root is None:
            continue
        title = root.title.get_text(strip=True) if root.title else ""
        text = " ".join(root.get_text(" ", strip=True).split())
        if not is_patient_notice(text):
            continue
        meta = _notice_metadata(text)
        return {
            "text": text,
            "title": title or "Notice patient",
            "language": "fr",
            "kind": "embedded-html",
            **meta,
        }

    # fallback: a section whose headings are the notice sections
    headings = soup.find_all(class_=re.compile(r"^AmmNoticeTitre"))
    if headings:
        text = " ".join(soup.get_text(" ", strip=True).split())
        if is_patient_notice(text):
            return {"text": text, "title": "Notice patient", "language": "fr",
                    "kind": "page-section", **_notice_metadata(text)}
    return {}


# ---------------------------------------------------------------------- PDF
def extract_notice_from_pdf(path: Path) -> dict:
    """The 'PATIENT INFORMATION' section of a US label (SPL).

    The marker has to be a *heading* (a line of its own): the labels also
    cross-reference "Patient Information" inside clinical sentences, and
    those are not the patient leaflet.
    """
    import pymupdf

    pages = []
    with pymupdf.open(path) as doc:
        for number, page in enumerate(doc, start=1):
            pages.append((number, page.get_text()))

    headings = ("PATIENT INFORMATION", "PATIENT COUNSELLING INFORMATION",
                "INFORMATION FOR THE PATIENT")
    start = None
    for number, text in pages:
        lines = text.splitlines()
        for index, line in enumerate(lines):
            stripped = line.strip().upper()
            if len(stripped) > 45:
                continue
            if any(stripped.startswith(h) for h in headings):
                start = (number, index, lines[index:])
                break
        if start:
            break
    if start is None:
        return {}
    number, index, lines = start
    body = "\n".join(lines).strip()
    if not is_patient_notice(body):
        return {}
    return {
        "text": " ".join(body.split()),
        "title": lines[0].strip() or "PATIENT INFORMATION",
        "language": "en",
        "kind": "label-section",
        "page": number,
        **_notice_metadata(body),
    }


def extract_notice(path: Path) -> dict:
    """Extract the patient notice of a document, if it carries one."""
    suffix = Path(path).suffix.lower()
    if suffix in (".html", ".htm"):
        return extract_notice_from_html(Path(path))
    if suffix == ".pdf":
        return extract_notice_from_pdf(Path(path))
    return {}
