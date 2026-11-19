"""Text helpers used only by extraction.

Nothing here is allowed to rewrite stored medical content. The repair map is
used for *matching* headings when the publisher served mojibake, never for the
passage that is stored in the output table.
"""
import hashlib
import json
import re
import unicodedata


# The BDPM pages in this corpus are UTF-8 but carry a second, accidental
# encoding layer (for example "DΘnomination" for "Dénomination", "g├⌐n├⌐rale"
# for "générale").  The text is preserved as received; only the matching
# functions below see the repaired copy.
_MOJIBAKE = {
    "├⌐": "e", "├è": "E", "├¿": "e", "├à": "A", "├á": "a", "├«": "i",
    "├«": "i", "├┤": "o", "├╗": "u", "├╣": "u", "├º": "c", "├ç": "C",
    "├ë": "E", "├¬": "e", "├»": "i", "├╗": "u", "┼ô": "oe", "┼Æ": "OE",
    "Θ": "e", "Φ": "e", "α": "a", "Ω": "o", "ε": "e", "δ": "d",
    "ΓÇÖ": "'", "ΓÇ£": '"', "ΓÇ¥": '"', "ΓÇô": "-", "ΓÇö": "-",
    "ΓëÑ": ">=", "Γëñ": "<=", "┬«": "", "┬°": "°", "┬": "",
    "∩¼é": "fl", "∩¼ü": "fi", "∩¼": "", "∩": "",
    "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-",
    "\u00a0": " ",
}
_MOJIBAKE_RE = re.compile("|".join(re.escape(k) for k in
                                   sorted(_MOJIBAKE, key=len, reverse=True)))


def repair_for_match(text: str) -> str:
    """Repair the known double-encoding artefacts for matching only."""
    value = text or ""
    return _MOJIBAKE_RE.sub(lambda m: _MOJIBAKE[m.group(0)], value)


def fold(text: str) -> str:
    """Lowercase, accent-free, punctuation-light form used by heading regexes."""
    value = repair_for_match(str(text or ""))
    value = value.replace("’", "'").replace("‘", "'")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9\u0600-\u06ff]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def normalise_heading(text: str) -> str:
    """Whitespace-only normalisation; used for the *stored* heading."""
    value = re.sub(r"\s+", " ", (text or "").replace("’", "'")).strip()
    return re.sub(r"\s*Redirection vers le haut de page.*$", "", value,
                  flags=re.IGNORECASE).strip()


def heading_number(title: str) -> tuple[str, int]:
    """Return (number, level) for '4.1. Indications', else ('', 0).

    The title must start with a number and be followed by a plausible word,
    which keeps dosage lines such as '500 mg 2 fois/jour' out of the heading
    detector.
    """
    match = re.match(r"^\s*(\d+(?:\.\d+)*)\s*[-.)]?\s+(.{2,})$", title or "")
    if not match:
        return "", 0
    body = match.group(2).strip()
    if not body or not re.match(r"[A-Za-zÀ-ÖØ-Þ\u0600-\u06ff]", body):
        return "", 0
    # a lowercase continuation is prose, not an SmPC heading
    if body[0].islower():
        return "", 0
    number = match.group(1)
    return number, 1 + number.count(".")


def looks_like_upper_heading(text: str) -> bool:
    """An upper-case line that can be an SPL label heading."""
    value = normalise_heading(text)
    if len(value) < 3 or len(value) > 90:
        return False
    if value != value.upper():
        return False
    if not re.search(r"[A-Z]{3}", value):
        return False
    if value.endswith((".", ",", ";", ":")):
        return False
    if re.match(r"^[\d\W]+$", value):
        return False
    return True


def detect_printed_page(text: str, page_label: str = "") -> str:
    """The page number printed by the publisher, when it can be identified."""
    label = (page_label or "").strip()
    if label:
        return label
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if not lines:
        return ""
    edge = lines[:3] + lines[-3:]
    patterns = [
        re.compile(r"^(?:page\s*)?(\d{1,4})\s*(?:/|sur)\s*(\d{1,4})$", re.I),
        re.compile(r"^(?:page\s*)(\d{1,4})$", re.I),
        re.compile(r"^(\d{1,4})$"),
    ]
    for line in edge:
        for pattern in patterns:
            match = pattern.match(line)
            if match:
                return match.group(1)
    return ""


NUMBER_UNIT_RE = re.compile(
    r"(?<![\w.])(\d+(?:[.,]\d+)?)\s*"
    r"(mg|g|kg|mcg|µg|ug|ml|l|cl|dl|mmol|mol|%|ui|iu|u|mg/kg|mg/m2|"
    r"mg/m²|gouttes?|comprim[ée]s?|g[ée]lules?|sachets?|jours?|heures?|"
    r"semaines?|mois|ans?|minutes?|fois|prises?|doses?|suppositoires?|"
    r"applications?|injections?)(?![\w])",
    re.IGNORECASE,
)


def numeric_expressions(text: str) -> list[str]:
    """The numeric expressions with a unit, exactly as written in a passage."""
    return [m.group(0) for m in NUMBER_UNIT_RE.finditer(text or "")]


def numeric_signature(text: str) -> list[str]:
    """A comparison form for numeric validation (digits + unit, no layout)."""
    return [re.sub(r"\s+", " ", value.lower()).strip()
            for value in numeric_expressions(text)]


LANGUAGE_WORDS = {
    "fr": {"le", "la", "les", "des", "une", "dans", "pour", "avec", "est",
           "medicament", "médicament", "traitement", "douleur", "prise"},
    "en": {"the", "and", "of", "to", "in", "is", "for", "with", "medicine",
           "treatment", "pain", "take", "tablets"},
    "ar": {"من", "في", "على", "التي", "هذا", "هذه", "الدواء", "العلاج", "الجرعة"},
}


def detect_language(text: str, fallback: str = "") -> str:
    """Very small stop-word language detector (FR/EN/AR), metadata wins."""
    if fallback:
        low = fallback.lower()
        for code in ("fr", "en", "ar"):
            if low.startswith(code):
                return code.upper()
    sample = fold(text)[:4000]
    words = set(sample.split())
    scores = {code: len(words & vocab) for code, vocab in LANGUAGE_WORDS.items()}
    best = max(scores, key=scores.get)
    return best.upper() if scores[best] else "UNKNOWN"


def content_sha(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def json_dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def strip_notice_header(text: str) -> str:
    """Drop the local notice file's provenance header, keep the leaflet text."""
    if not text:
        return ""
    marker = "-" * 20
    if marker in text:
        return text.split(marker, 1)[1].lstrip()
    return text


def is_html_mojibake(text: str) -> bool:
    """Heuristic flag for the double-encoded BDPM pages."""
    sample = (text or "")[:20000]
    markers = ("DΘnomination", "indiquΘ", "SpΘcialitΘ", "g├⌐n├⌐rale", "┬«")
    return any(marker in sample for marker in markers)
