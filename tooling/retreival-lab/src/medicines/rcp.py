"""Parse the header of an Algerian SmPC (RCP) document.

Every RCP starts with the same four items:

    1- Dénomination du médicament :
    1-1  Dénomination commerciale, dosage et forme pharmaceutique :
          CIPROFLOXACINE BEKER®
          750 mg
          Comprimé pelliculé
    1-2  Dénomination commune internationale (DCI) :
          Ciprofloxacine.

This module turns that into structured metadata (commercial name, strength,
pharmaceutical form, the DCI declared by the holder).  It reads *metadata
only* - no medical content is extracted here (that is the next stage).
"""
import re

STRENGTH_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ml|%)(?:\s*/\s*\d+(?:[.,]\d+)?\s*(mg|g|mcg|µg|ml))?",
    re.IGNORECASE,
)

FORMS = [
    "comprimés", "comprimé", "gélules", "gélule", "capsules", "capsule",
    "sirop", "solution buvable", "suspension buvable", "solution injectable",
    "solution", "pommade", "crème", "gel", "collyre", "suppositoires",
    "suppositoire", "patch", "ampoule", "spray", "granulés", "sachets",
    "poudre", "suspension", "solution buvable", "concentré",
]

MARKERS = {
    "commercial": ("denomination commerciale", "dénomination commerciale"),
    "dci": ("denomination commune internationale", "dénomination commune internationale"),
    "composition": ("composition qualitative", "composition quantitative"),
    "indications": ("indications therapeutiques",),
}


def _clean(line: str) -> str:
    return re.sub(r"\s+", " ", (line or "").replace(" ", " ")).strip()


def _find_after(text: str, markers: tuple, limit: int = 6) -> list:
    """The non-empty lines that follow the first marker line."""
    lines = [_clean(l) for l in (text or "").splitlines()]
    lines = [l for l in lines if l]
    for index, line in enumerate(lines):
        low = line.lower()
        if any(m in low for m in markers):
            block = []
            for candidate in lines[index + 1: index + 1 + limit]:
                low_c = candidate.lower()
                if any(m in low_c for m in sum(MARKERS.values(), ())) or \
                        re.match(r"^\s*\d+\s*[-\.]\s*\d", candidate):
                    break
                block.append(candidate)
            if block:
                return block
    return []


def _strength_from(block: list) -> str:
    for line in block:
        match = STRENGTH_RE.search(line)
        if match:
            return re.sub(r"\s+", " ", match.group(0)).replace(",", ",")
    return ""


def _form_from(block: list) -> str:
    for line in block:
        low = line.lower()
        for form in FORMS:
            if form in low:
                return form.capitalize()
    return ""


def _clean_name(line: str) -> str:
    """'DOLIPRANE 2.4 POUR CENT SANS SUCRE, SUSPENSION BUVABLE' -> 'DOLIPRANE'"""
    name = re.sub(r"\s*®\s*", " ", line)
    cut = len(name)
    match = STRENGTH_RE.search(name)
    if match:
        cut = min(cut, match.start())
    for form in FORMS:
        index = name.lower().find(form)
        if index > 0:
            cut = min(cut, index)
    # a dose inside the commercial name
    dose = re.search(r"\s+\d", name)
    if dose:
        cut = min(cut, dose.start())
    name = name[:cut]
    name = re.sub(r"[\s,;.]+$", "", name).strip(" ,;.:-")
    return re.sub(r"\s+", " ", name)


def parse_rcp_header(text: str) -> dict:
    """Return {commercial_name, strength, form, declared_dci, holder_hint}."""
    result = {"commercial_name": "", "strength": "", "form": "",
              "declared_dci": "", "holder_hint": ""}

    commercial = _find_after(text, MARKERS["commercial"])
    if commercial:
        name = _clean_name(commercial[0])
        if not name and len(commercial) > 1:
            name = _clean_name(" ".join(commercial[:2]))
        if name and len(name) < 120:
            result["commercial_name"] = name
        result["strength"] = _strength_from(commercial)
        result["form"] = _form_from(commercial)

    dci_block = _find_after(text, MARKERS["dci"])
    if dci_block:
        dci = dci_block[0].strip(" .:")
        dci = re.sub(r"\s+", " ", dci)
        if dci and len(dci) < 120:
            result["declared_dci"] = dci

    return result
