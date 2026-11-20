"""Typed settings for the PHARMEAZOR corpus-cleaning lab.

Runtime configuration lives in ``config.yaml`` next to this module. This file
loads it once, validates the shape, resolves every path against the lab root,
and joins the source registry that the collection lab owns
(``data/metadata/sources.csv``).

The two labs deliberately share one vocabulary:

* the collection lab decides *which* sources exist and *how authoritative*
  they are; that registry is the single source of truth,
* this lab adds only the cleaning-specific label (``tier``) for a source, and
  derives a sensible default from ``source_type`` when no label is configured.

Module-level aliases are not provided here; call sites receive a ``Settings``
instance. That keeps the pipeline testable and makes the configuration an
explicit argument instead of import-time global state.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "config.yaml"


class ConfigError(ValueError):
    """Raised when ``config.yaml`` or the source registry is inconsistent."""


# ---------------------------------------------------------------------------
# Typed settings
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DataPaths:
    """Absolute paths into the collection tree owned by the sibling lab."""

    documents_csv: Path
    sources_csv: Path
    medicines_csv: Path
    # Patient notices carved from already-collected parents. Optional: the
    # discovery audit uses it to account for every notice file on disk.
    notices_csv: Path | None = None


@dataclass(frozen=True)
class Source:
    """One row of the collection lab's source registry."""

    source_id: str
    source_name: str
    authority_level: int
    tier: str
    jurisdiction: str


@dataclass(frozen=True)
class ChunkingSettings:
    tokenizer: str
    chunk_size_tokens: int
    chunk_overlap_tokens: int
    merge_min_tokens: int
    preview_chunks_per_document: int


@dataclass(frozen=True)
class DedupeSettings:
    enabled: bool
    shingle_words: int
    near_threshold: float
    official_threshold: float


@dataclass(frozen=True)
class Settings:
    config_path: Path
    lab_root: Path
    data_root: Path
    output_root: Path
    paths: DataPaths
    sources: dict[str, Source]
    chunking: ChunkingSettings
    dedupe: DedupeSettings
    drop_line_patterns: tuple[re.Pattern[str], ...]
    drop_section_codes: frozenset[str]

    def source_info(self, source_id: str) -> dict[str, Any]:
        """Provenance fields for one source, tolerant of an unknown id."""
        source = self.sources.get(source_id)
        if source is None:
            return {
                "source_name": source_id,
                "authority_level": 99,
                "authority_tier": "unknown",
                "jurisdiction": "",
            }
        return {
            "source_name": source.source_name,
            "authority_level": source.authority_level,
            "authority_tier": source.tier,
            "jurisdiction": source.jurisdiction,
        }


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


def _boolean(value: Any, context: str) -> bool:
    if not isinstance(value, bool):
        raise ConfigError(f"'{context}' must be true or false")
    return value


def _required(mapping: dict[str, Any], key: str, context: str) -> Any:
    if key not in mapping:
        raise ConfigError(f"missing '{context}.{key}'")
    return mapping[key]


def _path(root: Path, value: Any, context: str) -> Path:
    raw = Path(value).expanduser() if isinstance(value, Path) else Path(
        _string(value, context)
    ).expanduser()
    return raw if raw.is_absolute() else (root / raw).resolve()


def _fraction(value: Any, context: str) -> float:
    result = _number(value, context, minimum=0.0)
    if result > 1.0:
        raise ConfigError(f"'{context}' must be between 0 and 1")
    return result


def _compile(value: Any, context: str) -> re.Pattern[str]:
    pattern = _string(value, context)
    try:
        return re.compile(pattern)
    except re.error as error:
        raise ConfigError(
            f"'{context}' is not a valid regular expression: {error}"
        ) from error


# ---------------------------------------------------------------------------
# Source registry (owned by the collection lab)
# ---------------------------------------------------------------------------

_TIER_BY_SOURCE_TYPE = {
    "official_agency": "official_algerian_agency",
    "official_ministry": "official_algerian_nomenclature",
    "official_nomenclature": "official_algerian_nomenclature",
    "foreign_institutional": "foreign_institutional",
    "algerian_professional": "algerian_professional",
}


def _tier_for(source_type: str, overrides: dict[str, Any], source_id: str) -> str:
    configured = overrides.get(source_id)
    if isinstance(configured, dict) and configured.get("tier"):
        return _string(configured["tier"], f"sources.{source_id}.tier")
    return _TIER_BY_SOURCE_TYPE.get(source_type.strip().lower(), "unknown")


def _missing_registry_error(path: Path) -> FileNotFoundError:
    return FileNotFoundError(
        f"source registry not found: {path}\n"
        "The cleaning lab reads the corpus produced by the sibling retrieval "
        "lab. Run the collection stage first:\n"
        "  cd tooling/retrieval-lab && python main.py init\n"
        "  cd tooling/retrieval-lab && python main.py collect-all\n"
        "or point --data-root / PHARMEAZOR_DATA_ROOT at an existing collection."
    )


def load_sources(path: Path, overrides: dict[str, Any]) -> dict[str, Source]:
    """Read the collection lab's registry and attach cleaning tiers.

    ``sources.csv`` is authoritative for identity, authority and jurisdiction.
    ``config.yaml`` may only relabel a source's ``tier``; it never overrides
    who a source is or how authoritative it is.
    """
    if not path.exists():
        raise _missing_registry_error(path)
    frame = pd.read_csv(path, dtype=str).fillna("")
    missing = {"source_id", "source_name", "authority_level"} - set(frame.columns)
    if missing:
        raise ConfigError(f"{path.name} is missing columns: {sorted(missing)}")

    sources: dict[str, Source] = {}
    for index, row in enumerate(frame.to_dict("records")):
        source_id = _string(str(row.get("source_id", "")), f"sources[{index}].source_id")
        if source_id in sources:
            raise ConfigError(f"{path.name} contains duplicate source_id '{source_id}'")
        raw_level = str(row.get("authority_level", "")).strip()
        if not raw_level.isdigit() or not 1 <= int(raw_level) <= 4:
            raise ConfigError(
                f"{path.name}: source '{source_id}' has invalid authority_level "
                f"'{raw_level}' (expected 1-4)"
            )
        sources[source_id] = Source(
            source_id=source_id,
            source_name=_string(
                str(row.get("source_name", "")) or source_id,
                f"sources[{index}].source_name",
            ),
            authority_level=int(raw_level),
            tier=_tier_for(str(row.get("source_type", "")), overrides, source_id),
            jurisdiction=str(row.get("jurisdiction", "")).strip(),
        )
    if not sources:
        raise ConfigError(f"{path.name} contains no sources")
    return sources


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def resolve_data_root(
    config_path: Path,
    override: str | None,
    configured: str,
) -> Path:
    """Resolve the collection root.

    Precedence is the CLI flag, then ``PHARMEAZOR_DATA_ROOT``, then the
    configured value. A relative configured value resolves against the config
    file's directory, so the committed default never carries a machine-specific
    home directory.
    """
    raw = override or os.environ.get("PHARMEAZOR_DATA_ROOT") or configured
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = config_path.resolve().parent / candidate
    return candidate.resolve()


def load_settings(
    config_path: Path | None = None,
    *,
    data_root_override: str | None = None,
    output_root_override: str | Path | None = None,
) -> Settings:
    """Load, validate and resolve ``config.yaml`` plus the source registry."""
    path = (config_path or DEFAULT_CONFIG).resolve()
    if not path.exists():
        raise ConfigError(f"configuration file not found: {path}")
    with path.open(encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    root = path.parent
    data = _mapping(raw, str(path))

    data_root = resolve_data_root(
        path,
        data_root_override,
        _string(_required(data, "data_root", str(path)), "data_root"),
    )
    output_root = _path(
        root,
        output_root_override
        if output_root_override is not None
        else _required(data, "output_root", str(path)),
        "output_root",
    )

    paths_raw = _mapping(_required(data, "paths", str(path)), "paths")
    notices_value = paths_raw.get("notices_csv")
    paths = DataPaths(
        documents_csv=data_root
        / _string(_required(paths_raw, "documents_csv", "paths"), "paths.documents_csv"),
        sources_csv=data_root
        / _string(_required(paths_raw, "sources_csv", "paths"), "paths.sources_csv"),
        medicines_csv=data_root
        / _string(_required(paths_raw, "medicines_csv", "paths"), "paths.medicines_csv"),
        notices_csv=data_root / _string(notices_value, "paths.notices_csv")
        if notices_value
        else None,
    )

    sources_override = data.get("sources") or {}
    if not isinstance(sources_override, dict):
        raise ConfigError("'sources' must be a mapping of source_id to tier overrides")
    sources = load_sources(paths.sources_csv, sources_override)

    chunking_raw = _mapping(_required(data, "chunking", str(path)), "chunking")
    chunking = ChunkingSettings(
        tokenizer=_string(
            _required(chunking_raw, "tokenizer", "chunking"), "chunking.tokenizer"
        ),
        chunk_size_tokens=_integer(
            _required(chunking_raw, "chunk_size_tokens", "chunking"),
            "chunking.chunk_size_tokens",
            minimum=1,
        ),
        chunk_overlap_tokens=_integer(
            _required(chunking_raw, "chunk_overlap_tokens", "chunking"),
            "chunking.chunk_overlap_tokens",
            minimum=0,
        ),
        merge_min_tokens=_integer(
            _required(chunking_raw, "merge_min_tokens", "chunking"),
            "chunking.merge_min_tokens",
            minimum=0,
        ),
        preview_chunks_per_document=_integer(
            _required(chunking_raw, "preview_chunks_per_document", "chunking"),
            "chunking.preview_chunks_per_document",
            minimum=1,
        ),
    )
    if chunking.chunk_overlap_tokens >= chunking.chunk_size_tokens:
        raise ConfigError("'chunking.chunk_overlap_tokens' must be smaller than 'chunk_size_tokens'")

    dedupe_raw = _mapping(_required(data, "dedupe", str(path)), "dedupe")
    dedupe = DedupeSettings(
        enabled=_boolean(_required(dedupe_raw, "enabled", "dedupe"), "dedupe.enabled"),
        shingle_words=_integer(
            _required(dedupe_raw, "shingle_words", "dedupe"),
            "dedupe.shingle_words",
            minimum=1,
        ),
        near_threshold=_fraction(
            _required(dedupe_raw, "near_threshold", "dedupe"), "dedupe.near_threshold"
        ),
        official_threshold=_fraction(
            _required(dedupe_raw, "official_threshold", "dedupe"),
            "dedupe.official_threshold",
        ),
    )

    drop_line_patterns = tuple(
        _compile(value, "drop_line_patterns[]")
        for value in _sequence(
            _required(data, "drop_line_patterns", str(path)), "drop_line_patterns"
        )
    )
    drop_section_codes = frozenset(
        _string(value, "drop_section_codes[]")
        for value in _sequence(
            _required(data, "drop_section_codes", str(path)), "drop_section_codes"
        )
    )

    return Settings(
        config_path=path,
        lab_root=root,
        data_root=data_root,
        output_root=output_root,
        paths=paths,
        sources=sources,
        chunking=chunking,
        dedupe=dedupe,
        drop_line_patterns=drop_line_patterns,
        drop_section_codes=drop_section_codes,
    )
