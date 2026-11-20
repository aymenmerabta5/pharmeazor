"""Typed settings for the PHARMEAZOR collection lab.

Runtime configuration lives in ``config.yaml`` next to this module. This file
loads it once, validates the shape, resolves every path against the lab root,
and exposes the names the rest of the package imports. The module-level aliases
are a stable facade: call sites keep using ``from config import RAW_DIR`` while
the actual values come from YAML.

The loader deliberately fails loudly. A typo in a source id, a missing path or
an out-of-range threshold is a configuration error, not something to discover
halfway through a crawl.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent


class ConfigError(ValueError):
    """Raised when ``config.yaml`` is missing, malformed or inconsistent."""


# ---------------------------------------------------------------------------
# Typed settings
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PathSettings:
    data: Path
    input: Path
    raw: Path
    quarantine: Path
    metadata: Path
    reports: Path
    logs: Path
    recon: Path
    cache: Path


@dataclass(frozen=True)
class HttpSettings:
    user_agent: str
    connect_timeout_s: int
    read_timeout_s: int
    max_retries: int
    backoff_factor_s: int
    chunk_size_bytes: int
    max_file_mb: int
    default_delay_s: float
    robots_cache_ttl_h: int
    max_links_per_page: int
    blocked_statuses: tuple[int, ...]


@dataclass(frozen=True)
class DiscoverySettings:
    probe_urls: dict[str, str]
    entrypoints: dict[str, tuple[str, str]]
    metadata_hooks: dict[str, tuple[str, str]]


@dataclass(frozen=True)
class CapSettings:
    max_brand_queries: int
    foreign_cap_when_official: int
    official_extra_documents: int


@dataclass(frozen=True)
class Settings:
    config_path: Path
    root: Path
    paths: PathSettings
    http: HttpSettings
    authority_levels: dict[str, str]
    authority_names: dict[str, str]
    decisions: dict[str, str]
    manual_only_targets: tuple[dict[str, str], ...]
    excluded_domains: tuple[str, ...]
    sources: tuple[dict[str, Any], ...]
    notice_sources: tuple[dict[str, Any], ...]
    notice_link_patterns: tuple[str, ...]
    discovery: DiscoverySettings
    caps: CapSettings


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def _mapping(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError(f"'{context}' must be a mapping")
    return value


def _sequence(value: Any, context: str) -> list[Any]:
    if not isinstance(value, list):
        raise ConfigError(f"'{context}' must be a list")
    return value


def _string(value: Any, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"'{context}' must be a non-empty string")
    return value.strip()


def _integer(value: Any, context: str, *, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"'{context}' must be an integer")
    if minimum is not None and value < minimum:
        raise ConfigError(f"'{context}' must be >= {minimum}")
    return value


def _number(value: Any, context: str, *, minimum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"'{context}' must be a number")
    result = float(value)
    if minimum is not None and result < minimum:
        raise ConfigError(f"'{context}' must be >= {minimum}")
    return result


def _required(mapping: dict[str, Any], key: str, context: str) -> Any:
    if key not in mapping:
        raise ConfigError(f"missing '{context}.{key}'")
    return mapping[key]


def _path(root: Path, value: Any, context: str) -> Path:
    raw = Path(_string(value, context)).expanduser()
    return raw if raw.is_absolute() else (root / raw).resolve()


def _pair(value: Any, context: str) -> tuple[str, str]:
    items = _sequence(value, context)
    if len(items) != 2:
        raise ConfigError(f"'{context}' must contain exactly two strings")
    return (_string(items[0], f"{context}[0]"), _string(items[1], f"{context}[1]"))


def _normalise_source(source: dict[str, Any], context: str) -> dict[str, Any]:
    """Validate the fields every source needs.

    ``authority_level`` belongs to the corpus registry (``sources``); the
    patient-notice registry (``notice_sources``) lists manufacturer sites that
    are looked up for leaflets, not ranked as corpus evidence, so the field is
    optional there.
    """
    source_id = _string(_required(source, "source_id", context), f"{context}.source_id")
    _string(_required(source, "source_name", context), f"{context}.source_name")
    _string(_required(source, "base_domain", context), f"{context}.base_domain")
    normalised = dict(source)
    normalised["source_id"] = source_id
    if "authority_level" in normalised:
        normalised["authority_level"] = _string(
            normalised["authority_level"], f"{context}.authority_level"
        )
    if "crawl_delay_s" in normalised:
        normalised["crawl_delay_s"] = _number(
            normalised["crawl_delay_s"], f"{context}.crawl_delay_s", minimum=0.0
        )
    return normalised


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def _config_path() -> Path:
    override = os.environ.get("PHARMEAZOR_COLLECTION_CONFIG")
    if not override:
        return ROOT / "config.yaml"
    candidate = Path(override).expanduser()
    return candidate if candidate.is_absolute() else (ROOT / candidate)


def load_settings(config_path: Path | None = None) -> Settings:
    """Load, validate and resolve ``config.yaml``.

    Paths are resolved relative to the configuration file's directory, so the
    committed relative defaults work on every machine and the cleaning lab can
    point at this lab with a single relative ``data_root``.
    """
    path = (config_path or _config_path()).resolve()
    if not path.exists():
        raise ConfigError(f"configuration file not found: {path}")
    with path.open(encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    root = path.parent
    data = _mapping(raw, str(path))

    paths_raw = _mapping(_required(data, "paths", str(path)), "paths")
    paths = PathSettings(
        data=_path(root, _required(paths_raw, "data", "paths"), "paths.data"),
        input=_path(root, _required(paths_raw, "input", "paths"), "paths.input"),
        raw=_path(root, _required(paths_raw, "raw", "paths"), "paths.raw"),
        quarantine=_path(
            root, _required(paths_raw, "quarantine", "paths"), "paths.quarantine"
        ),
        metadata=_path(
            root, _required(paths_raw, "metadata", "paths"), "paths.metadata"
        ),
        reports=_path(root, _required(paths_raw, "reports", "paths"), "paths.reports"),
        logs=_path(root, _required(paths_raw, "logs", "paths"), "paths.logs"),
        recon=_path(root, _required(paths_raw, "recon", "paths"), "paths.recon"),
        cache=_path(root, _required(paths_raw, "cache", "paths"), "paths.cache"),
    )

    http_raw = _mapping(_required(data, "http", str(path)), "http")
    blocked = _sequence(_required(http_raw, "blocked_statuses", "http"), "http.blocked_statuses")
    http = HttpSettings(
        user_agent=_string(_required(http_raw, "user_agent", "http"), "http.user_agent"),
        connect_timeout_s=_integer(
            _required(http_raw, "connect_timeout_s", "http"),
            "http.connect_timeout_s",
            minimum=1,
        ),
        read_timeout_s=_integer(
            _required(http_raw, "read_timeout_s", "http"), "http.read_timeout_s", minimum=1
        ),
        max_retries=_integer(
            _required(http_raw, "max_retries", "http"), "http.max_retries", minimum=0
        ),
        backoff_factor_s=_integer(
            _required(http_raw, "backoff_factor_s", "http"),
            "http.backoff_factor_s",
            minimum=0,
        ),
        chunk_size_bytes=_integer(
            _required(http_raw, "chunk_size_bytes", "http"),
            "http.chunk_size_bytes",
            minimum=1,
        ),
        max_file_mb=_integer(
            _required(http_raw, "max_file_mb", "http"), "http.max_file_mb", minimum=1
        ),
        default_delay_s=_number(
            _required(http_raw, "default_delay_s", "http"),
            "http.default_delay_s",
            minimum=0.0,
        ),
        robots_cache_ttl_h=_integer(
            _required(http_raw, "robots_cache_ttl_h", "http"),
            "http.robots_cache_ttl_h",
            minimum=0,
        ),
        max_links_per_page=_integer(
            _required(http_raw, "max_links_per_page", "http"),
            "http.max_links_per_page",
            minimum=1,
        ),
        blocked_statuses=tuple(
            _integer(value, "http.blocked_statuses[]", minimum=100) for value in blocked
        ),
    )

    authority_raw = _mapping(_required(data, "authority", str(path)), "authority")
    levels_raw = _mapping(
        _required(authority_raw, "levels", "authority"), "authority.levels"
    )
    names_raw = _mapping(_required(authority_raw, "names", "authority"), "authority.names")
    authority_levels = {
        key: str(_string(value, f"authority.levels.{key}"))
        for key, value in levels_raw.items()
    }
    authority_names = {
        str(key): _string(value, f"authority.names.{key}") for key, value in names_raw.items()
    }
    missing_names = sorted(set(authority_levels.values()) - set(authority_names))
    if missing_names:
        raise ConfigError(f"authority.names is missing levels: {missing_names}")

    compliance_raw = _mapping(_required(data, "compliance", str(path)), "compliance")
    decisions_raw = _mapping(
        _required(compliance_raw, "decisions", "compliance"), "compliance.decisions"
    )
    decisions = {
        key: _string(value, f"compliance.decisions.{key}")
        for key, value in decisions_raw.items()
    }
    for key in ("automated", "manual", "excluded", "review_required"):
        if key not in decisions:
            raise ConfigError(f"missing 'compliance.decisions.{key}'")

    manual_targets: list[dict[str, str]] = []
    for index, item in enumerate(
        _sequence(
            _required(compliance_raw, "manual_only_targets", "compliance"),
            "compliance.manual_only_targets",
        )
    ):
        target = _mapping(item, f"compliance.manual_only_targets[{index}]")
        manual_targets.append(
            {
                "host_glob": _string(
                    _required(target, "host_glob", f"compliance.manual_only_targets[{index}]"),
                    f"compliance.manual_only_targets[{index}].host_glob",
                ),
                "path_prefix": _string(
                    _required(target, "path_prefix", f"compliance.manual_only_targets[{index}]"),
                    f"compliance.manual_only_targets[{index}].path_prefix",
                ),
                "reason": _string(
                    _required(target, "reason", f"compliance.manual_only_targets[{index}]"),
                    f"compliance.manual_only_targets[{index}].reason",
                ),
            }
        )
    excluded_domains = tuple(
        _string(value, "compliance.excluded_domains[]")
        for value in _sequence(
            _required(compliance_raw, "excluded_domains", "compliance"),
            "compliance.excluded_domains",
        )
    )

    sources = tuple(
        _normalise_source(
            _mapping(item, f"sources[{index}]"), f"sources[{index}]"
        )
        for index, item in enumerate(_sequence(_required(data, "sources", str(path)), "sources"))
    )
    source_ids = [source["source_id"] for source in sources]
    if len(source_ids) != len(set(source_ids)):
        raise ConfigError("'sources' contains duplicate source_id values")
    known_levels = set(authority_levels.values())
    unknown_levels = sorted(
        {
            str(source.get("authority_level", ""))
            for source in sources
            if str(source.get("authority_level", "")) not in known_levels
        }
    )
    if unknown_levels:
        raise ConfigError(
            f"'sources' declares unknown authority levels: {unknown_levels} "
            f"(expected one of {sorted(known_levels)})"
        )

    notice_sources = tuple(
        _normalise_source(
            _mapping(item, f"notice_sources[{index}]"), f"notice_sources[{index}]"
        )
        for index, item in enumerate(
            _sequence(_required(data, "notice_sources", str(path)), "notice_sources")
        )
    )

    notice_link_patterns = tuple(
        _string(value, "notice_link_patterns[]")
        for value in _sequence(
            _required(data, "notice_link_patterns", str(path)), "notice_link_patterns"
        )
    )

    discovery_raw = _mapping(_required(data, "discovery", str(path)), "discovery")
    probe_urls = {
        _string(key, "discovery.probe_urls key"): _string(value, f"discovery.probe_urls.{key}")
        for key, value in _mapping(
            _required(discovery_raw, "probe_urls", "discovery"), "discovery.probe_urls"
        ).items()
    }
    entrypoints = {
        _string(key, "discovery.entrypoints key"): _pair(
            value, f"discovery.entrypoints.{key}"
        )
        for key, value in _mapping(
            _required(discovery_raw, "entrypoints", "discovery"), "discovery.entrypoints"
        ).items()
    }
    metadata_hooks = {
        _string(key, "discovery.metadata_hooks key"): _pair(
            value, f"discovery.metadata_hooks.{key}"
        )
        for key, value in _mapping(
            _required(discovery_raw, "metadata_hooks", "discovery"),
            "discovery.metadata_hooks",
        ).items()
    }
    unknown = sorted(set(entrypoints) - set(source_ids))
    if unknown:
        raise ConfigError(f"'discovery.entrypoints' has unknown source ids: {unknown}")

    caps_raw = _mapping(_required(data, "caps", str(path)), "caps")
    caps = CapSettings(
        max_brand_queries=_integer(
            _required(caps_raw, "max_brand_queries", "caps"),
            "caps.max_brand_queries",
            minimum=0,
        ),
        foreign_cap_when_official=_integer(
            _required(caps_raw, "foreign_cap_when_official", "caps"),
            "caps.foreign_cap_when_official",
            minimum=0,
        ),
        official_extra_documents=_integer(
            _required(caps_raw, "official_extra_documents", "caps"),
            "caps.official_extra_documents",
            minimum=0,
        ),
    )

    return Settings(
        config_path=path,
        root=root,
        paths=paths,
        http=http,
        authority_levels=authority_levels,
        authority_names=authority_names,
        decisions=decisions,
        manual_only_targets=tuple(manual_targets),
        excluded_domains=excluded_domains,
        sources=sources,
        notice_sources=notice_sources,
        notice_link_patterns=notice_link_patterns,
        discovery=DiscoverySettings(
            probe_urls=probe_urls,
            entrypoints=entrypoints,
            metadata_hooks=metadata_hooks,
        ),
        caps=caps,
    )


settings = load_settings()

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_DIR = settings.paths.data
INPUT_DIR = settings.paths.input
RAW_DIR = settings.paths.raw
QUARANTINE_DIR = settings.paths.quarantine
META_DIR = settings.paths.metadata
REPORTS_DIR = settings.paths.reports
LOG_DIR = settings.paths.logs
RECON_DIR = settings.paths.recon
CACHE_DIR = settings.paths.cache

SOURCES_CSV = META_DIR / "sources.csv"
DOCUMENTS_CSV = META_DIR / "documents.csv"
CHECKS_CSV = META_DIR / "compliance_checks.csv"
MEDICINES_CSV = INPUT_DIR / "medicines.csv"
TARGETS_CSV = INPUT_DIR / "targets.csv"
ROBOTS_CACHE = CACHE_DIR / "robots_cache.json"
FILE_RENAMES_CSV = META_DIR / "file_renames.csv"
EXTRACTIONS_CSV = META_DIR / "extractions.csv"
EXTRACTED_SECTIONS_CSV = META_DIR / "extracted_sections.csv"
EXTRACTION_COVERAGE_CSV = REPORTS_DIR / "extraction_coverage.csv"
EXTRACTION_FAILURES_CSV = REPORTS_DIR / "extraction_failures.csv"

EVAL_DIR = DATA_DIR / "evaluation"
EVAL_SAMPLE_CSV = EVAL_DIR / "notice_sample.csv"
EVAL_REFERENCE_CSV = EVAL_DIR / "manual_reference.csv"
EVAL_PROVISIONAL_CSV = EVAL_DIR / "provisional_reference.csv"
EVAL_SCORES_CSV = EVAL_DIR / "section_scores.csv"
EVAL_METRICS_CSV = EVAL_DIR / "metrics.csv"
EVAL_REPORT_MD = EVAL_DIR / "report.md"

# Generated reports are separate from the provenance/entity tables: they can be
# regenerated at any time and are never the source of truth.
COVERAGE_REPORT_CSV = REPORTS_DIR / "coverage_report.csv"
NOTICE_REPORT_CSV = REPORTS_DIR / "notice_report.csv"
USAGE_REPORT_CSV = REPORTS_DIR / "usage_report.csv"
PENDING_REVIEW_CSV = REPORTS_DIR / "pending_review.csv"
NEEDS_ATTENTION_CSV = REPORTS_DIR / "needs_attention.csv"
MANUAL_ACTIONS_CSV = REPORTS_DIR / "manual_actions.csv"
SOURCE_HEALTH_CSV = REPORTS_DIR / "source_health.csv"
BRAND_GAP_CSV = REPORTS_DIR / "brand_gap.csv"
SECTION_COVERAGE_CSV = REPORTS_DIR / "section_coverage.csv"
PROFESSORS_LIST_CSV = REPORTS_DIR / "professors_list.csv"

# ---------------------------------------------------------------------------
# HTTP behaviour
# ---------------------------------------------------------------------------

USER_AGENT = settings.http.user_agent
CONNECT_TIMEOUT = settings.http.connect_timeout_s
READ_TIMEOUT = settings.http.read_timeout_s
MAX_RETRIES = settings.http.max_retries
BACKOFF_FACTOR = settings.http.backoff_factor_s
CHUNK_SIZE = settings.http.chunk_size_bytes
MAX_FILE_MB = settings.http.max_file_mb
DEFAULT_DELAY_S = settings.http.default_delay_s
ROBOTS_CACHE_TTL_H = settings.http.robots_cache_ttl_h
MAX_LINKS_PER_PAGE = settings.http.max_links_per_page
BLOCKED_STATUSES = settings.http.blocked_statuses

# ---------------------------------------------------------------------------
# Table schemas (code contracts, not runtime configuration)
# ---------------------------------------------------------------------------

SOURCE_COLUMNS = [
    "source_id", "source_name", "base_domain", "country", "language",
    "source_type", "authority_level", "authority_notes", "jurisdiction",
    "robots_url", "robots_checked_at", "robots_rules", "terms_url",
    "terms_checked_at", "terms_conclusion", "reviewer", "allowed_mode",
    "allowed_scope", "crawl_delay_s", "review_status", "last_reviewed_at",
    "next_review_date", "notes",
]

DOCUMENT_COLUMNS = [
    "document_id", "medicine_id", "search_term", "matched_inn", "brand_name",
    "title", "document_type", "language", "country", "strength_form", "holder",
    "source_id", "source_url", "final_url", "collection_method", "collected_at",
    "publication_date", "file_path", "content_type", "file_size", "sha256",
    "compliance_check_id", "allowed_scope", "collection_status",
    "relevance_status", "reviewer_notes", "error",
]

CHECK_COLUMNS = [
    "check_id", "source_id", "target_url", "checked_at",
    "robots_status", "robots_can_fetch", "terms_conclusion",
    "decision", "reason", "reviewer",
]

MEDICINE_COLUMNS = [
    "medicine_id", "name", "inn", "inn_variants", "dci_components", "brand_name",
    "strength_form", "atc", "class", "list_number", "source_file",
    "in_algerian_nomenclature", "remarks",
    "notice_document_id", "notice_status", "notice_source", "notice_collected_at",
]

TARGET_COLUMNS = [
    "medicine_id", "source_id", "url", "document_type", "search_term",
    "matched_inn", "brand_name", "strength", "language", "country",
    "requires_js", "reviewer",
]

# --- Extraction tables (additive; the provenance tables above are untouched) --
EXTRACTION_PIPELINE_VERSION = "1.0"

EXTRACTION_COLUMNS = [
    "document_id", "parent_document_id", "medicine_id", "document_type",
    "source_document_type", "source_id", "source_url", "language", "file_path",
    "source_sha256", "page_count", "page_type", "extraction_status",
    "extraction_method", "ocr_used", "ocr_languages", "ocr_confidence",
    "ai_used", "review_required", "sections_found", "sections_required_found",
    "sections_total", "pipeline_version", "extracted_at", "notes",
]

EXTRACTED_SECTION_COLUMNS = [
    "document_id", "parent_document_id", "medicine_id", "document_type",
    "source_document_type", "source_id", "source_url", "language", "file_path",
    "source_sha256", "section_key", "section_label", "required", "status",
    "original_heading", "content", "content_sha256", "content_chars",
    "page_start", "page_end", "pages", "printed_pages", "extraction_method",
    "review_required", "validation_status", "numeric_check", "table_count",
    "tables_json", "notes", "extracted_at",
]

EVAL_SAMPLE_COLUMNS = [
    "sample_id", "document_id", "medication_id", "source_id", "language",
    "file_path", "selection_reason", "sampled_at", "reviewer", "notes",
]

EVAL_REFERENCE_COLUMNS = [
    "sample_id", "document_id", "section_key", "reference_status",
    "reference_heading", "reference_quote", "page_start", "page_end",
    "printed_pages", "reviewer", "reviewed_at", "notes",
]

EVAL_SCORE_COLUMNS = [
    "sample_id", "document_id", "section_key", "expected_status",
    "predicted_status", "status_match", "content_exact_match",
    "content_similarity", "numbers_match", "page_match", "predicted_method",
    "notes",
]

# ---------------------------------------------------------------------------
# Authority levels and compliance decisions
# ---------------------------------------------------------------------------

AUTHORITY_OFFICIAL_ALGERIAN = settings.authority_levels["official_algerian"]
AUTHORITY_OFFICIAL_NOMENCLATURE = settings.authority_levels["official_nomenclature"]
AUTHORITY_FOREIGN_INSTITUTIONAL = settings.authority_levels["foreign_institutional"]
AUTHORITY_ALGERIAN_PROFESSIONAL = settings.authority_levels["algerian_professional"]

AUTHORITY_NAMES = dict(settings.authority_names)

AUTOMATED = settings.decisions["automated"]
MANUAL = settings.decisions["manual"]
EXCLUDED = settings.decisions["excluded"]
REVIEW_REQUIRED = settings.decisions["review_required"]

MANUAL_ONLY_TARGETS = list(settings.manual_only_targets)
EXCLUDED_DOMAINS = list(settings.excluded_domains)

# ---------------------------------------------------------------------------
# Source registry and discovery
# ---------------------------------------------------------------------------

SEED_SOURCES = list(settings.sources)
SEED_NOTICE_SOURCES = list(settings.notice_sources)
NOTICE_LINK_PATTERNS = list(settings.notice_link_patterns)

DISCOVERY_PROBE_URLS = dict(settings.discovery.probe_urls)
DISCOVERY_ENTRYPOINTS = dict(settings.discovery.entrypoints)
DISCOVERY_METADATA_HOOKS = dict(settings.discovery.metadata_hooks)

MAX_BRAND_QUERIES = settings.caps.max_brand_queries
FOREIGN_CAP_WHEN_OFFICIAL = settings.caps.foreign_cap_when_official
OFFICIAL_EXTRA_DOCUMENTS = settings.caps.official_extra_documents
