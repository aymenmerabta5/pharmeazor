"""Identity + file integrity checks.  No medical content rewriting here.

Everything here is deliberately conservative: a document is only 'verified'
when the expected identity evidence is actually present in the file text.
Anything ambiguous becomes 'needs_review' for a human.
"""
import hashlib
import re
from pathlib import Path
from urllib.parse import urlsplit

from config import QUARANTINE_DIR
from src.utils.text import (
    component_forms, contains_token, dci_head, dci_required_components, normalize,
    strength_variants,
)

# ---------------------------------------------------------------- file level
def check_http_result(res: dict):
    if res.get("status_code", 0) >= 400:
        return False, f"HTTP {res.get('status_code')}"
    if not res.get("file_size"):
        return False, "empty file"
    return True, ""


def check_pdf_signature(path: Path) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(5).startswith(b"%PDF-")
    except OSError:
        return False


def verify_file_integrity(path: Path, res: dict, expected_type: str = ""):
    """The file must be what its extension promises.

    * a `.pdf` must really be a PDF (not an HTML error page saved as .pdf)
    * an `.html` document is a legitimate document (the BDPM product pages)
    * a text file must not be an HTML page
    """
    issues = []
    if not path.exists():
        return False, f"file missing: {path}"
    suffix = path.suffix.lower()
    ctype = (res.get("content_type") or "").lower()
    try:
        head = path.read_bytes()[:400].lstrip().lower()
    except OSError:
        head = b""

    is_html = head.startswith(b"<!doctype html") or head.startswith(b"<html") or b"<html" in head
    is_pdf = head.startswith(b"%pdf-")

    if suffix == ".pdf":
        if not is_pdf:
            issues.append("file does not start with %PDF- signature")
        if "text/html" in ctype:
            issues.append("content-type is text/html for a .pdf target")
    elif suffix in (".html", ".htm"):
        if is_pdf:
            issues.append("file is a PDF, not an HTML document")
        if not is_html and not is_pdf:
            issues.append("file does not look like an HTML document")
    else:
        if is_html:
            issues.append("file contains an HTML page, not a document")
        if "text/html" in ctype:
            issues.append("content-type is text/html")
    return (len(issues) == 0), "; ".join(issues)


def domain_changed(approved_url: str, final_url: str) -> bool:
    from src.compliance.registry import host_of
    return host_of(approved_url) != host_of(final_url)


JURISDICTION_MARKERS = {
    "DZ": ["algerie", "algeria", "algerien", "republique algerienne",
           "ministere de la sante", "anpp"],
    "FR": ["france", "francais", "ansm"],
    "US": ["united states", "fda", "nlm.nih.gov", "food and drug administration"],
    "EU": ["european union", "european medicines agency", "ema"],
}


def extension_for(res: dict, url: str = "") -> str:
    """File extension from the response content type (never from the URL)."""
    ctype = (res.get("content_type") or "").lower()
    if "pdf" in ctype:
        return "pdf"
    if "csv" in ctype:
        return "csv"
    if "html" in ctype:
        return "html"
    if "json" in ctype:
        return "json"
    if "xml" in ctype:
        return "xml"
    if "text/" in ctype or "plain" in ctype:
        return "txt"
    suffix = (url or "").split("?")[0].lower()
    for ext in ("pdf", "txt", "csv", "html", "htm", "json", "xml"):
        if suffix.endswith("." + ext):
            return ext
    return "pdf" if res.get("file_size") and not ctype else "bin"


# ------------------------------------------------------------- text level
_XLSX_TEXT_CACHE: dict = {}


def _xlsx_text(path: Path) -> str:
    """Text of an xlsx document (cached): every cell value, line per row."""
    key = str(path)
    if key in _XLSX_TEXT_CACHE:
        return _XLSX_TEXT_CACHE[key]
    try:
        from src.medicines.xlsx import read_rows

        rows = read_rows(path)
        lines = []
        for row in rows:
            lines.append(" ".join(str(v) for v in row.values()))
        text = "\n".join(lines)
    except Exception:
        text = ""
    _XLSX_TEXT_CACHE[key] = text
    return text


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    try:
        if ext == ".pdf":
            import pymupdf
            with pymupdf.open(path) as doc:
                return "\n".join(page.get_text() for page in doc)
        if ext in (".html", ".htm"):
            from bs4 import BeautifulSoup
            from src.utils.encoding import read_text_auto
            soup = BeautifulSoup(read_text_auto(path), "html.parser")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            return soup.get_text(" ")
        if ext in (".txt", ".csv"):
            from src.utils.encoding import read_text_auto
            return read_text_auto(path)
        if ext in (".xlsx", ".xlsm"):
            return _xlsx_text(path)
    except Exception:
        return ""
    return ""


DECLARED_DCI_RE = re.compile(
    r"\b(?:d[ée]nomination commune internationale|dci)\b\s*(?:\(dci\))?\s*[:\-–]?\s*"
    r"([A-Za-zÀ-ÿ][^\n]{1,79})",
    re.IGNORECASE)


def declared_substance(text: str) -> str:
    """The substance the document itself declares (for an audit note)."""
    if not text:
        return ""
    match = DECLARED_DCI_RE.search(text)
    if not match:
        return ""
    value = normalize(match.group(1))
    return value[:80]


def check_medicine_relevance(text: str, expected: dict) -> tuple:
    """Return (relevance_status, note).

    relevance_status in {verified, needs_review, rejected, not_checked}

    A medicine is identified by its *substances*: every substance of a
    combination must be present, and each substance may appear under any of
    its INN spellings (paracetamol / acetaminophen, enalapril / enalapril
    maleate, ...).
    """
    if not text.strip():
        return "not_checked", "no extractable text (scanned PDF?)"

    low = normalize(text)
    raw_components = expected.get("dci_required") or expected.get("dci_components") or []
    if isinstance(raw_components, str):
        raw_components = [t.strip() for t in raw_components.split("|") if t.strip()]
    components = [c for c in raw_components if c]
    if not components and expected.get("inn"):
        components = dci_required_components(expected)
    if not components:
        components = [(expected.get("inn") or expected.get("name") or "").strip()]
    components = [c for c in components if c]

    matched, missing = [], []
    for component in components:
        found = [f for f in component_forms(component) if contains_token(low, f)]
        if found:
            matched.append(f"{component} ({found[0]})")
        else:
            missing.append(component)

    # a combination may be stated under its own INN ("COTRIMOXAZOLE")
    head = dci_head(expected)
    head_forms = [f for f in component_forms(head) if contains_token(low, f)] if head else []
    if missing and head_forms and len(missing) == len(components):
        matched.append(f"{head} ({head_forms[0]}, combinaison)")
        missing = []

    brand = normalize(expected.get("brand_name") or "")
    # The brand check only makes sense for a real commercial name.  Label
    # titles ("CHILDRENS IBUPROFEN (IBUPROFEN) SUSPENSION") are not brands and
    # would fail for formatting reasons rather than for a wrong document.
    if brand and (len(brand.split()) > 3 or "(" in brand or ")" in brand):
        brand = ""
    strength = (expected.get("strength") or "").strip()
    strength_hits = any(contains_token(low, v) for v in strength_variants(strength)) if strength else None
    country = (expected.get("country") or "").strip().upper()
    country_hits = None
    markers = JURISDICTION_MARKERS.get(country)
    if markers:
        country_hits = any(contains_token(low, m) for m in markers)
        notes_extra = (f"document does not mention {country} "
                       f"(markers checked: {', '.join(markers[:3])})") if not country_hits else ""
    else:
        notes_extra = ""

    notes = []
    soft_notes = []
    if not components:
        return "needs_review", "no expected identity fields provided"

    if not matched:
        notes.append(f"none of the expected substances found ({', '.join(components[:4])})")
        declared = declared_substance(text)
        if declared:
            notes.append(f"the document declares another substance: {declared}")
        return "rejected", "; ".join(notes)

    if missing:
        notes.append("missing substance(s): " + ", ".join(missing))
    if brand and not contains_token(low, brand):
        notes.append("brand name not found")
    if strength_hits is False:
        notes.append(f"strength '{strength}' not found")
    if country_hits is False:
        if country == "DZ":
            # a foreign leaflet must never pass as an Algerian-approved one
            notes.append(notes_extra)
        else:
            # for foreign sources the country is only a hint, not a blocker
            soft_notes.append(notes_extra)

    if notes:
        return "needs_review", "; ".join(notes)
    note = (f"identity confirmed ({len(matched)} substance(s): {', '.join(matched[:4])})"
            + (f", strength '{strength}' confirmed" if strength_hits else ""))
    if soft_notes:
        note += " | " + "; ".join(soft_notes)
    return "verified", note


def document_title(path: Path, text: str = "") -> str:
    """A usable document title: the first meaningful line of the file."""
    if not text:
        text = extract_text(path)
    for line in (text or "").splitlines():
        line = line.strip()
        if len(line) >= 4 and not line.lower().startswith("page "):
            return line[:200]
    return ""


def quarantine_file(path: Path, reason: str) -> Path:
    """Move a rejected file out of the corpus, keeping it for review.

    Idempotent: a file that already sits in the quarantine folder keeps its
    name, so re-running a check never renames a document.
    """
    path = Path(path)
    QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if path.parent.resolve() == QUARANTINE_DIR.resolve():
            return path
    except OSError:
        pass
    target = QUARANTINE_DIR / path.name
    if target.exists():
        # same name, different content: a stable digest, not a random one
        digest = hashlib.sha1(reason.encode("utf-8")).hexdigest()[:4]
        target = QUARANTINE_DIR / f"{path.stem}_{digest}{path.suffix}"
    try:
        path.replace(target)
        return target
    except OSError:
        return path


def url_host(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()
