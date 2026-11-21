#!/usr/bin/env python3
"""Upload, verify and download the cleaned PHARMEAZOR corpus through R2.

This is the cleaning-lab entry point. The transfer engine lives in the sibling
collection lab (``tooling/retrieval-lab/r2_upload.py``) together with the R2
connection handling. This wrapper fixes the defaults for the cleaned corpus:

* source:   ``tooling/cleaning-lab/output/``
* prefix:   ``cleaning-lab/``
* download: ``tooling/cleaning-lab/downloads/``

The command line is identical to the collection lab's uploader; see
``R2_UPLOAD.md`` or run ``python r2_upload.py --help``.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Sequence

TOOL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = TOOL_ROOT.parents[1]
OUTPUT_ROOT = TOOL_ROOT / "output"
DOWNLOAD_ROOT = TOOL_ROOT / "downloads"
ENGINE_PATH = REPO_ROOT / "tooling" / "retrieval-lab" / "r2_upload.py"
PREFIX = "cleaning-lab"
COMMANDS = frozenset({"upload", "verify", "download"})
VALUE_FLAGS = frozenset(
    {
        "--env-file",
        "--source",
        "--prefix",
        "--bucket",
        "--dest",
        "--workers",
        "--limit",
        "--report",
    }
)


def _load_engine():
    """Load the collection lab's transfer engine without installing it."""
    if not ENGINE_PATH.is_file():
        raise SystemExit(
            f"error: R2 transfer engine not found: {ENGINE_PATH}\n"
            "The cleaning lab reuses the collection lab's uploader."
        )
    spec = importlib.util.spec_from_file_location("_pharmeazor_r2_upload", ENGINE_PATH)
    if spec is None or spec.loader is None:
        raise SystemExit(f"error: cannot load {ENGINE_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


engine = _load_engine()
# Keep the engine aligned with this lab even when a caller uses its attributes
# instead of going through main().
engine.PROCESSED_ROOT = OUTPUT_ROOT
engine.DEFAULT_DOWNLOAD_ROOT = DOWNLOAD_ROOT

_engine_build_parser = engine.build_parser


def _build_parser():
    """Rewrite the engine's help text with this lab's defaults."""
    parser = _engine_build_parser()
    parser.description = (
        "Upload, verify or download the cleaned PHARMEAZOR corpus through "
        "Cloudflare R2 (S3-compatible API)."
    )
    parser.epilog = (
        "Configuration is read from .env.local (S3_ACCESS_KEY_ID, "
        "S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_REGION, STORAGE_BUCKET).\n"
        "Secret values are never printed.\n\n"
        f"Defaults for this lab: source {OUTPUT_ROOT}, prefix {PREFIX}/, "
        f"downloads {DOWNLOAD_ROOT}.\n\n"
        "Examples:\n"
        "  python r2_upload.py --dry-run\n"
        "  python r2_upload.py --checksum\n"
        "  python r2_upload.py verify\n"
        "  python r2_upload.py download\n"
    )
    for action in parser._actions:
        if action.dest == "source":
            action.help = f"local corpus directory (default: {OUTPUT_ROOT})"
        elif action.dest == "prefix":
            action.help = f"object key prefix (default: {PREFIX})"
        elif action.dest == "dest":
            action.help = f"download directory (default: {DOWNLOAD_ROOT})"
    return parser


engine.build_parser = _build_parser


def _command(args: Sequence[str]) -> str:
    """Return the positional command, ignoring option values."""
    index = 0
    while index < len(args):
        argument = args[index]
        if argument in COMMANDS:
            return argument
        if argument in VALUE_FLAGS:
            index += 2
            continue
        if any(argument.startswith(f"{flag}=") for flag in VALUE_FLAGS):
            index += 1
            continue
        index += 1
    return "upload"


def defaulted_argv(argv: Sequence[str] | None = None) -> list[str]:
    """Prepend this lab's source, prefix and download defaults when absent."""
    args = list(sys.argv[1:] if argv is None else argv)
    has_source = any(a == "--source" or a.startswith("--source=") for a in args)
    has_prefix = any(a == "--prefix" or a.startswith("--prefix=") for a in args)
    has_dest = any(a == "--dest" or a.startswith("--dest=") for a in args)
    defaults: list[str] = []
    if not has_source:
        defaults.extend(("--source", str(OUTPUT_ROOT)))
    if not has_prefix:
        defaults.extend(("--prefix", PREFIX))
    if _command(args) == "download" and not has_dest:
        defaults.extend(("--dest", str(DOWNLOAD_ROOT)))
    return [*defaults, *args]


def main(argv: Sequence[str] | None = None) -> int:
    return engine.main(defaulted_argv(argv))


if __name__ == "__main__":
    raise SystemExit(main())
