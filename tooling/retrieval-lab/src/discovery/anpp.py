"""ANPP source adapters.

ANPP_RCP  - the official Algerian SmPC portal (https://rcp.anpp.dz/).  It is a
            Livewire application: the search flow needs a browser, so the
            adapter drives it with Playwright (reconnaissance + collection).
ANPP_SITE - the ANPP WordPress site.  Product dossiers live under
            /wpfd_file/<slug>/ and are indexed by the WPFD sitemap.  The pages
            expose the brand name only (no DCI), so discovery matches on the
            brand name when it is known and on the DCI otherwise; the DCI is
            confirmed later by the validation step on the downloaded file.
"""
import json
import re
import time
from pathlib import Path

from bs4 import BeautifulSoup

from config import CACHE_DIR, MAX_BRAND_QUERIES
from src.discovery.base import Candidate, DiscoveryError
from src.utils.text import contains_token, medicine_terms, normalize

RCP_BASE = "https://rcp.anpp.dz/"
SITE_BASE = "https://anpp.dz"
WPFD_SITEMAP = f"{SITE_BASE}/wp-sitemap-posts-wpfd_file-1.xml"
CACHE = CACHE_DIR / "anpp"

# Administrative documents that live in the same file manager (notes, decisions,
# forms...).  They are not product dossiers, so they must not be collected as
# medicine documents.
ADMIN_PATTERNS = (
    "note-n", "note-relative", "decision-n", "arrete", "instruction",
    "formulaire", "modele", "circulaire", "rapport", "reglement", "loi-",
    "decret", "plan-", "pv-", "annexe", "procedure", "demande-", "attestation",
)


def _looks_like_product(slug: str) -> bool:
    lowered = slug.lower()
    return not any(pattern in lowered for pattern in ADMIN_PATTERNS)


def _holder_from_url(url: str) -> str:
    """The holder is part of the RCP storage path: /rcp-pdfs/<holder>/<id>.pdf"""
    parts = [p for p in url.split("/") if p]
    if "rcp-pdfs" in parts:
        index = parts.index("rcp-pdfs")
        if index + 1 < len(parts):
            return parts[index + 1].replace("-", " ")
    return ""

RCP_SEARCH_RECIPE = [
    {"action": "search", "selector": "#query",
     "button": "button:has-text('Rechercher')",
     "values": [], "wait": 3000,
     "link_selector": "a[href]"},
]


def _rcp_queries(medicine: dict, name_map=None) -> list:
    """Query order for the RCP portal.

    The portal matches the DCI field case-sensitively (the record stores
    "LOSARTAN", so "losartan" finds nothing), therefore the upper-case form
    comes first.  The Algerian commercial names follow: the portal is indexed
    by brand, and the brand list comes from the name map.
    """
    from src.utils.inn_synonyms import synonyms_for
    from src.utils.text import normalize

    inn = (medicine.get("inn") or "").strip()
    plain = normalize(inn)
    queries = []
    for value in (inn.upper(), inn, plain.upper(), plain):
        value = (value or "").strip()
        if value and value not in queries:
            queries.append(value)
    for synonym in synonyms_for(inn)[1:2]:
        synonym = synonym.upper()
        if synonym not in queries:
            queries.append(synonym)

    if name_map is not None:
        medicine_id = medicine.get("medicine_id", "")
        for brand in name_map.algerian_brands(medicine_id, limit=MAX_BRAND_QUERIES):
            value = brand.upper().strip()
            if value and value not in queries:
                queries.append(value)
        for dci in name_map.algerian_dci(medicine_id):
            value = dci.upper().strip()
            if value and value not in queries:
                queries.append(value)
    return queries


def _load_search_cache() -> dict:
    path = CACHE / "search_index.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_search_cache(cache: dict) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "search_index.json").write_text(
        json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")


# --------------------------------------------------------------------- RCP
def search_rcp(medicine: dict, session, limiter, max_results: int = 10) -> list:
    from src.collectors.playwright_collector import run_recipe
    from src.names.resolver import NameMap

    inn = (medicine.get("inn") or "").strip()
    if not inn:
        raise DiscoveryError("no INN to search")

    name_map = NameMap()
    queries = _rcp_queries(medicine, name_map)
    if not queries:
        raise DiscoveryError("no INN to search")

    # the portal is slow: keep what it returned for every query
    cache = _load_search_cache()
    missing = [q for q in queries if q not in cache]
    if missing:
        recipe = [dict(step, values=missing) if step.get("action") == "search" else step
                  for step in RCP_SEARCH_RECIPE]
        dest = CACHE / "rcp_probe.pdf"
        last_error = None
        # The portal regularly needs more than 60 s to answer a batch of
        # queries; one retry with a longer budget recovers it instead of
        # dropping every ANPP document for the medicine.
        for timeout_ms in (60000, 90000):
            try:
                result = run_recipe(RCP_BASE, recipe, dest, timeout_ms=timeout_ms)
            except Exception as exc:
                last_error = exc
                continue
            for query, urls in (result.get("search_results") or {}).items():
                cache[query] = urls
            _save_search_cache(cache)
            dest.unlink(missing_ok=True)
            last_error = None
            break
        if last_error is not None:
            raise DiscoveryError(f"ANPP RCP search failed: {last_error}")

    urls = []
    for query in queries:
        for url in cache.get(query, []):
            if url not in urls:
                urls.append(url)

    candidates = []
    for url in urls:
        if not url or url.startswith("#"):
            continue
        if not any(url.lower().split("?")[0].endswith(ext)
                   for ext in (".pdf", ".doc", ".docx")):
            continue
        holder = _holder_from_url(url)
        candidates.append(Candidate(
            url=url,
            title=f"ANPP RCP - {inn}",
            document_type="smpc",
            language="fr",
            country="DZ",
            # the RCP file is a plain public PDF: Requests is the right tool,
            # the browser was only needed for the search itself
            method="requests",
            note=f"Official Algerian SmPC (RCP) published in the ANPP RCP portal"
                 + (f" - holder: {holder}" if holder else ""),
            extra={"holder": holder},
        ))
        if len(candidates) >= max_results:
            break
    return candidates


# -------------------------------------------------------------------- site
def _product_index(session, limiter) -> list:
    """(slug, url) for every ANPP product dossier, cached for 7 days."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / "products.json"
    if cache_file.exists() and (time.time() - cache_file.stat().st_mtime) < 7 * 86400:
        import json
        return json.loads(cache_file.read_text(encoding="utf-8"))

    if limiter:
        limiter.wait("anpp.dz")
    r = session.get(WPFD_SITEMAP, timeout=120)
    if r.status_code != 200:
        raise DiscoveryError(f"ANPP sitemap HTTP {r.status_code}")
    urls = re.findall(r"<loc>(.*?)</loc>", r.text)
    items = []
    for url in urls:
        slug = url.rstrip("/").split("/")[-1]
        if slug:
            items.append({"slug": slug, "url": url})
    import json
    cache_file.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    return items


def search_site(medicine: dict, session, limiter, max_results: int = 5) -> list:
    """ANPP product dossiers.

    The dossier pages carry the brand name only, so the page is fetched and
    its attachments (PDF: notice / RCP / composition) become the candidates.
    The DCI is then confirmed on the downloaded file by the validation step.
    """
    inn = (medicine.get("inn") or "").strip()
    brand = (medicine.get("brand_name") or "").strip()
    variants = medicine_terms(medicine)
    index = _product_index(session, limiter)

    needles = [normalize(brand)] if brand else []
    needles += [normalize(v) for v in variants[:4]]

    pages = []
    for item in index:
        if not _looks_like_product(item["slug"]):
            continue
        slug_norm = normalize(item["slug"])
        if any(contains_token(slug_norm, n) for n in needles if n):
            pages.append(item)
            if len(pages) >= max_results:
                break

    candidates = []
    seen = set()
    for item in pages:
        if limiter:
            limiter.wait("anpp.dz")
        try:
            r = session.get(item["url"], timeout=60)
        except Exception:
            continue
        if r.status_code != 200:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/download/" not in href:
                continue
            if not href.lower().split("?")[0].endswith(".pdf"):
                continue
            if href in seen:
                continue
            seen.add(href)
            label = a.get_text(" ", strip=True)[:120] or item["slug"]
            candidates.append(Candidate(
                url=href,
                title=f"{item['slug']} - {label}",
                document_type="other",
                brand_name=item["slug"],
                language="fr",
                country="DZ",
                method="requests",
                note="ANPP product dossier attachment (official Algerian agency)",
                extra={"slug": item["slug"], "product_page": item["url"]},
            ))
            if len(candidates) >= max_results:
                return candidates
    return candidates
