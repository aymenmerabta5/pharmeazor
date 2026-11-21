#!/usr/bin/env python
"""Command line entry point for the offline BGE-M3 embedding lab.

Commands
--------
download   Fetch the pinned BGE-M3 snapshot into models/bge-m3.
embed      Read cleaning-lab's embed-input.jsonl and write the vector artifact.
benchmark  Compare eager and compiled inference on this GPU.
validate   Re-read the artifact and verify its manifest, hashes and norms.
info       Show the effective config, input stats and model presence.

Run ``python run.py <command> --help`` for the full option list. With no
arguments, ``embed`` is assumed.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import traceback
from dataclasses import replace
from pathlib import Path
from typing import Any

# These must be set before transformers/tokenizers are imported. `run.py`
# itself does not import torch, so `info` and `validate` stay fast.
os.environ.setdefault("TOKENIZERS_PARALLELISM", "true")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from settings import (  # noqa: E402
    COMPILE_BACKENDS,
    COMPILE_MODES,
    DEFAULT_CONFIG,
    MODEL_DTYPES,
    OUTPUT_DTYPES,
    TRUNCATION_MODES,
    ConfigError,
    Settings,
    load_settings,
    validate_settings,
)
from pipeline.chunks import (  # noqa: E402
    ChunkSet,
    InputError,
    encode_texts,
    plan_batches,
    read_chunks,
)
from pipeline.files import (  # noqa: E402
    ModelError,
    OutputExistsError,
    ensure_output_available,
    missing_model_files,
    read_download_metadata,
)
from pipeline.validate import ValidationError, validate_output  # noqa: E402

logger = logging.getLogger("embedding-lab")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _json_print(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _cli_path(value: str | Path) -> Path:
    return Path(value).expanduser().resolve()


def _load(args: argparse.Namespace) -> Settings:
    config = getattr(args, "config", None)
    settings = load_settings(config or DEFAULT_CONFIG)
    settings = _apply_overrides(settings, args)
    validate_settings(settings)
    return settings


def _apply_overrides(settings: Settings, args: argparse.Namespace) -> Settings:
    input_settings = settings.input
    if getattr(args, "input", None):
        input_settings = replace(input_settings, path=_cli_path(args.input))
    if getattr(args, "limit", None) is not None:
        if args.limit < 0:
            raise ConfigError("--limit must be >= 0")
        input_settings = replace(input_settings, max_rows=args.limit)
    if getattr(args, "on_duplicate", None):
        input_settings = replace(
            input_settings, duplicate_policy=args.on_duplicate
        )

    output_settings = settings.output
    if getattr(args, "output", None):
        output_settings = replace(output_settings, root=_cli_path(args.output))
    if getattr(args, "output_dtype", None):
        output_settings = replace(output_settings, dtype=args.output_dtype)
    if getattr(args, "no_text", False):
        output_settings = replace(output_settings, include_text=False)
    if getattr(args, "force", False):
        output_settings = replace(output_settings, overwrite=True)

    model_settings = settings.model
    if getattr(args, "model_dir", None):
        model_settings = replace(
            model_settings, local_dir=_cli_path(args.model_dir)
        )
    if getattr(args, "revision", None):
        model_settings = replace(model_settings, revision=args.revision)
    if getattr(args, "max_length", None) is not None:
        model_settings = replace(model_settings, max_length=args.max_length)
    if getattr(args, "truncation", None):
        model_settings = replace(model_settings, truncation=args.truncation)
    if getattr(args, "model_dtype", None):
        model_settings = replace(model_settings, dtype=args.model_dtype)
    if getattr(args, "attn", None):
        model_settings = replace(
            model_settings, attn_implementation=args.attn
        )
    if getattr(args, "workers", None) is not None:
        if args.workers < 1:
            raise ConfigError("--workers must be >= 1")
        model_settings = replace(model_settings, download_workers=args.workers)

    runtime_settings = settings.runtime
    if getattr(args, "device", None):
        runtime_settings = replace(runtime_settings, device=args.device)
    if getattr(args, "batch_size", None) is not None:
        runtime_settings = replace(
            runtime_settings, batch_size=args.batch_size
        )
    if getattr(args, "max_batch_tokens", None) is not None:
        runtime_settings = replace(
            runtime_settings, max_batch_tokens=args.max_batch_tokens
        )
    if getattr(args, "prefetch", None) is not None:
        runtime_settings = replace(
            runtime_settings, prefetch_batches=args.prefetch
        )
    if getattr(args, "pad_multiple", None) is not None:
        runtime_settings = replace(
            runtime_settings, pad_multiple=args.pad_multiple
        )
    if getattr(args, "compile", None) is not None:
        runtime_settings = replace(runtime_settings, compile=args.compile)
    if getattr(args, "compile_mode", None):
        runtime_settings = replace(
            runtime_settings, compile_mode=args.compile_mode
        )
    if getattr(args, "compile_backend", None):
        runtime_settings = replace(
            runtime_settings, compile_backend=args.compile_backend
        )
    if getattr(args, "compile_dynamic", None) is not None:
        runtime_settings = replace(
            runtime_settings, compile_dynamic=args.compile_dynamic
        )
    if getattr(args, "length_grouped", None) is not None:
        runtime_settings = replace(
            runtime_settings, length_grouped=args.length_grouped
        )
    if getattr(args, "quiet", False):
        runtime_settings = replace(runtime_settings, progress=False)

    return replace(
        settings,
        input=input_settings,
        output=output_settings,
        model=model_settings,
        runtime=runtime_settings,
    )


def _read_chunks(settings: Settings, args: argparse.Namespace) -> ChunkSet:
    return read_chunks(
        settings.input.path,
        duplicate_policy=settings.input.duplicate_policy,
        require_text_sha256=settings.input.require_text_sha256,
        max_rows=settings.input.max_rows,
        offset=getattr(args, "offset", 0) or 0,
    )


def _ensure_model(settings: Settings, *, offline: bool) -> dict[str, Any]:
    missing = missing_model_files(settings.model.local_dir)
    if not missing:
        return read_download_metadata(settings.model.local_dir)
    if offline:
        raise ModelError(
            f"model files missing from {settings.model.local_dir}: "
            f"{', '.join(missing)} (--offline was set, so no download was "
            "attempted). Run `python run.py download` first."
        )
    from pipeline.model import download_model

    metadata = download_model(settings)
    missing = missing_model_files(settings.model.local_dir)
    if missing:
        raise ModelError(
            f"model is still incomplete after download: {', '.join(missing)}"
        )
    return metadata


def _profile_path(settings: Settings, args: argparse.Namespace) -> Path | None:
    if not getattr(args, "profile", False):
        return None
    configured = getattr(args, "profile_path", None)
    if configured:
        return _cli_path(configured)
    return (settings.output.root.parent / "profile" / "trace.json").resolve()


def _collect_warnings(
    *,
    token_stats: Any,
    bundle: Any,
    stats: Any,
) -> list[str]:
    warnings: list[str] = []
    if token_stats.truncated:
        warnings.append(
            f"{len(token_stats.truncated)} chunk(s) were truncated to "
            f"model.max_length={token_stats.max_length}"
        )
    if bundle.compile_error:
        warnings.append(f"torch.compile unavailable: {bundle.compile_error}")
    if stats.compile_fallback:
        warnings.append(
            f"torch.compile fell back to eager at runtime: "
            f"{stats.compile_fallback}"
        )
    if stats.oom_splits:
        warnings.append(
            f"CUDA OOM required {stats.oom_splits} batch split(s); the run "
            "completed, but consider lowering runtime.max_batch_tokens."
        )
    return warnings


def _configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(levelname)s %(message)s",
        force=True,
    )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_info(args: argparse.Namespace) -> int:
    settings = _load(args)
    payload: dict[str, Any] = {
        "settings": settings.public_dict(),
        "input": None,
        "model": None,
        "device": None,
    }

    try:
        chunk_set = _read_chunks(settings, args)
        payload["input"] = chunk_set.summary()
    except (InputError, ConfigError) as exc:
        payload["input"] = {
            "path": str(settings.input.path),
            "error": str(exc),
        }

    missing = missing_model_files(settings.model.local_dir)
    payload["model"] = {
        "local_dir": str(settings.model.local_dir),
        "present": not missing,
        "missing": missing,
        "download": read_download_metadata(settings.model.local_dir),
    }

    if getattr(args, "verbose", False):
        try:
            from pipeline.model import (
                configure_runtime,
                device_info,
                resolve_device,
            )

            flags = configure_runtime(settings)
            device = resolve_device(settings.runtime.device)
            payload["device"] = {
                "info": device_info(device),
                "flags": flags,
            }
        except Exception as exc:  # noqa: BLE001 - diagnostic output
            payload["device"] = {"error": f"{type(exc).__name__}: {exc}"}

    _json_print(payload)
    return 0 if "error" not in (payload["input"] or {}) else 1


def cmd_download(args: argparse.Namespace) -> int:
    settings = _load(args)
    from pipeline.model import download_model

    metadata = download_model(settings)
    _json_print(
        {
            "ok": True,
            "local_dir": str(settings.model.local_dir),
            **metadata,
        }
    )
    return 0


def cmd_embed(args: argparse.Namespace) -> int:
    settings = _load(args)
    ensure_output_available(
        settings.output.root, overwrite=settings.output.overwrite
    )
    chunk_set = _read_chunks(settings, args)
    _ensure_model(settings, offline=args.offline)

    from pipeline.engine import EmbeddingEngine
    from pipeline.model import (
        configure_runtime,
        device_info,
        load_model,
        resolve_device,
    )
    from pipeline.store import write_artifact
    from pipeline.validate import validate_vectors

    runtime_flags = configure_runtime(settings)
    device = resolve_device(settings.runtime.device)
    device_report = device_info(device)
    logger.info(
        "device: %s (compute %s, %.1f GB, bf16=%s)",
        device_report.get("device_name"),
        device_report.get("compute_capability"),
        device_report.get("total_memory_gb", 0.0),
        device_report.get("bf16_supported"),
    )

    bundle = load_model(
        settings, device, compile_model=settings.runtime.compile
    )
    logger.info(
        "model: %s@%s dim=%d compiled=%s load=%.1fs",
        bundle.repo_id,
        bundle.revision[:12],
        bundle.dim,
        bundle.compiled,
        bundle.load_seconds,
    )

    token_ids, token_stats = encode_texts(
        bundle.tokenizer,
        chunk_set.records,
        max_length=settings.model.max_length,
        truncation=settings.model.truncation,
    )
    logger.info(
        "tokens: %d total, median=%d, p95=%d, max=%d (max_length=%d)",
        token_stats.total_tokens,
        token_stats.median_tokens,
        token_stats.p95_tokens,
        token_stats.max_tokens,
        token_stats.max_length,
    )

    plans = plan_batches(
        token_ids,
        batch_size=settings.runtime.batch_size,
        max_batch_tokens=settings.runtime.max_batch_tokens,
        pad_multiple=settings.runtime.pad_multiple,
        max_length=settings.model.max_length,
        length_grouped=settings.runtime.length_grouped,
    )
    logger.info(
        "batches: %d (max items=%d, avg tokens/batch=%.0f, "
        "padding efficiency=%.1f%%)",
        len(plans),
        max(len(plan.rows) for plan in plans),
        sum(plan.token_count for plan in plans) / len(plans),
        100
        * sum(plan.token_count for plan in plans)
        / max(1, sum(plan.padded_tokens for plan in plans)),
    )

    engine = EmbeddingEngine(
        settings, bundle, output_dtype=settings.output.dtype
    )
    profile_path = _profile_path(settings, args)
    vectors, stats = engine.run(
        chunk_set.records,
        token_ids,
        plans,
        collect=True,
        profile_path=profile_path,
    )
    if vectors is None:
        raise RuntimeError("engine did not return vectors")

    vector_report = validate_vectors(
        vectors,
        expected_dim=bundle.dim,
        expected_rows=len(chunk_set.records),
        normalized=bundle.normalize,
    )
    if not vector_report["ok"]:
        raise ValidationError(
            "in-memory vector validation failed: "
            + "; ".join(vector_report["errors"])
        )

    warnings = _collect_warnings(
        token_stats=token_stats, bundle=bundle, stats=stats
    )
    for warning in warnings:
        logger.warning("%s", warning)

    manifest = write_artifact(
        settings,
        chunk_set,
        token_stats,
        vectors,
        vector_report,
        bundle,
        stats,
        device_info=device_report,
        runtime_flags=runtime_flags,
        warnings=warnings,
        profile_path=profile_path,
    )

    summary = {
        "ok": True,
        "artifact": str(settings.output.root),
        "rows": manifest["output"]["rows"],
        "dim": manifest["output"]["dim"],
        "dtype": manifest["output"]["dtype"],
        "model": manifest["model"]["repo_id"],
        "revision": manifest["model"]["revision"],
        "compiled": manifest["model"]["compiled"],
        "compile_fallback": manifest["model"]["compile_fallback"],
        "elapsed_seconds": manifest["performance"]["elapsed_seconds"],
        "rows_per_second": manifest["performance"]["rows_per_second"],
        "tokens_per_second": manifest["performance"]["tokens_per_second"],
        "peak_memory_mb": manifest["performance"]["peak_memory_mb"],
        "vectors_sha256": manifest["output"]["vectors_sha256"],
        "warnings": warnings,
    }
    _json_print(summary)
    return 0


def cmd_benchmark(args: argparse.Namespace) -> int:
    settings = _load(args)
    chunk_set = _read_chunks(settings, args)
    _ensure_model(settings, offline=args.offline)

    from pipeline.benchmark import (
        format_table,
        parse_modes,
        run_benchmark,
        write_benchmark_report,
    )
    from pipeline.model import (
        configure_runtime,
        device_info,
        load_model,
        resolve_device,
    )

    samples = (
        args.samples
        if args.samples is not None
        else settings.benchmark.sample_rows
    )
    warmup = (
        args.warmup
        if args.warmup is not None
        else settings.benchmark.warmup_batches
    )
    measure = (
        args.measure
        if args.measure is not None
        else settings.benchmark.measure_batches
    )
    if samples < 1:
        raise ConfigError("--samples must be >= 1")
    if warmup < 0:
        raise ConfigError("--warmup must be >= 0")
    if measure < 1:
        raise ConfigError("--measure must be >= 1")

    runtime_flags = configure_runtime(settings)
    device = resolve_device(settings.runtime.device)
    device_report = device_info(device)

    bundle = load_model(settings, device, compile_model=False)
    token_ids, token_stats = encode_texts(
        bundle.tokenizer,
        chunk_set.records,
        max_length=settings.model.max_length,
        truncation=settings.model.truncation,
    )

    if args.modes:
        mode_values = [value.strip() for value in args.modes.split(",")]
    elif settings.runtime.compile:
        mode_values = [settings.runtime.compile_mode]
    else:
        mode_values = []
    include_eager = (
        args.compare_eager
        if args.compare_eager is not None
        else settings.benchmark.compare_eager
    )
    modes = parse_modes(mode_values, include_eager=include_eager)

    report = run_benchmark(
        settings,
        records=chunk_set.records,
        token_ids=token_ids,
        bundle=bundle,
        device_info=device_report,
        runtime_flags=runtime_flags,
        modes=modes,
        sample_rows=samples,
        warmup_batches=warmup,
        measure_batches=measure,
    )
    path = write_benchmark_report(settings, report)
    print(format_table(report), file=sys.stderr)

    _json_print(
        {
            "ok": report["winner"] is not None,
            "report": str(path),
            "sample": report["sample"],
            "winner": report["winner"],
            "notes": report["notes"],
            "results": [
                {
                    "mode": result["mode"],
                    "backend": result["backend"],
                    "status": result["status"],
                    "compiled": result["compiled"],
                    "compile_error": result["compile_error"],
                    "compile_fallback": result["compile_fallback"],
                    "rows_per_second": (
                        result["stats"]["rows_per_second"]
                        if result["stats"]
                        else None
                    ),
                    "tokens_per_second": (
                        result["stats"]["tokens_per_second"]
                        if result["stats"]
                        else None
                    ),
                    "error": result["error"],
                }
                for result in report["results"]
            ],
        }
    )
    return 0 if report["winner"] is not None else 1


def cmd_validate(args: argparse.Namespace) -> int:
    settings = _load(args)
    report = validate_output(settings.output.root)
    _json_print(report)
    return 0 if report["ok"] else 1


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------


def _global_common() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument(
        "--config",
        type=Path,
        default=argparse.SUPPRESS,
        help="path to config.yaml (default: the file next to run.py)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        default=argparse.SUPPRESS,
        help="debug logging and tracebacks",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        default=argparse.SUPPRESS,
        help="disable the progress bar",
    )
    return parser


def _data_common() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        add_help=False, parents=[_global_common()]
    )
    parser.add_argument("--input", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--model-dir", type=Path, default=None)
    parser.add_argument("--revision", type=str, default=None)
    parser.add_argument("--device", type=str, default=None)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument(
        "--on-duplicate",
        choices=["error", "first", "last"],
        default=None,
    )
    return parser


def _runtime_common() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--max-batch-tokens", type=int, default=None)
    parser.add_argument("--max-length", type=int, default=None)
    parser.add_argument(
        "--truncation", choices=sorted(TRUNCATION_MODES), default=None
    )
    parser.add_argument(
        "--model-dtype", choices=sorted(MODEL_DTYPES), default=None
    )
    parser.add_argument(
        "--output-dtype", choices=sorted(OUTPUT_DTYPES), default=None
    )
    parser.add_argument(
        "--attn",
        choices=["sdpa", "eager", "flash_attention_2"],
        default=None,
    )
    parser.add_argument(
        "--compile",
        action=argparse.BooleanOptionalAction,
        default=None,
    )
    parser.add_argument(
        "--compile-mode", choices=sorted(COMPILE_MODES), default=None
    )
    parser.add_argument(
        "--compile-backend", choices=sorted(COMPILE_BACKENDS), default=None
    )
    parser.add_argument(
        "--compile-dynamic",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="compile one dynamic graph instead of one graph per shape",
    )
    parser.add_argument(
        "--length-grouped",
        action=argparse.BooleanOptionalAction,
        default=None,
    )
    parser.add_argument("--prefetch", type=int, default=None)
    parser.add_argument("--pad-multiple", type=int, default=None)
    return parser


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="embedding-lab",
        description=(
            "Offline BGE-M3 embedding service for the PHARMEAZOR chunk "
            "corpus. Reads cleaning-lab/embed-input.jsonl and writes vectors; "
            "it does not touch PostgreSQL or the application runtime."
        ),
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="path to config.yaml (default: the file next to run.py)",
    )
    parser.add_argument(
        "--verbose", action="store_true", help="debug logging and tracebacks"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    embed = subparsers.add_parser(
        "embed",
        parents=[_data_common(), _runtime_common()],
        help="embed the chunk corpus and write output/embeddings",
    )
    embed.add_argument(
        "--force",
        action="store_true",
        help="replace an existing artifact",
    )
    embed.add_argument(
        "--no-text",
        action="store_true",
        help="omit chunk text from chunks.jsonl",
    )
    embed.add_argument(
        "--offline",
        action="store_true",
        help="fail instead of downloading a missing model",
    )
    embed.add_argument(
        "--profile",
        action="store_true",
        help="write a Chrome profiler trace",
    )
    embed.add_argument("--profile-path", type=Path, default=None)

    benchmark = subparsers.add_parser(
        "benchmark",
        parents=[_data_common(), _runtime_common()],
        help="compare eager and compiled inference on this GPU",
    )
    benchmark.add_argument("--samples", type=int, default=None)
    benchmark.add_argument("--warmup", type=int, default=None)
    benchmark.add_argument("--measure", type=int, default=None)
    benchmark.add_argument(
        "--modes",
        type=str,
        default=None,
        help=(
            "comma-separated: eager, default, reduce-overhead, max-autotune, "
            "max-autotune-no-cudagraphs, cudagraphs, aot_eager"
        ),
    )
    benchmark.add_argument(
        "--compare-eager",
        action=argparse.BooleanOptionalAction,
        default=None,
    )
    benchmark.add_argument("--offline", action="store_true")

    download = subparsers.add_parser(
        "download",
        parents=[_global_common()],
        help="download the pinned BGE-M3 snapshot",
    )
    download.add_argument("--model-dir", type=Path, default=None)
    download.add_argument("--revision", type=str, default=None)
    download.add_argument("--workers", type=int, default=None)

    validate = subparsers.add_parser(
        "validate",
        parents=[_global_common()],
        help="validate the committed artifact",
    )
    validate.add_argument("--output", type=Path, default=None)

    subparsers.add_parser(
        "info",
        parents=[_data_common()],
        help="show the effective config, input stats and model presence",
    )

    return parser


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    arguments = list(sys.argv[1:] if argv is None else argv)
    if not arguments:
        arguments = ["embed"]

    parser = build_parser()
    args = parser.parse_args(arguments)
    _configure_logging(getattr(args, "verbose", False))

    try:
        if args.command == "embed":
            return cmd_embed(args)
        if args.command == "benchmark":
            return cmd_benchmark(args)
        if args.command == "download":
            return cmd_download(args)
        if args.command == "validate":
            return cmd_validate(args)
        if args.command == "info":
            return cmd_info(args)
        parser.error(f"unknown command: {args.command}")
        return 2
    except (ConfigError, InputError, ModelError, ValidationError, OutputExistsError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        if getattr(args, "verbose", False):
            traceback.print_exc()
        return 2
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    except Exception as exc:  # noqa: BLE001 - CLI boundary
        print(f"error: {type(exc).__name__}: {exc}", file=sys.stderr)
        if getattr(args, "verbose", False):
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
