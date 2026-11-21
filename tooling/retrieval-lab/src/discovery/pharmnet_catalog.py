"""Pharm'Net catalogue (pharmnet-dz.com) - Algerian nomenclature, NAME SOURCE.

The site publishes a catalogue of the Algerian nomenclature: commercial name,
DCI, nomenclature code, registration number, form, dosage and holder.  It
hosts no leaflets (notice_url is empty), so this adapter produces **name
records**, not document candidates.

The catalogue request is the site's own read-only call: the public page
ships its Supabase endpoint and publishable key, and we use exactly those,
with the same user agent and the same polite delay as every other source.

The site states that the interaction data it shows is a demonstration set -
that content is excluded from the corpus by policy (see the source notes in
the registry).
"""
import json
import re
import time
from pathlib import Path

from config import CACHE_DIR
from src.discovery.base import DiscoveryError

HOME = "https://pharmnet-dz.com/"
CACHE = CACHE_DIR / "pharmnet"


def _client_config(session) -> tuple:
    """Read the public endpoint and publishable key from the site's own page."""
    r = session.get(HOME, timeout=60)
    if r.status_code != 200:
        raise DiscoveryError(f"Pharm'Net catalogue HTTP {r.status_code}")
    html = r.text
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", html)
    key = re.search(r"SUPABASE_KEY\s*=\s*'([^']+)'", html)
    if not url or not key:
        raise DiscoveryError("Pharm'Net catalogue: public endpoint not found")
    return url.group(1), key.group(1)


def _cached_path(term: str) -> Path:
    safe = re.sub(r"[^a-z0-9]+", "_", term.lower())[:60]
    return CACHE / f"search_{safe}.json"


def search_products(term: str, session, limiter, limit: int = 100) -> list:
    """Algerian products matching a DCI / brand / laboratory / code."""
    path = _cached_path(term)
    if path.exists() and (time.time() - path.stat().st_mtime) < 7 * 86400:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass

    CACHE.mkdir(parents=True, exist_ok=True)
    base, key = _client_config(session)
    if limiter:
        limiter.wait("pharmnet-dz.com")
    r = session.post(f"{base}/rest/v1/rpc/rechercher",
                     headers={"apikey": key, "Content-Type": "application/json"},
                     json={"q": term, "lim": limit}, timeout=60)
    if r.status_code != 200:
        raise DiscoveryError(f"Pharm'Net catalogue RPC HTTP {r.status_code}")
    try:
        rows = r.json() or []
    except ValueError:
        raise DiscoveryError("Pharm'Net catalogue: non-JSON answer")

    records = []
    for row in rows:
        records.append({
            "nom_commercial": row.get("nom_commercial", ""),
            "dci": row.get("dci", ""),
            "dci_code": row.get("dci_code", ""),
            "dosage": row.get("dosage", ""),
            "forme": row.get("forme", ""),
            "laboratoire": row.get("laboratoire", ""),
            "type": row.get("type", ""),
            "nb_equivalents": row.get("nb_equivalents", ""),
            "id": row.get("id", ""),
        })
    path.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    return records


# ---------------------------------------------------------------------------
# Full register snapshot
# ---------------------------------------------------------------------------
# The search RPC caps a result at 100 rows, so it can never answer "every
# product of this DCI".  The catalogue page reads the same public tables
# directly; PostgREST pages them with limit/offset, which is the site's own
# read-only path and returns the whole register.

PRODUCT_COLUMNS = (
    "id", "num_enregistrement", "dci_code", "nom_commercial", "forme",
    "dosage", "conditionnement", "liste", "date_enr_initial", "date_enr_final",
    "type", "stabilite_mois", "registre", "laboratoire_id", "observation",
    "en_rupture", "prix_ppa", "tarif_ref", "code_barre", "Rcp_url",
    "notice_url", "updated_at",
)


def _fetch_table(session, base: str, key: str, table: str, select: str,
                 *, order: str = "id", page_size: int = 1000) -> list:
    rows: list = []
    offset = 0
    while True:
        r = session.get(
            f"{base}/rest/v1/{table}",
            params={"select": select, "order": f"{order}.asc",
                    "limit": page_size, "offset": offset},
            headers={"apikey": key, "Accept": "application/json"},
            timeout=120,
        )
        if r.status_code != 200:
            raise DiscoveryError(
                f"Pharm'Net catalogue {table} HTTP {r.status_code}: {r.text[:200]}")
        batch = r.json() or []
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        offset += page_size


def fetch_catalogue(session) -> dict:
    """The complete nomenclature snapshot: products, DCI labels and holders.

    The catalogue ships no leaflets (``Rcp_url`` / ``notice_url`` are empty for
    every row), so this is a register snapshot, never clinical prose.
    """
    base, key = _client_config(session)
    return {
        "endpoint": base,
        "produits": _fetch_table(session, base, key, "produits",
                                 ",".join(PRODUCT_COLUMNS)),
        "dci": _fetch_table(session, base, key, "dci",
                            "code,denomination,sous_classe,classe_code",
                            order="code"),
        "laboratoires": _fetch_table(session, base, key, "laboratoires",
                                     "id,nom,pays,est_local"),
    }


def discover(medicine: dict, session, limiter, max_results: int = 0) -> list:
    """No documents here - only names (the catalogue hosts no leaflets)."""
    return []
