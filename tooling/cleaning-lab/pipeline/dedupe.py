"""Near-duplicate detection for the cleaned documents.

DailyMed publishes dozens of labels for the same INN from different
manufacturers. They are not byte-identical, so a hash alone is insufficient.
We use 5-word shingles and Jaccard similarity, but only inside the same
source/document-type/medicine group, and never collapse official Algerian
documents unless they are effectively identical.

Strengths are part of a product's identity: the metadata strength list puts
different presentations in different groups, and - because that list can be
empty when the collector's title carries no dosage - the strengths each
document declares in its own title and composition section are compared
before any collapse. SMPC templates are so similar across strengths that a
0.99 Jaccard score does not prove "same product presentation"; a declared
strength mismatch vetoes the merge regardless of similarity.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

from .sections import normalize_key
from .text_utils import extract_strengths

# Sections where a document states its own presentation, not a dose it
# mentions in passing (posology text mentions every titration step, so it
# must stay out of this comparison).
_STRENGTH_SECTION_CODES = frozenset(
    {"composition", "dosage_forms", "denomination", "description"}
)


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


def declared_strengths(record: dict[str, Any]) -> frozenset[str]:
    """The strengths a document declares for its own presentation.

    Looked up in the document's title and in its composition / dosage-forms
    sections (using the char offsets recorded at render time), not in the
    posology, which mentions every titration step of every strength.
    Combined tokens such as "300MG/12.5MG" are split so a title and a
    composition section compare equal when they describe the same product.
    """
    values: list[str] = [record.get("title", "") or ""]
    body = record.get("body", "") or ""
    sections = record.get("sections") or []
    for section in sections:
        if str(section.get("code", "")) not in _STRENGTH_SECTION_CODES:
            continue
        try:
            start = int(section.get("start_char", -1))
            end = int(section.get("end_char", -1))
        except (TypeError, ValueError):
            continue
        if 0 <= start < end <= len(body):
            values.append(body[start:end])
    parts: set[str] = set()
    for strength in extract_strengths(*values):
        pieces = strength.replace(",", ".").split("/")
        parts.update(piece for piece in pieces if piece)
    return frozenset(parts)


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
        kept: list[tuple[dict[str, Any], set[int], frozenset[str]]] = []
        for record in ordered:
            body = record.get("body", "")
            content_hash = record.get("content_sha256")
            declared = declared_strengths(record)
            threshold = (
                official_threshold
                if int(record.get("authority_level", 99)) <= 2
                else near_threshold
            )
            best: tuple[float, dict[str, Any], str] | None = None
            for canonical, canonical_shingles, canonical_declared in kept:
                if content_hash and canonical.get("content_sha256") == content_hash:
                    best = (1.0, canonical, "identical_content")
                    break
                # A declared strength mismatch is a different presentation
                # of the product: posology is strength-specific, so the two
                # documents must both survive whatever the template
                # similarity says.
                if declared and canonical_declared and declared != canonical_declared:
                    continue
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
                kept.append((record, _shingles(body, shingle_words), declared))

    return result
