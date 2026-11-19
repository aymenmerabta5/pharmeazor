"""Base de donnees publique des medicaments (France) - official source.

Two artefacts per medicine:

1. the **live** product search of the site
   (`/api/options_autocompilation?searchType=medicine&term=...`), which finds
   the products currently registered (the static flat file that the site also
   publishes is a 2022 snapshot and misses recent products);
2. the product page `/medicament/<id>/extrait`, which is server-rendered and
   contains the **full SmPC (Résumé des Caractéristiques du Produit) and the
   patient notice** published by ANSM.

The static flat files (CIS_bdpm / CIS_COMPO_bdpm) are still used for the name
map (the foreign brand names), because one download covers every medicine.
"""
import json
import re
import time
from collections import defaultdict
from pathlib import Path

from config import CACHE_DIR
from src.discovery.base import Candidate, DiscoveryError
from src.utils.text import (
    contains_token, dci_required_components, medicine_terms, normalize,
)

BASE = "https://base-donnees-publique.medicaments.gouv.fr"
SEARCH_API = f"{BASE}/api/options_autocompilation"
FILES = {
    "CIS_bdpm.txt": f"{BASE}/download/file/CIS_bdpm.txt",
    "CIS_COMPO_bdpm.txt": f"{BASE}/download/file/CIS_COMPO_bdpm.txt",
}
CACHE = CACHE_DIR / "bdpm"
MAX_PRODUCTS = 4          # product pages collected per medicine
DATE_RE = re.compile(r"ANSM\s*-\s*Mis\s*à\s*jour\s*le\s*:?\s*([0-9]{2}/[0-9]{2}/[0-9]{4})", re.I)


# --------------------------------------------------------------- live search
def _search_cache(term: str) -> Path:
    safe = re.sub(r"[^a-z0-9]+", "_", term.lower())[:60]
    return CACHE / f"search_{safe}.json"


def search_products(term: str, session, limiter, max_age_days: int = 7) -> list:
    """Products whose name matches the term (the site's own autocomplete call).

    The register indexes the *product names*: "methyldopa" finds nothing
    while "aldomet" finds the product, so the caller also queries the brand
    names of the substance.
    """
    path = _search_cache(term)
    if path.exists() and (time.time() - path.stat().st_mtime) < max_age_days * 86400:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    CACHE.mkdir(parents=True, exist_ok=True)
    if limiter:
        limiter.wait("base-donnees-publique.medicaments.gouv.fr")
    r = session.get(SEARCH_API,
                    params={"searchType": "medicine", "term": term, "contains": term},
                    timeout=60)
    if r.status_code == 204:
        items = []                      # no match: that is not an error
    elif r.status_code != 200:
        raise DiscoveryError(f"BDPM search HTTP {r.status_code}")
    else:
        try:
            items = r.json()
        except ValueError:
            raise DiscoveryError("BDPM search returned non-JSON")
    items = items if isinstance(items, list) else (items.get("data") or [])
    path.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    return items


def brands_for_components(components: list, session, limiter, limit: int = 8) -> list:
    """Brand names of the products containing the given substances.

    Taken from the register extracts (CIS_bdpm + CIS_COMPO_bdpm): the live
    search matches product names, so the brands are the way in.
    """
    products, compositions = {}, defaultdict(list)
    try:
        for name in FILES:
            path = _download(session, limiter, name)
            rows = _rows(path)
            if name == "CIS_bdpm.txt":
                for row in rows:
                    if len(row) > 2:
                        products[row[0]] = row
            else:
                for row in rows:
                    if len(row) > 4:
                        compositions[row[0]].append((row[3], row[4]))
    except Exception:
        return []

    wanted = [normalize(c) for c in components if c]
    if not wanted:
        return []
    brands = []
    for pid, subs in compositions.items():
        if pid not in products:
            continue
        substances = [normalize(s) for s, _ in subs]
        if not all(any(w in s for s in substances) for w in wanted):
            continue
        name = products[pid][1]
        brand = re.split(r"\s+\d", name)[0].strip(" ,;:")
        if brand and brand not in brands:
            brands.append(brand)
        if len(brands) >= limit:
            break
    return brands


# ------------------------------------------------------------- flat files
def _download(session, limiter, name: str) -> Path:
    path = CACHE / name
    if path.exists() and path.stat().st_size > 0:
        return path
    CACHE.mkdir(parents=True, exist_ok=True)
    if limiter:
        limiter.wait("base-donnees-publique.medicaments.gouv.fr")
    r = session.get(FILES[name], timeout=180)
    if r.status_code != 200:
        raise DiscoveryError(f"BDPM {name} HTTP {r.status_code}")
    path.write_bytes(r.content)
    return path


def _rows(path: Path) -> list:
    text = path.read_bytes().decode("cp1252", errors="replace")
    return [line.split("\t") for line in text.splitlines() if line.strip()]


# ------------------------------------------------------------- discovery
def search(medicine: dict, session, limiter, max_results: int = 6) -> list:
    inn = (medicine.get("inn") or "").strip()
    if not inn:
        raise DiscoveryError("no INN to search")
    components = [normalize(c) for c in dci_required_components(medicine) if c]
    variants = medicine_terms(medicine)

    candidates = []
    seen_urls = set()

    # 1. the live product pages (SmPC + notice)
    products = []
    # (term, from_brand): a term that is a brand of this medicine already
    # identifies the product, even when its name does not repeat the DCI
    queries = [(term, False) for term in variants[:3]]
    for brand in brands_for_components(components, session, limiter, limit=6):
        for form in (brand, brand.upper()):
            queries.append((form, True))
    try:
        from src.names.resolver import NameMap

        for brand in NameMap().algerian_brands(medicine.get("medicine_id", ""), limit=8):
            for form in (brand, brand.upper()):
                queries.append((form, True))
    except Exception:
        pass

    seen_terms = set()
    for term, from_brand in queries[:16]:
        if term in seen_terms:
            continue
        seen_terms.add(term)
        try:
            found = search_products(term, session, limiter)
        except DiscoveryError:
            continue
        for item in found:
            products.append((item, from_brand))
    for item, from_brand in products:
        name = (item.get("value") or "").strip()
        url = item.get("url") or ""
        if not name or not url:
            continue
        low = normalize(name)
        # the product must carry every substance of the medicine - unless it
        # was found through a brand that already identifies this medicine
        if not from_brand and components and not all(
                any(contains_token(low, c) for c in [comp]) or comp in low
                for comp in components):
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        candidates.append(Candidate(
            url=f"{BASE}{url}",
            title=name,
            document_type="smpc",
            language="fr",
            country="FR",
            method="requests",
            note="ANSM: résumé des caractéristiques du produit et notice (page produit)",
            extra={"product_id": url.split("/")[2] if len(url.split("/")) > 2 else ""},
        ))
        if len(candidates) >= MAX_PRODUCTS:
            break

    # 2. the official register extract (one shared file, one record per medicine)
    try:
        path = _download(session, limiter, "CIS_bdpm.txt")
        rows = _rows(path)
        matched = [row for row in rows
                   if len(row) > 1 and any(
                       normalize(row[1]).startswith(v + " ") or normalize(row[1]) == v
                       for v in [normalize(x) for x in variants[:3]])]
        if matched:
            candidates.append(Candidate(
                url=FILES["CIS_bdpm.txt"],
                title=f"BDPM CIS_bdpm.txt - {len(matched)} produit(s) correspondant(s) a {inn}",
                document_type="nomenclature",
                language="fr",
                country="FR",
                publication_date=time.strftime("%Y-%m-%d"),
                method="requests",
                note="Extract of the official French register (products, holder, dosage)",
                extra={"matched_products": [r[1] for r in matched[:40]]},
            ))
    except DiscoveryError:
        pass

    return candidates


def document_metadata(path: Path) -> dict:
    """The ANSM update date printed on the product page."""
    try:
        text = path.read_bytes().decode("utf-8", errors="replace")
    except OSError:
        return {}
    match = DATE_RE.search(text)
    if not match:
        return {}
    day, month, year = match.group(1).split("/")
    return {"publication_date": f"{year}-{month}-{day}"}
