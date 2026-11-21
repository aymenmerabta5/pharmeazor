"""Text normalisation helpers shared by discovery, validation and reporting."""
import re
import unicodedata

# Salt / ester forms seen in official nomenclature (FR/EN).  A DCI in the
# medicine list must be matched against "DCI + salt" and "salt + DCI".
SALT_WORDS = [
    "maleate", "maleate", "fumarate", "potassium", "potassique", "sodium",
    "chlorhydrate", "hydrochloride", "sulfate", "sulphate", "mesilate",
    "mesylate", "besilate", "besylate", "tartrate", "citrate", "phosphate",
    "acetate", "succinate", "oxalate", "bromide", "chloride", "carbonate",
    "diphosphate", "hemihydrate", "anhydre", "anhydrous", "bromhydrate",
    "dihydrate", "trihydrate", "nitrate", " lactate", "lactate",
    "montelukast", "racecadotril", "arginine", "aspartate",
]

_PUNCT = re.compile(r"[^\w\s/]+", re.UNICODE)
_SPACE = re.compile(r"\s+")


def strip_accents(value: str) -> str:
    """'énalapril' -> 'enalapril' (NFD then drop combining marks)."""
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize(value: str) -> str:
    """Lowercase, de-accent, drop punctuation, collapse whitespace."""
    if not value:
        return ""
    text = strip_accents(str(value)).lower()
    text = text.replace("’", "'").replace("‘", "'")
    text = _PUNCT.sub(" ", text)
    return _SPACE.sub(" ", text).strip()


def contains_token(haystack_norm: str, needle: str) -> bool:
    """Whole-token containment on normalised strings (avoids 'para' in 'paraffin').

    Also matches inside a slash-separated group, because the registers write
    "sulfamethoxazole/trimethoprime" where the substances are separated by a
    slash instead of a space.
    """
    if not needle:
        return False
    needle = normalize(needle)
    if not needle:
        return False
    if f" {needle} " in f" {haystack_norm} ":
        return True
    flat = haystack_norm.replace("/", " ")
    return f" {needle} " in f" {flat} "


def inn_variants(inn: str) -> list:
    """Search variants for a DCI: the bare DCI first, then DCI + salt forms."""
    base = normalize(inn)
    if not base:
        return []
    variants = {base}
    for salt in SALT_WORDS:
        variants.add(f"{base} {salt}")
        variants.add(f"{salt} de {base}")
    rest = sorted(variants - {base})
    return [base] + rest


def strength_variants(value: str) -> list:
    """'500 mg' -> ['500 mg', '500mg'] so '500mg' in the leaflet still matches.

    The registers also store the galenic form in the same field
    ('20 mg, comprimés non pelliculés').  The dosage before the first comma is
    the identity-critical token; the form wording ("comprimé sécable" vs
    "comprimés non pelliculés") is not, and matching it rejects valid
    documents.  Both the full value and the dosage part are returned.
    """
    norm = normalize(value)
    if not norm:
        return []
    dosage = normalize(str(value).split(",")[0])
    out = {norm, norm.replace(" ", "")}
    if dosage:
        out.update({dosage, dosage.replace(" ", "")})
    return sorted(out)


def medicine_terms(medicine: dict) -> list:
    """Search terms for a medicine record (uses the pre-computed variants)."""
    raw = (medicine.get("inn_variants") or "").strip()
    terms = [t.strip() for t in raw.split("|") if t.strip()] if raw else []
    if not terms:
        terms = inn_variants(medicine.get("inn") or "")
    return terms


def component_forms(component: str) -> list:
    """All accepted spellings of one substance: the DCI, its salts and its
    equivalent INNs in other registers (paracetamol / acetaminophen)."""
    from src.utils.inn_synonyms import synonyms_for

    forms = []
    for form in inn_variants(component) + synonyms_for(component):
        if form not in forms:
            forms.append(form)
    return forms


def dci_components(medicine: dict) -> list:
    """The individual substances of a (possibly combination) medicine."""
    raw = (medicine.get("dci_components") or "").strip()
    if raw:
        return [t.strip() for t in raw.split("|") if t.strip()]
    inn = (medicine.get("inn") or "").strip()
    if "+" in inn or "(" in inn:
        from src.medicines.loader import split_dci
        return split_dci(inn)
    return [inn] if inn else []


def dci_required_components(medicine: dict) -> list:
    """Substances a document must contain to prove it is this medicine.

    'cotrimoxazole (sulfamethoxazole + trimethoprim)' is sold as
    'sulfamethoxazole and trimethoprim': the substances in brackets are
    required, the combination's own name is not (it never appears on the
    label).
    """
    inn = (medicine.get("inn") or "").strip()
    components = dci_components(medicine)
    if "(" in inn and ")" in inn and len(components) > 1:
        return components[1:]
    return components


def dci_head(medicine: dict) -> str:
    """The DCI of the combination itself ("cotrimoxazole"), if any.

    A register may state a combination under its own INN
    ("COTRIMOXAZOLE") instead of listing the substances
    ("sulfamethoxazole + trimethoprim"), so both forms are accepted.
    """
    inn = (medicine.get("inn") or "").strip()
    if "(" in inn:
        head = inn.split("(", 1)[0].strip()
        return normalize(head)
    return ""


_KNOWN_SUBSTANCES_CACHE = {}


def known_substances() -> dict:
    """Every substance of the medicine list -> the medicines that contain it.

    Used to tell a *substance* (which may make a notice a combination) from a
    *commercial name* (which never does).
    """
    if _KNOWN_SUBSTANCES_CACHE:
        return _KNOWN_SUBSTANCES_CACHE
    from pathlib import Path

    from config import MEDICINES_CSV, MEDICINE_COLUMNS
    from src.storage.store import read_table

    table = {}
    path = Path(MEDICINES_CSV)
    if path.exists():
        for row in read_table(path, MEDICINE_COLUMNS).to_dict("records"):
            for component in (row.get("dci_components") or "").split("|"):
                component = component.strip()
                if not component:
                    continue
                for form in component_forms(component):
                    table.setdefault(form, set()).add(row["medicine_id"])
    _KNOWN_SUBSTANCES_CACHE.update(table)
    return table


def is_known_substance(value: str) -> bool:
    """True when the text names a substance of the medicine list."""
    low = normalize(value)
    if not low:
        return False
    known = known_substances()
    if not known:
        return False
    return any(contains_token(low, form) for form in known)


def match_terms(medicine: dict) -> list:
    """All identity terms that may prove a document belongs to a medicine."""
    terms = []
    for key in ("inn", "name"):
        value = (medicine.get(key) or "").strip()
        if value:
            terms.append(value)
    terms.extend(medicine_terms(medicine))
    seen, out = set(), []
    for t in terms:
        n = normalize(t)
        if n and n not in seen:
            seen.add(n)
            out.append(t)
    return out
