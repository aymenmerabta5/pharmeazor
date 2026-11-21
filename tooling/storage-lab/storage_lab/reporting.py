"""Console summaries and JSONL transfer reports."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from .config import R2Config
from .keys import Dataset, DatasetState, OrganizeResult, PlannedFile, UploadResult
from .paths import REPO_ROOT


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
