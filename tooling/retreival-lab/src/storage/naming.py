"""Human-readable names for every file in the corpus.

The provenance tables keep the machine identifiers (`MED001`,
`MED001__SRC_DAILYMED__DOC002`); the files on disk carry the **medicine
name**, so a folder can be read without a lookup table::

    data/raw/paracetamol/paracetamol__daily-med__doc002__ac-fast.pdf
    data/raw/_shared/bdpm-fr__cis-bdpm-txt.txt
    data/raw/paracetamol/notices/paracetamol__bdpm-fr__doc002__notice.txt

`slugify` is deterministic and ASCII-only, so the same document always gets
the same path on every platform.  The document token (`doc002`) is kept so a
file can always be traced back to its `document_id` in `documents.csv`.
"""
import re
import unicodedata
from pathlib import Path

from config import QUARANTINE_DIR, RAW_DIR

SHARED_DIR_NAME = "_shared"
NOTICE_DIR_NAME = "notices"


# --- slugs ----------------------------------------------------------------
def slugify(value, limit: int = 60, fallback: str = "document") -> str:
    """A lowercase ASCII slug: "Kétoprofène + codéine" -> "ketoprofene-codeine"."""
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    text = re.sub(r"-{2,}", "-", text)
    if len(text) > limit:
        text = text[:limit].rstrip("-")
    return text or fallback


def source_slug(source_id: str) -> str:
    return slugify(str(source_id or "source").replace("_", "-"), 32, fallback="source")


def medicine_slug(medicine) -> str:
    """The name of the medicine, as a folder/file slug.

    Accepts a dict/Series (the medicine record) or a plain name.
    """
    if hasattr(medicine, "get"):
        name = (medicine.get("name") or medicine.get("inn")
                or medicine.get("medicine_id") or "")
    else:
        name = str(medicine or "")
    return slugify(name, 60, fallback="medicine")


def _ascii_fold(value) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    return text.encode("ascii", "ignore").decode("ascii").lower()


def is_generic_title(title) -> bool:
    """True for headings that describe the document, not the product.

    "ANNEXE I" or "Résumé des caractéristiques du produit" say nothing about
    which medicine the file belongs to; the brand or the holder is a better
    file label.  Commercial titles ("ATENOLOL/NIFEDIPINE BIOGARAN ...") are
    kept as they are.
    """
    text = re.sub(r"[^a-z0-9]+", " ", _ascii_fold(title)).strip()
    if not text:
        return True
    return (
        text.startswith("annexe")
        or "resume des caracteristiques" in text
        or "summary of product characteristics" in text
        or text in ("rcp", "smpc")
        or text.startswith("bdpm cis")
        or text.startswith("nomenclature nationale")
    )


def label_from_values(brand: str = "", title: str = "", holder: str = "") -> str:
    """Pick the most specific product label: brand, then title, then holder."""
    brand = str(brand or "").strip()
    if brand:
        return brand
    title = str(title or "").strip()
    if title and not is_generic_title(title):
        return title
    holder = str(holder or "").strip()
    if holder:
        return holder
    return title


def document_label(row) -> str:
    """The most specific human label a provenance row offers."""
    if hasattr(row, "get"):
        return label_from_values(row.get("brand_name", ""), row.get("title", ""),
                                 row.get("holder", ""))
    return ""


def _label_slug(label, limit: int = 48) -> str:
    """A short slug for the product label, without the marketing brackets."""
    value = re.sub(r"\[[^\]]*\]", " ", str(label or ""))
    value = re.sub(r"\([^)]*\)", " ", value)
    return slugify(value, limit, fallback="") if value.strip() else ""


def doc_token(document_id: str) -> str:
    """`MED001__SRC_DAILYMED__DOC002` -> `doc002`.

    A downloaded notice (`MED001__SRC_BEKER__NOTICE_001`) keeps its own
    counter as `notice001`.
    """
    notice = re.search(r"__NOTICE_(\d+)", str(document_id or ""))
    if notice:
        return f"notice{int(notice.group(1)):03d}"
    match = re.search(r"__DOC(\d+)", str(document_id or ""))
    if match:
        return f"doc{int(match.group(1)):03d}"
    return slugify(str(document_id or "").split("__")[-1], 24, fallback="doc")


# --- corpus paths ---------------------------------------------------------
def medicine_dir(medicine) -> Path:
    return RAW_DIR / medicine_slug(medicine)


def document_filename(medicine, source_id: str, document_id: str,
                      label: str = "", suffix: str = ".pdf") -> str:
    parts = [medicine_slug(medicine), source_slug(source_id), doc_token(document_id)]
    label_part = _label_slug(label)
    if label_part:
        parts.append(label_part)
    return "__".join(parts) + suffix


def document_path(medicine, source_id: str, document_id: str,
                  suffix: str = ".pdf", label: str = "") -> Path:
    return medicine_dir(medicine) / document_filename(
        medicine, source_id, document_id, label, suffix)


def shared_product_filename(owners, source_id: str, document_id: str,
                            label: str = "", suffix: str = ".pdf") -> str:
    names = "+".join(sorted({medicine_slug(m) for m in owners})) or "shared"
    parts = [names, source_slug(source_id), doc_token(document_id)]
    label_part = _label_slug(label, 42)
    if label_part:
        parts.append(label_part)
    return "__".join(parts) + suffix


def shared_product_path(owners, source_id: str, document_id: str,
                        suffix: str = ".pdf", label: str = "") -> Path:
    return (RAW_DIR / SHARED_DIR_NAME
            / shared_product_filename(owners, source_id, document_id, label, suffix))


def shared_register_path(source_id: str, title: str, suffix: str = ".xlsx") -> Path:
    """A register file (nomenclature, composition) shared by many medicines."""
    base = re.split(r"\s+-\s+", str(title or ""), maxsplit=1)[0]
    base = re.sub(r"^(?:bdpm|sante|msp)\b[ ._-]*", "", base, flags=re.IGNORECASE)
    label = slugify(base, 60, fallback="register")
    return RAW_DIR / SHARED_DIR_NAME / f"{source_slug(source_id)}__{label}{suffix}"


def notice_dir(medicine) -> Path:
    return medicine_dir(medicine) / NOTICE_DIR_NAME


def notice_filename(medicine, source_id: str, document_id: str,
                    suffix: str = ".txt") -> str:
    token = doc_token(document_id)
    parts = [medicine_slug(medicine), source_slug(source_id), token]
    if not token.startswith("notice"):
        parts.append("notice")
    return "__".join(parts) + suffix


def notice_path(medicine, source_id: str, document_id: str,
                suffix: str = ".txt") -> Path:
    return notice_dir(medicine) / notice_filename(medicine, source_id, document_id, suffix)


def quarantine_path(medicine, source_id: str, document_id: str,
                    suffix: str = ".pdf", label: str = "") -> Path:
    return QUARANTINE_DIR / document_filename(
        medicine, source_id, document_id, label, suffix)


def free_path(path: Path) -> Path:
    """Never overwrite an existing file: `name.pdf` -> `name__2.pdf`."""
    if not path.exists():
        return path
    for index in range(2, 1000):
        candidate = path.with_name(f"{path.stem}__{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    return path.with_name(f"{path.stem}__copy{path.suffix}")
