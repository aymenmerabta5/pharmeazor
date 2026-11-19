"""Discovery dispatch: one adapter per source id."""
from importlib import import_module

from config import DISCOVERY_MODULES
from src.discovery.base import Candidate, DiscoveryError

# URL used for the *source level* compliance check (the first request the
# collector would make on that source).
PROBE_URLS = {
    "ANPP_RCP": "https://rcp.anpp.dz/",
    "ANPP_SITE": "https://anpp.dz/wp-sitemap-posts-wpfd_file-1.xml",
    "SANTE_MSP": "https://sante.gov.dz/pharmacie-et-equipements-de-sante/",
    "BDPM_FR": "https://base-donnees-publique.medicaments.gouv.fr/download/file/CIS_bdpm.txt",
    "DAILYMED": "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json",
    "EMA": "https://www.ema.europa.eu/sitemap.xml?page=1",
    "PHARMNET": "https://www.pharmnet.dz/",
    "PHARMNET_CATALOG": "https://pharmnet-dz.com/",
}

# discovery entry point per source (module.function)
ENTRYPOINTS = {
    "ANPP_RCP": ("src.discovery.anpp", "search_rcp"),
    "ANPP_SITE": ("src.discovery.anpp", "search_site"),
    "SANTE_MSP": ("src.discovery.sante", "search"),
    "BDPM_FR": ("src.discovery.bdpm", "search"),
    "DAILYMED": ("src.discovery.dailymed", "search"),
    "EMA": ("src.discovery.ema", "search"),
    "PHARMNET": ("src.discovery.pharmnet", "search"),
    "PHARMNET_CATALOG": ("src.discovery.pharmnet_catalog", "discover"),
}


def probe_url(source_id: str) -> str:
    return PROBE_URLS.get(source_id, "")


def discover(source_id: str, medicine: dict, session, limiter,
             max_results: int = 10) -> list:
    """Run the adapter for a source.  Raises DiscoveryError when unusable."""
    if source_id not in ENTRYPOINTS:
        raise DiscoveryError(f"no discovery adapter for source '{source_id}'")
    module_name, func_name = ENTRYPOINTS[source_id]
    module = import_module(module_name)
    func = getattr(module, func_name)
    return func(medicine, session, limiter, max_results=max_results)


# optional per-source hook: extra document metadata read from the file
METADATA_HOOKS = {
    "BDPM_FR": ("src.discovery.bdpm", "document_metadata"),
}


def document_metadata(source_id: str, path) -> dict:
    """Source-specific metadata (e.g. the ANSM update date of a product page)."""
    hook = METADATA_HOOKS.get(source_id)
    if not hook:
        return {}
    module_name, func_name = hook
    try:
        module = import_module(module_name)
        return getattr(module, func_name)(path) or {}
    except Exception:
        return {}
