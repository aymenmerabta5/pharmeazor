"""Ministere de la Sante (Algeria) - official nomenclature, MANUAL ONLY.

The project brief states that the official Algerian nomenclature list page
must not be automated.  The adapter therefore only produces the manual
action (URL + what a human has to do); it never issues a request to the list.
"""
from src.discovery.base import Candidate

NOMENCLATURE_URL = "https://sante.gov.dz/pharmacie-et-equipements-de-sante/"
MANUAL_INSTRUCTION = (
    "Open the nomenclature section, download the list of authorised products "
    "manually, and note for every medicine whether the DCI is present "
    "(column E of the professor's list: yes / no / to verify)."
)


def manual_action(medicine: dict) -> dict:
    return {
        "source_id": "SANTE_MSP",
        "medicine_id": medicine.get("medicine_id", ""),
        "url": NOMENCLATURE_URL,
        "instruction": MANUAL_INSTRUCTION,
    }


def search(medicine: dict, session, limiter, max_results: int = 0) -> list:
    """No automated discovery: manual download only (project brief)."""
    return []
