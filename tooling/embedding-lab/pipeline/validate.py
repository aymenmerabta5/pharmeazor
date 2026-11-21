"""Validation for the embedding artifact.

Two levels:

* ``validate_vectors`` checks the in-memory array before it is written, so a
  NaN, a zero row, or a broken normalization stops the run before it replaces
  a good artifact.
* ``validate_output`` re-reads the committed artifact and checks the manifest,
  row alignment, text hashes and checksums. ``run.py validate`` uses it as the
  post-run gate.

This module imports numpy only; it stays usable when CUDA is unavailable.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

from .chunks import sha256_file

VECTORS_NAME = "vectors.npy"
CHUNKS_NAME = "chunks.jsonl"
MANIFEST_NAME = "manifest.json"
NORM_TOLERANCE = {"float16": 0.02, "float32": 1e-4}


class ValidationError(ValueError):
    """Raised when an artifact is structurally invalid."""


def validate_vectors(
    vectors: np.ndarray,
    *,
    expected_dim: int,
    expected_rows: int | None = None,
    normalized: bool = True,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    if vectors.ndim != 2:
        raise ValidationError(f"vectors must be 2-D, got shape {vectors.shape}")
    if vectors.shape[1] != expected_dim:
        errors.append(
            f"vector dimension is {vectors.shape[1]}, expected {expected_dim}"
        )
    if expected_rows is not None and vectors.shape[0] != expected_rows:
        errors.append(
            f"vector row count is {vectors.shape[0]}, expected {expected_rows}"
        )
    if vectors.dtype.kind != "f":
        errors.append(f"vector dtype is {vectors.dtype}, expected a float type")
    if not np.isfinite(vectors).all():
        errors.append("vectors contain NaN or infinite values")

    if vectors.shape[0] and vectors.shape[1]:
        # Norm in float32: float16 norms can lose enough precision to trip a
        # tight tolerance even when the float32 normalization was exact.
        float_vectors = vectors.astype(np.float32, copy=False)
        norms = np.linalg.norm(float_vectors, axis=1)
        zero_rows = np.flatnonzero(norms == 0.0)
        if zero_rows.size:
            errors.append(
                f"{zero_rows.size} zero vector row(s), first at row "
                f"{int(zero_rows[0])}"
            )
        norm_min = float(norms.min())
        norm_max = float(norms.max())
        norm_mean = float(norms.mean())
        norm_std = float(norms.std())
        if normalized:
            tolerance = NORM_TOLERANCE.get(str(vectors.dtype), 0.02)
            off = np.abs(norms - 1.0)
            bad = np.flatnonzero(off > tolerance)
            if bad.size:
                errors.append(
                    f"{bad.size} row(s) are not L2-normalized within "
                    f"{tolerance}, first at row {int(bad[0])} "
                    f"(norm={float(norms[bad[0]]):.6f})"
                )
        if not np.isfinite(norms).all():
            errors.append("vector norms contain NaN or infinite values")
    else:
        norm_min = norm_max = norm_mean = norm_std = 0.0
        warnings.append("empty vector array")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "rows": int(vectors.shape[0]),
        "dim": int(vectors.shape[1]) if vectors.ndim == 2 else 0,
        "dtype": str(vectors.dtype),
        "norm_min": norm_min,
        "norm_max": norm_max,
        "norm_mean": norm_mean,
        "norm_std": norm_std,
        "normalized": normalized,
    }


def _load_manifest(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValidationError(f"cannot read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValidationError(f"{path} must contain a JSON object")
    return payload


def _load_chunks(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValidationError(
                        f"{path}:{line_number}: invalid JSON: {exc}"
                    ) from exc
                if not isinstance(payload, dict):
                    raise ValidationError(
                        f"{path}:{line_number}: expected a JSON object"
                    )
                rows.append(payload)
    except OSError as exc:
        raise ValidationError(f"cannot read {path}: {exc}") from exc
    return rows


def validate_output(output_dir: Path | str) -> dict[str, Any]:
    root = Path(output_dir).expanduser()
    if not root.is_absolute():
        root = (Path.cwd() / root).resolve()

    manifest_path = root / MANIFEST_NAME
    vectors_path = root / VECTORS_NAME
    chunks_path = root / CHUNKS_NAME

    missing = [
        str(path)
        for path in (manifest_path, vectors_path, chunks_path)
        if not path.is_file()
    ]
    if missing:
        raise ValidationError("missing artifact file(s): " + ", ".join(missing))

    manifest = _load_manifest(manifest_path)
    chunks = _load_chunks(chunks_path)
    vectors = np.load(vectors_path, mmap_mode="r", allow_pickle=False)

    errors: list[str] = []
    warnings: list[str] = []

    output = manifest.get("output", {})
    expected_rows = output.get("rows")
    expected_dim = output.get("dim")
    expected_dtype = output.get("dtype")

    if expected_rows != len(chunks):
        errors.append(
            f"manifest says {expected_rows!r} rows, chunks.jsonl has {len(chunks)}"
        )
    if vectors.shape[0] != len(chunks):
        errors.append(
            f"vectors.npy has {vectors.shape[0]} rows, chunks.jsonl has "
            f"{len(chunks)}"
        )
    if expected_dim is not None and vectors.shape[1] != expected_dim:
        errors.append(
            f"vectors.npy dimension is {vectors.shape[1]}, manifest says "
            f"{expected_dim}"
        )
    if expected_dtype is not None and str(vectors.dtype) != expected_dtype:
        errors.append(
            f"vectors.npy dtype is {vectors.dtype}, manifest says {expected_dtype}"
        )

    model = manifest.get("model", {})
    model_id = model.get("repo_id")
    model_revision = model.get("revision")
    model_dim = model.get("dim")
    model_dtype = model.get("output_dtype")

    seen: set[str] = set()
    bad_rows: list[int] = []
    bad_hashes: list[str] = []
    bad_model_rows: list[int] = []
    for index, row in enumerate(chunks):
        if row.get("row") != index:
            bad_rows.append(index)
        chunk_id = row.get("chunk_id")
        if not isinstance(chunk_id, str) or not chunk_id:
            errors.append(f"chunks.jsonl row {index}: missing chunk_id")
            continue
        if chunk_id in seen:
            errors.append(f"chunks.jsonl row {index}: duplicate chunk_id {chunk_id}")
        seen.add(chunk_id)

        if row.get("embedding_model") != model_id:
            bad_model_rows.append(index)
        if row.get("embedding_revision") != model_revision:
            bad_model_rows.append(index)
        if row.get("embedding_dim") != model_dim:
            bad_model_rows.append(index)
        if row.get("embedding_dtype") != model_dtype:
            bad_model_rows.append(index)

        text = row.get("text")
        if isinstance(text, str) and row.get("text_sha256"):
            actual = hashlib.sha256(text.encode("utf-8")).hexdigest()
            if actual != row["text_sha256"]:
                bad_hashes.append(chunk_id)

    if bad_rows:
        errors.append(
            f"{len(bad_rows)} chunk row(s) have a non-sequential 'row' field, "
            f"first at {bad_rows[0]}"
        )
    if bad_model_rows:
        errors.append(
            f"{len(bad_model_rows)} chunk row(s) disagree with the manifest's "
            f"model identity, first at row {bad_model_rows[0]}"
        )
    if bad_hashes:
        errors.append(
            f"{len(bad_hashes)} chunk row(s) have a text_sha256 mismatch, first "
            f"at {bad_hashes[0]}"
        )

    vector_report = validate_vectors(
        vectors,
        expected_dim=int(expected_dim or vectors.shape[1]),
        expected_rows=len(chunks),
        normalized=bool(model.get("normalize", True)),
    )
    errors.extend(vector_report["errors"])
    warnings.extend(vector_report["warnings"])

    checksums = manifest.get("checksums", {})
    if checksums.get("vectors_sha256"):
        actual = sha256_file(vectors_path)
        if actual != checksums["vectors_sha256"]:
            errors.append("vectors.npy checksum does not match the manifest")
    else:
        warnings.append("manifest has no vectors checksum")
    if checksums.get("chunks_sha256"):
        actual = sha256_file(chunks_path)
        if actual != checksums["chunks_sha256"]:
            errors.append("chunks.jsonl checksum does not match the manifest")
    else:
        warnings.append("manifest has no chunks checksum")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "artifact": str(root),
        "manifest": manifest,
        "vectors": vector_report,
        "chunks": {
            "rows": len(chunks),
            "unique_chunk_ids": len(seen),
            "text_present": sum(1 for row in chunks if isinstance(row.get("text"), str)),
        },
    }
