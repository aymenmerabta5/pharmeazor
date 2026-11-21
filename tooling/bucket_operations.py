#!/usr/bin/env python3
"""Mirror the PHARMEAZOR corpus between the local tree and Cloudflare R2.

This is the single shared bucket module for both labs. The R2 API is
S3-compatible, so boto3/botocore provides signing, retries and multipart
transfers.

Dataset commands (the normal entry point):

* ``status`` - compare every known dataset locally and remotely;
* ``pull``   - download every dataset into its local root;
* ``push``   - upload every dataset under its canonical prefix;
* ``sync``   - pull missing remote objects, then push local objects;
* ``organize`` - copy legacy prefixes to the canonical layout;
* ``reset``  - delete the selected prefixes, but only after confirming that a
  complete local copy exists (requires ``--yes``; ``--dry-run`` lists first).

Single-tree commands (compatibility and ad-hoc transfers):

* ``upload`` (default) - upload one local tree under ``--prefix``;
* ``verify`` - read one remote prefix back and compare hashes;
* ``download`` - restore one remote prefix under ``--dest``.

Design notes
------------
* Configuration is read from the repository's ``.env.local`` (or ``--env-file``).
  The file is parsed locally; secret values are never printed, logged or copied
  into a report. Process environment variables win over the file.
* ``S3_ENDPOINT`` in this project currently points at
  ``https://<account>.r2.cloudflarestorage.com/<bucket>``. The endpoint boto3
  needs is the account-level origin, so a trailing path equal to the bucket name
  is removed. Any other path is rejected instead of being guessed at.
* R2 uses region ``auto`` and path-style addressing; no Cloudflare-specific SDK
  is needed.
* ``S3_PUBLIC_URL`` is the public read base URL (``r2.dev``). It is validated as
  optional configuration and is deliberately not used for transfers.

Every command except ``reset`` only creates or overwrites objects. ``reset`` is
the single destructive command: it refuses to delete a dataset unless the local
tree is present, non-empty and (for ``cleaning-output``) carries its manifest.
Legacy prefixes are read as fallbacks by every other command and are deleted
only when ``reset`` is explicitly asked to include them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit, urlunsplit

TOOL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = TOOL_ROOT.parent
RETRIEVAL_ROOT = TOOL_ROOT / "retrieval-lab"
CLEANING_ROOT = TOOL_ROOT / "cleaning-lab"
DEFAULT_ENV_FILE = REPO_ROOT / ".env.local"
DEFAULT_DOWNLOAD_ROOT = TOOL_ROOT / "downloads"
PROCESSED_ROOT = CLEANING_ROOT / "output"
DATA_ROOT = RETRIEVAL_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
BUCKET_MANIFEST_KEY = "manifest.json"

PLACEHOLDER_PREFIX = "REPLACE_WITH"
MAX_KEY_BYTES = 1024
STREAM_CHUNK_BYTES = 1024 * 1024
WINDOWS_RESERVED = re.compile(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$", re.IGNORECASE)
SKIP_DIRS = frozenset(
    {
        ".cache",
        ".git",
        ".hg",
        ".svn",
        ".turbo",
        ".venv",
        "__pycache__",
        "node_modules",
    }
)
SKIP_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini"})
CONTENT_TYPES = {
    ".csv": "text/csv",
    ".html": "text/html",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
TEXTUAL_TYPES = frozenset(
    {
        "application/json",
        "application/x-ndjson",
        "application/xml",
    }
)

_ASSIGNMENT = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")


class ConfigError(RuntimeError):
    """Configuration is missing, inconsistent or unsafe."""


# ---------------------------------------------------------------------------
# .env.local parsing (no python-dotenv dependency)
# ---------------------------------------------------------------------------


def _parse_env_value(raw: str) -> str:
    """Parse one dotenv-style value without ever logging it."""
    value = raw.strip()
    if not value:
        return ""
    if value[0] in {'"', "'"}:
        quote = value[0]
        end = value.find(quote, 1)
        return value[1:end] if end != -1 else value[1:]
    # Unquoted values may carry a trailing comment: KEY=value # note
    return re.split(r"\s+#", value, maxsplit=1)[0].strip()


def parse_env_file(path: Path) -> dict[str, list[str]]:
    """Return every assignment per key, in file order.

    Keeping all assignments (instead of a last-wins dict) lets the caller prefer
    the first configured value when a file contains a trailing template block
    with ``REPLACE_WITH_*`` placeholders.
    """
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError as error:
        raise ConfigError(f"environment file not found: {path}") from error
    except OSError as error:
        raise ConfigError(f"cannot read environment file {path}: {error.strerror}") from error

    assignments: dict[str, list[str]] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _ASSIGNMENT.match(stripped)
        if match is None:
            continue
        key, raw_value = match.groups()
        assignments.setdefault(key, []).append(_parse_env_value(raw_value))
    return assignments


def env_value(
    assignments: Mapping[str, Sequence[str]],
    *names: str,
    environ: Mapping[str, str] | None = None,
) -> str | None:
    """Resolve a key from the process environment, then from the env file.

    Within each source the first non-empty, non-placeholder value wins. Values
    are returned to the caller and must never be printed.
    """
    environment = os.environ if environ is None else environ
    for name in names:
        candidate = environment.get(name)
        if candidate and candidate.strip() and not candidate.strip().startswith(PLACEHOLDER_PREFIX):
            return candidate.strip()
    for name in names:
        for candidate in assignments.get(name, ()):
            if candidate and not candidate.startswith(PLACEHOLDER_PREFIX):
                return candidate
    return None


def duplicate_keys(assignments: Mapping[str, Sequence[str]]) -> list[str]:
    """Keys assigned more than once with different non-empty values."""
    return sorted(
        key
        for key, values in assignments.items()
        if len({value for value in values if value}) > 1
    )


# ---------------------------------------------------------------------------
# R2 configuration
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class R2Config:
    bucket: str
    endpoint: str
    region: str
    access_key_id: str = field(repr=False)
    secret_access_key: str = field(repr=False)
    public_url: str | None = None

    def redact(self, message: str) -> str:
        for secret in (self.access_key_id, self.secret_access_key):
            if secret:
                message = message.replace(secret, "<redacted>")
        return message


def normalize_endpoint(endpoint: str, bucket: str) -> str:
    """Return the account-level S3 endpoint boto3 expects.

    ``S3_ENDPOINT`` may include the bucket as a path suffix (as it does in this
    repository). boto3 addresses the bucket itself, so that suffix is removed.
    A different path is rejected rather than silently producing wrong keys.
    """
    candidate = endpoint.strip()
    parsed = urlsplit(candidate)
    if parsed.scheme != "https":
        raise ConfigError("S3_ENDPOINT must use HTTPS (Cloudflare R2 requires TLS)")
    if not parsed.netloc:
        raise ConfigError("S3_ENDPOINT has no host")
    if parsed.username or parsed.password:
        raise ConfigError("S3_ENDPOINT must not embed credentials")
    if parsed.query or parsed.fragment:
        raise ConfigError("S3_ENDPOINT must not carry a query string or fragment")

    path = parsed.path.rstrip("/")
    if path in {"", "/"}:
        path = ""
    elif path == f"/{bucket}":
        path = ""
    else:
        raise ConfigError(
            "S3_ENDPOINT contains an unexpected path; use the account-level "
            "R2 endpoint (optionally ending in /<bucket>)"
        )
    return urlunsplit(("https", parsed.netloc, path, "", ""))


def resolve_config(
    assignments: Mapping[str, Sequence[str]],
    *,
    bucket_override: str | None = None,
    environ: Mapping[str, str] | None = None,
) -> R2Config:
    bucket = (bucket_override or env_value(
        assignments, "STORAGE_BUCKET", "R2_BUCKET", "S3_BUCKET", environ=environ
    ))
    if not bucket:
        # The repository's S3_ENDPOINT ends in /<bucket>. When STORAGE_BUCKET is
        # missing or still a placeholder, take the name from that path instead
        # of forcing the operator to repeat it.
        endpoint_hint = env_value(
            assignments, "S3_ENDPOINT", "S3_URL", "R2_ENDPOINT", environ=environ
        )
        if endpoint_hint:
            path = urlsplit(endpoint_hint.strip()).path.strip("/")
            if path and "/" not in path:
                bucket = path
    if not bucket:
        raise ConfigError("STORAGE_BUCKET is not configured")
    bucket = bucket.strip()
    if bucket.startswith(PLACEHOLDER_PREFIX) or "/" in bucket or any(char.isspace() for char in bucket):
        raise ConfigError("STORAGE_BUCKET is invalid or still a placeholder")

    access_key_id = env_value(
        assignments, "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", environ=environ
    )
    secret_access_key = env_value(
        assignments,
        "S3_SECRET_ACCESS_KEY",
        "R2_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
        environ=environ,
    )
    if not access_key_id or not secret_access_key:
        raise ConfigError(
            "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must both be configured"
        )

    raw_endpoint = env_value(
        assignments, "S3_ENDPOINT", "S3_URL", "R2_ENDPOINT", environ=environ
    )
    if not raw_endpoint:
        raise ConfigError("S3_ENDPOINT (or S3_URL) is not configured")
    endpoint = normalize_endpoint(raw_endpoint, bucket)

    region = (
        env_value(assignments, "S3_REGION", "R2_REGION", environ=environ) or "auto"
    ).strip()
    if region.startswith(PLACEHOLDER_PREFIX):
        region = "auto"

    public_url = env_value(
        assignments, "S3_PUBLIC_URL", "S3_PUBLIC", "R2_PUBLIC_URL", environ=environ
    )
    if public_url:
        parsed_public = urlsplit(public_url)
        if parsed_public.scheme not in {"http", "https"} or not parsed_public.netloc:
            raise ConfigError("S3_PUBLIC_URL is not a valid HTTP(S) URL")
        public_url = public_url.rstrip("/") + "/"

    return R2Config(
        bucket=bucket,
        endpoint=endpoint,
        region=region,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        public_url=public_url,
    )


# ---------------------------------------------------------------------------
# Source tree and object keys
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _client_error_details(error: Exception) -> tuple[str, int | None, str]:
    response = getattr(error, "response", None) or {}
    error_block = response.get("Error") or {}
    code = str(error_block.get("Code") or type(error).__name__)
    status = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    if not response:
        # File, socket and programming errors carry their detail in str().
        message = str(error).strip()
    else:
        message = str(error_block.get("Message") or "").strip()
    return code, status, message


def describe_error(error: Exception, config: R2Config) -> str:
    code, status, message = _client_error_details(error)
    parts = [code]
    if status is not None:
        parts.append(f"HTTP {status}")
    if message:
        parts.append(message)
    return config.redact(": ".join(parts))


def _is_not_found(error: Exception) -> bool:
    code, status, _ = _client_error_details(error)
    return code in {"404", "NoSuchKey", "NoSuchBucket", "NotFound"} or status == 404


def _is_access_denied(error: Exception) -> bool:
    code, status, _ = _client_error_details(error)
    return code in {"403", "AccessDenied", "Forbidden"} or status == 403


def load_boto3() -> tuple[Any, Any, Any]:
    try:
        import boto3
        from boto3.s3.transfer import TransferConfig
        from botocore.config import Config
    except ImportError as error:
        raise ConfigError(
            "boto3 is not installed. Create the tool's virtual environment and "
            "install requirements.txt (see README.md)"
        ) from error
    return boto3, TransferConfig, Config


def make_client(config: R2Config, *, workers: int) -> tuple[Any, Any]:
    boto3, TransferConfig, Config = load_boto3()
    client_config = Config(
        signature_version="s3v4",
        retries={"max_attempts": 5, "mode": "standard"},
        connect_timeout=15,
        read_timeout=120,
        max_pool_connections=max(10, workers + 5),
        s3={"addressing_style": "path"},
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )
    client = boto3.client(
        "s3",
        endpoint_url=config.endpoint,
        region_name=config.region,
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
        config=client_config,
    )
    transfer_config = TransferConfig(
        multipart_threshold=16 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=max(2, workers),
        use_threads=True,
    )
    return client, transfer_config


def verify_bucket(client: Any, config: R2Config) -> None:
    try:
        client.head_bucket(Bucket=config.bucket)
    except Exception as error:  # noqa: BLE001 - translated below
        if _is_not_found(error):
            raise ConfigError(
                f"bucket '{config.bucket}' does not exist or is not visible to these credentials"
            ) from error
        if _is_access_denied(error):
            print(
                "warning: HeadBucket was denied; continuing so the first transfer "
                "can report the real permission result",
                file=sys.stderr,
            )
            return
        raise ConfigError(
            f"cannot access bucket '{config.bucket}': {describe_error(error, config)}"
        ) from error


def upload_one(
    client: Any,
    transfer_config: Any,
    config: R2Config,
    item: PlannedFile,
    *,
    skip_existing: bool,
    checksum: bool,
) -> UploadResult:
    try:
        digest = sha256_file(item.path) if checksum else None
        if skip_existing:
            try:
                head = client.head_object(Bucket=config.bucket, Key=item.key)
            except Exception as error:  # noqa: BLE001 - only 404 is expected
                if not _is_not_found(error):
                    raise
            else:
                remote_size = int(head.get("ContentLength", -1))
                remote_hash = (head.get("Metadata") or {}).get("sha256")
                if remote_size == item.size and (not checksum or remote_hash == digest):
                    return UploadResult(
                        key=item.key,
                        relative=item.relative,
                        size=item.size,
                        status="skipped",
                        sha256=digest,
                    )

        metadata = {
            "source-path": item.relative.encode("ascii", "replace").decode("ascii")[:1900],
            "uploaded-by": "pharmeazor-r2-upload",
        }
        if digest:
            metadata["sha256"] = digest
        client.upload_file(
            Filename=str(item.path),
            Bucket=config.bucket,
            Key=item.key,
            ExtraArgs={"ContentType": item.content_type, "Metadata": metadata},
            Config=transfer_config,
        )
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=item.size,
            status="uploaded",
            sha256=digest,
        )
    except Exception as error:  # noqa: BLE001 - reported per file
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=item.size,
            status="failed",
            error=describe_error(error, config),
        )


def run_uploads(
    client: Any,
    transfer_config: Any,
    config: R2Config,
    plan: Sequence[PlannedFile],
    *,
    workers: int,
    skip_existing: bool,
    checksum: bool,
    fail_fast: bool,
    verbose: bool,
    quiet: bool,
) -> list[UploadResult]:
    results: list[UploadResult] = []
    total = len(plan)
    progress_lock = Lock()
    completed = 0
    effective_workers = 1 if fail_fast else max(1, workers)

    with ThreadPoolExecutor(max_workers=effective_workers) as pool:
        futures = {
            pool.submit(
                upload_one,
                client,
                transfer_config,
                config,
                item,
                skip_existing=skip_existing,
                checksum=checksum,
            ): item
            for item in plan
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            with progress_lock:
                completed += 1
                if verbose and not quiet:
                    detail = f" ({result.error})" if result.error else ""
                    print(f"  [{completed}/{total}] {result.status:<8} {result.key}{detail}")
                elif not quiet and (completed % 25 == 0 or completed == total):
                    print(f"  progress: {completed}/{total} objects")

            if fail_fast and result.status == "failed":
                for pending in futures:
                    pending.cancel()
                break

    return results


# ---------------------------------------------------------------------------
# Remote verification and download
# ---------------------------------------------------------------------------


def list_remote_objects(client: Any, config: R2Config, prefix: str) -> dict[str, int]:
    """Return the remote key -> size map for every object under prefix/."""
    remote: dict[str, int] = {}
    try:
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=config.bucket, Prefix=f"{prefix}/"):
            for entry in page.get("Contents", ()):
                remote[str(entry["Key"])] = int(entry["Size"])
    except Exception as error:  # noqa: BLE001 - translated below
        raise ConfigError(
            f"cannot list objects under '{prefix}/': {describe_error(error, config)}"
        ) from error
    return remote


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


def verify_one(
    client: Any,
    config: R2Config,
    item: PlannedFile,
    remote_size: int,
) -> UploadResult:
    """Stream one remote object and compare it with the local file."""
    try:
        response = client.get_object(Bucket=config.bucket, Key=item.key)
        body = response["Body"]
        digest = hashlib.sha256()
        size = 0
        try:
            for chunk in iter(lambda: body.read(STREAM_CHUNK_BYTES), b""):
                digest.update(chunk)
                size += len(chunk)
        finally:
            body.close()

        remote_hash = digest.hexdigest()
        local_hash = sha256_file(item.path)
        metadata_hash = (response.get("Metadata") or {}).get("sha256")
        problems: list[str] = []
        if remote_size != item.size or size != item.size:
            problems.append(
                f"remote size {remote_size} / downloaded {size} != local size {item.size}"
            )
        if remote_hash != local_hash:
            problems.append("downloaded SHA-256 differs from the local file")
        if metadata_hash and metadata_hash != remote_hash:
            problems.append("stored SHA-256 metadata differs from the downloaded bytes")
        if problems:
            return UploadResult(
                key=item.key,
                relative=item.relative,
                size=remote_size,
                status="failed",
                sha256=remote_hash,
                error="; ".join(problems),
            )
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=remote_size,
            status="verified",
            sha256=remote_hash,
        )
    except Exception as error:  # noqa: BLE001 - reported per file
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=remote_size,
            status="failed",
            error=describe_error(error, config),
        )


def download_one(
    client: Any,
    config: R2Config,
    key: str,
    *,
    prefix: str,
    dest_root: Path,
    local_item: PlannedFile | None,
    remote_size: int,
    skip_existing: bool,
) -> UploadResult:
    """Download one object atomically and verify its bytes before publishing."""
    relative_path: Path | None = None
    temp: Path | None = None
    try:
        relative_path = safe_relative_key(key, prefix)
        destination = dest_root / relative_path
        response = client.get_object(Bucket=config.bucket, Key=key)
        body = response["Body"]
        try:
            expected_size = int(response.get("ContentLength", -1))
            metadata_hash = (response.get("Metadata") or {}).get("sha256")
            if skip_existing and destination.is_file():
                existing_size = destination.stat().st_size
                if (
                    existing_size == expected_size
                    and metadata_hash
                    and sha256_file(destination) == metadata_hash
                ):
                    return UploadResult(
                        key=key,
                        relative=relative_path.as_posix(),
                        size=remote_size,
                        status="skipped",
                        sha256=metadata_hash,
                    )

            destination.parent.mkdir(parents=True, exist_ok=True)
            temp = destination.with_name(destination.name + ".part")
            digest = hashlib.sha256()
            size = 0
            with temp.open("wb") as handle:
                for chunk in iter(lambda: body.read(STREAM_CHUNK_BYTES), b""):
                    handle.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                handle.flush()
                os.fsync(handle.fileno())
        finally:
            body.close()

        remote_hash = digest.hexdigest()
        problems: list[str] = []
        if expected_size >= 0 and size != expected_size:
            problems.append(f"downloaded {size} bytes, expected {expected_size}")
        if metadata_hash and metadata_hash != remote_hash:
            problems.append("downloaded SHA-256 differs from the stored metadata")
        if local_item is not None:
            if local_item.size != size:
                problems.append(
                    f"downloaded size {size} differs from local size {local_item.size}"
                )
            elif sha256_file(local_item.path) != remote_hash:
                problems.append("downloaded bytes differ from the local source")
        if problems:
            temp.unlink(missing_ok=True)
            temp = None
            return UploadResult(
                key=key,
                relative=relative_path.as_posix(),
                size=remote_size,
                status="failed",
                sha256=remote_hash,
                error="; ".join(problems),
            )

        os.replace(temp, destination)
        temp = None
        return UploadResult(
            key=key,
            relative=relative_path.as_posix(),
            size=remote_size,
            status="downloaded",
            sha256=remote_hash,
        )
    except Exception as error:  # noqa: BLE001 - reported per file
        if temp is not None:
            temp.unlink(missing_ok=True)
        return UploadResult(
            key=key,
            relative=relative_path.as_posix() if relative_path else key,
            size=remote_size,
            status="failed",
            error=describe_error(error, config),
        )


def run_verify(
    client: Any,
    config: R2Config,
    plan: Sequence[PlannedFile],
    remote: Mapping[str, int],
    *,
    workers: int,
    limit: int | None,
    verbose: bool,
    quiet: bool,
) -> list[UploadResult]:
    results: list[UploadResult] = []
    local_by_key = {item.key: item for item in plan}
    remote_keys = set(remote)
    local_keys = set(local_by_key)

    for key in sorted(local_keys - remote_keys):
        results.append(
            UploadResult(
                key=key,
                relative="",
                size=0,
                status="failed",
                error="object is missing from the bucket",
            )
        )
    for key in sorted(remote_keys - local_keys):
        results.append(
            UploadResult(
                key=key,
                relative=key,
                size=remote[key],
                status="failed",
                error="remote object is not present in the local source tree",
            )
        )

    targets = [local_by_key[key] for key in sorted(local_keys & remote_keys)]
    if limit is not None:
        targets = targets[:limit]
    total = len(targets)
    progress_lock = Lock()
    completed = 0

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(verify_one, client, config, item, remote[item.key]): item
            for item in targets
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            with progress_lock:
                completed += 1
                if verbose and not quiet:
                    detail = f" ({result.error})" if result.error else ""
                    print(f"  [{completed}/{total}] {result.status:<8} {result.key}{detail}")
                elif not quiet and (completed % 25 == 0 or completed == total):
                    print(f"  progress: {completed}/{total} objects")

    return results


def run_download(
    client: Any,
    config: R2Config,
    remote: Mapping[str, int],
    *,
    prefix: str,
    dest_root: Path,
    local_by_key: Mapping[str, PlannedFile],
    workers: int,
    limit: int | None,
    skip_existing: bool,
    verbose: bool,
    quiet: bool,
) -> list[UploadResult]:
    keys = sorted(remote)
    if limit is not None:
        keys = keys[:limit]
    total = len(keys)
    progress_lock = Lock()
    completed = 0
    results: list[UploadResult] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(
                download_one,
                client,
                config,
                key,
                prefix=prefix,
                dest_root=dest_root,
                local_item=local_by_key.get(key),
                remote_size=remote[key],
                skip_existing=skip_existing,
            ): key
            for key in keys
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            with progress_lock:
                completed += 1
                if verbose and not quiet:
                    detail = f" ({result.error})" if result.error else ""
                    print(f"  [{completed}/{total}] {result.status:<10} {result.key}{detail}")
                elif not quiet and (completed % 25 == 0 or completed == total):
                    print(f"  progress: {completed}/{total} objects")

    return results


# ---------------------------------------------------------------------------
# Dataset mirroring (pull / push / sync / status)
# ---------------------------------------------------------------------------


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


def find_remote_objects(
    client: Any, config: R2Config, dataset: Dataset
) -> tuple[str | None, dict[str, int]]:
    """Return the first non-empty prefix and its object map.

    The canonical prefix wins; legacy prefixes are read fallbacks only. The
    caller never deletes anything from a legacy prefix.
    """
    for prefix in (dataset.prefix, *dataset.legacy_prefixes):
        remote = list_remote_objects(client, config, prefix)
        if remote:
            return prefix, remote
    return None, {}


def dataset_state(client: Any, config: R2Config, dataset: Dataset) -> DatasetState:
    remote_prefix, remote = find_remote_objects(client, config, dataset)
    local: list[PlannedFile] = []
    if dataset.local_root.is_dir():
        local = build_plan(dataset.local_root, remote_prefix or dataset.prefix)
    return DatasetState(
        dataset=dataset,
        remote_prefix=remote_prefix,
        remote=remote,
        local=local,
    )


def pull_dataset(
    client: Any,
    config: R2Config,
    dataset: Dataset,
    *,
    dest_root: Path | None = None,
    workers: int = 4,
    limit: int | None = None,
    skip_existing: bool = True,
    verbose: bool = False,
    quiet: bool = False,
) -> tuple[DatasetState, list[UploadResult]]:
    """Download a dataset into its local root (or ``dest_root``).

    Nothing is deleted locally or remotely. Existing files are verified by
    SHA-256 and skipped when they already match the bucket.
    """
    state = dataset_state(client, config, dataset)
    if not state.remote:
        return state, []
    prefix = state.remote_prefix or dataset.prefix
    destination = (dest_root or dataset.local_root).expanduser().resolve()
    local_by_key: dict[str, PlannedFile] = {}
    if destination.is_dir():
        local_by_key = {item.key: item for item in build_plan(destination, prefix)}
    results = run_download(
        client,
        config,
        state.remote,
        prefix=prefix,
        dest_root=destination,
        local_by_key=local_by_key,
        workers=workers,
        limit=limit,
        skip_existing=skip_existing,
        verbose=verbose,
        quiet=quiet,
    )
    return state, results


def push_dataset(
    client: Any,
    transfer_config: Any,
    config: R2Config,
    dataset: Dataset,
    *,
    workers: int = 4,
    skip_existing: bool = True,
    checksum: bool = True,
    fail_fast: bool = False,
    verbose: bool = False,
    quiet: bool = False,
) -> tuple[list[PlannedFile], list[UploadResult]]:
    """Upload a local dataset under its canonical prefix.

    Uploads only create or overwrite objects; nothing is deleted remotely.
    """
    plan = dataset_local_plan(dataset)
    if not plan:
        return plan, []
    results = run_uploads(
        client,
        transfer_config,
        config,
        plan,
        workers=workers,
        skip_existing=skip_existing,
        checksum=checksum,
        fail_fast=fail_fast,
        verbose=verbose,
        quiet=quiet,
    )
    return plan, results


def dataset_local_plan(dataset: Dataset) -> list[PlannedFile]:
    if not dataset.local_root.is_dir():
        return []
    return build_plan(dataset.local_root, dataset.prefix)


def head_object_state(client: Any, config: R2Config, key: str) -> tuple[int, str | None]:
    """Return the object size and stored SHA-256 metadata (when present)."""
    response = client.head_object(Bucket=config.bucket, Key=key)
    metadata = response.get("Metadata") or {}
    return int(response.get("ContentLength", -1)), metadata.get("sha256")


def legacy_objects(
    client: Any, config: R2Config, dataset: Dataset
) -> dict[str, tuple[str, int]]:
    """Return every legacy key mapped to its prefix and size."""
    found: dict[str, tuple[str, int]] = {}
    for prefix in dataset.legacy_prefixes:
        for key, size in list_remote_objects(client, config, prefix).items():
            found[key] = (prefix, size)
    return found


def organize_dataset(
    client: Any,
    config: R2Config,
    dataset: Dataset,
    *,
    dry_run: bool = False,
    limit: int | None = None,
    verbose: bool = False,
    quiet: bool = False,
) -> list[OrganizeResult]:
    """Copy legacy objects to the canonical prefix without overwriting.

    The destination is never replaced. An object that already exists with a
    different size or SHA-256 is reported as a conflict and both copies are
    left in place. Source objects are never deleted.
    """
    legacy = legacy_objects(client, config, dataset)
    if not legacy:
        return []
    canonical = list_remote_objects(client, config, dataset.prefix)
    keys = sorted(legacy)
    if limit is not None:
        keys = keys[:limit]

    results: list[OrganizeResult] = []
    total = len(keys)
    for index, source_key in enumerate(keys, start=1):
        source_prefix, size = legacy[source_key]
        try:
            relative = safe_relative_key(source_key, source_prefix)
            target_key = object_key(dataset.prefix, relative)
        except ConfigError as error:
            results.append(
                OrganizeResult(
                    dataset=dataset.name,
                    source_key=source_key,
                    target_key="",
                    size=size,
                    status="failed",
                    error=str(error),
                )
            )
            continue

        if target_key in canonical:
            try:
                source_size, source_hash = head_object_state(client, config, source_key)
                target_size, target_hash = head_object_state(client, config, target_key)
            except Exception as error:  # noqa: BLE001 - reported per object
                results.append(
                    OrganizeResult(
                        dataset.name,
                        source_key,
                        target_key,
                        size,
                        "failed",
                        describe_error(error, config),
                    )
                )
                continue
            if source_size != target_size or (
                source_hash and target_hash and source_hash != target_hash
            ):
                results.append(
                    OrganizeResult(
                        dataset.name,
                        source_key,
                        target_key,
                        size,
                        "conflict",
                        "destination exists with different content; left untouched",
                    )
                )
            else:
                results.append(
                    OrganizeResult(dataset.name, source_key, target_key, size, "present")
                )
        elif dry_run:
            results.append(
                OrganizeResult(dataset.name, source_key, target_key, size, "planned")
            )
        else:
            try:
                client.copy_object(
                    Bucket=config.bucket,
                    Key=target_key,
                    CopySource={"Bucket": config.bucket, "Key": source_key},
                )
                source_size, source_hash = head_object_state(client, config, source_key)
                target_size, target_hash = head_object_state(client, config, target_key)
                if source_size != target_size or (
                    source_hash and target_hash and source_hash != target_hash
                ):
                    results.append(
                        OrganizeResult(
                            dataset.name,
                            source_key,
                            target_key,
                            size,
                            "failed",
                            "copied object does not match the source; source kept",
                        )
                    )
                else:
                    results.append(
                        OrganizeResult(dataset.name, source_key, target_key, size, "copied")
                    )
                    canonical[target_key] = target_size
            except Exception as error:  # noqa: BLE001 - reported per object
                results.append(
                    OrganizeResult(
                        dataset.name,
                        source_key,
                        target_key,
                        size,
                        "failed",
                        describe_error(error, config),
                    )
                )

        if verbose and not quiet:
            result = results[-1]
            print(f"  [{index}/{total}] {result.status:<8} {result.source_key} -> {result.target_key}")

    return results


def print_organize_summary(
    results: Sequence[OrganizeResult],
    *,
    dry_run: bool = False,
) -> None:
    counts = Counter(result.status for result in results)
    if dry_run:
        print(
            f"\nPlanned: {counts.get('planned', 0)} copies, "
            f"{counts.get('present', 0)} already present, "
            f"{counts.get('conflict', 0)} conflicts, {counts.get('failed', 0)} failed"
        )
    else:
        print(
            f"\nOrganized: {counts.get('copied', 0)} copied, "
            f"{counts.get('present', 0)} already present, "
            f"{counts.get('conflict', 0)} conflicts, {counts.get('failed', 0)} failed"
        )
    for result in results:
        if result.status in {"conflict", "failed"}:
            print(
                f"  {result.status}: {result.source_key} -> {result.target_key}: {result.error}",
                file=sys.stderr,
            )


def write_organize_report(
    path: Path,
    config: R2Config,
    results: Sequence[OrganizeResult],
    *,
    dry_run: bool = False,
) -> None:
    """Write one JSONL row per legacy object that was inspected."""
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for result in results:
            row = {
                "timestamp": timestamp,
                "command": "organize",
                "bucket": config.bucket,
                "dataset": result.dataset,
                "source_key": result.source_key,
                "target_key": result.target_key,
                "bytes": result.size,
                "status": "planned" if dry_run and result.status == "copied" else result.status,
                "error": result.error,
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Report: {_display_path(path)}")


def dataset_remote_objects(
    client: Any, config: R2Config, dataset: Dataset
) -> dict[str, tuple[str, int]]:
    """Return every remote key for a dataset mapped to its prefix and size."""
    found: dict[str, tuple[str, int]] = {}
    for prefix in (dataset.prefix, *dataset.legacy_prefixes):
        for key, size in list_remote_objects(client, config, prefix).items():
            found[key] = (prefix, size)
    return found


def dataset_reset_guard(
    dataset: Dataset,
    remote: Mapping[str, tuple[str, int]] | None = None,
    *,
    allow_remote_only: bool = False,
) -> tuple[bool, str]:
    """Refuse to delete a dataset that cannot be rebuilt from the local tree.

    When ``remote`` is supplied, every remote object must have a local
    counterpart. A remote-only object would be lost by the reset, so it blocks
    the run unless ``allow_remote_only`` is explicit.
    """
    if not dataset.local_root.is_dir():
        return False, f"no local tree at {_display_path(dataset.local_root)}"
    plan = dataset_local_plan(dataset)
    if not plan:
        return False, "local tree is empty"
    if dataset.marker and not (dataset.local_root / dataset.marker).is_file():
        return False, f"local marker {dataset.marker} is missing"

    if remote and not allow_remote_only:
        local_relatives = {item.relative for item in plan}
        remote_only: list[str] = []
        for key, (prefix, _size) in remote.items():
            try:
                relative = safe_relative_key(key, prefix).as_posix()
            except ConfigError:
                remote_only.append(key)
                continue
            if relative not in local_relatives:
                remote_only.append(key)
        if remote_only:
            return (
                False,
                f"{len(remote_only)} remote object(s) have no local copy "
                f"(first: {remote_only[0]}); pass --allow-remote-only to delete them",
            )

    detail = f"{len(plan)} local object(s) available to re-upload"
    if remote is not None:
        detail += f"; {len(remote)} remote object(s) checked"
    return True, detail


def reset_dataset(
    client: Any,
    config: R2Config,
    dataset: Dataset,
    *,
    remote: Mapping[str, tuple[str, int]] | None = None,
    dry_run: bool = False,
    limit: int | None = None,
    verbose: bool = False,
    quiet: bool = False,
) -> list[UploadResult]:
    """Delete every object under a dataset's canonical and legacy prefixes.

    The caller must check :func:`dataset_reset_guard` first. Objects are deleted
    one at a time so a failure names the exact key and stops nothing else.
    """
    if remote is None:
        remote = dataset_remote_objects(client, config, dataset)

    keys = sorted(remote)
    if limit is not None:
        keys = keys[:limit]
    total = len(keys)
    results: list[UploadResult] = []
    for index, key in enumerate(keys, start=1):
        prefix, size = remote[key]
        try:
            relative = safe_relative_key(key, prefix).as_posix()
        except ConfigError:
            relative = key

        if dry_run:
            status, error = "planned", None
        else:
            try:
                client.delete_object(Bucket=config.bucket, Key=key)
                status, error = "deleted", None
            except Exception as failure:  # noqa: BLE001 - reported per object
                status, error = "failed", describe_error(failure, config)

        results.append(
            UploadResult(
                key=key,
                relative=relative,
                size=size,
                status=status,
                error=error,
            )
        )
        if verbose and not quiet:
            print(f"  [{index}/{total}] {status:<8} {key}")

    return results


def print_reset_summary(
    results: Sequence[UploadResult],
    *,
    dry_run: bool = False,
) -> None:
    counts = Counter(result.status for result in results)
    removed = counts.get("deleted", 0) + counts.get("planned", 0)
    removed_bytes = sum(
        result.size for result in results if result.status in {"deleted", "planned"}
    )
    label = "Planned deletion" if dry_run else "Deleted"
    print(
        f"\n{label}: {removed} objects ({human_bytes(removed_bytes)}), "
        f"{counts.get('failed', 0)} failed"
    )
    for result in results:
        if result.status == "failed":
            print(f"  failed: {result.key}: {result.error}", file=sys.stderr)


def print_dataset_state(state: DatasetState) -> None:
    marker = "yes" if state.complete else "no"
    prefix = state.remote_prefix or state.dataset.prefix
    print(
        f"  {state.dataset.name:<22} local {state.local_objects:>6}  "
        f"remote {state.remote_objects:>6}  {state.state:<12} "
        f"marker={marker}  prefix={prefix}/"
    )


def write_bucket_manifest(
    client: Any,
    config: R2Config,
    states: Sequence[DatasetState],
    *,
    command: str,
) -> str:
    """Write a small index of every dataset. It never deletes objects."""
    payload = {
        "version": 1,
        "bucket": config.bucket,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": command,
        "datasets": [
            {
                "name": state.dataset.name,
                "prefix": state.remote_prefix or state.dataset.prefix,
                "canonical_prefix": state.dataset.prefix,
                "objects": state.remote_objects,
                "bytes": state.remote_bytes,
                "local_objects": state.local_objects,
                "complete": state.complete,
                "description": state.dataset.description,
            }
            for state in states
        ],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    client.put_object(
        Bucket=config.bucket,
        Key=BUCKET_MANIFEST_KEY,
        Body=body.encode("utf-8"),
        ContentType="application/json",
    )
    return BUCKET_MANIFEST_KEY


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def human_bytes(value: int) -> str:
    size = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if size < 1024 or unit == "TiB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{value} B"


def _display_path(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def print_header(
    config: R2Config,
    source: Path | None,
    prefix: str,
    *,
    command: str,
    object_count: int | None = None,
    object_bytes: int | None = None,
) -> None:
    print(f"Command:     {command}")
    print(f"Bucket:      {config.bucket}")
    print("Endpoint:    <configured R2 account endpoint>")
    print(f"Region:      {config.region}")
    print(f"Source:      {_display_path(source) if source else '(remote only)'}")
    print(f"Prefix:      {prefix}/")
    if object_count is not None:
        print(f"Objects:     {object_count} ({human_bytes(object_bytes or 0)})")
    print("Credentials: configured (values are never printed)")


def print_dataset_header(config: R2Config, datasets: Sequence[Dataset], *, command: str) -> None:
    print(f"Command:     {command}")
    print(f"Bucket:      {config.bucket}")
    print("Endpoint:    <configured R2 account endpoint>")
    print(f"Region:      {config.region}")
    print(f"Datasets:    {', '.join(dataset.name for dataset in datasets)}")
    print("Credentials: configured (values are never printed)")


def print_plan(plan: Sequence[PlannedFile], *, verbose: bool) -> None:
    print("\nDry run: no network calls and no objects written.")
    if not plan:
        return
    print("Planned object keys:")
    shown = plan if verbose else plan[:5]
    for item in shown:
        print(f"  {item.key}  ({human_bytes(item.size)})")
    if len(plan) > len(shown):
        print(f"  ... {len(plan) - len(shown)} more (use --verbose to list every key)")


def print_summary(
    results: Sequence[UploadResult],
    *,
    command: str,
    dry_run: bool = False,
) -> None:
    counts = Counter(result.status for result in results)
    failed = counts.get("failed", 0)
    if command in {"upload", "push"}:
        uploaded = counts.get("uploaded", 0) + counts.get("planned", 0)
        uploaded_bytes = sum(
            result.size for result in results if result.status in {"uploaded", "planned"}
        )
        if dry_run:
            print(f"\nPlanned: {uploaded} objects ({human_bytes(uploaded_bytes)})")
        else:
            print(
                f"\nFinished: {uploaded} uploaded, {counts.get('skipped', 0)} skipped, "
                f"{failed} failed ({human_bytes(uploaded_bytes)} uploaded)"
            )
    elif command == "verify":
        verified = counts.get("verified", 0)
        verified_bytes = sum(
            result.size for result in results if result.status == "verified"
        )
        print(
            f"\nVerified: {verified} objects ({human_bytes(verified_bytes)}), "
            f"{failed} failed"
        )
    else:
        downloaded = counts.get("downloaded", 0)
        downloaded_bytes = sum(
            result.size for result in results if result.status == "downloaded"
        )
        print(
            f"\nDownloaded: {downloaded} objects ({human_bytes(downloaded_bytes)}), "
            f"{counts.get('skipped', 0)} skipped, {failed} failed"
        )
    for result in results:
        if result.status == "failed":
            print(f"  failed: {result.key}: {result.error}", file=sys.stderr)


def write_report(
    path: Path,
    config: R2Config,
    source: Path | None,
    prefix: str,
    results: Sequence[UploadResult],
    *,
    command: str,
    dry_run: bool = False,
) -> None:
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for result in results:
            row = {
                "timestamp": timestamp,
                "command": command,
                "bucket": config.bucket,
                "source": _display_path(source) if source else "",
                "prefix": prefix,
                "key": result.key,
                "relative_path": result.relative,
                "bytes": result.size,
                "status": "planned" if dry_run and result.status == "uploaded" else result.status,
                "sha256": result.sha256,
                "error": result.error,
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Report: {_display_path(path)}")


def write_dataset_report(
    path: Path,
    config: R2Config,
    results: Sequence[tuple[str, str, UploadResult]],
    *,
    command: str,
    dry_run: bool = False,
) -> None:
    """Write one JSONL report across datasets, with the dataset name per row."""
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for dataset_name, prefix, result in results:
            row = {
                "timestamp": timestamp,
                "command": command,
                "bucket": config.bucket,
                "dataset": dataset_name,
                "prefix": prefix,
                "key": result.key,
                "relative_path": result.relative,
                "bytes": result.size,
                "status": "planned" if dry_run and result.status == "uploaded" else result.status,
                "sha256": result.sha256,
                "error": result.error,
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"Report: {_display_path(path)}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Upload, verify, pull or push the PHARMEAZOR corpus through "
            "Cloudflare R2 (S3-compatible API)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Configuration is read from .env.local (S3_ACCESS_KEY_ID, "
            "S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_REGION, STORAGE_BUCKET).\n"
            "Secret values are never printed.\n\n"
            "Commands:\n"
            "  upload (default)  upload one local tree under --prefix\n"
            "  verify            read one remote prefix back and compare hashes\n"
            "  download          restore one remote prefix under --dest\n"
            "  status            compare every known dataset locally and remotely\n"
            "  pull              download every dataset into its local root\n"
            "  push              upload every dataset under its canonical prefix\n"
            "  sync              pull missing remote objects, then push local objects\n"
            "  organize          copy legacy prefixes to the canonical layout (no overwrite, no delete)\n"
            "  reset             delete selected prefixes (requires --yes and a complete local copy)\n\n"
            "Examples:\n"
            "  python bucket_operations.py --dry-run\n"
            "  python bucket_operations.py status\n"
            "  python bucket_operations.py pull --group retrieval\n"
            "  python bucket_operations.py push --group cleaning --skip-existing\n"
            "  python bucket_operations.py organize --dry-run\n"
            "  python bucket_operations.py organize --report organize.report.jsonl\n"
            "  python bucket_operations.py reset --dry-run\n"
            "  python bucket_operations.py reset --yes --report reset.report.jsonl\n"
            "  python bucket_operations.py sync\n"
            "  python bucket_operations.py --source ../cleaning-lab/output --prefix cleaning-lab\n"
        ),
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="upload",
        choices=(
            "upload",
            "verify",
            "download",
            "status",
            "pull",
            "push",
            "sync",
            "organize",
            "reset",
        ),
        help="upload (default), verify, download, status, pull, push, sync, organize, or reset",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help=f"environment file to read (default: {DEFAULT_ENV_FILE})",
    )
    parser.add_argument(
        "--source",
        type=Path,
        help="local corpus directory (default: cleaned output, then raw corpus)",
    )
    parser.add_argument(
        "--prefix",
        help="object key prefix inside the bucket (default: cleaning-lab or retrieval-lab/raw)",
    )
    parser.add_argument(
        "--dataset",
        action="append",
        choices=tuple(DATASETS_BY_NAME),
        help="dataset for status/pull/push/sync/organize/reset (repeatable; default: all)",
    )
    parser.add_argument(
        "--group",
        action="append",
        choices=DATASET_GROUPS,
        help="select a lab group for status/pull/push/sync/organize/reset (repeatable)",
    )
    parser.add_argument("--bucket", help="override STORAGE_BUCKET")
    parser.add_argument(
        "--dest",
        type=Path,
        help=f"download directory (default: {DEFAULT_DOWNLOAD_ROOT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="upload/push/organize/reset only: list planned work without writing objects",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="upload/download/push: skip objects already matching size and SHA-256",
    )
    parser.add_argument(
        "--checksum",
        action="store_true",
        help="upload/push only: store SHA-256 as object metadata",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="pull/push/sync: re-transfer even when size and SHA-256 already match",
    )
    parser.add_argument("--workers", type=int, default=4, help="parallel transfers (default: 4)")
    parser.add_argument("--limit", type=int, help="process only the first N objects")
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="upload/push only: stop at the first failure (sequential)",
    )
    parser.add_argument("--report", type=Path, help="write a JSONL report of every object")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="reset only: confirm permanent deletion of the selected remote objects",
    )
    parser.add_argument(
        "--allow-remote-only",
        action="store_true",
        help="reset only: delete remote objects that have no local copy",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="print every object")
    parser.add_argument("--quiet", "-q", action="store_true", help="only print the summary")
    return parser


def _overlaps(left: Path, right: Path) -> bool:
    """True when either path contains the other (equal paths included)."""
    for parent, child in ((left, right), (right, left)):
        try:
            parent.relative_to(child)
            return True
        except ValueError:
            continue
    return False


DATASET_COMMANDS = frozenset({"status", "pull", "push", "sync", "organize", "reset"})


def _run_dataset_command(args: Any, config: R2Config, assignments: Mapping[str, Sequence[str]]) -> int:
    """Run status/pull/push/sync/organize/reset across the known dataset trees."""
    try:
        datasets = select_datasets(args.dataset, args.group)
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    if args.dest is not None and len(datasets) != 1:
        print("error: --dest requires exactly one --dataset", file=sys.stderr)
        return 2
    if args.command == "reset" and not args.yes and not args.dry_run:
        print(
            "note: reset without --yes only lists the objects; "
            "pass --yes to delete them permanently"
        )
        args.dry_run = True

    if not args.quiet:
        print_dataset_header(config, datasets, command=args.command)
        duplicates = [
            key
            for key in duplicate_keys(assignments)
            if key.startswith(("S3_", "STORAGE_", "R2_"))
        ]
        if duplicates:
            print(
                "note:       duplicate keys in the environment file; the first "
                f"configured value wins ({', '.join(duplicates)})"
            )

    if args.dry_run and args.command == "push":
        planned: list[tuple[str, str, UploadResult]] = []
        for dataset in datasets:
            plan = dataset_local_plan(dataset)
            if args.limit is not None:
                plan = plan[: args.limit]
            if not args.quiet:
                print(f"\nDataset:     {dataset.name}")
                print(f"Prefix:      {dataset.prefix}/")
                print_plan(plan, verbose=args.verbose)
            planned.extend(
                (
                    dataset.name,
                    dataset.prefix,
                    UploadResult(
                        key=item.key,
                        relative=item.relative,
                        size=item.size,
                        status="uploaded",
                    ),
                )
                for item in plan
            )
        print_summary([result for _, _, result in planned], command="push", dry_run=True)
        if args.report:
            try:
                write_dataset_report(
                    args.report, config, planned, command=args.command, dry_run=True
                )
            except OSError as error:
                print(f"error: cannot write report: {error}", file=sys.stderr)
                return 1
        return 0

    try:
        client, transfer_config = make_client(config, workers=args.workers)
        verify_bucket(client, config)
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    states: list[DatasetState] = []
    report_rows: list[tuple[str, str, UploadResult]] = []
    organize_rows: list[OrganizeResult] = []
    failures = 0

    try:
        for dataset in datasets:
            if not args.quiet:
                print(f"\nDataset:     {dataset.name}  ({dataset.description})")
            state = dataset_state(client, config, dataset)

            if args.command == "status":
                print_dataset_state(state)
                states.append(state)
                continue

            if args.command == "organize":
                results = organize_dataset(
                    client,
                    config,
                    dataset,
                    dry_run=args.dry_run,
                    limit=args.limit,
                    verbose=args.verbose,
                    quiet=args.quiet,
                )
                if results:
                    print_organize_summary(results, dry_run=args.dry_run)
                    organize_rows.extend(results)
                    failures += sum(
                        1 for result in results if result.status in {"conflict", "failed"}
                    )
                else:
                    print("  no legacy objects")
                continue

            if args.command == "reset":
                remote = dataset_remote_objects(client, config, dataset)
                allowed, reason = dataset_reset_guard(
                    dataset, remote, allow_remote_only=args.allow_remote_only
                )
                if not allowed:
                    print(f"  skipped: {reason}; remote objects are left untouched")
                    continue
                print(f"  guard: {reason}")
                results = reset_dataset(
                    client,
                    config,
                    dataset,
                    remote=remote,
                    dry_run=args.dry_run,
                    limit=args.limit,
                    verbose=args.verbose,
                    quiet=args.quiet,
                )
                if results:
                    print_reset_summary(results, dry_run=args.dry_run)
                    report_rows.extend(
                        (dataset.name, dataset.prefix, result) for result in results
                    )
                    failures += sum(1 for result in results if result.status == "failed")
                else:
                    print("  no remote objects")
                continue

            if args.command in {"pull", "sync"} and state.remote:
                destination = args.dest.expanduser().resolve() if args.dest else None
                state, results = pull_dataset(
                    client,
                    config,
                    dataset,
                    dest_root=destination,
                    workers=args.workers,
                    limit=args.limit,
                    skip_existing=not args.force,
                    verbose=args.verbose,
                    quiet=args.quiet,
                )
                if results:
                    print(f"  pull: {len(results)} object(s) from {state.remote_prefix}/")
                    print_summary(results, command="pull")
                    report_rows.extend(
                        (dataset.name, state.remote_prefix or dataset.prefix, result)
                        for result in results
                    )
                    failures += sum(1 for result in results if result.status == "failed")

            if args.command in {"push", "sync"}:
                plan, results = push_dataset(
                    client,
                    transfer_config,
                    config,
                    dataset,
                    workers=args.workers,
                    skip_existing=not args.force,
                    checksum=True,
                    fail_fast=args.fail_fast,
                    verbose=args.verbose,
                    quiet=args.quiet,
                )
                if results:
                    print(f"  push: {len(plan)} object(s) to {dataset.prefix}/")
                    print_summary(results, command="push")
                    report_rows.extend(
                        (dataset.name, dataset.prefix, result) for result in results
                    )
                    failures += sum(1 for result in results if result.status == "failed")

            states.append(dataset_state(client, config, dataset))
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\ninterrupted; completed transfers remain in the bucket", file=sys.stderr)
        return 130

    if args.command in {"push", "sync"}:
        try:
            key = write_bucket_manifest(client, config, states, command=args.command)
        except Exception as error:  # noqa: BLE001 - translated below
            print(
                f"error: cannot write {BUCKET_MANIFEST_KEY}: {describe_error(error, config)}",
                file=sys.stderr,
            )
            return 1
        if not args.quiet:
            print(f"\nManifest:    {key}")

    if args.report:
        try:
            if args.command == "organize":
                write_organize_report(
                    args.report, config, organize_rows, dry_run=args.dry_run
                )
            else:
                write_dataset_report(args.report, config, report_rows, command=args.command)
        except OSError as error:
            print(f"error: cannot write report: {error}", file=sys.stderr)
            return 1

    return 1 if failures else 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    command = args.command
    dataset_command = command in DATASET_COMMANDS

    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.verbose and args.quiet:
        parser.error("--verbose and --quiet are mutually exclusive")
    if args.dry_run and command not in {"upload", "push", "organize", "reset"}:
        parser.error("--dry-run is only valid for upload, push, organize and reset")
    if args.dest is not None and command not in {"download", "pull"}:
        parser.error("--dest is only valid for download and pull")
    if args.checksum and command not in {"upload", "push"}:
        parser.error("--checksum is only valid for upload and push")
    if args.fail_fast and command not in {"upload", "push"}:
        parser.error("--fail-fast is only valid for upload and push")
    if args.force and command not in {"pull", "push", "sync"}:
        parser.error("--force is only valid for pull, push and sync")
    if args.force and args.skip_existing:
        parser.error("--force and --skip-existing are mutually exclusive")
    if args.skip_existing and command == "verify":
        parser.error("--skip-existing is not valid for verify")
    if args.yes and command != "reset":
        parser.error("--yes is only valid for reset")
    if args.allow_remote_only and command != "reset":
        parser.error("--allow-remote-only is only valid for reset")
    if dataset_command and (args.source is not None or args.prefix is not None):
        parser.error("--source/--prefix are only valid for upload, verify and download")
    if not dataset_command and args.dataset:
        parser.error("--dataset is only valid for status, pull, push, sync, organize and reset")
    if not dataset_command and args.group:
        parser.error("--group is only valid for status, pull, push, sync, organize and reset")

    try:
        assignments = parse_env_file(args.env_file)
        config = resolve_config(assignments, bucket_override=args.bucket)
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if dataset_command:
        return _run_dataset_command(args, config, assignments)

    try:
        source, prefix = resolve_source(args.source, args.prefix)
        plan = build_plan(source, prefix)
        if command == "upload" and args.limit is not None:
            plan = plan[: args.limit]
        if not plan:
            raise ConfigError(f"no files found under {source}")
        dest_root = None
        if command == "download":
            dest_root = (args.dest or DEFAULT_DOWNLOAD_ROOT).expanduser().resolve()
            if _overlaps(dest_root, source):
                raise ConfigError("--dest must not overlap the local source tree")
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if not args.quiet:
        print_header(
            config,
            source,
            prefix,
            command=command,
            object_count=len(plan) if command != "download" else None,
            object_bytes=sum(item.size for item in plan) if command != "download" else None,
        )
        duplicates = [
            key
            for key in duplicate_keys(assignments)
            if key.startswith(("S3_", "STORAGE_", "R2_"))
        ]
        if duplicates:
            print(
                "note:       duplicate keys in the environment file; the first "
                f"configured value wins ({', '.join(duplicates)})"
            )

    if args.dry_run:
        if not args.quiet:
            print_plan(plan, verbose=args.verbose)
        results = []
        for item in plan:
            digest = None
            if args.checksum:
                try:
                    digest = sha256_file(item.path)
                except OSError as error:
                    print(
                        f"warning: cannot hash {item.key}: {error.strerror or error}",
                        file=sys.stderr,
                    )
            results.append(
                UploadResult(
                    key=item.key,
                    relative=item.relative,
                    size=item.size,
                    status="uploaded",
                    sha256=digest,
                )
            )
        print_summary(results, command=command, dry_run=True)
        if args.report:
            try:
                write_report(
                    args.report,
                    config,
                    source,
                    prefix,
                    results,
                    command=command,
                    dry_run=True,
                )
            except OSError as error:
                print(f"error: cannot write report: {error}", file=sys.stderr)
                return 1
        return 0

    try:
        client, transfer_config = make_client(config, workers=args.workers)
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    try:
        verify_bucket(client, config)
    except ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if command == "upload":
        try:
            results = run_uploads(
                client,
                transfer_config,
                config,
                plan,
                workers=args.workers,
                skip_existing=args.skip_existing,
                checksum=args.checksum,
                fail_fast=args.fail_fast,
                verbose=args.verbose,
                quiet=args.quiet,
            )
        except KeyboardInterrupt:
            print(
                "\ninterrupted; already-uploaded objects remain in the bucket",
                file=sys.stderr,
            )
            return 130
    else:
        try:
            remote = list_remote_objects(client, config, prefix)
        except ConfigError as error:
            print(f"error: {error}", file=sys.stderr)
            return 2
        if not remote:
            print(f"error: no objects under '{prefix}/'", file=sys.stderr)
            return 2
        if not args.quiet:
            print(
                f"Remote:      {len(remote)} objects "
                f"({human_bytes(sum(remote.values()))})"
            )

        try:
            if command == "verify":
                results = run_verify(
                    client,
                    config,
                    plan,
                    remote,
                    workers=args.workers,
                    limit=args.limit,
                    verbose=args.verbose,
                    quiet=args.quiet,
                )
            else:
                assert dest_root is not None  # set for the download command
                if not args.quiet:
                    print(f"Destination: {_display_path(dest_root)}")
                local_by_key = {item.key: item for item in plan}
                results = run_download(
                    client,
                    config,
                    remote,
                    prefix=prefix,
                    dest_root=dest_root,
                    local_by_key=local_by_key,
                    workers=args.workers,
                    limit=args.limit,
                    skip_existing=args.skip_existing,
                    verbose=args.verbose,
                    quiet=args.quiet,
                )
        except KeyboardInterrupt:
            print("\ninterrupted; partial results may remain", file=sys.stderr)
            return 130

    print_summary(results, command=command)
    if args.report:
        try:
            write_report(
                args.report,
                config,
                source,
                prefix,
                results,
                command=command,
            )
        except OSError as error:
            print(f"error: cannot write report: {error}", file=sys.stderr)
            return 1

    return 1 if any(result.status == "failed" for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
