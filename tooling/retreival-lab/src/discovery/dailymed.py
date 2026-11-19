"""DailyMed (US National Library of Medicine) source adapter.

Public API v2:
    GET /dailymed/services/v2/spls.json?drug_name=<DCI>
    GET /dailymed/getFile.cfm?setid=<setid>&type=pdf      (the SPL label PDF)

The register uses the English INN, so every substance is queried under all
of its spellings (paracetamol / acetaminophen, ...).
"""
from src.discovery.base import Candidate, DiscoveryError
from src.utils.text import (
    component_forms, contains_token, dci_components, dci_required_components,
    medicine_terms, normalize,
)

API = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json"
PDF = "https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid={setid}&type=pdf"


def _queries(medicine: dict) -> list:
    """Search strings to try: every substance under its DCI and under the
    equivalent INN of another register (amoxicilline / amoxicillin)."""
    from src.utils.inn_synonyms import synonyms_for

    queries = []
    for component in dci_components(medicine):
        base = normalize(component)
        if base and base not in queries:
            queries.append(base)
        for synonym in synonyms_for(component):
            norm = normalize(synonym)
            if norm and norm != base and norm not in queries:
                queries.append(norm)
    if not queries:
        queries = medicine_terms(medicine)[:2]
    return queries[:4]


def search(medicine: dict, session, limiter, max_results: int = 6) -> list:
    inn = (medicine.get("inn") or "").strip()
    if not inn:
        raise DiscoveryError("no INN to search")

    components = [normalize(c) for c in dci_required_components(medicine) if c]
    groups = []
    for component in components:
        groups.append([normalize(f) for f in component_forms(component)])

    results, seen = [], set()
    for query in _queries(medicine):
        if limiter:
            limiter.wait("dailymed.nlm.nih.gov")
        r = session.get(API, params={"drug_name": query, "pagesize": "20"}, timeout=45)
        if r.status_code != 200:
            raise DiscoveryError(f"DailyMed API HTTP {r.status_code}")
        try:
            data = r.json()
        except ValueError:
            raise DiscoveryError("DailyMed API returned non-JSON")
        for item in data.get("data") or []:
            setid = item.get("setid")
            title = item.get("title") or ""
            if not setid or setid in seen:
                continue
            low = normalize(title)
            if groups:
                # every substance of the medicine must appear in the label title
                if not all(any(contains_token(low, form) for form in group)
                           for group in groups):
                    continue
            seen.add(setid)
            brand = title.split("[")[0].strip() if "[" in title else title
            results.append(Candidate(
                url=PDF.format(setid=setid),
                title=title.strip(),
                document_type="label",
                brand_name=brand,
                language="en",
                country="US",
                publication_date=item.get("published_date", ""),
                method="requests",
                note="DailyMed Structured Product Label (FDA approved labelling)",
                extra={"setid": setid, "spl_version": item.get("spl_version"),
                       "search_variant": query},
            ))
            if len(results) >= max_results:
                return results
    return results
