"""Batched BGE-M3 inference.

The engine owns the GPU loop, not the model or the file format. It:

* moves pinned batches to the device with non-blocking copies,
* runs the compiled/eager model under ``torch.inference_mode()``,
* splits a batch and retries on CUDA OOM instead of aborting a long run,
* writes each batch into a preallocated output array in the original row order,
* reports both wall-clock throughput and steady-state throughput so the
  one-time ``torch.compile`` cost is visible rather than hidden.

A separate ``measure`` path is used by the benchmark: it warms up compiled
kernels, then times a contiguous block of batches with one GPU synchronization.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import torch
from tqdm.auto import tqdm

from settings import Settings

from .chunks import BatchPlan, ChunkRecord, iter_prepared_batches
from .model import ModelBundle, ModelError, embed_batch

logger = logging.getLogger(__name__)

OUTPUT_DTYPES: dict[str, torch.dtype] = {
    "float16": torch.float16,
    "float32": torch.float32,
}


@dataclass
class RunStats:
    rows: int
    batches: int
    tokens: int
    padded_tokens: int
    elapsed_seconds: float
    rows_per_second: float
    tokens_per_second: float
    steady_state_rows_per_second: float
    first_batch_seconds: float | None
    peak_memory_mb: float
    oom_splits: int
    max_batch_size: int
    avg_batch_size: float
    max_tokens_per_batch: int
    avg_tokens_per_batch: float
    batch_sizes: list[int] = field(default_factory=list)
    token_counts: list[int] = field(default_factory=list)
    compile_fallback: str | None = None
    warmup_batches: int = 0
    measure_batches: int = 0
    warmup_seconds: float | None = None

    @property
    def padding_efficiency(self) -> float:
        return self.tokens / self.padded_tokens if self.padded_tokens else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "rows": self.rows,
            "batches": self.batches,
            "tokens": self.tokens,
            "padded_tokens": self.padded_tokens,
            "padding_efficiency": round(self.padding_efficiency, 4),
            "elapsed_seconds": round(self.elapsed_seconds, 4),
            "rows_per_second": round(self.rows_per_second, 2),
            "tokens_per_second": round(self.tokens_per_second, 2),
            "steady_state_rows_per_second": round(
                self.steady_state_rows_per_second, 2
            ),
            "first_batch_seconds": (
                round(self.first_batch_seconds, 4)
                if self.first_batch_seconds is not None
                else None
            ),
            "peak_memory_mb": round(self.peak_memory_mb, 1),
            "oom_splits": self.oom_splits,
            "max_batch_size": self.max_batch_size,
            "avg_batch_size": round(self.avg_batch_size, 2),
            "max_tokens_per_batch": self.max_tokens_per_batch,
            "avg_tokens_per_batch": round(self.avg_tokens_per_batch, 2),
            "batch_sizes": self.batch_sizes,
            "token_counts": self.token_counts,
            "compile_fallback": self.compile_fallback,
            "warmup_batches": self.warmup_batches,
            "measure_batches": self.measure_batches,
            "warmup_seconds": (
                round(self.warmup_seconds, 4)
                if self.warmup_seconds is not None
                else None
            ),
        }


class EmbeddingEngine:
    def __init__(
        self,
        settings: Settings,
        bundle: ModelBundle,
        *,
        output_dtype: str | None = None,
    ) -> None:
        self.settings = settings
        self.bundle = bundle
        self.output_dtype = output_dtype or settings.output.dtype
        if self.output_dtype not in OUTPUT_DTYPES:
            raise ValueError(f"unsupported output dtype: {self.output_dtype}")
        self.output_dtype_torch = OUTPUT_DTYPES[self.output_dtype]
        self.oom_splits = 0

    # ------------------------------------------------------------------
    # Forward with OOM splitting
    # ------------------------------------------------------------------

    def _forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        rows: Sequence[int],
    ) -> torch.Tensor:
        try:
            return embed_batch(self.bundle, input_ids, attention_mask)
        except torch.cuda.OutOfMemoryError as exc:
            if not self.settings.runtime.oom_retry:
                raise
            if len(rows) <= 1:
                chunk_id = "unknown"
                if rows:
                    chunk_id = self._records[rows[0]].chunk_id
                raise ModelError(
                    "CUDA out of memory on a single chunk "
                    f"({chunk_id}). Lower model.max_length, use "
                    "model.dtype=float16, or reduce runtime.max_batch_tokens."
                ) from exc
            torch.cuda.empty_cache()
            self.oom_splits += 1
            midpoint = len(rows) // 2
            logger.warning(
                "CUDA OOM on a batch of %d; retrying as %d + %d",
                len(rows),
                midpoint,
                len(rows) - midpoint,
            )
            left = self._forward(
                input_ids[:midpoint], attention_mask[:midpoint], rows[:midpoint]
            )
            right = self._forward(
                input_ids[midpoint:], attention_mask[midpoint:], rows[midpoint:]
            )
            return torch.cat((left, right), dim=0)

    # ------------------------------------------------------------------
    # Full run
    # ------------------------------------------------------------------

    def run(
        self,
        records: Sequence[ChunkRecord],
        token_ids: Sequence[Sequence[int]],
        plans: Sequence[BatchPlan],
        *,
        collect: bool = True,
        profile_path: Path | None = None,
    ) -> tuple[np.ndarray | None, RunStats]:
        if not plans:
            raise ValueError("no batches to run")

        self._records = records
        self.oom_splits = 0
        device = self.bundle.device
        vectors: np.ndarray | None = None
        if collect:
            vectors = np.empty(
                (len(records), self.bundle.dim), dtype=self.output_dtype
            )

        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)

        profiler = None
        if profile_path is not None:
            profile_path.parent.mkdir(parents=True, exist_ok=True)
            profiler = torch.profiler.profile(
                activities=[
                    torch.profiler.ProfilerActivity.CPU,
                    torch.profiler.ProfilerActivity.CUDA,
                ],
                record_shapes=False,
            )
            profiler.__enter__()

        batch_times: list[float] = []
        processed_rows = 0
        processed_tokens = 0
        padded_tokens = 0
        progress = tqdm(
            total=len(records),
            unit="chunk",
            desc="embedding",
            disable=not self.settings.runtime.progress,
            dynamic_ncols=True,
        )

        started = time.perf_counter()
        try:
            with torch.inference_mode():
                for plan, (input_ids, attention_mask) in iter_prepared_batches(
                    self.bundle.tokenizer,
                    token_ids,
                    plans,
                    pin_memory=self.settings.runtime.pin_memory
                    and device.type == "cuda",
                    max_prefetch=self.settings.runtime.prefetch_batches,
                ):
                    batch_started = time.perf_counter()
                    input_ids = input_ids.to(device, non_blocking=True)
                    attention_mask = attention_mask.to(device, non_blocking=True)

                    batch_vectors = self._forward(
                        input_ids, attention_mask, plan.rows
                    )

                    if vectors is not None:
                        cpu_vectors = batch_vectors.to(
                            "cpu", dtype=self.output_dtype_torch
                        ).numpy()
                        vectors[list(plan.rows)] = cpu_vectors

                    batch_times.append(time.perf_counter() - batch_started)
                    processed_rows += len(plan.rows)
                    processed_tokens += plan.token_count
                    padded_tokens += plan.padded_tokens
                    progress.update(len(plan.rows))
        finally:
            progress.close()
            if profiler is not None:
                profiler.__exit__(None, None, None)
                profiler.export_chrome_trace(str(profile_path))
                logger.info("wrote profiler trace to %s", profile_path)

        elapsed = time.perf_counter() - started
        if device.type == "cuda":
            torch.cuda.synchronize(device)
            peak_memory_mb = torch.cuda.max_memory_allocated(device) / (1024**2)
        else:
            peak_memory_mb = 0.0

        first_batch = batch_times[0] if batch_times else None
        steady_rows = processed_rows - (len(plans[0].rows) if plans else 0)
        steady_seconds = sum(batch_times[1:]) if len(batch_times) > 1 else 0.0
        steady_rps = (
            steady_rows / steady_seconds if steady_seconds > 0 else 0.0
        )

        batch_sizes = [len(plan.rows) for plan in plans]
        token_counts = [plan.token_count for plan in plans]
        stats = RunStats(
            rows=processed_rows,
            batches=len(plans),
            tokens=processed_tokens,
            padded_tokens=padded_tokens,
            elapsed_seconds=elapsed,
            rows_per_second=processed_rows / elapsed if elapsed else 0.0,
            tokens_per_second=processed_tokens / elapsed if elapsed else 0.0,
            steady_state_rows_per_second=steady_rps,
            first_batch_seconds=first_batch,
            peak_memory_mb=peak_memory_mb,
            oom_splits=self.oom_splits,
            max_batch_size=max(batch_sizes) if batch_sizes else 0,
            avg_batch_size=(
                sum(batch_sizes) / len(batch_sizes) if batch_sizes else 0.0
            ),
            max_tokens_per_batch=max(token_counts) if token_counts else 0,
            avg_tokens_per_batch=(
                sum(token_counts) / len(token_counts) if token_counts else 0.0
            ),
            batch_sizes=batch_sizes,
            token_counts=token_counts,
            compile_fallback=self.bundle.fallback_reason,
        )
        return vectors, stats

    # ------------------------------------------------------------------
    # Benchmark path
    # ------------------------------------------------------------------

    def measure(
        self,
        records: Sequence[ChunkRecord],
        token_ids: Sequence[Sequence[int]],
        plans: Sequence[BatchPlan],
        *,
        warmup_batches: int,
        measure_batches: int,
    ) -> RunStats:
        """Warm up compiled kernels, then time a contiguous block of batches."""
        if not plans:
            raise ValueError("no batches to measure")

        self._records = records
        self.oom_splits = 0
        device = self.bundle.device
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)

        # Plans are sorted longest-first. Measuring the first N plans after
        # warmup would report the slowest corner of the corpus, not the corpus.
        # Center the measured window on the median-length batch and warm up on
        # the immediately preceding plans, so compiled kernels are hot for the
        # shapes that are actually timed.
        measure_count = min(measure_batches, len(plans))
        start = max(0, (len(plans) - measure_count) // 2)
        measured = list(plans[start : start + measure_count])
        warmup_start = max(0, start - warmup_batches)
        warmup_plans = list(plans[warmup_start:start])
        if not warmup_plans and start + measure_count < len(plans):
            warmup_plans = list(
                plans[start + measure_count : start + measure_count + warmup_batches]
            )
        warmup = len(warmup_plans)

        warmup_started = time.perf_counter()
        with torch.inference_mode():
            for plan, (input_ids, attention_mask) in iter_prepared_batches(
                self.bundle.tokenizer,
                token_ids,
                warmup_plans,
                pin_memory=self.settings.runtime.pin_memory
                and device.type == "cuda",
                max_prefetch=self.settings.runtime.prefetch_batches,
            ):
                input_ids = input_ids.to(device, non_blocking=True)
                attention_mask = attention_mask.to(device, non_blocking=True)
                self._forward(input_ids, attention_mask, plan.rows)
        if device.type == "cuda":
            torch.cuda.synchronize(device)
        warmup_seconds = time.perf_counter() - warmup_started

        rows = sum(len(plan.rows) for plan in measured)
        tokens = sum(plan.token_count for plan in measured)
        padded_tokens = sum(plan.padded_tokens for plan in measured)

        if device.type == "cuda":
            torch.cuda.synchronize(device)
        started = time.perf_counter()
        with torch.inference_mode():
            for plan, (input_ids, attention_mask) in iter_prepared_batches(
                self.bundle.tokenizer,
                token_ids,
                measured,
                pin_memory=self.settings.runtime.pin_memory
                and device.type == "cuda",
                max_prefetch=self.settings.runtime.prefetch_batches,
            ):
                input_ids = input_ids.to(device, non_blocking=True)
                attention_mask = attention_mask.to(device, non_blocking=True)
                self._forward(input_ids, attention_mask, plan.rows)
        if device.type == "cuda":
            torch.cuda.synchronize(device)
        elapsed = time.perf_counter() - started

        peak_memory_mb = (
            torch.cuda.max_memory_allocated(device) / (1024**2)
            if device.type == "cuda"
            else 0.0
        )
        batch_sizes = [len(plan.rows) for plan in measured]
        token_counts = [plan.token_count for plan in measured]

        return RunStats(
            rows=rows,
            batches=len(measured),
            tokens=tokens,
            padded_tokens=padded_tokens,
            elapsed_seconds=elapsed,
            rows_per_second=rows / elapsed if elapsed else 0.0,
            tokens_per_second=tokens / elapsed if elapsed else 0.0,
            steady_state_rows_per_second=rows / elapsed if elapsed else 0.0,
            first_batch_seconds=None,
            peak_memory_mb=peak_memory_mb,
            oom_splits=self.oom_splits,
            max_batch_size=max(batch_sizes) if batch_sizes else 0,
            avg_batch_size=(
                sum(batch_sizes) / len(batch_sizes) if batch_sizes else 0.0
            ),
            max_tokens_per_batch=max(token_counts) if token_counts else 0,
            avg_tokens_per_batch=(
                sum(token_counts) / len(token_counts) if token_counts else 0.0
            ),
            batch_sizes=batch_sizes,
            token_counts=token_counts,
            compile_fallback=self.bundle.fallback_reason,
            warmup_batches=warmup,
            measure_batches=len(measured),
            warmup_seconds=warmup_seconds,
        )
