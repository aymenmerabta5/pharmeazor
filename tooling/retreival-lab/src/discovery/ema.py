"""EMA (European Medicines Agency) source adapter.

EPAR product information documents are published as PDFs and are listed in the
EMA sitemaps, which are allowed by robots.txt (the /search/ path is not).
The sitemaps are cached locally so we do not re-download them for every
medicine.
"""
import json
import re
import time
from pathlib import Path

from config import CACHE_DIR
from src.discovery.base import Candidate, DiscoveryError
from src.utils.text import contains_token, medicine_terms, normalize

SITEMAP = "https://www.ema.europa.eu/sitemap.xml?page={page}"
PRODUCT_INFO = "/en/documents/product-information/"
CACHE = CACHE_DIR / "ema"


def _sitemap_urls(session, limiter, pages: int = 2) -> list:
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / "product_information.json"
    if cache_file.exists() and (time.time() - cache_file.stat().st_mtime) < 7 * 86400:
        return json.loads(cache_file.read_text(encoding="utf-8"))

    urls = []
    for page in range(1, pages + 1):
        if limiter:
            limiter.wait("www.ema.europa.eu")
        r = session.get(SITEMAP.format(page=page), timeout=180)
        if r.status_code != 200:
            raise DiscoveryError(f"EMA sitemap page {page} HTTP {r.status_code}")
        locs = re.findall(r"<loc>(.*?)</loc>", r.text)
        urls.extend(l for l in locs if PRODUCT_INFO in l and l.endswith("_en.pdf"))
        if not locs:
            break
    cache_file.write_text(json.dumps(urls, ensure_ascii=False, indent=1), encoding="utf-8")
    return urls


def search(medicine: dict, session, limiter, max_results: int = 4) -> list:
    inn = (medicine.get("inn") or "").strip()
    brand = (medicine.get("brand_name") or "").strip()
    needles = [normalize(brand)] if brand else []
    needles += [normalize(v) for v in medicine_terms(medicine)[:4]]

    urls = _sitemap_urls(session, limiter)
    candidates = []
    for url in urls:
        slug = normalize(url.rsplit("/", 1)[-1])
        if any(contains_token(slug, n) for n in needles if n):
            candidates.append(Candidate(
                url=url,
                title=url.rsplit("/", 1)[-1].replace("-epar-product-information_en.pdf", "")
                       .replace("_en.pdf", "").replace("-", " "),
                document_type="smpc",
                language="en",
                country="EU",
                method="requests",
                note="EMA EPAR product information (European assessment document set)",
            ))
            if len(candidates) >= max_results:
                break
    return candidates
