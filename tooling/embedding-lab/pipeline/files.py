"""Filesystem and model-presence helpers that do not import torch.

``run.py info`` and ``run.py validate`` must work on a machine where the CUDA
stack is broken, so the checks they need live here rather than in
``pipeline.model``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ALLOW_PATTERNS = [
    "config.json",
    "config_sentence_transformers.json",
    "modules.json",
    "pytorch_model.bin",
    "model.safetensors",
    "model.safetensors.index.json",
    "sentence_bert_config.json",
    "sentencepiece.bpe.model",
    "special_tokens_map.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "1_Pooling/config.json",
]

REQUIRED_CONFIG_FILES = ("config.json",)
REQUIRED_TOKENIZER_FILES = ("tokenizer.json", "sentencepiece.bpe.model")
WEIGHT_FILES = ("model.safetensors", "pytorch_model.bin", "model.safetensors.index.json")
DOWNLOAD_METADATA = "download.json"


class ModelError(RuntimeError):
    """Raised when the model cannot be found, loaded, or used."""


class OutputExistsError(RuntimeError):
    """Raised when an artifact exists and overwrite was not requested."""


def missing_model_files(local_dir: Path) -> list[str]:
    if not local_dir.is_dir():
        return ["<model directory>"]
    missing: list[str] = []
    for name in REQUIRED_CONFIG_FILES:
        if not (local_dir / name).is_file():
            missing.append(name)
    if not any((local_dir / name).is_file() for name in WEIGHT_FILES):
        missing.append("model.safetensors|pytorch_model.bin")
    if not any((local_dir / name).is_file() for name in REQUIRED_TOKENIZER_FILES):
        missing.append("tokenizer.json|sentencepiece.bpe.model")
    return missing


def model_present(local_dir: Path) -> bool:
    return not missing_model_files(local_dir)


def read_download_metadata(local_dir: Path) -> dict[str, Any]:
    path = local_dir / DOWNLOAD_METADATA
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def local_revision(local_dir: Path, fallback: str) -> str:
    metadata = read_download_metadata(local_dir)
    revision = metadata.get("resolved_revision")
    return revision if isinstance(revision, str) and revision else fallback


def directory_size(path: Path) -> int:
    total = 0
    for item in path.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                pass
    return total


def ensure_output_available(output_dir: Path, *, overwrite: bool) -> None:
    if not output_dir.exists():
        return
    if not output_dir.is_dir():
        raise OutputExistsError(f"output path is not a directory: {output_dir}")
    entries = list(output_dir.iterdir())
    if entries and not overwrite:
        raise OutputExistsError(
            f"output directory already contains files: {output_dir}. "
            "Pass --force to replace the artifact."
        )
