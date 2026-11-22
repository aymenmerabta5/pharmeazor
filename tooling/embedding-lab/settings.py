"""Typed settings for the PHARMEAZOR embedding lab.

``config.yaml`` is the single source of runtime configuration. This module
loads it once, validates every value, and resolves every path against the lab
root (the directory that contains the config file), never against the current
working directory. The pipeline receives one immutable ``Settings`` object.

The module deliberately does not import torch. ``run.py info`` and
``run.py validate`` must stay fast even when the CUDA environment is broken.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "config.yaml"

MODEL_DTYPES = frozenset({"auto", "bfloat16", "float16", "float32"})
OUTPUT_DTYPES = frozenset({"float16", "float32"})
POOLING_MODES = frozenset({"cls", "mean"})
ATTENTION_IMPLEMENTATIONS = frozenset({"auto", "sdpa", "eager", "flash_attention_2"})
TRUNCATION_MODES = frozenset({"error", "truncate"})
DUPLICATE_POLICIES = frozenset({"error", "first", "last"})
COMPILE_MODES = frozenset(
    {"default", "reduce-overhead", "max-autotune", "max-autotune-no-cudagraphs"}
)
COMPILE_BACKENDS = frozenset({"inductor", "cudagraphs", "aot_eager", "eager"})


class ConfigError(ValueError):
    """Raised when ``config.yaml`` is missing a value or has an invalid one."""


@dataclass(frozen=True)
class InputSettings:
    path: Path
    duplicate_policy: str = "error"
    require_text_sha256: bool = True
    max_rows: int = 0


@dataclass(frozen=True)
class OutputSettings:
    root: Path
    dtype: str = "float16"
    include_text: bool = True
    overwrite: bool = False


@dataclass(frozen=True)
class ModelSettings:
    repo_id: str
    revision: str
    local_dir: Path
    max_length: int
    truncation: str
    dtype: str
    attn_implementation: str
    pooling: str
    normalize: bool
    trust_remote_code: bool
    local_files_only: bool
    download_workers: int


@dataclass(frozen=True)
class RuntimeSettings:
    device: str
    batch_size: int
    max_batch_tokens: int
    length_grouped: bool
    pad_multiple: int
    prefetch_batches: int
    pin_memory: bool
    compile: bool
    compile_mode: str
    compile_backend: str
    compile_dynamic: bool
    warmup_batches: int
    tf32: bool
    sdpa: bool
    oom_retry: bool
    progress: bool


@dataclass(frozen=True)
class BenchmarkSettings:
    sample_rows: int
    warmup_batches: int
    measure_batches: int
    compare_eager: bool


@dataclass(frozen=True)
class Settings:
    config_path: Path
    lab_root: Path
    input: InputSettings
    output: OutputSettings
    model: ModelSettings
    runtime: RuntimeSettings
    benchmark: BenchmarkSettings
    raw: dict[str, Any]

    def public_dict(self) -> dict[str, Any]:
        """A JSON-safe view of the effective settings (paths as strings)."""
        return {
            "config_path": str(self.config_path),
            "lab_root": str(self.lab_root),
            "input": {
                "path": str(self.input.path),
                "duplicate_policy": self.input.duplicate_policy,
                "require_text_sha256": self.input.require_text_sha256,
                "max_rows": self.input.max_rows,
            },
            "output": {
                "root": str(self.output.root),
                "dtype": self.output.dtype,
                "include_text": self.output.include_text,
                "overwrite": self.output.overwrite,
            },
            "model": {
                "repo_id": self.model.repo_id,
                "revision": self.model.revision,
                "local_dir": str(self.model.local_dir),
                "max_length": self.model.max_length,
                "truncation": self.model.truncation,
                "dtype": self.model.dtype,
                "attn_implementation": self.model.attn_implementation,
                "pooling": self.model.pooling,
                "normalize": self.model.normalize,
                "trust_remote_code": self.model.trust_remote_code,
                "local_files_only": self.model.local_files_only,
                "download_workers": self.model.download_workers,
            },
            "runtime": {
                "device": self.runtime.device,
                "batch_size": self.runtime.batch_size,
                "max_batch_tokens": self.runtime.max_batch_tokens,
                "length_grouped": self.runtime.length_grouped,
                "pad_multiple": self.runtime.pad_multiple,
                "prefetch_batches": self.runtime.prefetch_batches,
                "pin_memory": self.runtime.pin_memory,
                "compile": self.runtime.compile,
                "compile_mode": self.runtime.compile_mode,
                "compile_backend": self.runtime.compile_backend,
                "compile_dynamic": self.runtime.compile_dynamic,
                "warmup_batches": self.runtime.warmup_batches,
                "tf32": self.runtime.tf32,
                "sdpa": self.runtime.sdpa,
                "oom_retry": self.runtime.oom_retry,
                "progress": self.runtime.progress,
            },
            "benchmark": {
                "sample_rows": self.benchmark.sample_rows,
                "warmup_batches": self.benchmark.warmup_batches,
                "measure_batches": self.benchmark.measure_batches,
                "compare_eager": self.benchmark.compare_eager,
            },
        }


# ---------------------------------------------------------------------------
# YAML helpers
# ---------------------------------------------------------------------------


def _mapping(value: Any, context: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ConfigError(f"'{context}' must be a mapping")
    return value


def _text(value: Any, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"'{context}' must be a non-empty string")
    return value.strip()


def _integer(value: Any, context: str, *, minimum: int | None = None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"'{context}' must be an integer")
    if minimum is not None and value < minimum:
        raise ConfigError(f"'{context}' must be >= {minimum}")
    return value


def _boolean(value: Any, context: str) -> bool:
    if not isinstance(value, bool):
        raise ConfigError(f"'{context}' must be true or false")
    return value


def _choice(value: Any, context: str, choices: frozenset[str]) -> str:
    text = _text(value, context)
    if text not in choices:
        allowed = ", ".join(sorted(choices))
        raise ConfigError(f"'{context}' must be one of: {allowed}")
    return text


def _resolve(base: Path, value: Any, context: str) -> Path:
    text = _text(value, context)
    path = Path(text).expanduser()
    return path if path.is_absolute() else (base / path).resolve()


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def load_settings(config_path: Path | str = DEFAULT_CONFIG) -> Settings:
    """Load and validate ``config.yaml``.

    Raises ``ConfigError`` with the exact key path for any invalid value, so a
    bad config fails before the model is downloaded or the GPU is touched.
    """
    path = Path(config_path).expanduser()
    if not path.is_absolute():
        path = (Path.cwd() / path).resolve()
    if not path.is_file():
        raise ConfigError(f"config file not found: {path}")

    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ConfigError(f"invalid YAML in {path}: {exc}") from exc

    root = _mapping(raw, str(path))
    lab_root = path.parent

    input_raw = _mapping(root.get("input"), "input")
    output_raw = _mapping(root.get("output"), "output")
    model_raw = _mapping(root.get("model"), "model")
    runtime_raw = _mapping(root.get("runtime"), "runtime")
    benchmark_raw = _mapping(root.get("benchmark"), "benchmark")

    input_settings = InputSettings(
        path=_resolve(lab_root, input_raw.get("path"), "input.path"),
        duplicate_policy=_choice(
            input_raw.get("duplicate_policy", "error"),
            "input.duplicate_policy",
            DUPLICATE_POLICIES,
        ),
        require_text_sha256=_boolean(
            input_raw.get("require_text_sha256", True),
            "input.require_text_sha256",
        ),
        max_rows=_integer(input_raw.get("max_rows", 0), "input.max_rows", minimum=0),
    )

    output_settings = OutputSettings(
        root=_resolve(lab_root, output_raw.get("root"), "output.root"),
        dtype=_choice(
            output_raw.get("dtype", "float16"), "output.dtype", OUTPUT_DTYPES
        ),
        include_text=_boolean(
            output_raw.get("include_text", True), "output.include_text"
        ),
        overwrite=_boolean(output_raw.get("overwrite", False), "output.overwrite"),
    )

    max_length = _integer(
        model_raw.get("max_length", 4096), "model.max_length", minimum=16
    )
    if max_length > 8192:
        raise ConfigError("'model.max_length' must be <= 8192 for BGE-M3")

    model_settings = ModelSettings(
        repo_id=_text(model_raw.get("repo_id"), "model.repo_id"),
        revision=_text(model_raw.get("revision"), "model.revision"),
        local_dir=_resolve(lab_root, model_raw.get("local_dir"), "model.local_dir"),
        max_length=max_length,
        truncation=_choice(
            model_raw.get("truncation", "error"),
            "model.truncation",
            TRUNCATION_MODES,
        ),
        dtype=_choice(
            model_raw.get("dtype", "auto"), "model.dtype", MODEL_DTYPES
        ),
        attn_implementation=_choice(
            model_raw.get("attn_implementation", "auto"),
            "model.attn_implementation",
            ATTENTION_IMPLEMENTATIONS,
        ),
        pooling=_choice(
            model_raw.get("pooling", "cls"), "model.pooling", POOLING_MODES
        ),
        normalize=_boolean(model_raw.get("normalize", True), "model.normalize"),
        trust_remote_code=_boolean(
            model_raw.get("trust_remote_code", False), "model.trust_remote_code"
        ),
        local_files_only=_boolean(
            model_raw.get("local_files_only", True), "model.local_files_only"
        ),
        download_workers=_integer(
            model_raw.get("download_workers", 8),
            "model.download_workers",
            minimum=1,
        ),
    )

    runtime_settings = RuntimeSettings(
        device=_text(runtime_raw.get("device", "cuda"), "runtime.device"),
        batch_size=_integer(
            runtime_raw.get("batch_size", 0), "runtime.batch_size", minimum=0
        ),
        max_batch_tokens=_integer(
            runtime_raw.get("max_batch_tokens", 0),
            "runtime.max_batch_tokens",
            minimum=0,
        ),
        length_grouped=_boolean(
            runtime_raw.get("length_grouped", True), "runtime.length_grouped"
        ),
        pad_multiple=_integer(
            runtime_raw.get("pad_multiple", 64), "runtime.pad_multiple", minimum=1
        ),
        prefetch_batches=_integer(
            runtime_raw.get("prefetch_batches", 4),
            "runtime.prefetch_batches",
            minimum=0,
        ),
        pin_memory=_boolean(
            runtime_raw.get("pin_memory", True), "runtime.pin_memory"
        ),
        compile=_boolean(runtime_raw.get("compile", True), "runtime.compile"),
        compile_mode=_choice(
            runtime_raw.get("compile_mode", "default"),
            "runtime.compile_mode",
            COMPILE_MODES,
        ),
        compile_backend=_choice(
            runtime_raw.get("compile_backend", "inductor"),
            "runtime.compile_backend",
            COMPILE_BACKENDS,
        ),
        compile_dynamic=_boolean(
            runtime_raw.get("compile_dynamic", True), "runtime.compile_dynamic"
        ),
        warmup_batches=_integer(
            runtime_raw.get("warmup_batches", 3),
            "runtime.warmup_batches",
            minimum=0,
        ),
        tf32=_boolean(runtime_raw.get("tf32", True), "runtime.tf32"),
        sdpa=_boolean(runtime_raw.get("sdpa", True), "runtime.sdpa"),
        oom_retry=_boolean(runtime_raw.get("oom_retry", True), "runtime.oom_retry"),
        progress=_boolean(runtime_raw.get("progress", True), "runtime.progress"),
    )

    benchmark_settings = BenchmarkSettings(
        sample_rows=_integer(
            benchmark_raw.get("sample_rows", 1024),
            "benchmark.sample_rows",
            minimum=1,
        ),
        warmup_batches=_integer(
            benchmark_raw.get("warmup_batches", 3),
            "benchmark.warmup_batches",
            minimum=0,
        ),
        measure_batches=_integer(
            benchmark_raw.get("measure_batches", 10),
            "benchmark.measure_batches",
            minimum=1,
        ),
        compare_eager=_boolean(
            benchmark_raw.get("compare_eager", True),
            "benchmark.compare_eager",
        ),
    )

    return Settings(
        config_path=path,
        lab_root=lab_root,
        input=input_settings,
        output=output_settings,
        model=model_settings,
        runtime=runtime_settings,
        benchmark=benchmark_settings,
        raw=root,
    )


def validate_settings(settings: Settings) -> None:
    """Re-check the invariants after CLI overrides are applied."""
    if settings.model.max_length < 16 or settings.model.max_length > 8192:
        raise ConfigError("'model.max_length' must be between 16 and 8192")
    if settings.runtime.batch_size < 0:
        raise ConfigError("'runtime.batch_size' must be >= 0 (0 means auto)")
    if settings.runtime.max_batch_tokens < 0:
        raise ConfigError("'runtime.max_batch_tokens' must be >= 0 (0 means auto)")
    if settings.runtime.pad_multiple < 1:
        raise ConfigError("'runtime.pad_multiple' must be >= 1")
    if settings.runtime.prefetch_batches < 0:
        raise ConfigError("'runtime.prefetch_batches' must be >= 0")
    if settings.output.dtype not in OUTPUT_DTYPES:
        raise ConfigError(f"'output.dtype' must be one of: {sorted(OUTPUT_DTYPES)}")
    if settings.model.dtype not in MODEL_DTYPES:
        raise ConfigError(f"'model.dtype' must be one of: {sorted(MODEL_DTYPES)}")
    if settings.model.truncation not in TRUNCATION_MODES:
        raise ConfigError(
            f"'model.truncation' must be one of: {sorted(TRUNCATION_MODES)}"
        )
    if settings.runtime.compile_mode not in COMPILE_MODES:
        raise ConfigError(
            f"'runtime.compile_mode' must be one of: {sorted(COMPILE_MODES)}"
        )
    if settings.runtime.compile_backend not in COMPILE_BACKENDS:
        raise ConfigError(
            f"'runtime.compile_backend' must be one of: {sorted(COMPILE_BACKENDS)}"
        )
    if settings.input.duplicate_policy not in DUPLICATE_POLICIES:
        raise ConfigError(
            f"'input.duplicate_policy' must be one of: {sorted(DUPLICATE_POLICIES)}"
        )
