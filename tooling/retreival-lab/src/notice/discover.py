"""Discovery of patient notices on the manufacturers' own sites.

The official Algerian portal publishes RCPs only, so the notices have to be
looked for on the sites of the pharmaceutical manufacturers that hold the
registration (their name comes from the official nomenclature).  For every
source the robots.txt is checked first; a path outside the reviewed scope is
never fetched.
"""
import re
import time
from urllib.parse import urljoin, urlsplit

from config import NOTICE_LINK_PATTERNS, SEED_NOTICE_SOURCES
from src.compliance.registry import _in_scope, host_of
from src.compliance.robots import check_robots
from src.utils.text import normalize


def _matches_notice(text: str) -> bool:
    low = (text or "").lower()
    return any(re.search(p, low, re.IGNORECASE) for p in NOTICE_LINK_PATTERNS)


def _product_pages(source: dict, session, limiter, cache: dict = None) -> list:
    """The product pages of a manufacturer (from its sitemap)."""
    sitemap = source.get("product_sitemap")
    if not sitemap:
        return []
    if cache is not None and sitemap in cache:
        return cache[sitemap]
    if limiter:
        limiter.wait(host_of(sitemap))
    try:
        r = session.get(sitemap, timeout=60)
    except Exception:
        return []
    urls = re.findall(r"<loc>(.*?)</loc>", r.text) if r.status_code == 200 else []
    if cache is not None:
        cache[sitemap] = urls
    return urls


def discover_notices(medicine: dict, brands: list, session, limiter,
                     cache: dict = None) -> list:
    """Candidate notice documents for a medicine on the manufacturer sites.

    Returns a list of dicts: {source_id, url, title, kind, note}.
    """
    results = []
    needles = [normalize(b) for b in brands if b]
    if not needles:
        return results

    for source in SEED_NOTICE_SOURCES:
        robots = check_robots(source.get("robots_url", ""),
                              f"https://{source['base_domain']}/")
        if not robots.get("can_fetch", False):
            results.append({
                "source_id": source["source_id"], "url": "", "title": "",
                "kind": "blocked", "note": robots.get("error") or
                "robots.txt does not allow this source",
            })
            continue

        pages = _product_pages(source, session, limiter, cache)
        for page_url in pages:
            if not _in_scope(page_url, source["base_domain"],
                             source.get("allowed_scope", "/")):
                continue
            slug = normalize(page_url.rstrip("/").split("/")[-1])
            if not any(needle and needle in slug for needle in needles):
                continue
            if limiter:
                limiter.wait(host_of(page_url))
            try:
                r = session.get(page_url, timeout=60)
            except Exception as exc:
                results.append({"source_id": source["source_id"], "url": page_url,
                                "title": "", "kind": "error", "note": str(exc)[:120]})
                continue
            if r.status_code != 200:
                continue

            from bs4 import BeautifulSoup

            soup = BeautifulSoup(r.text, "html.parser")
            found = False
            for link in soup.find_all("a", href=True):
                href = link["href"]
                label = link.get_text(" ", strip=True)
                if not _matches_notice(label + " " + href):
                    continue
                absolute = urljoin(page_url, href)
                parsed = urlsplit(absolute)
                if href.startswith("#") or "popup" in (parsed.fragment or "").lower():
                    # the notice is shown in a pop-up, not as a file
                    results.append({
                        "source_id": source["source_id"], "url": page_url,
                        "title": label, "kind": "popup",
                        "note": ("the manufacturer shows the notice in a pop-up; "
                                 "no downloadable file is published"),
                    })
                    found = True
                    continue
                if not parsed.path.lower().endswith(
                        (".pdf", ".doc", ".docx", ".htm", ".html")):
                    continue
                if not _in_scope(absolute, source["base_domain"],
                                 source.get("allowed_scope", "/")):
                    continue
                results.append({
                    "source_id": source["source_id"], "url": absolute,
                    "title": label, "kind": "document",
                    "note": "patient notice published by the manufacturer",
                })
                found = True
            if not found:
                results.append({
                    "source_id": source["source_id"], "url": page_url,
                    "title": "", "kind": "no-notice",
                    "note": "the product page publishes no patient notice",
                })
    return results
