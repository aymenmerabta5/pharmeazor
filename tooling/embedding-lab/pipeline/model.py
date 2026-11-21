"""BGE-M3 loading, device setup, and the compiled-inference wrapper.

The optimization choices are deliberate and measurable:

* BF16 weights and activations — native on Blackwell (sm_120), more stable than
  FP16 for XLM-R's LayerNorm.
* SDPA attention — lets PyTorch pick the fused Blackwell kernel instead of the
  materialized math path.
* ``torch.compile`` — optional and lazily compiled. If Inductor/Triton is not
  available on Windows, or a compiled kernel fails at runtime, the wrapper
  falls back to the eager model and records the reason. A long embedding run
  never dies because a compiler backend is missing.
* CLS pooling + L2 normalization — the pooling declared by BGE-M3's
  ``1_Pooling/config.json``. The output is float32 until storage so the norm is
  computed accurately before the optional float16 cast.
"""

from __future__ import annotations

import json
import logging
import platform
import sys
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from torch import nn

from settings import Settings

from .files import (
    ALLOW_PATTERNS,
    DOWNLOAD_METADATA,
    ModelError,
    directory_size,
    local_revision,
    missing_model_files,
)

logger = logging.getLogger(__name__)

DTYPES: dict[str, torch.dtype] = {
    "bfloat16": torch.bfloat16,
    "float16": torch.float16,
    "float32": torch.float32,
}


@dataclass
class ModelBundle:
    eager: nn.Module
    model: nn.Module
    tokenizer: Any
    device: torch.device
    dtype: torch.dtype
    dim: int
    repo_id: str
    revision: str
    local_dir: Path
    attn_implementation: str
    pooling: str
    normalize: bool
    load_seconds: float
    compiled: bool = False
    compile_mode: str | None = None
    compile_backend: str | None = None
    compile_error: str | None = None

    @property
    def fallback_reason(self) -> str | None:
        return getattr(self.model, "fallback_reason", None)

    def describe(self) -> dict[str, Any]:
        return {
            "repo_id": self.repo_id,
            "revision": self.revision,
            "local_dir": str(self.local_dir),
            "dim": self.dim,
            "weights_dtype": str(self.dtype).replace("torch.", ""),
            "attn_implementation": self.attn_implementation,
            "pooling": self.pooling,
            "normalize": self.normalize,
            "compiled": self.compiled,
            "compile_mode": self.compile_mode,
            "compile_backend": self.compile_backend,
            "compile_error": self.compile_error,
            "compile_fallback": self.fallback_reason,
            "load_seconds": round(self.load_seconds, 3),
        }


# ---------------------------------------------------------------------------
# Model download
# ---------------------------------------------------------------------------


def download_model(settings: Settings) -> dict[str, Any]:
    """Download the pinned BGE-M3 snapshot into ``model.local_dir``.

    Only the files needed for dense embedding are fetched: config, tokenizer,
    pooling config and weights. ONNX exports, images, sparse/ColBERT heads and
    the model card are skipped.
    """
    from huggingface_hub import HfApi, snapshot_download

    local_dir = settings.model.local_dir
    local_dir.mkdir(parents=True, exist_ok=True)

    resolved_revision = settings.model.revision
    try:
        info = HfApi().model_info(
            settings.model.repo_id, revision=settings.model.revision
        )
        if getattr(info, "sha", None):
            resolved_revision = info.sha
    except Exception as exc:  # noqa: BLE001 - offline runs use the pinned SHA
        logger.warning(
            "could not resolve %s@%s from Hugging Face (%s); using the pinned "
            "revision for the download",
            settings.model.repo_id,
            settings.model.revision,
            exc,
        )

    logger.info(
        "downloading %s@%s into %s",
        settings.model.repo_id,
        resolved_revision,
        local_dir,
    )
    snapshot_download(
        repo_id=settings.model.repo_id,
        revision=resolved_revision,
        local_dir=str(local_dir),
        allow_patterns=ALLOW_PATTERNS,
        max_workers=settings.model.download_workers,
    )

    missing = missing_model_files(local_dir)
    if missing:
        raise ModelError(
            f"download completed but these required files are missing from "
            f"{local_dir}: {', '.join(missing)}"
        )

    metadata = {
        "repo_id": settings.model.repo_id,
        "requested_revision": settings.model.revision,
        "resolved_revision": resolved_revision,
        "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bytes": directory_size(local_dir),
    }
    (local_dir / DOWNLOAD_METADATA).write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


# ---------------------------------------------------------------------------
# Runtime setup
# ---------------------------------------------------------------------------


def configure_runtime(settings: Settings) -> dict[str, Any]:
    """Apply the process-wide CUDA/matmul settings before loading the model."""
    applied: dict[str, Any] = {}

    if settings.runtime.tf32:
        torch.set_float32_matmul_precision("high")
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        applied["tf32"] = True
    torch.backends.cudnn.benchmark = True

    if settings.runtime.sdpa:
        for name, enabled in (
            ("flash_sdp", True),
            ("mem_efficient_sdp", True),
            ("math_sdp", True),
        ):
            try:
                getattr(torch.backends.cuda, f"enable_{name}")(enabled)
            except (AttributeError, RuntimeError):
                pass
        applied["sdpa"] = True

    # Dynamic padding creates a handful of sequence lengths. The default
    # Dynamo cache is small enough to recompile repeatedly on a long run.
    try:
        torch._dynamo.config.cache_size_limit = 64
        torch._dynamo.config.accumulated_cache_size_limit = 256
        applied["dynamo_cache_size_limit"] = 64
    except (AttributeError, RuntimeError):
        pass

    applied["matmul_precision"] = torch.get_float32_matmul_precision()
    applied["cudnn_benchmark"] = torch.backends.cudnn.benchmark
    return applied


def resolve_device(device: str) -> torch.device:
    if device.startswith("cuda"):
        if not torch.cuda.is_available():
            raise ModelError(
                "CUDA is not available. This lab needs a CUDA build of PyTorch "
                f"(torch.version.cuda={torch.version.cuda!r}). Install the "
                "cu130 wheel from https://download.pytorch.org/whl/cu130 and "
                "check that nvidia-smi sees the RTX 5060."
            )
        index = 0
        if ":" in device:
            try:
                index = int(device.split(":", 1)[1])
            except ValueError as exc:
                raise ModelError(f"invalid CUDA device: {device}") from exc
        if index >= torch.cuda.device_count():
            raise ModelError(
                f"CUDA device {device} requested, but only "
                f"{torch.cuda.device_count()} device(s) are visible"
            )
        torch.cuda.set_device(index)
        return torch.device(f"cuda:{index}")
    return torch.device(device)


def device_info(device: torch.device) -> dict[str, Any]:
    info: dict[str, Any] = {
        "device": str(device),
        "torch_version": torch.__version__,
        "cuda_version": torch.version.cuda,
        "cudnn_version": torch.backends.cudnn.version(),
        "python_version": platform.python_version(),
        "platform": platform.platform(),
    }
    if device.type == "cuda":
        properties = torch.cuda.get_device_properties(device)
        major, minor = torch.cuda.get_device_capability(device)
        info.update(
            {
                "device_name": torch.cuda.get_device_name(device),
                "compute_capability": f"{major}.{minor}",
                "total_memory_gb": round(properties.total_memory / (1024**3), 2),
                "multiprocessor_count": properties.multi_processor_count,
                "bf16_supported": torch.cuda.is_bf16_supported(),
            }
        )
    else:
        info["device_name"] = platform.processor() or "cpu"
    return info


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def load_tokenizer(settings: Settings) -> Any:
    from transformers import AutoTokenizer

    try:
        tokenizer = AutoTokenizer.from_pretrained(
            str(settings.model.local_dir),
            local_files_only=True,
            use_fast=True,
            trust_remote_code=False,
        )
    except Exception as exc:  # noqa: BLE001 - re-raised with actionable context
        raise ModelError(
            f"could not load the tokenizer from {settings.model.local_dir}: {exc}"
        ) from exc
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    return tokenizer


def _load_automodel(settings: Settings, dtype: torch.dtype) -> nn.Module:
    from transformers import AutoModel

    base_kwargs: dict[str, Any] = {
        "local_files_only": True,
        "trust_remote_code": False,
    }
    attempts: list[dict[str, Any]] = [
        {
            **base_kwargs,
            "dtype": dtype,
            "attn_implementation": settings.model.attn_implementation,
            "low_cpu_mem_usage": True,
        },
        {
            **base_kwargs,
            "dtype": dtype,
            "attn_implementation": settings.model.attn_implementation,
        },
        {
            **base_kwargs,
            "dtype": dtype,
        },
        {
            **base_kwargs,
            "torch_dtype": dtype,
        },
    ]

    errors: list[str] = []
    for kwargs in attempts:
        try:
            return AutoModel.from_pretrained(
                str(settings.model.local_dir), **kwargs
            )
        except (TypeError, ValueError, ImportError, RuntimeError) as exc:
            errors.append(f"{sorted(kwargs)}: {type(exc).__name__}: {exc}")
            logger.debug("model load attempt failed: %s", errors[-1])

    raise ModelError(
        "could not load BGE-M3 from "
        f"{settings.model.local_dir}. Attempts:\n  " + "\n  ".join(errors)
    )


class CompiledModel(nn.Module):
    """Run the compiled module, falling back to eager on a compiler failure.

    OOM is deliberately re-raised so the engine can split the batch and retry;
    only compiler/runtime failures trigger the eager fallback.
    """

    def __init__(self, eager: nn.Module, compiled: Any) -> None:
        super().__init__()
        self.eager = eager
        self.compiled = compiled
        self.active = compiled
        self.fallback_reason: str | None = None

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> Any:
        try:
            return self.active(
                input_ids=input_ids, attention_mask=attention_mask
            )
        except torch.cuda.OutOfMemoryError:
            raise
        except Exception as exc:  # noqa: BLE001 - compiler backends vary
            if self.active is self.eager:
                raise
            self.fallback_reason = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "torch.compile failed at runtime (%s); continuing with eager "
                "PyTorch for the rest of this run",
                self.fallback_reason,
            )
            self.active = self.eager
            self.compiled = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            return self.eager(
                input_ids=input_ids, attention_mask=attention_mask
            )


def compile_bundle(
    bundle: ModelBundle,
    *,
    mode: str,
    backend: str,
    dynamic: bool,
) -> ModelBundle:
    """Compile the eager model, returning an eager bundle on failure."""
    if backend == "eager":
        return replace(
            bundle,
            compiled=False,
            compile_mode="eager",
            compile_backend="eager",
            compile_error=None,
        )

    kwargs: dict[str, Any] = {
        "backend": backend,
        "dynamic": dynamic,
        "fullgraph": False,
    }
    if backend == "inductor":
        kwargs["mode"] = mode

    started = time.perf_counter()
    try:
        compiled = torch.compile(bundle.eager, **kwargs)
    except Exception as exc:  # noqa: BLE001 - backend availability varies
        reason = f"{type(exc).__name__}: {exc}"
        logger.warning(
            "torch.compile(backend=%s, mode=%s) is unavailable (%s); using "
            "eager PyTorch",
            backend,
            mode,
            reason,
        )
        return replace(
            bundle,
            compiled=False,
            compile_mode=mode,
            compile_backend=backend,
            compile_error=reason,
        )

    logger.info(
        "torch.compile configured in %.1fs (backend=%s, mode=%s, dynamic=%s); "
        "the first batch will trigger the actual compilation",
        time.perf_counter() - started,
        backend,
        mode,
        dynamic,
    )
    return replace(
        bundle,
        model=CompiledModel(bundle.eager, compiled),
        compiled=True,
        compile_mode=mode,
        compile_backend=backend,
        compile_error=None,
    )


def load_model(
    settings: Settings,
    device: torch.device,
    *,
    compile_model: bool,
) -> ModelBundle:
    started = time.perf_counter()
    missing = missing_model_files(settings.model.local_dir)
    if missing:
        raise ModelError(
            f"model files missing from {settings.model.local_dir}: "
            f"{', '.join(missing)}. Run `python run.py download` first."
        )

    tokenizer = load_tokenizer(settings)
    dtype = DTYPES[settings.model.dtype]
    model = _load_automodel(settings, dtype)
    model.to(device)
    model.eval()
    model.requires_grad_(False)
    if hasattr(model, "config"):
        model.config.use_cache = False

    dim = int(getattr(model.config, "hidden_size", 0))
    if dim <= 0:
        raise ModelError("loaded model does not expose a positive hidden_size")

    bundle = ModelBundle(
        eager=model,
        model=model,
        tokenizer=tokenizer,
        device=device,
        dtype=dtype,
        dim=dim,
        repo_id=settings.model.repo_id,
        revision=local_revision(settings.model.local_dir, settings.model.revision),
        local_dir=settings.model.local_dir,
        attn_implementation=settings.model.attn_implementation,
        pooling=settings.model.pooling,
        normalize=settings.model.normalize,
        load_seconds=0.0,
    )

    if compile_model:
        bundle = compile_bundle(
            bundle,
            mode=settings.runtime.compile_mode,
            backend=settings.runtime.compile_backend,
            dynamic=settings.runtime.compile_dynamic,
        )

    bundle.load_seconds = time.perf_counter() - started
    return bundle


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------


def embed_batch(
    bundle: ModelBundle,
    input_ids: torch.Tensor,
    attention_mask: torch.Tensor,
) -> torch.Tensor:
    """Return float32, optionally L2-normalized, dense vectors for one batch."""
    outputs = bundle.model(input_ids=input_ids, attention_mask=attention_mask)
    last_hidden_state = getattr(outputs, "last_hidden_state", None)
    if last_hidden_state is None:
        last_hidden_state = outputs[0]

    if bundle.pooling == "mean":
        mask = attention_mask.unsqueeze(-1).to(last_hidden_state.dtype)
        pooled = (last_hidden_state * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1)
    else:
        pooled = last_hidden_state[:, 0]

    pooled = pooled.float()
    if bundle.normalize:
        pooled = F.normalize(pooled, p=2, dim=-1)
    return pooled


def environment_summary() -> dict[str, Any]:
    return {
        "python": sys.version.split()[0],
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
        "cudnn": torch.backends.cudnn.version(),
        "platform": platform.platform(),
    }
