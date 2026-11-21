#!/usr/bin/env python3
"""Bucket-first runner for the PHARMEAZOR corpus.

The bucket is the source of truth. On every run this script asks R2 what
already exists:

1. if the cleaned corpus is in the bucket, it is pulled and the local
   retrieval/cleaning/chunking stages are skipped;
2. if the raw collection is in the bucket, it is pulled and only the missing
   stages run locally;
3. only when the bucket has nothing does the script collect, clean and chunk.

Every stage that runs is pushed back to the bucket. Nothing is ever deleted
from R2, and a legacy prefix is read as a fallback but never rewritten.

Usage
-----
    python tooling/run_pipeline.py                 # bucket-first, all stages
    python tooling/run_pipeline.py --stage pull    # restore from the bucket only
    python tooling/run_pipeline.py --stage push    # upload the local tree only
    python tooling/run_pipeline.py --refresh       # rebuild locally, then push
    python tooling/run_pipeline.py --reset --yes   # wipe selected datasets, rebuild, push
    python tooling/run_pipeline.py --dry-run       # show the plan, touch nothing
"""

from __future__ import annotations

import argparse
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Sequence

TOOL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = TOOL_ROOT.parent
BUCKET_MODULE = TOOL_ROOT / "bucket_operations.py"
RETRIEVAL_MAIN = TOOL_ROOT / "retrieval-lab" / "main.py"
CLEANING_MAIN = TOOL_ROOT / "cleaning-lab" / "run.py"
CLEANING_OUTPUT = TOOL_ROOT / "cleaning-lab" / "output"
EMBED_INPUT = CLEANING_OUTPUT / "context" / "embed-input.jsonl"
CLEANING_MARKER = CLEANING_OUTPUT / "manifest.jsonl"


def load_bucket_module():
    """Load the shared bucket module without installing it."""
    spec = importlib.util.spec_from_file_location("_pharmeazor_bucket_operations", BUCKET_MODULE)
    if spec is None or spec.loader is None:
        raise SystemExit(f"error: cannot load {BUCKET_MODULE}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


bucket = load_bucket_module()


def run_step(label: str, command: Sequence[str], *, dry_run: bool) -> int:
    printable = " ".join(str(part) for part in command)
    print(f"\n== {label} ==")
    print(f"$ {printable}")
    if dry_run:
        return 0
    completed = subprocess.run(command, cwd=REPO_ROOT, check=False)
    if completed.returncode != 0:
        print(f"error: {label} exited with {completed.returncode}", file=sys.stderr)
    return completed.returncode


def python_step(label: str, script: Path, *arguments: str, dry_run: bool) -> int:
    return run_step(label, [sys.executable, str(script), *arguments], dry_run=dry_run)


def bun_step(label: str, *arguments: str, dry_run: bool) -> int:
    bun = shutil.which("bun")
    if bun is None:
        print("error: bun is not on PATH; cannot run the chunking stage", file=sys.stderr)
        return 2
    return run_step(
        label,
        [bun, "run", "retrieval:contextualize", "--", *arguments],
        dry_run=dry_run,
    )


def pull_available(
    client,
    config,
    datasets,
    *,
    workers: int,
    force: bool,
    dry_run: bool,
) -> dict[str, object]:
    """Download every selected dataset that exists remotely."""
    states: dict[str, object] = {}
    for dataset in datasets:
        state = bucket.dataset_state(client, config, dataset)
        states[dataset.name] = state
        if not state.remote:
            print(f"  {dataset.name:<22} not in bucket")
            continue
        print(
            f"  {dataset.name:<22} bucket {state.remote_objects:>6} object(s) "
            f"under {state.remote_prefix}/"
        )
        if dry_run:
            continue
        state, results = bucket.pull_dataset(
            client,
            config,
            dataset,
            workers=workers,
            skip_existing=not force,
            quiet=True,
        )
        if results:
            bucket.print_summary(results, command="pull")
    return states


def push_local(
    client,
    transfer_config,
    config,
    datasets,
    *,
    workers: int,
    force: bool,
    dry_run: bool,
) -> int:
    """Upload every selected dataset that has a local tree."""
    failures = 0
    states = []
    for dataset in datasets:
        if not dataset.local_root.is_dir():
            print(f"  {dataset.name:<22} no local tree at {dataset.local_root}")
            continue
        if dry_run:
            plan = bucket.dataset_local_plan(dataset)
            print(f"  {dataset.name:<22} would push {len(plan)} object(s) to {dataset.prefix}/")
            continue
        plan, results = bucket.push_dataset(
            client,
            transfer_config,
            config,
            dataset,
            workers=workers,
            skip_existing=not force,
            checksum=True,
            quiet=True,
        )
        if results:
            bucket.print_summary(results, command="push")
            failures += sum(1 for result in results if result.status == "failed")
        states.append(bucket.dataset_state(client, config, dataset))
    if states and not dry_run:
        key = bucket.write_bucket_manifest(client, config, states, command="push")
        print(f"  manifest: {key}")
    return failures


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--stage",
        choices=("auto", "pull", "push"),
        default="auto",
        help="auto (bucket-first), pull only, or push only",
    )
    parser.add_argument(
        "--dataset",
        action="append",
        choices=tuple(bucket.DATASETS_BY_NAME),
        help="limit the run to one dataset (repeatable; default: all)",
    )
    parser.add_argument(
        "--group",
        action="append",
        choices=bucket.DATASET_GROUPS,
        help="limit the run to a lab group (repeatable; default: all)",
    )
    parser.add_argument("--env-file", type=Path, default=bucket.DEFAULT_ENV_FILE)
    parser.add_argument("--bucket", help="override STORAGE_BUCKET")
    parser.add_argument("--workers", type=int, default=4, help="parallel transfers (default: 4)")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help=(
            "rebuild the cleaned corpus and chunk export locally even when the "
            "bucket already has them (the raw collection is reused)"
        ),
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help=(
            "delete the selected remote datasets before rebuilding and pushing; "
            "requires --yes and a complete local copy"
        ),
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="confirm the permanent deletion performed by --reset",
    )
    parser.add_argument(
        "--allow-remote-only",
        action="store_true",
        help="with --reset: also delete remote objects that have no local copy",
    )
    parser.add_argument(
        "--skip-retrieval",
        action="store_true",
        help="never run the collection stage",
    )
    parser.add_argument(
        "--skip-cleaning",
        action="store_true",
        help="never run the cleaning stage",
    )
    parser.add_argument(
        "--skip-chunking",
        action="store_true",
        help="never run the chunking/context export stage",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the plan without transferring or running a stage (the bucket is still listed)",
    )
    args = parser.parse_args(argv)

    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if args.yes and not args.reset:
        parser.error("--yes is only valid with --reset")
    if args.allow_remote_only and not args.reset:
        parser.error("--allow-remote-only is only valid with --reset")
    if args.reset and args.stage == "pull":
        parser.error("--reset cannot be combined with --stage pull")

    try:
        assignments = bucket.parse_env_file(args.env_file)
        config = bucket.resolve_config(assignments, bucket_override=args.bucket)
        datasets = bucket.select_datasets(args.dataset, args.group)
    except bucket.ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    print(f"Bucket:      {config.bucket}")
    print(f"Region:      {config.region}")
    print(f"Stage:       {args.stage}")
    print(f"Datasets:    {', '.join(dataset.name for dataset in datasets)}")
    print("Credentials: configured (values are never printed)")

    if args.stage == "pull":
        try:
            client, _ = bucket.make_client(config, workers=args.workers)
            bucket.verify_bucket(client, config)
        except bucket.ConfigError as error:
            print(f"error: {error}", file=sys.stderr)
            return 2
        pull_available(
            client,
            config,
            datasets,
            workers=args.workers,
            force=args.refresh,
            dry_run=args.dry_run,
        )
        return 0

    try:
        client, transfer_config = bucket.make_client(config, workers=args.workers)
        bucket.verify_bucket(client, config)
    except bucket.ConfigError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.reset:
        print("\nReset: deleting the selected remote datasets.")
        list_only = args.dry_run or not args.yes
        if not args.yes:
            print("  --yes was not passed; listing objects only.")
        reset_failures = 0
        for dataset in datasets:
            remote = bucket.dataset_remote_objects(client, config, dataset)
            allowed, reason = bucket.dataset_reset_guard(
                dataset, remote, allow_remote_only=args.allow_remote_only
            )
            if not allowed:
                print(f"  {dataset.name:<22} skipped: {reason}")
                continue
            print(f"  {dataset.name:<22} {reason}")
            results = bucket.reset_dataset(
                client,
                config,
                dataset,
                remote=remote,
                dry_run=list_only,
            )
            bucket.print_reset_summary(results, dry_run=list_only)
            reset_failures += sum(1 for result in results if result.status == "failed")
        if list_only:
            print("\nNothing was deleted. Re-run without --dry-run and with --yes to delete.")
            return 0
        if reset_failures:
            print("\nReset failed for some objects; nothing was pushed.", file=sys.stderr)
            return 1

    if args.stage == "push":
        failures = push_local(
            client,
            transfer_config,
            config,
            datasets,
            workers=args.workers,
            force=args.refresh,
            dry_run=args.dry_run,
        )
        return 1 if failures else 0

    # ------------------------------------------------------------------
    # auto: bucket first
    # ------------------------------------------------------------------
    cleaning_dataset = bucket.DATASETS_BY_NAME["cleaning-output"]
    raw_dataset = bucket.DATASETS_BY_NAME["retrieval-raw"]
    cleaning_selected = cleaning_dataset in datasets
    retrieval_selected = any(
        dataset.prefix.startswith("retrieval-lab/") for dataset in datasets
    )
    cleaning_state = bucket.dataset_state(client, config, cleaning_dataset)
    raw_state = bucket.dataset_state(client, config, raw_dataset)

    if cleaning_state.complete and not args.refresh:
        print("\nBucket hit: cleaned corpus is present; pulling it and stopping.")
        pull_available(
            client,
            config,
            datasets,
            workers=args.workers,
            force=False,
            dry_run=args.dry_run,
        )
        if args.dry_run or args.skip_chunking or not cleaning_selected:
            return 0
        if not EMBED_INPUT.is_file():
            print("\nChunk export is missing from the pulled corpus; generating it.")
            code = bun_step("chunking", "export", dry_run=False)
            if code != 0:
                return code
            failures = push_local(
                client,
                transfer_config,
                config,
                [cleaning_dataset],
                workers=args.workers,
                force=False,
                dry_run=False,
            )
            return 1 if failures else 0
        print("\nNothing else to do.")
        return 0

    # The cleaned corpus is absent (or a refresh was requested): restore what
    # the bucket already has, then run only the missing stages.
    if args.refresh:
        print("\nRefresh requested: rebuilding the cleaned corpus and chunk export.")
    else:
        print("\nBucket miss: cleaned corpus is not in the bucket.")
    pull_datasets = [
        dataset for dataset in datasets if not (args.refresh and dataset is cleaning_dataset)
    ]
    pull_available(
        client,
        config,
        pull_datasets,
        workers=args.workers,
        force=False,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        if (
            retrieval_selected
            and not raw_state.remote
            and not args.skip_retrieval
            and not (bucket.DATA_ROOT / "raw").is_dir()
        ):
            print("  would run: retrieval collection")
        if cleaning_selected and not args.skip_cleaning and (
            args.refresh or not CLEANING_MARKER.is_file()
        ):
            print("  would run: cleaning")
        if cleaning_selected and not args.skip_chunking and (
            args.refresh or not EMBED_INPUT.is_file()
        ):
            print("  would run: chunking export")
        print("  would push: local datasets")
        return 0

    failures = 0
    if (
        retrieval_selected
        and not args.skip_retrieval
        and not raw_state.remote
        and not (bucket.DATA_ROOT / "raw").is_dir()
    ):
        failures += python_step("retrieval", RETRIEVAL_MAIN, "collect-all", dry_run=False)
        if failures:
            return 1

    if cleaning_selected and not args.skip_cleaning and (
        args.refresh or not CLEANING_MARKER.is_file()
    ):
        failures += python_step("cleaning", CLEANING_MAIN, dry_run=False)
        if failures:
            return 1

    if cleaning_selected and not args.skip_chunking and (
        args.refresh or not EMBED_INPUT.is_file()
    ):
        code = bun_step("chunking", "export", dry_run=False)
        if code != 0:
            return code

    failures += push_local(
        client,
        transfer_config,
        config,
        datasets,
        workers=args.workers,
        force=False,
        dry_run=False,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
