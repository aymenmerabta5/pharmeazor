"""Dataset-level pull, push, sync, organize and reset."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from .config import ConfigError, R2Config
from .keys import (
    Dataset,
    DatasetState,
    OrganizeResult,
    PlannedFile,
    UploadResult,
    build_plan,
    object_key,
    safe_relative_key,
)
from .paths import BUCKET_MANIFEST_KEY
from .reporting import _display_path
from .transfer import describe_error, list_remote_objects, run_download, run_uploads


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
