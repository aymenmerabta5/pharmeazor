"""Match a patient notice to a medication record.

The brief is explicit: a partial or combination match must never be
silently attached as an exact match.  The classifier therefore returns

    EXACT_MATCH       same medicine, brand, strength and form
    PARTIAL_MATCH     same INN but a different brand, strength or form
    COMBINATION_MATCH the requested substance together with another one
    UNVERIFIED        not enough evidence to say

and the evidence that led to the verdict, so a human can check it.

The decisive information is taken from the notice itself: the "Dénomination du
médicament" / "Product Name" line gives the commercial name, the substances
(separated by / or +), the strength and the form.
"""
import re

from src.utils.text import (
    component_forms, contains_token, dci_required_components, is_known_substance,
    normalize,
)

EXACT_MATCH = "EXACT_MATCH"
PARTIAL_MATCH = "PARTIAL_MATCH"
COMBINATION_MATCH = "COMBINATION_MATCH"
UNVERIFIED = "UNVERIFIED"

# "Dénomination du médicament : ATENOLOL/NIFEDIPINE BIOGARAN 50 mg/20 mg, gélule"
DENOMINATION_RE = re.compile(
    r"d[ée]nomination\s+du\s+m[ée]dicament\s*[:\-]?\s*"
    r"(?P<name>[^\n]{3,140})", re.IGNORECASE)
PRODUCT_NAME_EN_RE = re.compile(
    r"(?:product\s+name)\s*[:\-]?\s*(?P<name>[^\n]{3,140})", re.IGNORECASE)

STRENGTH_RE = re.compile(
    r"(\d+(?:[.,]\d+)?\s*(?:mg|g|µg|mcg|ml|IU|%)(?:\s*/\s*\d+(?:[.,]\d+)?\s*"
    r"(?:mg|g|µg|mcg|ml))*)", re.IGNORECASE)

FORM_WORDS = [
    "comprimé", "comprime", "gélule", "gelule", "sirop", "solution",
    "suspension", "pommade", "crème", "creme", "collyre", "suppositoire",
    "sachet", "granulé", "granule", "spray", "patch", "ampoule", "poudre",
]


def _brand_core(brand: str) -> str:
    """'NIFEDIPINE ARROW L.P. 30 mg, comprime' -> 'NIFEDIPINE ARROW L.P.'

    The dose and the presentation are dropped: only the commercial name is
    compared.
    """
    if not brand:
        return ""
    core = re.split(r"\d", brand)[0]
    core = re.split(r"[,;()]", core)[0]
    return re.sub(r"\s+", " ", core).strip(" ,;.-")


def _compact_doses(text: str) -> str:
    """'30 mg' -> '30mg' so that a dose is compared in the same shape."""
    return re.sub(r"(\d)\s*(mg|g|mcg|\u00b5g|ml|iu|%)\b", r"\1\2", text or "", flags=re.IGNORECASE)


def _strength_forms(strength: str) -> list:
    """'50 mg/20 mg' -> ['50 mg/20 mg', '50mg/20mg', '50 mg', '20 mg', ...]"""
    if not strength:
        return []
    norm = _compact_doses(normalize(strength))
    forms = {norm, norm.replace(" ", "")}
    for part in re.split(r"[/+]", norm):
        part = part.strip()
        if part:
            forms.add(part)
            forms.add(part.replace(" ", ""))
    return sorted(forms)


def _notice_product(text: str) -> dict:
    """The product identity printed on the notice."""
    head = " ".join((text or "")[:3000].split())
    name = ""
    for pattern in (DENOMINATION_RE, PRODUCT_NAME_EN_RE):
        match = pattern.search(head)
        if match:
            name = match.group("name").strip(" .")
            break
    if not name:
        # English labels: the product name is the first line
        first = head.split(" . ")[0]
        name = first[:120] if first else ""
    # the name stops at the boxed summary that follows it
    for stop in ("Encadré", "Encadre", "Veuillez lire", "Sommaire", "Rubrique"):
        index = name.find(stop)
        if index > 0:
            name = name[:index]

    strength = ""
    match = STRENGTH_RE.search(name)
    if match:
        strength = match.group(1).strip()
    form = ""
    for candidate in FORM_WORDS:
        if candidate in name.lower():
            form = candidate
            break
    return {"name": name, "strength": strength, "form": form,
            "substances": _substances_of(name)}


def _substances_of(name: str) -> list:
    """The substances declared in a product name ('ATENOLOL/NIFEDIPINE ...',
    'PARACETAMOL ET PSEUDOEPHEDRINE ...')."""
    if not name:
        return []
    head = re.split(r"\d", name)[0]
    parts = re.split(r"[/+]|\s+ET\s+", head)
    out = []
    for part in parts:
        part = re.sub(r"\s+", " ", part).strip(" ,;.-()")
        if len(part) > 2 and part.lower() != "dci":
            out.append(part)
    return out


def _is_substance_of(text: str, component: str) -> bool:
    low = normalize(text)
    return any(contains_token(low, form) for form in component_forms(component))


def classify(notice_text: str, medicine: dict, expected: dict = None) -> dict:
    """Classify a notice against a medication record."""
    expected = expected or {}
    components = [c for c in dci_required_components(medicine) if c]
    low = normalize(notice_text)

    matched = [c for c in components if _is_substance_of(notice_text, c)]
    missing = [c for c in components if c not in matched]

    product = _notice_product(notice_text)
    evidence = {
        "substances_found": matched,
        "substances_missing": missing,
        "product_name": product["name"],
        "product_strength": product["strength"],
        "product_form": product["form"],
        "notice_substances": product["substances"],
    }

    if not components or not matched:
        evidence["reason"] = "the notice does not name the substance of the record"
        return {"status": UNVERIFIED, "evidence": evidence}

    # a combination: the notice declares more substances than the record.
    # A commercial name is never a substance and is ignored.
    extra = []
    for substance in product["substances"]:
        if len(substance) < 3:
            continue
        if any(_is_substance_of(substance, c) for c in components):
            continue
        if is_known_substance(substance):
            extra.append(substance)
    if not extra and len(product["substances"]) > len(components):
        # more substances are declared than the record holds: the notice is
        # for a combination (the extra substance may not be in our list)
        extra = [s for s in product["substances"]
                 if not any(_is_substance_of(s, c) for c in components)]
        if extra and len(product["substances"]) == len(components):
            extra = []
    if extra and missing:
        evidence["other_substances"] = extra
        evidence["reason"] = ("the notice covers only part of the combination "
                               "(missing " + ", ".join(missing) + ")")
        return {"status": COMBINATION_MATCH, "evidence": evidence}
    if extra:
        evidence["other_substances"] = extra
        evidence["reason"] = ("the notice combines the substance with "
                               + ", ".join(extra))
        return {"status": COMBINATION_MATCH, "evidence": evidence}

    # the record may hold several products (brands, strengths, forms):
    # the notice is exact when it matches one of them
    products_expected = expected if isinstance(expected, list) else [expected]
    haystack = _compact_doses(normalize(notice_text))
    notice_name = normalize(product["name"])

    best = None
    for candidate in products_expected:
        brand = _brand_core(candidate.get("brand_name") or "")
        brand_ok = bool(brand) and (notice_name.startswith(normalize(brand))
                                    or contains_token(notice_name, normalize(brand)))
        strength = candidate.get("strength") or ""
        strength_ok = True
        if strength:
            forms = _strength_forms(strength)
            strength_ok = any(contains_token(haystack, form) for form in forms)
        form = normalize(candidate.get("form") or "")
        form_ok = True
        if form:
            notice_form = normalize(product["form"] or "")
            form_ok = any(contains_token(notice_form, f) or contains_token(haystack, f)
                          for f in FORM_WORDS)
        missing_bits = []
        if not brand_ok:
            missing_bits.append("brand" if brand else "brand (no commercial name recorded)")
        if not strength_ok:
            missing_bits.append("strength")
        if not form_ok:
            missing_bits.append("form")
        result = {"brand_expected": brand, "brand_matched": brand_ok,
                  "strength_expected": strength, "strength_matched": strength_ok,
                  "form_expected": form, "form_matched": form_ok,
                  "missing": missing_bits, "product": candidate}
        if best is None or len(missing_bits) < len(best["missing"]):
            best = result
        if not missing_bits:
            break

    evidence.update({k: v for k, v in best.items() if k != "product"})
    evidence["matched_product"] = best["product"]

    if not best["missing"]:
        evidence["reason"] = "same substance, brand, strength and form"
        return {"status": EXACT_MATCH, "evidence": evidence}

    if best["missing"]:
        evidence["reason"] = "same substance, different " + ", ".join(best["missing"])
        return {"status": PARTIAL_MATCH, "evidence": evidence}

    evidence["reason"] = "same substance; no product identity printed to compare"
    return {"status": PARTIAL_MATCH, "evidence": evidence}
