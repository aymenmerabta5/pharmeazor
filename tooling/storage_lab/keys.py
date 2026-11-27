"""Dataset definitions, object keys and local upload plans."""

from __future__ import annotations

import mimetypes
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .config import ConfigError
from .paths import (
    CONTENT_TYPES,
    DATA_ROOT,
    EMBEDDING_OUTPUT,
    MAX_KEY_BYTES,
    PROCESSED_ROOT,
    RAW_ROOT,
    REPO_ROOT,
    SKIP_DIRS,
    SKIP_FILES,
    TEXTUAL_TYPES,
    WINDOWS_RESERVED,
)


@dataclass(frozen=True)
class PlannedFile:
    path: Path
    relative: str
    key: str
    size: int
    content_type: str


@dataclass(frozen=True)
class UploadResult:
    key: str
    relative: str
    size: int
    status: str
    sha256: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class OrganizeResult:
    dataset: str
    source_key: str
    target_key: str
    size: int
    status: str
    error: str | None = None


@dataclass(frozen=True)
class Dataset:
    """One local tree mirrored to one bucket prefix.

    ``legacy_prefixes`` are read fallbacks for buckets written before the
    canonical layout existed. New uploads always use ``prefix``; nothing is
    ever deleted from a legacy prefix. ``group`` lets a lab select all of its
    trees with one flag (``--group retrieval`` or ``--group cleaning``).
    """

    name: str
    local_root: Path
    prefix: str
    marker: str | None = None
    legacy_prefixes: tuple[str, ...] = ()
    description: str = ""
    group: str = ""


DATASETS: tuple[Dataset, ...] = (
    Dataset(
        "retrieval-raw",
        DATA_ROOT / "raw",
        "retrieval-lab/raw",
        legacy_prefixes=("corpus/retrieval-lab/raw", "corpus/raw"),
        description="collected source documents (HTML, PDF, OCR, text)",
        group="retrieval",
    ),
    Dataset(
        "retrieval-metadata",
        DATA_ROOT / "metadata",
        "retrieval-lab/metadata",
        legacy_prefixes=("corpus/retrieval-lab/metadata",),
        description="collection metadata and CSV tables",
        group="retrieval",
    ),
    Dataset(
        "retrieval-reports",
        DATA_ROOT / "reports",
        "retrieval-lab/reports",
        legacy_prefixes=("corpus/retrieval-lab/reports",),
        description="collection and validation reports",
        group="retrieval",
    ),
    Dataset(
        "retrieval-input",
        DATA_ROOT / "input",
        "retrieval-lab/input",
        legacy_prefixes=("corpus/retrieval-lab/input",),
        description="imported medicine lists and workbooks",
        group="retrieval",
    ),
    Dataset(
        "retrieval-recon",
        DATA_ROOT / "recon",
        "retrieval-lab/recon",
        legacy_prefixes=("corpus/retrieval-lab/recon",),
        description="site reconnaissance output",
        group="retrieval",
    ),
    Dataset(
        "retrieval-logs",
        DATA_ROOT / "logs",
        "retrieval-lab/logs",
        legacy_prefixes=("corpus/retrieval-lab/logs",),
        description="collection logs",
        group="retrieval",
    ),
    Dataset(
        "retrieval-quarantine",
        DATA_ROOT / "quarantine",
        "retrieval-lab/quarantine",
        legacy_prefixes=("corpus/retrieval-lab/quarantine",),
        description="documents quarantined during collection",
        group="retrieval",
    ),
    Dataset(
        "retrieval-evaluation",
        DATA_ROOT / "evaluation",
        "retrieval-lab/evaluation",
        legacy_prefixes=("corpus/retrieval-lab/evaluation",),
        description="extraction evaluation output",
        group="retrieval",
    ),
    Dataset(
        "cleaning-output",
        PROCESSED_ROOT,
        "cleaning-lab",
        marker="manifest.jsonl",
        legacy_prefixes=("corpus/cleaning-lab", "corpus/processed"),
        description="clean Markdown, chunks, context notes, structured tables, reports",
        group="cleaning",
    ),
    Dataset(
        "embedding-output",
        EMBEDDING_OUTPUT,
        "embedding-lab",
        marker="embeddings/manifest.json",
        description="BGE-M3 vectors, chunk sidecar, run reports and benchmark",
        group="embedding",
    ),
)


DATASETS_BY_NAME = {dataset.name: dataset for dataset in DATASETS}


DATASET_GROUPS = tuple(sorted({dataset.group for dataset in DATASETS if dataset.group}))


def select_datasets(
    names: Sequence[str] | None = None,
    groups: Sequence[str] | None = None,
) -> list[Dataset]:
    """Return the requested datasets.

    ``--dataset`` selects exact trees and wins over ``--group``. With neither
    flag, every dataset is selected.
    """
    if names:
        selected: list[Dataset] = []
        for name in names:
            dataset = DATASETS_BY_NAME.get(name)
            if dataset is None:
                known = ", ".join(sorted(DATASETS_BY_NAME))
                raise ConfigError(f"unknown dataset '{name}'; known datasets: {known}")
            if dataset not in selected:
                selected.append(dataset)
        return selected
    if groups:
        unknown = [group for group in groups if group not in DATASET_GROUPS]
        if unknown:
            known = ", ".join(DATASET_GROUPS)
            raise ConfigError(f"unknown group '{unknown[0]}'; known groups: {known}")
        return [dataset for dataset in DATASETS if dataset.group in groups]
    return list(DATASETS)


def normalize_prefix(prefix: str) -> str:
    parts = [
        part
        for part in re.split(r"[\\/]+", prefix.strip())
        if part and part != "."
    ]
    if not parts:
        raise ConfigError("the object prefix cannot be empty")
    if any(part == ".." for part in parts):
        raise ConfigError("the object prefix cannot contain '..'")
    return "/".join(parts)


def object_key(prefix: str, relative: Path) -> str:
    parts = [part for part in relative.parts if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        raise ConfigError(f"unsafe relative path: {relative}")
    key = "/".join([normalize_prefix(prefix), *parts])
    if len(key.encode("utf-8")) > MAX_KEY_BYTES:
        raise ConfigError(f"object key exceeds {MAX_KEY_BYTES} bytes: {key[:80]}...")
    return key


def guess_content_type(path: Path) -> str:
    content_type = CONTENT_TYPES.get(path.suffix.lower())
    if content_type is None:
        content_type, _ = mimetypes.guess_type(path.name)
    if content_type is None:
        content_type = "application/octet-stream"
    if (content_type.startswith("text/") or content_type in TEXTUAL_TYPES) and "charset" not in content_type:
        content_type += "; charset=utf-8"
    return content_type


def _same_path(left: Path, right: Path) -> bool:
    try:
        return left.resolve() == right.resolve()
    except OSError:
        return left == right


def resolve_source(
    source_arg: Path | None,
    prefix_arg: str | None,
) -> tuple[Path, str]:
    """Resolve the source tree and its bucket prefix.

    Default preference is the cleaned corpus; the collected raw corpus is used
    only when the cleaning lab has not produced ``output/`` yet.
    """
    if source_arg is not None:
        root = source_arg.expanduser().resolve()
        if not root.is_dir():
            raise ConfigError(f"source directory not found: {root}")
        if root == REPO_ROOT:
            raise ConfigError("refusing to upload the repository root; choose a corpus directory")
        if prefix_arg:
            prefix = prefix_arg
        elif _same_path(root, PROCESSED_ROOT):
            prefix = "cleaning-lab"
        elif _same_path(root, RAW_ROOT):
            prefix = "retrieval-lab/raw"
        else:
            prefix = root.name
    else:
        if PROCESSED_ROOT.is_dir():
            root = PROCESSED_ROOT.resolve()
            prefix = prefix_arg or "cleaning-lab"
        elif RAW_ROOT.is_dir():
            root = RAW_ROOT.resolve()
            prefix = prefix_arg or "retrieval-lab/raw"
        else:
            raise ConfigError(
                "no corpus found. Run the cleaning lab first "
                f"({PROCESSED_ROOT}), or pass --source pointing at a directory"
            )
    return root, normalize_prefix(prefix)


def build_plan(root: Path, prefix: str) -> list[PlannedFile]:
    """Walk the source tree, preserving every relative filename in the key."""
    planned: list[PlannedFile] = []
    for current, dirnames, filenames in os.walk(root, followlinks=False):
        current_path = Path(current)
        dirnames[:] = sorted(
            name
            for name in dirnames
            if name not in SKIP_DIRS and not (current_path / name).is_symlink()
        )
        for name in sorted(filenames):
            path = current_path / name
            if path.is_symlink() or name in SKIP_FILES or name.startswith(".env"):
                continue
            relative_path = path.relative_to(root)
            relative = relative_path.as_posix()
            try:
                size = path.stat().st_size
            except OSError as error:
                raise ConfigError(f"cannot stat {path}: {error.strerror}") from error
            planned.append(
                PlannedFile(
                    path=path,
                    relative=relative,
                    key=object_key(prefix, relative_path),
                    size=size,
                    content_type=guess_content_type(path),
                )
            )
    planned.sort(key=lambda item: item.key)
    return planned


def safe_relative_key(key: str, prefix: str) -> Path:
    """Map a remote key to a safe relative path below the prefix.

    Remote keys are data, not trusted paths. Reject traversal, absolute paths,
    Windows drive/alternate-stream syntax and reserved device names.
    """
    marker = f"{prefix}/"
    if not key.startswith(marker):
        raise ConfigError(f"remote key is outside the selected prefix: {key!r}")
    relative = key[len(marker) :]
    parts = relative.split("/")
    if not relative or any(
        part in {"", ".", ".."} or ":" in part or "\\" in part for part in parts
    ):
        raise ConfigError(f"unsafe remote key: {key!r}")
    if any(WINDOWS_RESERVED.match(part) for part in parts):
        raise ConfigError(f"unsafe remote key (reserved name): {key!r}")
    return Path(*parts)


@dataclass(frozen=True)
class DatasetState:
    dataset: Dataset
    remote_prefix: str | None
    remote: dict[str, int]
    local: list[PlannedFile]

    @property
    def remote_objects(self) -> int:
        return len(self.remote)

    @property
    def remote_bytes(self) -> int:
        return sum(self.remote.values())

    @property
    def local_objects(self) -> int:
        return len(self.local)

    @property
    def complete(self) -> bool:
        """True when the remote tree exists and carries the dataset marker."""
        if not self.remote or self.remote_prefix is None:
            return False
        if self.dataset.marker is None:
            return True
        return f"{self.remote_prefix}/{self.dataset.marker}" in self.remote

    @property
    def state(self) -> str:
        if self.complete and self.local:
            return "in sync"
        if self.complete:
            return "remote only"
        if self.local and self.remote:
            return "local + partial"
        if self.local:
            return "local only"
        if self.remote:
            return "remote partial"
        return "missing"
