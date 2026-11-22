"""Compare eager and compiled inference on this exact GPU.

The benchmark is deliberately separate from the artifact run:

* it samples the corpus across the length distribution, not just the first N
  chunks (which would over-represent whichever medicine sorts first),
* it warms up compiled kernels before timing,
* it records a failed compiler backend as a result instead of aborting the
  comparison,
* it writes ``output/benchmark.json`` and leaves ``output/embeddings`` alone.

The winner is the highest measured rows/second among successful modes. A
compiled mode that silently fell back to eager is labelled as such and is not
presented as a speedup.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import torch

from settings import Settings

from .chunks import ChunkRecord, plan_batches
from .engine import EmbeddingEngine
from .model import ModelBundle, compile_bundle

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BenchmarkMode:
    name: str
    mode: str
    backend: str


def parse_modes(values: Sequence[str], *, include_eager: bool) -> list[BenchmarkMode]:
    modes: list[BenchmarkMode] = []
    seen: set[str] = set()

    def add(item: BenchmarkMode) -> None:
        if item.name not in seen:
            seen.add(item.name)
            modes.append(item)

    if include_eager:
        add(BenchmarkMode(name="eager", mode="eager", backend="eager"))

    for raw in values:
        name = raw.strip()
        if not name:
            continue
        if name == "eager":
            add(BenchmarkMode(name="eager", mode="eager", backend="eager"))
        elif name in {"default", "reduce-overhead", "max-autotune", "max-autotune-no-cudagraphs"}:
            add(BenchmarkMode(name=name, mode=name, backend="inductor"))
        elif name in {"cudagraphs", "aot_eager"}:
            add(BenchmarkMode(name=name, mode="default", backend=name))
        else:
            raise ValueError(
                f"unknown benchmark mode: {name}. Use eager, default, "
                "reduce-overhead, max-autotune, max-autotune-no-cudagraphs, "
                "cudagraphs, or aot_eager."
            )
    if not modes:
        add(BenchmarkMode(name="eager", mode="eager", backend="eager"))
    return modes


def sample_corpus(
    records: Sequence[ChunkRecord],
    token_ids: Sequence[Sequence[int]],
    sample_rows: int,
) -> tuple[list[ChunkRecord], list[list[int]]]:
    """Select a length-stratified sample across the whole corpus."""
    total = len(records)
    if sample_rows >= total:
        return list(records), [list(ids) for ids in token_ids]

    order = sorted(range(total), key=lambda index: len(token_ids[index]))
    positions = np.linspace(0, total - 1, num=sample_rows, dtype=int)
    selected = [order[int(position)] for position in positions]
    # Deduplicate while preserving the sorted-by-length selection order.
    selected = list(dict.fromkeys(selected))

    return (
        [records[index] for index in selected],
        [list(token_ids[index]) for index in selected],
    )


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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


def run_benchmark(
    settings: Settings,
    *,
    records: Sequence[ChunkRecord],
    token_ids: Sequence[Sequence[int]],
    bundle: ModelBundle,
    device_info: dict[str, Any],
    runtime_flags: dict[str, Any],
    modes: Sequence[BenchmarkMode],
    sample_rows: int,
    warmup_batches: int,
    measure_batches: int,
) -> dict[str, Any]:
    sample_records, sample_tokens = sample_corpus(records, token_ids, sample_rows)
    sample_plans = plan_batches(
        sample_tokens,
        batch_size=settings.runtime.batch_size,
        max_batch_tokens=settings.runtime.max_batch_tokens,
        pad_multiple=settings.runtime.pad_multiple,
        max_length=settings.model.max_length,
        length_grouped=settings.runtime.length_grouped,
    )
    if not sample_plans:
        raise ValueError("benchmark sample produced no batches")

    results: list[dict[str, Any]] = []
    for item in modes:
        logger.info("benchmarking mode=%s backend=%s", item.name, item.backend)
        started = time.perf_counter()
        mode_bundle = bundle
        compile_error = None
        if item.backend != "eager":
            mode_bundle = compile_bundle(
                bundle,
                mode=item.mode,
                backend=item.backend,
                dynamic=settings.runtime.compile_dynamic,
            )
            compile_error = mode_bundle.compile_error

        engine = EmbeddingEngine(
            settings, mode_bundle, output_dtype=settings.output.dtype
        )
        try:
            stats = engine.measure(
                sample_records,
                sample_tokens,
                sample_plans,
                warmup_batches=warmup_batches,
                measure_batches=measure_batches,
            )
            status = "ok"
            error = None
        except Exception as exc:  # noqa: BLE001 - a failed mode is a result
            logger.warning("benchmark mode %s failed: %s", item.name, exc)
            status = "failed"
            error = f"{type(exc).__name__}: {exc}"
            stats = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

        fallback = mode_bundle.fallback_reason
        results.append(
            {
                "mode": item.name,
                "backend": item.backend,
                "status": status,
                "compiled": mode_bundle.compiled,
                "compile_error": compile_error,
                "compile_fallback": fallback,
                "wall_seconds": round(time.perf_counter() - started, 4),
                "error": error,
                "stats": stats.to_dict() if stats is not None else None,
            }
        )

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    successful = [
        result
        for result in results
        if result["status"] == "ok"
        and result["stats"] is not None
        and result["stats"]["rows_per_second"] > 0
    ]
    winner = (
        max(successful, key=lambda result: result["stats"]["rows_per_second"])
        if successful
        else None
    )

    notes: list[str] = []
    if warmup_batches == 0:
        notes.append(
            "warmup_batches=0: a compiled mode's first-batch compilation cost "
            "is included in its measured throughput."
        )
    if any(result["compile_fallback"] for result in results):
        notes.append(
            "At least one compiled mode fell back to eager at runtime; see "
            "compile_fallback in its result."
        )
    if any(result["compile_error"] for result in results):
        notes.append(
            "At least one compiler backend was unavailable; see compile_error."
        )
    if winner is not None and not winner["compiled"] and winner["mode"] != "eager":
        notes.append(
            f"The fastest mode ({winner['mode']}) did not stay compiled; its "
            "throughput is eager throughput."
        )

    measured = successful[0]["stats"] if successful else None

    report: dict[str, Any] = {
        "schema_version": 1,
        "lab": "embedding-lab",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sample": {
            "rows": len(sample_records),
            "corpus_rows": len(records),
            "selection": "length-stratified",
            "measurement": "median-centered window",
            "batches": len(sample_plans),
            "tokens": sum(plan.token_count for plan in sample_plans),
            "padded_tokens": sum(plan.padded_tokens for plan in sample_plans),
        },
        "measured": (
            {
                "rows": measured["rows"],
                "batches": measured["batches"],
                "tokens": measured["tokens"],
                "padded_tokens": measured["padded_tokens"],
                "warmup_batches": measured["warmup_batches"],
            }
            if measured is not None
            else None
        ),
        "device": device_info,
        "runtime_flags": runtime_flags,
        "settings": settings.public_dict(),
        "results": results,
        "winner": (
            {
                "mode": winner["mode"],
                "backend": winner["backend"],
                "rows_per_second": winner["stats"]["rows_per_second"],
                "tokens_per_second": winner["stats"]["tokens_per_second"],
                "compiled": winner["compiled"],
            }
            if winner is not None
            else None
        ),
        "notes": notes,
    }
    return report


def write_benchmark_report(settings: Settings, report: dict[str, Any]) -> Path:
    path = settings.output.root.parent / "benchmark.json"
    _write_json(path, report)
    return path


def format_table(report: dict[str, Any]) -> str:
    lines = [
        "mode                         status   rows/s    tok/s    peak MB  compiled",
        "---------------------------  -------  --------  -------  -------  --------",
    ]
    for result in report.get("results", []):
        stats = result.get("stats") or {}
        lines.append(
            f"{result['mode'][:27]:<27}  {result['status']:<7}  "
            f"{stats.get('rows_per_second', 0):>8.2f}  "
            f"{stats.get('tokens_per_second', 0):>7.1f}  "
            f"{stats.get('peak_memory_mb', 0):>7.1f}  "
            f"{str(result.get('compiled', False)):<8}"
        )
    winner = report.get("winner")
    if winner:
        lines.append(
            f"\nwinner: {winner['mode']} "
            f"({winner['rows_per_second']:.2f} rows/s, "
            f"{winner['tokens_per_second']:.1f} tokens/s)"
        )
    return "\n".join(lines)
