"""Structured audit trail: one JSON record per attempt.

The workflow document requires that every attempt records timestamp,
medicine, source, URL, method, status, file path, hash and error details.
The human-readable `collection.log` stays for reading; this file is the
machine-checkable audit trail (one JSON object per line, append-only).
"""
import json
import time
from pathlib import Path

from config import LOG_DIR

AUDIT_PATH = LOG_DIR / "attempts.jsonl"

FIELDS = [
    "timestamp", "medicine_id", "source_id", "target_url", "method",
    "status", "file_path", "sha256", "file_size", "content_type",
    "check_id", "decision", "reason", "duration_ms", "error",
]


def log_attempt(**fields) -> dict:
    record = {f: fields.get(f, "") for f in FIELDS}
    record["timestamp"] = record.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%S")
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(AUDIT_PATH, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        pass
    return record


def read_attempts(path: Path = AUDIT_PATH) -> list:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out


def summarise(attempts: list) -> dict:
    by_status, by_source, by_medicine = {}, {}, {}
    for a in attempts:
        by_status[a.get("status", "")] = by_status.get(a.get("status", ""), 0) + 1
        by_source[a.get("source_id", "")] = by_source.get(a.get("source_id", ""), 0) + 1
        by_medicine[a.get("medicine_id", "")] = by_medicine.get(a.get("medicine_id", ""), 0) + 1
    return {
        "attempts": len(attempts),
        "by_status": by_status,
        "by_source": by_source,
        "by_medicine": by_medicine,
        "first": attempts[0]["timestamp"] if attempts else "",
        "last": attempts[-1]["timestamp"] if attempts else "",
    }
