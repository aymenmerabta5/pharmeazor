"""Canonical section taxonomy for the EN/FR medication corpus.

The raw documents use three quite different heading systems:

* ANPP SmPC PDFs: ``4.1- Indications thérapeutiques`` (numbering often split
  across two physical lines);
* BDPM HTML: ``4.1. Indications thérapeutiques`` in a ``p.AmmAnnexeTitre2``;
* DailyMed labels: either all-caps headings (``INDICATIONS AND USAGE``) or the
  modern PLR numbered form (``1 INDICATIONS AND USAGE``, ``5.1 Fetal Toxicity``).

Everything is mapped to a small, stable vocabulary so the retrieval layer can
filter on ``section = indications`` regardless of language or publisher.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .text_utils import normalize_key


@dataclass(frozen=True)
class SectionDef:
    code: str
    label: str
    aliases: tuple[str, ...]
    language: str = "any"
    tier: int = 3  # 1 = key clinical section, 2 = supporting, 3 = administrative


SECTION_DEFS: tuple[SectionDef, ...] = (
    # ---- core clinical sections (brief requires these) ---------------------
    SectionDef(
        "indications",
        "Indications",
        (
            "indications therapeutiques",
            "indications and usage",
            "indications",
            "uses",
            "purpose",
        ),
        tier=1,
    ),
    SectionDef(
        "dosage",
        "Posologie / Dosage",
        (
            "posologie et mode d administration",
            "posologie et mode dadministration",
            "posologie et mode d'administration",
            "posologie",
            "dosage and administration",
            "dosage & administration",
            "dosage and method of administration",
            "directions",
        ),
        tier=1,
    ),
    SectionDef(
        "contraindications",
        "Contre-indications",
        (
            "contre indications",
            "contre-indications",
            "contraindications",
            "do not use",
            "ne prenez jamais",
        ),
        tier=1,
    ),
    SectionDef(
        "interactions",
        "Interactions",
        (
            "interactions avec d autres medicaments et autres formes d interactions",
            "interactions avec d'autres medicaments et autres formes d'interactions",
            "interactions medicamenteuses et autres",
            "interactions medicamenteuses",
            "drug interactions",
            "interactions",
            "autres medicaments",
            "prise d autres medicaments",
        ),
        tier=1,
    ),
    # ---- supporting clinical sections -------------------------------------
    SectionDef(
        "warnings",
        "Mises en garde / Warnings",
        (
            "mises en garde speciales et precautions d emploi",
            "mises en garde speciales et precautions demploi",
            "mises en garde et precautions d emploi",
            "mises en garde",
            "warnings and precautions",
            "warnings and precautionss",
            "boxed warning",
            "warning",
            "warnings",
            "precautions",
            "drug abuse",
            "laboratory tests",
            "carcinogenesis mutagenesis impairment of fertility",
            "ask a doctor before use",
            "ask a doctor or pharmacist before use",
            "when using this product",
            "stop use and ask a doctor",
            "keep out of reach of children",
            "overdose warning",
            "allergy alert",
            "liver warning",
            "sore throat warning",
            "faites attention",
            "avertissements et precautions",
        ),
        tier=2,
    ),
    SectionDef(
        "pregnancy",
        "Grossesse et allaitement",
        (
            "fertilite grossesse et allaitement",
            "grossesse et allaitement",
            "pregnancy",
            "nursing mothers",
            "pediatric use",
            "geriatric use",
            "labor and delivery",
            "teratogenic effects",
            "nonteratogenic effects",
            "use in specific populations",
            "fertility pregnancy and lactation",
        ),
        tier=2,
    ),
    SectionDef(
        "driving",
        "Aptitude à conduire",
        (
            "effets sur l aptitude a conduire des vehicules et a utiliser des machines",
            "effets sur l aptitude a conduire des vehicules et a utiliser de machines",
            "effects on ability to drive and use machines",
        ),
        tier=2,
    ),
    SectionDef(
        "adverse_effects",
        "Effets indésirables",
        (
            "effets indesirables",
            "adverse reactions",
            "undesirable effects",
            "declaration des effets secondaires",
        ),
        tier=2,
    ),
    SectionDef(
        "overdose",
        "Surdosage",
        ("surdosage", "overdosage", "overdose"),
        tier=2,
    ),
    SectionDef(
        "pharmacodynamics",
        "Pharmacodynamie",
        (
            "proprietes pharmacodynamiques",
            "pharmacodynamics",
            "pharmacodynamie",
            "mechanism of action",
        ),
        tier=2,
    ),
    SectionDef(
        "pharmacokinetics",
        "Pharmacocinétique",
        ("proprietes pharmacocinetiques", "pharmacocinetique", "pharmacokinetics"),
        tier=2,
    ),
    SectionDef(
        "preclinical",
        "Sécurité préclinique",
        (
            "donnees de securite preclinique",
            "nonclinical toxicology",
            "preclinical safety data",
        ),
        tier=3,
    ),
    SectionDef(
        "clinical_studies",
        "Études cliniques",
        ("clinical studies", "clinical efficacy and safety"),
        tier=3,
    ),
    SectionDef(
        "clinical_data",
        "Données cliniques",
        ("donnees cliniques",),
        tier=3,
    ),
    SectionDef(
        "pharmacology",
        "Propriétés pharmacologiques",
        ("proprietes pharmacologiques",),
        tier=3,
    ),
    SectionDef(
        "pharmaceutical_data",
        "Données pharmaceutiques",
        ("donnees pharmaceutiques",),
        tier=3,
    ),
    SectionDef(
        "administrative_data",
        "Informations administratives",
        ("informations administratives",),
        tier=3,
    ),
    # ---- product / pharmaceutical sections --------------------------------
    SectionDef(
        "denomination",
        "Dénomination",
        (
            "denomination du medicament",
            "denomination commerciale dosage et forme pharmaceutique",
            "denomination commune internationale",
            "denomination",
        ),
        tier=3,
    ),
    SectionDef(
        "composition",
        "Composition",
        (
            "composition qualitative et quantitative",
            "composition",
            "description generale",
            "formule centesimale",
            "active ingredients",
            "ce que contient",
        ),
        tier=3,
    ),
    SectionDef(
        "dosage_forms",
        "Formes et dosages",
        ("dosage forms and strengths", "forme pharmaceutique"),
        tier=3,
    ),
    SectionDef(
        "description",
        "Description",
        ("description", "product information"),
        tier=3,
    ),
    SectionDef(
        "excipients",
        "Excipients",
        ("liste des excipients", "inactive ingredients", "excipients"),
        tier=3,
    ),
    SectionDef(
        "incompatibilities",
        "Incompatibilités",
        ("incompatibilites", "incompatibilities"),
        tier=3,
    ),
    SectionDef(
        "shelf_life",
        "Durée de conservation",
        ("duree de conservation", "shelf life"),
        tier=3,
    ),
    SectionDef(
        "storage",
        "Conservation",
        (
            "precautions particulieres de conservation",
            "how supplied storage and handling",
            "storage and handling",
            "how supplied",
            "comment conserver",
        ),
        tier=3,
    ),
    SectionDef(
        "package",
        "Emballage",
        (
            "nature et contenu de l emballage exterieur",
            "contenu de l emballage",
            "package",
            "package description",
            "principal display panel",
        ),
        tier=3,
    ),
    SectionDef(
        "disposal",
        "Élimination",
        (
            "precautions particulieres d elimination et de manipulation",
            "precautions particulieres d'elimination et de manipulation",
            "disposal",
        ),
        tier=3,
    ),
    SectionDef(
        "patient_counseling",
        "Conseil au patient",
        ("patient counseling information", "information pour le patient"),
        tier=3,
    ),
    # ---- administrative / regulatory --------------------------------------
    SectionDef(
        "marketing_authorization",
        "Titulaire de l'AMM",
        (
            "titulaire de l autorisation de mise sur le marche",
            "titulaire de l'autorisation de mise sur le marche",
            "titulaire",
            "nom et adresse du détenteur de la décision d'enregistrement",
            "nom et adresse du detenteur de la decision d'enregistrement",
        ),
        tier=3,
    ),
    SectionDef(
        "authorization_number",
        "Numéro d'AMM",
        (
            "numero d autorisation de mise sur le marche",
            "numero d'autorisation de mise sur le marche",
            "numero de la decision d enregistrement",
            "numero de la decision d'enregistrement",
            "numero s d autorisation de mise sur le marche",
            "condition de delivrance",
            "conditions de prescription et de delivrance",
            "condition de prescription et de delivrance",
        ),
        tier=3,
    ),
    SectionDef(
        "first_authorization",
        "Première autorisation",
        (
            "date de premiere autorisation",
            "date de premiere autorisation de renouvellement de l autorisation",
        ),
        tier=3,
    ),
    SectionDef(
        "revision",
        "Date de mise à jour",
        (
            "date de mise a jour du texte",
            "date de revision",
            "date de mise a jour",
        ),
        tier=3,
    ),
    SectionDef(
        "clinical_pharmacology",
        "Pharmacologie clinique",
        ("clinical pharmacology",),
        tier=3,
    ),
    SectionDef(
        "patient_information",
        "Notice patient",
        (
            "notice patient",
            "que contient cette notice",
            "notice",
        ),
        tier=3,
    ),
    SectionDef(
        "other_information",
        "Autres informations",
        (
            "other information",
            "questions or comments",
            "drug facts",
        ),
        tier=3,
    ),
    # ---- excluded commercial / administrative blocks -----------------------
    # These are classified so the body renderer can drop the whole section
    # (price and stock are explicitly out of scope for the corpus).
    SectionDef(
        "price",
        "Prix",
        ("prix", "price", "tarif", "tarifs"),
        tier=3,
    ),
    SectionDef(
        "reimbursement",
        "Remboursement",
        (
            "remboursement",
            "reimbursement",
            "taux de prise en charge",
            "prise en charge",
        ),
        tier=3,
    ),
    SectionDef(
        "smr",
        "Service médical rendu",
        ("service medical rendu", "smr"),
        tier=3,
    ),
    SectionDef(
        "asmr",
        "Amélioration du service médical rendu",
        (
            "amelioration du service medical rendu",
            "asmr",
            "amelioration du smr",
        ),
        tier=3,
    ),
    SectionDef(
        "stock",
        "Stock",
        ("stock", "disponibilite", "availability", "rupture de stock"),
        tier=3,
    ),
)

_ALIAS_LOOKUP: list[tuple[str, str]] = []
for _definition in SECTION_DEFS:
    for _alias in _definition.aliases:
        _ALIAS_LOOKUP.append((normalize_key(_alias), _definition.code))
# Longest alias first, so "interactions avec ..." wins over "interactions".
_ALIAS_LOOKUP.sort(key=lambda pair: len(pair[0]), reverse=True)

CODE_BY_LABEL = {definition.code: definition.label for definition in SECTION_DEFS}
CODE_TIER = {definition.code: definition.tier for definition in SECTION_DEFS}
# The brief's required sections are exactly the tier-1 clinical definitions.
# Deriving them keeps the taxonomy and the "key section" policy in one place.
KEY_CODES = frozenset(
    definition.code for definition in SECTION_DEFS if definition.tier == 1
)

# A heading may be prefixed by 1, 4.1, 4.1.2, "1-", "I.", etc.
# Only Arabic section numbers. Treating a leading "I" or "C" as a Roman
# numeral silently turns French headings ("Insuffisance", "Conditions") into
# "I nsuffisance" and breaks section classification.
_NUMBER_PREFIX_RE = re.compile(
    r"^\s*(?P<number>\d{1,2}(?:\.\d{1,2}){0,3})\s*[\.\)\-–—:]?\s*(?P<title>.*)$"
)
_ORPHAN_NUMBER_RE = re.compile(r"^\s*\d{1,2}(?:\.\d{1,2}){0,3}\s*[\.\-–—:)]?\s*$")
_DOSE_LINE_RE = re.compile(
    r"^\s*\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ml|cl|l|ui|iu|%)\b", re.IGNORECASE
)
_TOC_LINE_RE = re.compile(r"\.{4,}\s*\d*\s*$")


def strip_heading_number(text: str) -> tuple[str, int, str]:
    """Return ``(number, depth, title)`` for a heading candidate."""
    match = _NUMBER_PREFIX_RE.match(text)
    if not match:
        return "", 0, text.strip()
    number = match.group("number").strip()
    title = match.group("title").strip()
    # A line such as "500 mg 2 fois par jour" is a dose, not a numbered heading.
    if _DOSE_LINE_RE.match(text) and not title:
        return "", 0, text.strip()
    depth = number.count(".") + 1 if number and number[0].isdigit() else 1
    return number, depth, title


def is_orphan_number(text: str) -> bool:
    return bool(_ORPHAN_NUMBER_RE.match(text))


# French patient-leaflet headings are long questions that contain the brand
# name, so exact alias matching cannot work. These patterns only apply to
# headings that reached the classifier, never to arbitrary body text.
_NOTICE_HEADING_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^qu est ce que .* et dans quels cas .*utilis"), "indications"),
    (re.compile(r"^quelles sont les informations a connaitre avant"), "warnings"),
    (re.compile(r"^comment utiliser "), "dosage"),
    (re.compile(r"^quels sont les effets indesirables"), "adverse_effects"),
    (re.compile(r"^comment conserver "), "storage"),
    (re.compile(r"^contenu de l emballage"), "package"),
    (re.compile(r"^ce que contient "), "composition"),
    (re.compile(r"^ne prenez jamais"), "contraindications"),
    (re.compile(r"^faites attention"), "warnings"),
    (re.compile(r"^autres medicaments"), "interactions"),
    (re.compile(r"^prise d autres medicaments"), "interactions"),
    (re.compile(r"^grossesse et allaitement"), "pregnancy"),
    (re.compile(r"^conduite de vehicules"), "driving"),
)


def classify_heading(text: str) -> str:
    """Map a heading (with or without number) to a canonical section code."""
    _, _, title = strip_heading_number(text)
    key = normalize_key(title)
    if not key:
        return "other"
    for pattern, code in _NOTICE_HEADING_RULES:
        if pattern.search(key):
            return code
    for alias, code in _ALIAS_LOOKUP:
        if key == alias:
            return code
        # Allow a trailing qualifier, but not a different sentence.
        if key.startswith(alias + " ") and len(key) <= len(alias) + 45:
            return code
    return "other"


def heading_depth(text: str) -> int:
    number, depth, _ = strip_heading_number(text)
    return depth


def heading_title(text: str) -> str:
    number, _, title = strip_heading_number(text)
    if number and title:
        return f"{number} {title}".strip()
    return text.strip()


def is_toc_line(text: str) -> bool:
    return bool(_TOC_LINE_RE.search(text.strip()))


def is_dose_line(text: str) -> bool:
    return bool(_DOSE_LINE_RE.match(text.strip()))


def section_metadata(code: str) -> dict[str, object]:
    return {
        "code": code,
        "label": CODE_BY_LABEL.get(code, code),
        "tier": CODE_TIER.get(code, 3),
        "is_key_section": code in KEY_CODES,
    }
