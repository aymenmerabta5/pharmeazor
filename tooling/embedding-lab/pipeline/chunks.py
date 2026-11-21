"""Read the cleaning-lab chunk file, tokenize it, and plan GPU batches.

The input contract is intentionally narrow. Every row must have:

* ``chunk_id`` — stable identity (artifact + section + ordinal + index),
* ``text`` — the contextualized chunk text (note + body) to embed,
* ``text_sha256`` — SHA-256 of ``text``.

``notes.jsonl`` is explicitly rejected: it is a note-only sidecar with no chunk
text and duplicate chunk ids. Embedding it would index notes, not chunks.

Batching has two jobs:

1. keep the tokenizer off the critical path (the prefetcher pads and pins the
   next batches while the GPU works), and
2. group similar-length chunks so an 8 GB card does not spend most of its
   compute on padding.
"""

from __future__ import annotations

import hashlib
import json
import queue
import threading
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any, Iterable, Iterator, Sequence

from settings import DUPLICATE_POLICIES

EMBED_INPUT_NAME = "embed-input.jsonl"
NOTES_NAME = "notes.jsonl"


class InputError(ValueError):
    """Raised when the chunk file is missing, malformed, or note-only."""


@dataclass(frozen=True)
class ChunkRecord:
    row: int
    line_number: int
    chunk_id: str
    artifact_id: str
    section_code: str
    language: str
    context_key: str
    text: str
    text_sha256: str


@dataclass(frozen=True)
class ChunkSet:
    path: Path
    file_sha256: str
    file_bytes: int
    records: tuple[ChunkRecord, ...]
    rows_read: int
    duplicates_skipped: int
    max_text_chars: int

    @property
    def rows(self) -> int:
        return len(self.records)

    def summary(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "sha256": self.file_sha256,
            "bytes": self.file_bytes,
            "rows_read": self.rows_read,
            "rows": self.rows,
            "duplicates_skipped": self.duplicates_skipped,
            "max_text_chars": self.max_text_chars,
        }


@dataclass(frozen=True)
class TokenStats:
    rows: int
    total_tokens: int
    min_tokens: int
    median_tokens: int
    p95_tokens: int
    max_tokens: int
    max_length: int
    truncated: tuple[dict[str, Any], ...]

    def summary(self) -> dict[str, Any]:
        return {
            "rows": self.rows,
            "total_tokens": self.total_tokens,
            "min_tokens": self.min_tokens,
            "median_tokens": self.median_tokens,
            "p95_tokens": self.p95_tokens,
            "max_tokens": self.max_tokens,
            "max_length": self.max_length,
            "truncated": len(self.truncated),
        }


@dataclass(frozen=True)
class BatchPlan:
    rows: tuple[int, ...]
    lengths: tuple[int, ...]
    padded_length: int

    @property
    def token_count(self) -> int:
        return sum(self.lengths)

    @property
    def padded_tokens(self) -> int:
        return self.padded_length * len(self.rows)


# ---------------------------------------------------------------------------
# Input resolution
# ---------------------------------------------------------------------------


def _notes_only_error(path: Path) -> InputError:
    return InputError(
        f"{path} contains only contextualization notes "
        "(context_key, chunk_id, note) and no chunk text. Embedding it would "
        "index notes instead of chunks, and the file also contains duplicate "
        "chunk ids. Use the sibling embed-input.jsonl, which carries "
        "chunk_id, text and text_sha256. Omit --input or pass that file."
    )


def resolve_input_path(path: Path | str) -> Path:
    """Resolve a file or a directory to the embedding input file.

    A directory is accepted for convenience; ``embed-input.jsonl`` wins over
    ``notes.jsonl``. Passing ``notes.jsonl`` directly fails with an explanation
    instead of producing a note-only index.
    """
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()

    if candidate.is_dir():
        embed_input = candidate / EMBED_INPUT_NAME
        notes = candidate / NOTES_NAME
        if embed_input.is_file():
            return embed_input
        if notes.is_file():
            raise _notes_only_error(notes)
        raise InputError(
            f"no {EMBED_INPUT_NAME} or {NOTES_NAME} in directory: {candidate}"
        )

    if candidate.name.lower() == NOTES_NAME:
        raise _notes_only_error(candidate)

    if not candidate.is_file():
        raise InputError(f"input file not found: {candidate}")

    return candidate


# ---------------------------------------------------------------------------
# Reading and validation
# ---------------------------------------------------------------------------


def sha256_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(chunk_size)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def _derive_ids(chunk_id: str) -> tuple[str, str]:
    artifact_id, separator, remainder = chunk_id.partition("#")
    if not separator or not remainder:
        return chunk_id, ""
    section = remainder.split("#", 1)[0]
    # chunk_id = artifact#section-ordinal#index; the ordinal is not part of
    # the section code, and section codes may themselves contain underscores.
    section_code = section.rsplit("-", 1)[0] if "-" in section else section
    return artifact_id, section_code


def _parse_row(
    payload: dict[str, Any],
    *,
    path: Path,
    line_number: int,
    require_text_sha256: bool,
) -> ChunkRecord:
    chunk_id = payload.get("chunk_id")
    if not isinstance(chunk_id, str) or not chunk_id.strip():
        raise InputError(f"{path}:{line_number}: missing or empty 'chunk_id'")

    text = payload.get("text")
    if not isinstance(text, str):
        if isinstance(payload.get("note"), str):
            raise _notes_only_error(path)
        raise InputError(f"{path}:{line_number}: missing string 'text' for {chunk_id}")
    if not text.strip():
        raise InputError(f"{path}:{line_number}: empty 'text' for {chunk_id}")

    text_sha256 = payload.get("text_sha256")
    if require_text_sha256:
        if not isinstance(text_sha256, str) or not text_sha256:
            raise InputError(
                f"{path}:{line_number}: missing 'text_sha256' for {chunk_id}"
            )
        actual = hashlib.sha256(text.encode("utf-8")).hexdigest()
        if actual != text_sha256:
            raise InputError(
                f"{path}:{line_number}: text_sha256 mismatch for {chunk_id} "
                f"(expected {text_sha256}, got {actual})"
            )
    elif not isinstance(text_sha256, str):
        text_sha256 = ""

    artifact_id, section_code = _derive_ids(chunk_id)
    language = payload.get("language")
    context_key = payload.get("context_key")

    return ChunkRecord(
        row=-1,
        line_number=line_number,
        chunk_id=chunk_id,
        artifact_id=artifact_id,
        section_code=section_code,
        language=language if isinstance(language, str) else "",
        context_key=context_key if isinstance(context_key, str) else "",
        text=text,
        text_sha256=text_sha256,
    )


def read_chunks(
    path: Path | str,
    *,
    duplicate_policy: str = "error",
    require_text_sha256: bool = True,
    max_rows: int = 0,
    limit: int = 0,
    offset: int = 0,
) -> ChunkSet:
    """Read, validate, and de-duplicate the embedding input.

    Rows are returned in file order. Length grouping happens later, so the
    output row order stays stable across runs and diffs stay readable.
    """
    if duplicate_policy not in DUPLICATE_POLICIES:
        raise InputError(
            f"duplicate_policy must be one of: {', '.join(sorted(DUPLICATE_POLICIES))}"
        )
    if offset < 0:
        raise InputError("offset must be >= 0")
    if limit < 0:
        raise InputError("limit must be >= 0")

    resolved = resolve_input_path(path)
    effective_limit = min(
        [value for value in (max_rows, limit) if value > 0], default=0
    )

    seen: dict[str, ChunkRecord] = {}
    rows_read = 0
    duplicates_skipped = 0
    max_text_chars = 0

    with resolved.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            rows_read += 1
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as exc:
                raise InputError(f"{resolved}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(payload, dict):
                raise InputError(f"{resolved}:{line_number}: expected a JSON object")

            record = _parse_row(
                payload,
                path=resolved,
                line_number=line_number,
                require_text_sha256=require_text_sha256,
            )
            previous = seen.get(record.chunk_id)
            if previous is not None:
                if duplicate_policy == "error":
                    raise InputError(
                        f"{resolved}:{line_number}: duplicate chunk_id "
                        f"{record.chunk_id!r} (first seen on line "
                        f"{previous.line_number}); use --on-duplicate first/last "
                        "only for exploratory runs"
                    )
                duplicates_skipped += 1
                if duplicate_policy == "first":
                    continue
                # `last`: replace the payload but keep the original insertion
                # position so the output order remains stable.
            seen[record.chunk_id] = record
            max_text_chars = max(max_text_chars, len(record.text))

    records = list(seen.values())
    if offset:
        records = records[offset:]
    if effective_limit:
        records = records[:effective_limit]

    selected = tuple(
        ChunkRecord(
            row=index,
            line_number=record.line_number,
            chunk_id=record.chunk_id,
            artifact_id=record.artifact_id,
            section_code=record.section_code,
            language=record.language,
            context_key=record.context_key,
            text=record.text,
            text_sha256=record.text_sha256,
        )
        for index, record in enumerate(records)
    )

    if not selected:
        raise InputError(
            f"{resolved}: no chunk rows selected "
            f"(rows read: {rows_read}, offset: {offset}, limit: {effective_limit})"
        )

    return ChunkSet(
        path=resolved,
        file_sha256=sha256_file(resolved),
        file_bytes=resolved.stat().st_size,
        records=selected,
        rows_read=rows_read,
        duplicates_skipped=duplicates_skipped,
        max_text_chars=max_text_chars,
    )


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------


def _percentile(sorted_values: Sequence[int], fraction: float) -> int:
    if not sorted_values:
        return 0
    index = min(len(sorted_values) - 1, max(0, int(round(fraction * (len(sorted_values) - 1)))))
    return sorted_values[index]


def encode_texts(
    tokenizer: Any,
    records: Sequence[ChunkRecord],
    *,
    max_length: int,
    truncation: str = "error",
) -> tuple[list[list[int]], TokenStats]:
    """Tokenize every chunk and reject silent truncation by default.

    The tokenizer is fast (Rust) and parallel. Tokenizing the whole corpus once
    gives exact lengths for length-grouped batching without a second pass.
    """
    if truncation not in {"error", "truncate"}:
        raise InputError("truncation must be 'error' or 'truncate'")

    texts = [record.text for record in records]
    encoded = tokenizer(
        texts,
        add_special_tokens=True,
        truncation=False,
        return_attention_mask=False,
        return_token_type_ids=False,
    )
    token_ids = encoded["input_ids"]

    lengths: list[int] = []
    truncated: list[dict[str, Any]] = []
    eos_token_id = getattr(tokenizer, "eos_token_id", None)

    for record, ids in zip(records, token_ids):
        original = len(ids)
        if original > max_length:
            if truncation == "error":
                raise InputError(
                    f"chunk {record.chunk_id} is {original} BGE-M3 tokens, above "
                    f"model.max_length={max_length}. Raise model.max_length or "
                    "set model.truncation=truncate deliberately."
                )
            if eos_token_id is not None and ids and ids[-1] == eos_token_id:
                ids = ids[: max_length - 1] + [eos_token_id]
            else:
                ids = ids[:max_length]
            truncated.append(
                {
                    "chunk_id": record.chunk_id,
                    "original_tokens": original,
                    "kept_tokens": len(ids),
                }
            )
        lengths.append(len(ids))

    ordered = sorted(lengths)
    stats = TokenStats(
        rows=len(lengths),
        total_tokens=sum(lengths),
        min_tokens=ordered[0] if ordered else 0,
        median_tokens=int(median(ordered)) if ordered else 0,
        p95_tokens=_percentile(ordered, 0.95),
        max_tokens=ordered[-1] if ordered else 0,
        max_length=max_length,
        truncated=tuple(truncated),
    )
    return token_ids, stats


# ---------------------------------------------------------------------------
# Batch planning
# ---------------------------------------------------------------------------


def _round_up(value: int, multiple: int) -> int:
    if multiple <= 1:
        return value
    return ((value + multiple - 1) // multiple) * multiple


def plan_batches(
    token_ids: Sequence[Sequence[int]],
    *,
    batch_size: int,
    max_batch_tokens: int,
    pad_multiple: int,
    max_length: int,
    length_grouped: bool,
) -> list[BatchPlan]:
    """Turn token ids into batches capped by item count and padded tokens.

    Length grouping sorts longest-first, so the first item in a batch is also
    the padded length of the whole batch. That makes the token cap exact and
    avoids the classic "one long chunk pads 63 short ones" waste.
    """
    if not token_ids:
        return []

    padded_lengths = [
        min(max_length, max(1, _round_up(len(ids), pad_multiple)))
        for ids in token_ids
    ]

    plans: list[BatchPlan] = []

    def flush(rows: list[int], padded_length: int) -> None:
        if rows:
            plans.append(
                BatchPlan(
                    rows=tuple(rows),
                    lengths=tuple(len(token_ids[row]) for row in rows),
                    padded_length=padded_length,
                )
            )

    if length_grouped:
        order = sorted(
            range(len(token_ids)), key=lambda index: padded_lengths[index], reverse=True
        )
        rows: list[int] = []
        current_max = 0
        for index in order:
            length = padded_lengths[index]
            candidate_max = max(current_max, length)
            if rows and (
                len(rows) >= batch_size
                or candidate_max * (len(rows) + 1) > max_batch_tokens
            ):
                flush(rows, current_max)
                rows = []
                current_max = 0
                candidate_max = length
            rows.append(index)
            current_max = candidate_max
        flush(rows, current_max)
    else:
        rows = []
        current_max = 0
        for index in range(len(token_ids)):
            length = padded_lengths[index]
            candidate_max = max(current_max, length)
            if rows and (
                len(rows) >= batch_size
                or candidate_max * (len(rows) + 1) > max_batch_tokens
            ):
                flush(rows, current_max)
                rows = []
                current_max = 0
                candidate_max = length
            rows.append(index)
            current_max = candidate_max
        flush(rows, current_max)

    return plans


# ---------------------------------------------------------------------------
# Tensor preparation and prefetching
# ---------------------------------------------------------------------------


def batch_tensors(
    tokenizer: Any,
    token_ids: Sequence[Sequence[int]],
    plan: BatchPlan,
    *,
    pin_memory: bool,
) -> tuple[Any, Any]:
    """Pad one batch to its planned length and optionally pin it.

    Pinning lets the main thread issue a non-blocking host-to-device copy while
    the previous batch is still on the GPU.
    """
    features = [{"input_ids": list(token_ids[row])} for row in plan.rows]
    batch = tokenizer.pad(
        features,
        padding="max_length",
        max_length=plan.padded_length,
        return_tensors="pt",
        return_attention_mask=True,
    )
    input_ids = batch["input_ids"]
    attention_mask = batch["attention_mask"]
    if pin_memory:
        input_ids = input_ids.pin_memory()
        attention_mask = attention_mask.pin_memory()
    return input_ids, attention_mask


_SENTINEL = object()


class _PrefetchFailure:
    def __init__(self, error: BaseException) -> None:
        self.error = error


class BatchPrefetcher:
    """A one-thread, bounded queue that pads/pins the next batches.

    Tokenization is already done; this overlaps the remaining CPU work and the
    pinned-memory allocation with GPU compute. The queue is bounded, so a fast
    GPU cannot make the prefetcher balloon memory.
    """

    def __init__(
        self,
        tokenizer: Any,
        token_ids: Sequence[Sequence[int]],
        plans: Iterable[BatchPlan],
        *,
        pin_memory: bool,
        max_prefetch: int,
    ) -> None:
        self._tokenizer = tokenizer
        self._token_ids = token_ids
        self._plans = plans
        self._pin_memory = pin_memory
        self._max_prefetch = max_prefetch
        self._queue: queue.Queue[Any] = queue.Queue(maxsize=max_prefetch)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def __enter__(self) -> "BatchPrefetcher":
        self._thread = threading.Thread(
            target=self._produce, name="embedding-prefetch", daemon=True
        )
        self._thread.start()
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def _put(self, item: Any) -> bool:
        while not self._stop.is_set():
            try:
                self._queue.put(item, timeout=0.5)
                return True
            except queue.Full:
                continue
        return False

    def _produce(self) -> None:
        try:
            for plan in self._plans:
                if self._stop.is_set():
                    return
                item = batch_tensors(
                    self._tokenizer,
                    self._token_ids,
                    plan,
                    pin_memory=self._pin_memory,
                )
                if not self._put((plan, item)):
                    return
            self._put(_SENTINEL)
        except BaseException as error:  # noqa: BLE001 - forwarded to the consumer
            self._put(_PrefetchFailure(error))

    def __iter__(self) -> Iterator[tuple[BatchPlan, tuple[Any, Any]]]:
        while True:
            item = self._queue.get()
            if item is _SENTINEL:
                return
            if isinstance(item, _PrefetchFailure):
                raise item.error
            yield item

    def close(self) -> None:
        self._stop.set()
        # Drain so a producer blocked on put() can observe the stop flag.
        while True:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                break
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None


def iter_prepared_batches(
    tokenizer: Any,
    token_ids: Sequence[Sequence[int]],
    plans: Sequence[BatchPlan],
    *,
    pin_memory: bool,
    max_prefetch: int,
) -> Iterator[tuple[BatchPlan, tuple[Any, Any]]]:
    """Yield padded batches, optionally through the background prefetcher."""
    if max_prefetch <= 0:
        for plan in plans:
            yield plan, batch_tensors(
                tokenizer, token_ids, plan, pin_memory=pin_memory
            )
        return

    with BatchPrefetcher(
        tokenizer,
        token_ids,
        plans,
        pin_memory=pin_memory,
        max_prefetch=max_prefetch,
    ) as prefetcher:
        yield from prefetcher
