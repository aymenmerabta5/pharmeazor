"""Pharm'Net (Algerian professional website) - secondary source.

The site must always be labelled as non-official.  When it is unreachable
(offline / under maintenance) the adapter reports that instead of guessing.
"""
from src.discovery.base import Candidate, DiscoveryError
from src.utils.text import contains_token, medicine_terms, normalize

BASE = "https://www.pharmnet.dz/"


def search(medicine: dict, session, limiter, max_results: int = 5) -> list:
    inn = (medicine.get("inn") or "").strip()
    if not inn:
        raise DiscoveryError("no INN to search")
    if limiter:
        limiter.wait("www.pharmnet.dz")
    try:
        r = session.get(BASE, timeout=45)
    except Exception as exc:
        raise DiscoveryError(f"Pharm'Net unreachable: {exc}")
    if r.status_code != 200:
        raise DiscoveryError(f"Pharm'Net HTTP {r.status_code}")
    if "maintenance" in r.text.lower() or "maintenance" in r.text[:2000].lower():
        raise DiscoveryError("Pharm'Net site is under maintenance - retry later")

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(r.text, "html.parser")
    needles = [normalize(v) for v in medicine_terms(medicine)[:4]]
    candidates = []
    for a in soup.find_all("a", href=True):
        label = a.get_text(" ", strip=True)
        if any(contains_token(normalize(label), n) for n in needles if n):
            candidates.append(Candidate(
                url=a["href"], title=label[:160], document_type="other",
                language="fr", country="DZ", method="requests",
                note="Algerian professional website - secondary source, not official",
            ))
            if len(candidates) >= max_results:
                break
    return candidates
