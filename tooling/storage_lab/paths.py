"""Repository paths, limits and file-type constants shared by the lab."""

from __future__ import annotations

import re
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parent
TOOL_ROOT = LAB_ROOT.parent
REPO_ROOT = TOOL_ROOT.parent
RETRIEVAL_ROOT = TOOL_ROOT / "retrieval-lab"
CLEANING_ROOT = TOOL_ROOT / "cleaning-lab"
EMBEDDING_ROOT = TOOL_ROOT / "embedding-lab"
DEFAULT_ENV_FILE = REPO_ROOT / ".env.local"
DEFAULT_DOWNLOAD_ROOT = TOOL_ROOT / "downloads"
PROCESSED_ROOT = CLEANING_ROOT / "output"
EMBEDDING_OUTPUT = EMBEDDING_ROOT / "output"
DATA_ROOT = RETRIEVAL_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
BUCKET_MANIFEST_KEY = "manifest.json"

PLACEHOLDER_PREFIX = "REPLACE_WITH"
MAX_KEY_BYTES = 1024
STREAM_CHUNK_BYTES = 1024 * 1024
WINDOWS_RESERVED = re.compile(r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$", re.IGNORECASE)
SKIP_DIRS = frozenset(
    {
        ".cache",
        ".git",
        ".hg",
        ".svn",
        ".turbo",
        ".venv",
        "__pycache__",
        "node_modules",
    }
)
SKIP_FILES = frozenset({".DS_Store", "Thumbs.db", "desktop.ini"})
CONTENT_TYPES = {
    ".csv": "text/csv",
    ".html": "text/html",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
TEXTUAL_TYPES = frozenset(
    {
        "application/json",
        "application/x-ndjson",
        "application/xml",
    }
)

_ASSIGNMENT = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")
