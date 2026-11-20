"""Discovery dispatch: one adapter per source id.

The routing table lives in ``config.yaml`` (``discovery.entrypoints``), so a new
source is added without editing this module.
"""
from importlib import import_module

import requests

from config import DISCOVERY_ENTRYPOINTS, DISCOVERY_METADATA_HOOKS, DISCOVERY_PROBE_URLS
from src.discovery.base import Candidate, DiscoveryError


def probe_url(source_id: str) -> str:
    return DISCOVERY_PROBE_URLS.get(source_id, "")


def discover(source_id: str, medicine: dict, session, limiter,
             max_results: int = 10) -> list:
    """Run the adapter for a source.  Raises DiscoveryError when unusable.

    A transport failure is a discovery failure, not a crash: the collector
    records the source as ``discovery_failed`` for that medicine and carries
    on with the next one.
    """
    entrypoint = DISCOVERY_ENTRYPOINTS.get(source_id)
    if entrypoint is None:
        raise DiscoveryError(f"no discovery adapter for source '{source_id}'")
    module_name, func_name = entrypoint
    module = import_module(module_name)
    func = getattr(module, func_name)
    try:
        return func(medicine, session, limiter, max_results=max_results)
    except DiscoveryError:
        raise
    except (requests.RequestException, OSError) as exc:
        raise DiscoveryError(f"{source_id} discovery failed: {exc}") from exc


def document_metadata(source_id: str, path) -> dict:
    """Source-specific metadata (e.g. the ANSM update date of a product page)."""
    hook = DISCOVERY_METADATA_HOOKS.get(source_id)
    if not hook:
        return {}
    module_name, func_name = hook
    try:
        module = import_module(module_name)
        return getattr(module, func_name)(path) or {}
    except Exception:
        return {}
