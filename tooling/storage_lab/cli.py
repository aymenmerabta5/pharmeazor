"""Command-line interface for the shared bucket operations."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

from .config import ConfigError, duplicate_keys, parse_env_file, resolve_config
from .keys import (
    DATASET_GROUPS,
    DATASETS_BY_NAME,
    UploadResult,
    build_plan,
    resolve_source,
    select_datasets,
)
from .mirror import (
    dataset_local_plan,
    dataset_remote_objects,
    dataset_reset_guard,
    dataset_state,
    organize_dataset,
    pull_dataset,
    push_dataset,
    reset_dataset,
    write_bucket_manifest,
)
from .paths import BUCKET_MANIFEST_KEY, DEFAULT_DOWNLOAD_ROOT, DEFAULT_ENV_FILE
from .reporting import (
    _display_path,
    human_bytes,
    print_dataset_header,
    print_dataset_state,
    print_header,
    print_organize_summary,
    print_plan,
    print_reset_summary,
    print_summary,
    write_dataset_report,
    write_organize_report,
    write_report,
)
from .transfer import (
    describe_error,
    list_remote_objects,
    make_client,
    run_download,
    run_uploads,
    run_verify,
    sha256_file,
    verify_bucket,
)


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
