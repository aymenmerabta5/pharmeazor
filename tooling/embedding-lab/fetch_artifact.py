#!/usr/bin/env python3
"""Fetch and validate the BGE-M3 embedding artifact from Cloudflare R2.

The ``embedding-output`` dataset is the only supported source. The script
refuses to treat a local directory as the source when the bucket tree is
missing or partial: a stale checkout must not be imported silently. Use
``--validate-only`` when an offline artifact is explicitly intended.

The artifact contract is owned by ``pipeline/validate.py``: manifest checksums,
row alignment, chunk ids, text hashes, model identity and vector norms are all
checked before the TypeScript importer is allowed to touch PostgreSQL.

Examples::

    python tooling/embedding-lab/fetch_artifact.py --json
    python tooling/embedding-lab/fetch_artifact.py --validate-only --json
    python tooling/embedding-lab/fetch_artifact.py --prefix embedding-lab-test --dest /tmp/out
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

LAB_ROOT = Path(__file__).resolve().parent
REPO_ROOT = LAB_ROOT.parents[1]
TOOL_ROOT = LAB_ROOT.parent
if str(TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOL_ROOT))
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))


def _ensure_validation_dependencies() -> None:
    """Re-exec inside a project virtualenv when PyYAML is missing.

    ``pipeline.validate`` imports the settings module, which reads YAML. The
    system interpreter does not always carry the embedding-lab requirements,
    so prefer the checkout's virtualenv instead of failing after the download.
    """
    try:
        import yaml  # noqa: F401
    except ModuleNotFoundError:
        for candidate in (
            LAB_ROOT / ".venv" / "Scripts" / "python.exe",
            LAB_ROOT / ".venv" / "bin" / "python",
            REPO_ROOT / "tooling" / "cleaning-lab" / ".venv" / "Scripts" / "python.exe",
            REPO_ROOT / "tooling" / "cleaning-lab" / ".venv" / "bin" / "python",
        ):
            if candidate.is_file() and Path(sys.executable).resolve() != candidate.resolve():
                os.execv(str(candidate), [str(candidate), *sys.argv])
        raise SystemExit(
            "PyYAML is missing; install tooling/embedding-lab/requirements.txt "
            "or run the script with a project virtualenv"
        )


_ensure_validation_dependencies()

from pipeline.validate import ValidationError, validate_output  # noqa: E402
from storage_lab.config import ConfigError, parse_env_file, resolve_config  # noqa: E402
from storage_lab.keys import DATASETS_BY_NAME, normalize_prefix  # noqa: E402
from storage_lab.mirror import dataset_state, pull_dataset  # noqa: E402
from storage_lab.transfer import describe_error, make_client, verify_bucket  # noqa: E402

DATASET_NAME = "embedding-output"
ARTIFACT_SUBDIR = "embeddings"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Pull the embedding-output dataset from R2 and validate the "
            "BGE-M3 artifact before import."
        )
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=REPO_ROOT / ".env.local",
        help="environment file read by the shared storage module",
    )
    parser.add_argument(
        "--dest",
        type=Path,
        help=f"dataset root (default: tooling/embedding-lab/output)",
    )
    parser.add_argument(
        "--artifact",
        type=Path,
        help=f"artifact directory (default: <dest>/{ARTIFACT_SUBDIR})",
    )
    parser.add_argument(
        "--prefix",
        help="override the canonical R2 prefix (used by pipeline tests)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="parallel downloads (default: 4)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-download objects even when size and SHA-256 already match",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="skip R2 entirely and validate the local artifact",
    )
    parser.add_argument("--json", action="store_true", help="print one JSON object")
    return parser


def _fail(message: str, code: int = 1) -> int:
    print(f"error: {message}", file=sys.stderr)
    return code


def _summarize_transfer(results: list[Any]) -> dict[str, int]:
    summary = {"downloaded": 0, "skipped": 0, "failed": 0}
    for result in results:
        if result.status in summary:
            summary[result.status] += 1
    return summary


def _summary(
    *,
    mode: str,
    dataset_name: str,
    bucket: str | None,
    remote_prefix: str | None,
    destination: Path,
    artifact_dir: Path,
    transfer: dict[str, int],
    report: dict[str, Any],
) -> dict[str, Any]:
    manifest = report["manifest"]
    model = manifest.get("model", {})
    checksums = manifest.get("checksums", {})
    return {
        "ok": True,
        "mode": mode,
        "dataset": dataset_name,
        "bucket": bucket,
        "remote_prefix": remote_prefix,
        "destination": str(destination),
        "artifact": str(artifact_dir),
        "transfer": transfer,
        "validation": {
            "rows": report["chunks"]["rows"],
            "unique_chunk_ids": report["chunks"]["unique_chunk_ids"],
            "dim": report["vectors"]["dim"],
            "dtype": report["vectors"]["dtype"],
            "model": model.get("repo_id"),
            "revision": model.get("revision"),
            "vectors_sha256": checksums.get("vectors_sha256"),
            "chunks_sha256": checksums.get("chunks_sha256"),
            "warnings": report["warnings"],
        },
    }


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.workers < 1:
        return _fail("--workers must be at least 1", 2)

    dataset = DATASETS_BY_NAME[DATASET_NAME]
    destination = (args.dest or dataset.local_root).expanduser().resolve()
    artifact_dir = (
        args.artifact.expanduser().resolve()
        if args.artifact is not None
        else destination / ARTIFACT_SUBDIR
    )
    if args.validate_only and args.prefix:
        return _fail("--prefix cannot be combined with --validate-only", 2)

    bucket: str | None = None
    remote_prefix: str | None = None
    transfer = {"downloaded": 0, "skipped": 0, "failed": 0}

    if not args.validate_only:
        try:
            assignments = parse_env_file(args.env_file)
            config = resolve_config(assignments)
            if args.prefix:
                dataset = replace(dataset, prefix=normalize_prefix(args.prefix))
            client, _ = make_client(config, workers=args.workers)
            verify_bucket(client, config)
            state = dataset_state(client, config, dataset)
            bucket = config.bucket
            remote_prefix = state.remote_prefix
            if not state.complete:
                return _fail(
                    f"dataset '{dataset.name}' is not complete in R2 "
                    f"(state={state.state}, prefix={state.remote_prefix or dataset.prefix}/); "
                    f"upload {dataset.marker or 'the artifact marker'} with "
                    f"`python tooling/bucket_operations.py push --group embedding` "
                    f"before importing"
                )
            _, results = pull_dataset(
                client,
                config,
                dataset,
                dest_root=destination,
                workers=args.workers,
                skip_existing=not args.force,
                quiet=args.json,
            )
            transfer = _summarize_transfer(results)
            if transfer["failed"]:
                failures = [result for result in results if result.status == "failed"]
                detail = "; ".join(
                    f"{result.key}: {result.error or 'failed'}" for result in failures[:3]
                )
                return _fail(f"{len(failures)} download(s) failed ({detail})")
        except ConfigError as error:
            return _fail(str(error), 2)
        except Exception as error:  # noqa: BLE001 - translated at the CLI boundary
            return _fail(describe_error(error, config) if "config" in locals() else str(error))

    try:
        report = validate_output(artifact_dir)
    except ValidationError as error:
        return _fail(str(error))
    if not report["ok"]:
        return _fail("artifact validation failed: " + "; ".join(report["errors"]))

    summary = _summary(
        mode="validate-only" if args.validate_only else "pull",
        dataset_name=dataset.name,
        bucket=bucket,
        remote_prefix=remote_prefix,
        destination=destination,
        artifact_dir=artifact_dir,
        transfer=transfer,
        report=report,
    )
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        validation = summary["validation"]
        print(
            f"artifact: {validation['model']}@{validation['revision']} "
            f"rows={validation['rows']} dim={validation['dim']} dtype={validation['dtype']}"
        )
        print(
            f"transfer: downloaded={transfer['downloaded']} "
            f"skipped={transfer['skipped']} failed={transfer['failed']}"
        )
        print(f"path:     {artifact_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
