"""BGE-M3 loading, device setup, and the compiled-inference wrapper.

Nothing here assumes a particular GPU. The defaults adapt to whatever card the
run actually gets:

* dtype ``auto`` picks BF16 when the device supports it natively (Ampere and
  newer), FP16 on older CUDA cards, and FP32 on CPU. BF16 is preferred where it
  exists because it has FP32's range, so XLM-R's LayerNorm cannot overflow the
  way it can in FP16.
* attention ``auto`` picks SDPA when this PyTorch exposes it, and eager
  otherwise.
* batch limits ``0`` scale with the memory the device reports, so the same
  config runs on a laptop GPU and a workstation card.
* ``torch.compile`` is optional and lazily compiled. If Inductor/Triton is not
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


def _bf16_native() -> bool:
    """True only when the GPU computes BF16 in hardware.

    Compute capability is checked first: ``torch.cuda.is_bf16_supported()``
    reports Turing cards when emulation is allowed, and emulated BF16 is slower
    than plain FP16. Native BF16 starts at Ampere (8.0). Newer PyTorch can
    confirm it; older builds are trusted on the capability check alone.
    """
    if not torch.cuda.is_available():
        return False
    try:
        major, _ = torch.cuda.get_device_capability()
    except (RuntimeError, AssertionError):
        return False
    if major < 8:
        return False
    try:
        return bool(torch.cuda.is_bf16_supported(including_emulation=False))
    except TypeError:
        # PyTorch < 2.3: no including_emulation argument. Capability 8.0+
        # already proves the hardware supports BF16 natively.
        return True
    except (RuntimeError, AssertionError):
        return False


def _tf32_supported() -> bool:
    """TF32 exists from Ampere onwards and needs CUDA 11 or newer."""
    if not torch.cuda.is_available():
        return False
    cuda_version = torch.version.cuda
    if cuda_version:
        try:
            if int(cuda_version.split(".", 1)[0]) < 11:
                return False
        except ValueError:
            pass
    try:
        major, _ = torch.cuda.get_device_capability()
    except (RuntimeError, AssertionError):
        return False
    return major >= 8


def resolve_dtype(requested: str, device: torch.device) -> tuple[torch.dtype, str]:
    """Resolve ``auto`` to the best dtype this device supports.

    Returns the torch dtype and the concrete name, so the run manifest records
    what actually ran rather than the word ``auto``. An explicit request is
    honoured, but a half-precision dtype on CPU gets a warning because many
    kernels are not implemented there and the ones that exist are slower than
    float32.
    """
    if requested != "auto":
        dtype = DTYPES[requested]
        if device.type == "cpu" and dtype is not torch.float32:
            logger.warning(
                "model.dtype=%s on CPU is usually slower than float32 and some "
                "kernels are missing; prefer auto or float32",
                requested,
            )
        return dtype, requested
    if device.type != "cuda":
        return torch.float32, "float32"
    if _bf16_native():
        return torch.bfloat16, "bfloat16"
    return torch.float16, "float16"


def resolve_attn_implementation(requested: str) -> str:
    """Resolve ``auto`` to the best attention path this PyTorch exposes."""
    if requested != "auto":
        return requested
    return "sdpa" if hasattr(F, "scaled_dot_product_attention") else "eager"


def _auto_batch_limits(memory_gb: float) -> tuple[int, int]:
    """Return ``(batch_size, max_batch_tokens)`` for a given device size.

    The numbers are a starting point, not a promise: the engine still halves a
    batch on CUDA OOM, so a card that needs less degrades instead of failing.
    """
    if memory_gb >= 40:
        return 128, 65_536
    if memory_gb >= 20:
        return 96, 49_152
    if memory_gb >= 11:
        return 64, 32_768
    if memory_gb >= 7:
        return 48, 24_576
    if memory_gb > 0:
        return 24, 12_288
    return 8, 8_192


def apply_device_defaults(settings: Settings, device: torch.device) -> Settings:
    """Replace the ``auto``/``0`` runtime values with concrete ones.

    ``config.yaml`` is loaded before the device is known, so the batch limits
    cannot be resolved there. Call this once after ``resolve_device`` and pass
    the returned settings to everything that plans batches.
    """
    batch_size = settings.runtime.batch_size
    max_batch_tokens = settings.runtime.max_batch_tokens
    if batch_size > 0 and max_batch_tokens > 0:
        return settings

    memory_gb = 0.0
    if device.type == "cuda":
        try:
            memory_gb = (
                torch.cuda.get_device_properties(device).total_memory / (1024**3)
            )
        except (RuntimeError, AssertionError):
            # A backend that cannot report memory falls back to the smallest
            # profile. The engine still splits on OOM, so this is safe.
            memory_gb = 0.0
    auto_batch, auto_tokens = _auto_batch_limits(memory_gb)
    runtime = replace(
        settings.runtime,
        batch_size=batch_size if batch_size > 0 else auto_batch,
        max_batch_tokens=max_batch_tokens if max_batch_tokens > 0 else auto_tokens,
    )
    if batch_size < 1 or max_batch_tokens < 1:
        logger.info(
            "auto batch limits for %.1f GB: batch_size=%d, max_batch_tokens=%d",
            memory_gb,
            runtime.batch_size,
            runtime.max_batch_tokens,
        )
    return replace(settings, runtime=runtime)


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
    """Apply the process-wide CUDA/matmul settings before loading the model.

    The flags are safe to set on hardware that ignores them; the report records
    whether the current card actually has TF32 so a profile is not misread.
    """
    applied: dict[str, Any] = {}

    if settings.runtime.tf32:
        torch.set_float32_matmul_precision("high")
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        applied["tf32"] = True
        applied["tf32_supported"] = _tf32_supported()
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


def _mps_available() -> bool:
    backend = getattr(torch.backends, "mps", None)
    return bool(backend is not None and backend.is_available())


def resolve_device(device: str) -> torch.device:
    """Resolve a device string. ``auto`` prefers CUDA, then MPS, then CPU.

    ``cuda`` stays the explicit default in ``config.yaml``: a full corpus run
    on CPU takes hours, so a missing CUDA build should fail loudly instead of
    quietly moving to the processor. ``auto`` is for machines where the caller
    accepts that trade-off.
    """
    if device == "auto":
        if torch.cuda.is_available():
            resolved = "cuda"
        elif _mps_available():
            resolved = "mps"
        else:
            resolved = "cpu"
            logger.warning(
                "runtime.device=auto resolved to CPU: no CUDA build of PyTorch "
                "is installed (torch.version.cuda=%r). Embedding the full "
                "corpus on CPU takes hours; install the CUDA wheel to use the "
                "GPU.",
                torch.version.cuda,
            )
        logger.info("runtime.device=auto resolved to %s", resolved)
        device = resolved

    if device.startswith("cuda"):
        if not torch.cuda.is_available():
            raise ModelError(
                "CUDA is not available. Install the CUDA build of PyTorch that "
                "matches your driver from https://pytorch.org/get-started/locally/ "
                f"(this process has torch.version.cuda={torch.version.cuda!r}), "
                "then check that nvidia-smi lists the card."
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
    if device == "mps" and not _mps_available():
        raise ModelError("MPS was requested but torch.backends.mps is not available")
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
                "bf16_supported": _bf16_native(),
                "tf32_supported": _tf32_supported(),
            }
        )
    elif device.type == "mps":
        info["device_name"] = "Apple Metal (MPS)"
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


def _dtype_keyword() -> str:
    """Return the keyword this transformers version uses for weight dtype.

    Transformers 5 renamed ``torch_dtype`` to ``dtype`` and still accepts the
    old name. Transformers 4 accepts only ``torch_dtype``; passing ``dtype``
    there is silently swallowed into the config and the model loads in float32,
    so the name has to be chosen rather than guessed.
    """
    import transformers

    try:
        major = int(transformers.__version__.split(".", 1)[0])
    except (AttributeError, ValueError):
        major = 5
    return "dtype" if major >= 5 else "torch_dtype"


def _load_automodel(
    settings: Settings, dtype: torch.dtype, attn_implementation: str
) -> nn.Module:
    from transformers import AutoModel

    dtype_keyword = _dtype_keyword()
    base_kwargs: dict[str, Any] = {
        "local_files_only": True,
        "trust_remote_code": False,
    }
    attempts: list[dict[str, Any]] = [
        {
            **base_kwargs,
            dtype_keyword: dtype,
            "attn_implementation": attn_implementation,
            "low_cpu_mem_usage": True,
        },
        {
            **base_kwargs,
            dtype_keyword: dtype,
            "attn_implementation": attn_implementation,
        },
        {
            **base_kwargs,
            dtype_keyword: dtype,
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
    dtype, dtype_name = resolve_dtype(settings.model.dtype, device)
    attn_implementation = resolve_attn_implementation(
        settings.model.attn_implementation
    )
    if settings.model.dtype == "auto" or settings.model.attn_implementation == "auto":
        logger.info(
            "auto runtime: dtype=%s attention=%s on %s",
            dtype_name,
            attn_implementation,
            device,
        )
    model = _load_automodel(settings, dtype, attn_implementation)
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
        attn_implementation=attn_implementation,
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
