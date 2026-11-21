"""Discovery: find candidate documents for a medicine on a given source.

A *source adapter* returns Candidate objects (URL + metadata) that the
collector then gates, downloads and validates.  Adapters never bypass the
compliance gate: the URL they return is checked again by the gate before any
request is made.
"""
from dataclasses import dataclass, field


@dataclass
class Candidate:
    url: str
    title: str = ""
    document_type: str = "other"     # smpc | notice | label | nomenclature | safety | other
    brand_name: str = ""
    language: str = ""
    country: str = ""
    publication_date: str = ""
    strength_form: str = ""
    method: str = "requests"         # requests | playwright
    note: str = ""
    extra: dict = field(default_factory=dict)
    # A copy already fetched for this exact URL (the shared register file).
    # The collector uses it instead of downloading the same bytes again.
    local_path: str = ""

    def as_dict(self) -> dict:
        return {
            "url": self.url, "title": self.title, "document_type": self.document_type,
            "brand_name": self.brand_name, "language": self.language,
            "country": self.country, "publication_date": self.publication_date,
            "strength_form": self.strength_form, "method": self.method,
            "note": self.note, "extra": self.extra,
        }


class DiscoveryError(Exception):
    """Raised when a source adapter cannot run at all (blocked, unreachable)."""
