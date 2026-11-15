"""Near-duplicate detection for the cleaned documents.

DailyMed publishes dozens of labels for the same INN from different
manufacturers. They are not byte-identical, so a hash alone is insufficient.
We use 5-word shingles and Jaccard similarity, but only inside the same
source/document-type/medicine group, and never collapse official Algerian
documents unless they are effectively identical.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

from .sections import normalize_key


@dataclass
class DuplicateInfo:
    status: str  # clean | duplicate
    duplicate_of: str | None = None
    similarity: float | None = None
    reason: str | None = None


def _shingles(text: str, size: int = 5) -> set[int]:
    tokens = normalize_key(text).split()
    if len(tokens) < size:
        return {hash(" ".join(tokens))} if tokens else set()
    return {hash(" ".join(tokens[i : i + size])) for i in range(len(tokens) - size + 1)}


def _jaccard(left: set[int], right: set[int]) -> float:
    if not left or not right:
        return 0.0
    intersection = len(left & right)
    if not intersection:
        return 0.0
    return intersection / len(left | right)


def _publication_ordinal(value: str | None) -> int:
    if not value:
        return 0
    try:
        return date.fromisoformat(value).toordinal()
    except ValueError:
        return 0


def _canonical_key(record: dict[str, Any]) -> tuple[Any, ...]:
    return (
        record.get("authority_level", 99),
        -_publication_ordinal(record.get("publication_date")),
        -len(record.get("body", "")),
        record.get("artifact_id", ""),
    )


def deduplicate(
    records: list[dict[str, Any]],
    *,
    shingle_words: int = 5,
    near_threshold: float = 0.93,
    official_threshold: float = 0.985,
) -> dict[str, DuplicateInfo]:
    """Return ``artifact_id -> DuplicateInfo``. Input records are not mutated."""
    groups: dict[tuple[Any, ...], list[dict[str, Any]]] = {}
    for record in records:
        key = (
            record.get("source_id"),
            record.get("document_type"),
            record.get("part_id"),
            record.get("language"),
            tuple(sorted(record.get("medicine_ids") or [])),
            # Different strengths of the same product often share 93-96% of
            # their text. Never collapse them: posology is strength-specific.
            tuple(sorted(record.get("strengths") or [])),
        )
        groups.setdefault(key, []).append(record)

    result: dict[str, DuplicateInfo] = {
        record["artifact_id"]: DuplicateInfo(status="clean") for record in records
    }

    for group in groups.values():
        if len(group) < 2:
            continue
        ordered = sorted(group, key=_canonical_key)
        kept: list[tuple[dict[str, Any], set[int]]] = []
        for record in ordered:
            body = record.get("body", "")
            content_hash = record.get("content_sha256")
            threshold = (
                official_threshold
                if int(record.get("authority_level", 99)) <= 2
                else near_threshold
            )
            best: tuple[float, dict[str, Any], str] | None = None
            for canonical, canonical_shingles in kept:
                if content_hash and canonical.get("content_sha256") == content_hash:
                    best = (1.0, canonical, "identical_content")
                    break
                # Cheap length guard before the set intersection.
                ratio = len(body) / max(1, len(canonical.get("body", "")))
                if ratio < 0.55 or ratio > 1.8:
                    continue
                similarity = _jaccard(_shingles(body, shingle_words), canonical_shingles)
                if similarity >= threshold and (best is None or similarity > best[0]):
                    best = (similarity, canonical, "near_duplicate")
            if best is not None:
                similarity, canonical, reason = best
                result[record["artifact_id"]] = DuplicateInfo(
                    status="duplicate",
                    duplicate_of=canonical["artifact_id"],
                    similarity=round(similarity, 4),
                    reason=reason,
                )
            else:
                kept.append((record, _shingles(body, shingle_words)))

    return result
