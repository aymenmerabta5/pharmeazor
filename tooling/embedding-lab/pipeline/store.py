"""Write the embedding artifact atomically.

Layout (all paths relative to ``output.root``)::

    vectors.npy      float16/float32, shape (N, 1024), row i = chunks.jsonl row i
    chunks.jsonl     one metadata row per vector, optional text
    manifest.json    stable contract: model, input hash, counts, checksums
    run-report.json  diagnostic: full timings, batch sizes, effective config

``manifest.json`` is written last and is the commit marker. If a run dies
between replacing ``vectors.npy`` and replacing the manifest, a reader will see
a checksum mismatch and must not import the artifact.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from settings import Settings

from .chunks import ChunkSet, TokenStats, sha256_file
from .engine import RunStats
from .files import ensure_output_available
from .model import ModelBundle
from .validate import CHUNKS_NAME, MANIFEST_NAME, VECTORS_NAME

RUN_REPORT_NAME = "run-report.json"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _git_commit(cwd: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    commit = result.stdout.strip()
    return commit or None


def _write_json_atomic(path: Path, payload: Any) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    try:
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            try:
                temporary.unlink()
            except OSError:
                pass


def _write_chunks_atomic(
    path: Path,
    records: Any,
    *,
    bundle: ModelBundle,
    output_dtype: str,
    include_text: bool,
) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            for record in records:
                row: dict[str, Any] = {
                    "row": record.row,
                    "vector_index": record.row,
                    "chunk_id": record.chunk_id,
                    "artifact_id": record.artifact_id,
                    "section_code": record.section_code,
                    "language": record.language,
                    "context_key": record.context_key,
                    "text_sha256": record.text_sha256,
                    "input_line": record.line_number,
                    "embedding_model": bundle.repo_id,
                    "embedding_revision": bundle.revision,
                    "embedding_dim": bundle.dim,
                    "embedding_dtype": output_dtype,
                    "pooling": bundle.pooling,
                    "normalized": bundle.normalize,
                }
                if include_text:
                    row["text"] = record.text
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            try:
                temporary.unlink()
            except OSError:
                pass


def write_artifact(
    settings: Settings,
    chunk_set: ChunkSet,
    token_stats: TokenStats,
    vectors: np.ndarray,
    vector_report: dict[str, Any],
    bundle: ModelBundle,
    run_stats: RunStats,
    *,
    device_info: dict[str, Any],
    runtime_flags: dict[str, Any],
    warnings: list[str],
    profile_path: Path | None = None,
) -> dict[str, Any]:
    output_dir = settings.output.root
    ensure_output_available(output_dir, overwrite=settings.output.overwrite)
    output_dir.mkdir(parents=True, exist_ok=True)

    vectors_path = output_dir / VECTORS_NAME
    chunks_path = output_dir / CHUNKS_NAME
    manifest_path = output_dir / MANIFEST_NAME
    report_path = output_dir / RUN_REPORT_NAME

    temporary_vectors = output_dir / f".{VECTORS_NAME}.tmp.npy"
    try:
        np.save(temporary_vectors, vectors, allow_pickle=False)
        vectors_sha256 = sha256_file(temporary_vectors)
        vectors_bytes = temporary_vectors.stat().st_size
        os.replace(temporary_vectors, vectors_path)
    finally:
        if temporary_vectors.exists():
            try:
                temporary_vectors.unlink()
            except OSError:
                pass

    _write_chunks_atomic(
        chunks_path,
        chunk_set.records,
        bundle=bundle,
        output_dtype=settings.output.dtype,
        include_text=settings.output.include_text,
    )
    chunks_sha256 = sha256_file(chunks_path)
    chunks_bytes = chunks_path.stat().st_size

    run_id = uuid.uuid4().hex
    created_at = _utc_now()

    performance = run_stats.to_dict()
    # The manifest stays compact and stable; the full batch lists go to the
    # run report.
    performance.pop("batch_sizes", None)
    performance.pop("token_counts", None)

    manifest: dict[str, Any] = {
        "schema_version": 1,
        "lab": "embedding-lab",
        "run_id": run_id,
        "created_at": created_at,
        "model": {
            **bundle.describe(),
            "output_dtype": settings.output.dtype,
            "max_length": settings.model.max_length,
            "tokenizer": "BAAI/bge-m3 fast tokenizer",
            "trust_remote_code": settings.model.trust_remote_code,
        },
        "input": {
            **chunk_set.summary(),
            "tokens": token_stats.summary(),
        },
        "output": {
            "root": str(output_dir),
            "vectors": VECTORS_NAME,
            "chunks": CHUNKS_NAME,
            "rows": int(vectors.shape[0]),
            "dim": int(vectors.shape[1]),
            "dtype": settings.output.dtype,
            "include_text": settings.output.include_text,
            "vectors_bytes": vectors_bytes,
            "chunks_bytes": chunks_bytes,
            "vectors_sha256": vectors_sha256,
            "chunks_sha256": chunks_sha256,
        },
        # `validate_output` reads this block. Keep it a stable top-level
        # contract instead of reaching into `output`, so a future layout
        # change cannot silently disable checksum verification.
        "checksums": {
            "vectors_sha256": vectors_sha256,
            "chunks_sha256": chunks_sha256,
        },
        "runtime": {
            "device": device_info,
            "settings": settings.public_dict()["runtime"],
            "flags": runtime_flags,
        },
        "performance": performance,
        "validation": vector_report,
        "warnings": list(warnings),
        "provenance": {
            "git_commit": _git_commit(settings.lab_root),
            "config_path": str(settings.config_path),
            "host": platform.node(),
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
    }
    if profile_path is not None:
        manifest["provenance"]["profile_trace"] = str(profile_path)

    report: dict[str, Any] = {
        "run_id": run_id,
        "created_at": created_at,
        "manifest": str(manifest_path),
        "settings": settings.public_dict(),
        "device": device_info,
        "runtime_flags": runtime_flags,
        "input": chunk_set.summary(),
        "tokens": token_stats.summary(),
        "truncated": list(token_stats.truncated),
        "performance": run_stats.to_dict(),
        "validation": vector_report,
        "warnings": list(warnings),
        "profile_trace": str(profile_path) if profile_path is not None else None,
    }

    # Manifest last: it is the commit marker for the artifact.
    _write_json_atomic(report_path, report)
    _write_json_atomic(manifest_path, manifest)
    return manifest
