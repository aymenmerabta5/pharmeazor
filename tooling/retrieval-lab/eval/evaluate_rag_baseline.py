#!/usr/bin/env python3
"""Offline lexical retrieval baseline for the PHARMEAZOR corpus.

This is the measurement half of the RAG baseline. It runs the same BM25
formula and the same accent-folding tokenizer as the production lexical arm
(`packages/services/src/retrieval/tokenize.ts` and
`packages/api/src/adapters/retrieval/postgres.ts`) over the exported 7,245
contextualized chunks. It does not call an embedding server, a reranker, a
database, or an LLM.

Two modes are measured on purpose:

* ``raw_chunk`` strips the model-written context note and indexes the chunk
  body only. This is the pre-contextual-retrieval baseline.
* ``contextual_chunk`` indexes the full exported text (note + body), which is
  the text the production ingest worker actually embeds and tokenizes.

The fixture contains 15 corpus-grounded questions copied from
``packages/benchmark/data/v1`` and 5 genuinely out-of-corpus questions whose
ingredients have zero occurrences in the corpus. The evaluator refuses to run
if the copied gold labels drift from the benchmark, if a gold chunk is absent
from the corpus, or if an out-of-corpus ingredient appears in the corpus.

Usage:
    python tooling/retrieval-lab/eval/evaluate_rag_baseline.py
    python tooling/retrieval-lab/eval/evaluate_rag_baseline.py --suite full
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
import re
import statistics
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Sequence

REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_DIR = Path(__file__).resolve().parent
DEFAULT_FIXTURE = EVAL_DIR / "fixtures" / "rag_baseline_questions.jsonl"
DEFAULT_MANIFEST = EVAL_DIR / "fixtures" / "manifest.json"
DEFAULT_CORPUS = REPO_ROOT / "tooling" / "cleaning-lab" / "output" / "context" / "embed-input.jsonl"
DEFAULT_GOLD = REPO_ROOT / "packages" / "benchmark" / "data" / "v1" / "gold_annotations.jsonl"
DEFAULT_BENCHMARK_QUESTIONS = (
    REPO_ROOT / "packages" / "benchmark" / "data" / "v1" / "questions.jsonl"
)
DEFAULT_OUTPUT = EVAL_DIR / "results" / "rag_baseline_baseline.json"
DEFAULT_MARKDOWN = EVAL_DIR / "results" / "rag_baseline_baseline.md"

# Mirrors packages/services/src/retrieval/tokenize.ts (lexical-fold-v1).
TERM_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)
MIN_TERM_LENGTH = 2
MAX_TERM_LENGTH = 48
MAX_QUERY_TERMS = 32

# Mirrors RETRIEVAL_LIMITS in packages/services/src/retrieval/policy.ts.
BM25_K1 = 1.2
BM25_B = 0.75
SEARCH_DEPTH = 50

Mode = Literal["raw_chunk", "contextual_chunk"]


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            try:
                rows.append(json.loads(stripped))
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {error}") from error
    return rows


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).lower()


def tokenize(text: str) -> list[str]:
    """The production lexical analyzer: NFKD, strip marks, lower-case."""
    terms: list[str] = []
    for match in TERM_PATTERN.finditer(fold(text)):
        term = match.group(0)
        if len(term) > MAX_TERM_LENGTH:
            continue
        if len(term) < MIN_TERM_LENGTH and not term.isdigit():
            continue
        terms.append(term)
    return terms


def query_terms(text: str) -> list[str]:
    seen: set[str] = set()
    terms: list[str] = []
    for term in tokenize(text):
        if term in seen:
            continue
        seen.add(term)
        terms.append(term)
        if len(terms) >= MAX_QUERY_TERMS:
            break
    return terms


def split_contextualized(text: str) -> tuple[str, str]:
    note, separator, body = text.partition("\n\n")
    if separator and note.lstrip().startswith("[FR]"):
        return note, body
    return "", text


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round(fraction * (len(ordered) - 1)))))
    return ordered[index]


# ---------------------------------------------------------------------------
# Corpus and BM25
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    artifact_id: str
    language: str
    section_code: str
    text: str
    body: str
    note: str


def load_corpus(path: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for row in read_jsonl(path):
        note, body = split_contextualized(row["text"])
        chunks.append(
            Chunk(
                chunk_id=row["chunk_id"],
                artifact_id=row["artifact_id"],
                language=row["language"],
                section_code=row["section_code"],
                text=row["text"],
                body=body,
                note=note,
            )
        )
    if not chunks:
        raise ValueError(f"no chunks found in {path}")
    duplicate_ids = len(chunks) - len({chunk.chunk_id for chunk in chunks})
    if duplicate_ids:
        raise ValueError(f"{duplicate_ids} duplicate chunk ids in {path}")
    return chunks


@dataclass(frozen=True)
class SearchHit:
    chunk_id: str
    score: float
    rank: int


class BM25Index:
    """BM25 over a fixed document list, matching the production SQL formula."""

    def __init__(
        self,
        documents: Sequence[str],
        chunk_ids: Sequence[str],
        *,
        k1: float = BM25_K1,
        b: float = BM25_B,
    ) -> None:
        if len(documents) != len(chunk_ids):
            raise ValueError("documents and chunk_ids must have the same length")
        self.chunk_ids = list(chunk_ids)
        self.k1 = k1
        self.b = b
        self.term_frequencies: list[collections.Counter[str]] = []
        self.lengths: list[int] = []
        document_frequency: collections.Counter[str] = collections.Counter()
        for document in documents:
            terms = tokenize(document)
            frequencies = collections.Counter(terms)
            self.term_frequencies.append(frequencies)
            self.lengths.append(len(terms))
            document_frequency.update(frequencies.keys())
        self.document_count = len(documents)
        self.average_length = mean(self.lengths)
        self.vocabulary_size = len(document_frequency)
        self.idf = {
            term: math.log(
                1 + (self.document_count - frequency + 0.5) / (frequency + 0.5)
            )
            for term, frequency in document_frequency.items()
        }

    def search(self, query: str, limit: int = SEARCH_DEPTH) -> list[SearchHit]:
        terms = query_terms(query)
        if not terms:
            return []
        scored: list[tuple[float, int]] = []
        for index, frequencies in enumerate(self.term_frequencies):
            score = 0.0
            length = self.lengths[index]
            denominator_base = self.k1 * (
                1 - self.b + self.b * length / max(self.average_length, 1e-9)
            )
            for term in terms:
                frequency = frequencies.get(term)
                if not frequency:
                    continue
                score += (
                    self.idf[term]
                    * frequency
                    * (self.k1 + 1)
                    / (frequency + denominator_base)
                )
            if score > 0:
                scored.append((score, index))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [
            SearchHit(chunk_id=self.chunk_ids[index], score=score, rank=rank)
            for rank, (score, index) in enumerate(scored[:limit], 1)
        ]


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def recall_at(relevant: Sequence[int], gold_count: int, k: int) -> float:
    return sum(relevant[:k]) / gold_count if gold_count else 0.0


def precision_at(relevant: Sequence[int], k: int) -> float:
    return sum(relevant[:k]) / k


def reciprocal_rank(relevant: Sequence[int], k: int) -> float:
    for rank, value in enumerate(relevant[:k], 1):
        if value:
            return 1.0 / rank
    return 0.0


def ndcg_at(relevant: Sequence[int], gold_count: int, k: int) -> float:
    dcg = sum(
        value / math.log2(rank + 1)
        for rank, value in enumerate(relevant[:k], 1)
    )
    ideal = [1] * min(gold_count, k)
    idcg = sum(value / math.log2(rank + 1) for rank, value in enumerate(ideal, 1))
    return dcg / idcg if idcg else 0.0


@dataclass
class QuestionResult:
    question_id: str
    source_question_id: str | None
    stratum: str
    language: str
    category: str
    question: str
    gold_ids: list[str]
    retrieved: list[SearchHit]
    relevance: list[int]
    ranks: dict[str, int | None]
    found: int

    @property
    def gold_count(self) -> int:
        return len(self.gold_ids)

    @property
    def first_relevant_rank(self) -> int | None:
        for rank, value in enumerate(self.relevance, 1):
            if value:
                return rank
        return None

    def metrics(self, k: int = 10) -> dict[str, float | int | None]:
        return {
            "gold_count": self.gold_count,
            "found_at_k": sum(self.relevance[:k]),
            "recall_at_k": recall_at(self.relevance, self.gold_count, k),
            "precision_at_k": precision_at(self.relevance, k),
            "reciprocal_rank_at_k": reciprocal_rank(self.relevance, k),
            "ndcg_at_k": ndcg_at(self.relevance, self.gold_count, k),
            "first_relevant_rank": self.first_relevant_rank,
        }


def aggregate(rows: Sequence[QuestionResult], k: int = 10) -> dict[str, Any]:
    return {
        "questions": len(rows),
        "recall_at_5": mean([recall_at(row.relevance, row.gold_count, 5) for row in rows]),
        "recall_at_10": mean([recall_at(row.relevance, row.gold_count, 10) for row in rows]),
        "recall_at_20": mean([recall_at(row.relevance, row.gold_count, 20) for row in rows]),
        "recall_at_50": mean([recall_at(row.relevance, row.gold_count, 50) for row in rows]),
        "precision_at_5": mean([precision_at(row.relevance, 5) for row in rows]),
        "precision_at_10": mean([precision_at(row.relevance, 10) for row in rows]),
        "mrr_at_10": mean([reciprocal_rank(row.relevance, 10) for row in rows]),
        "ndcg_at_10": mean([ndcg_at(row.relevance, row.gold_count, 10) for row in rows]),
        "hit_rate_at_10": mean(
            [1.0 if any(row.relevance[:10]) else 0.0 for row in rows]
        ),
        "zero_hit_questions": sum(1 for row in rows if row.found == 0),
        "mean_gold_chunks": mean([row.gold_count for row in rows]),
    }


def grouped_aggregate(
    rows: Sequence[QuestionResult], key: str
) -> dict[str, dict[str, Any]]:
    groups: dict[str, list[QuestionResult]] = collections.defaultdict(list)
    for row in rows:
        groups[str(getattr(row, key))].append(row)
    return {group: aggregate(group_rows) for group, group_rows in sorted(groups.items())}


def evaluate_mode(
    chunks: Sequence[Chunk],
    questions: Sequence[dict[str, Any]],
    gold_by_id: dict[str, dict[str, Any]],
    mode: Mode,
) -> tuple[list[QuestionResult], BM25Index]:
    documents = [chunk.text if mode == "contextual_chunk" else chunk.body for chunk in chunks]
    index = BM25Index(documents, [chunk.chunk_id for chunk in chunks])
    chunk_by_id = {chunk.chunk_id: chunk for chunk in chunks}
    results: list[QuestionResult] = []
    for question in questions:
        if question.get("stratum") != "in_corpus":
            continue
        gold_ids = list(dict.fromkeys(question["relevant_chunk_ids"]))
        benchmark_gold = gold_by_id[question["source_question_id"]]
        if gold_ids != list(dict.fromkeys(benchmark_gold["relevant_chunk_ids"])):
            raise ValueError(
                f"{question['question_id']}: gold labels drifted from "
                f"{question['source_question_id']}"
            )
        hits = index.search(question["question"], SEARCH_DEPTH)
        retrieved_ids = [hit.chunk_id for hit in hits]
        gold_set = set(gold_ids)
        relevance = [1 if chunk_id in gold_set else 0 for chunk_id in retrieved_ids]
        ranks = {
            gold_id: next(
                (rank for rank, chunk_id in enumerate(retrieved_ids, 1) if chunk_id == gold_id),
                None,
            )
            for gold_id in gold_ids
        }
        results.append(
            QuestionResult(
                question_id=question["question_id"],
                source_question_id=question.get("source_question_id"),
                stratum=question["stratum"],
                language=question["language"],
                category=question["category"],
                question=question["question"],
                gold_ids=gold_ids,
                retrieved=hits,
                relevance=relevance,
                ranks=ranks,
                found=sum(relevance),
            )
        )
    return results, index


def evaluate_out_of_corpus(
    chunks: Sequence[Chunk],
    questions: Sequence[dict[str, Any]],
    index: BM25Index,
) -> dict[str, Any]:
    chunk_by_id = {chunk.chunk_id: chunk for chunk in chunks}
    rows: list[dict[str, Any]] = []
    for question in questions:
        if question.get("stratum") != "out_of_corpus":
            continue
        hits = index.search(question["question"], SEARCH_DEPTH)
        top_hits = hits[:10]
        absence_terms = [
            tokenize(term) for term in question.get("absence_check_terms", [])
        ]
        leaked_terms: list[str] = []
        for hit in top_hits:
            body_terms = set(tokenize(chunk_by_id[hit.chunk_id].body))
            for term_tokens in absence_terms:
                if all(token in body_terms for token in term_tokens):
                    label = " ".join(term_tokens)
                    if label not in leaked_terms:
                        leaked_terms.append(label)
        rows.append(
            {
                "question_id": question["question_id"],
                "question": question["question"],
                "language": question["language"],
                "absent_ingredient": question.get("absent_ingredient"),
                "returned": len(hits),
                "top1_score": round(hits[0].score, 6) if hits else 0.0,
                "top10_max_score": round(max((hit.score for hit in top_hits), default=0.0), 6),
                "top1_chunk_id": hits[0].chunk_id if hits else None,
                "absence_term_leaks_in_top10": leaked_terms,
                "top10_chunk_ids": [hit.chunk_id for hit in top_hits],
            }
        )
    top1_scores = [row["top1_score"] for row in rows]
    return {
        "questions": len(rows),
        "empty_result_questions": sum(1 for row in rows if row["returned"] == 0),
        "mean_top1_score": mean(top1_scores),
        "median_top1_score": statistics.median(top1_scores) if top1_scores else 0.0,
        "max_top1_score": max(top1_scores) if top1_scores else 0.0,
        "leak_questions": sum(1 for row in rows if row["absence_term_leaks_in_top10"]),
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# Validation and reporting
# ---------------------------------------------------------------------------


def validate_fixture(
    questions: Sequence[dict[str, Any]],
    chunks: Sequence[Chunk],
    gold_by_id: dict[str, dict[str, Any]],
    expected_corpus_sha256: str | None,
    corpus_sha256: str,
    allow_corpus_mismatch: bool,
    require_out_of_corpus: bool = True,
) -> dict[str, Any]:
    if len(questions) < 15:
        raise ValueError(f"the baseline set has {len(questions)} questions; at least 15 required")
    in_corpus = [row for row in questions if row.get("stratum") == "in_corpus"]
    out_of_corpus = [row for row in questions if row.get("stratum") == "out_of_corpus"]
    if not in_corpus:
        raise ValueError("the baseline set must contain in_corpus rows")
    if require_out_of_corpus and not out_of_corpus:
        raise ValueError("the baseline set must contain out_of_corpus rows")
    if len({row["question_id"] for row in questions}) != len(questions):
        raise ValueError("question ids must be unique")
    if expected_corpus_sha256 and corpus_sha256 != expected_corpus_sha256:
        message = (
            f"corpus sha256 {corpus_sha256} does not match the fixture manifest "
            f"({expected_corpus_sha256})"
        )
        if not allow_corpus_mismatch:
            raise ValueError(message + "; pass --allow-corpus-mismatch to measure anyway")
        print(f"WARNING: {message}", file=sys.stderr)

    chunk_ids = {chunk.chunk_id for chunk in chunks}
    token_counts: collections.Counter[str] = collections.Counter()
    for chunk in chunks:
        token_counts.update(tokenize(chunk.text))

    missing_gold: list[str] = []
    for question in in_corpus:
        source_id = question.get("source_question_id")
        if source_id not in gold_by_id:
            raise ValueError(f"{question['question_id']}: unknown source question {source_id}")
        benchmark_gold = list(
            dict.fromkeys(gold_by_id[source_id]["relevant_chunk_ids"])
        )
        if list(dict.fromkeys(question["relevant_chunk_ids"])) != benchmark_gold:
            raise ValueError(
                f"{question['question_id']}: relevant_chunk_ids do not match {source_id}"
            )
        if not question["relevant_chunk_ids"]:
            raise ValueError(f"{question['question_id']}: in-corpus row has no gold chunks")
        for gold_id in question["relevant_chunk_ids"]:
            if gold_id not in chunk_ids:
                missing_gold.append(f"{question['question_id']}:{gold_id}")
    if missing_gold:
        raise ValueError(f"gold chunks absent from the corpus: {missing_gold}")

    absence: list[dict[str, Any]] = []
    for question in out_of_corpus:
        terms = question.get("absence_check_terms") or []
        if not terms:
            raise ValueError(f"{question['question_id']}: out-of-corpus row has no absence terms")
        if question.get("expected_behavior") != "ABSTAIN":
            raise ValueError(f"{question['question_id']}: expected_behavior must be ABSTAIN")
        if question.get("relevant_chunk_ids"):
            raise ValueError(f"{question['question_id']}: out-of-corpus row has gold chunks")
        counts = {term: sum(token_counts[token] for token in tokenize(term)) for term in terms}
        absence.append(
            {
                "question_id": question["question_id"],
                "terms": counts,
            }
        )
        if any(count > 0 for count in counts.values()):
            raise ValueError(
                f"{question['question_id']}: absence term occurs in the corpus: {counts}"
            )

    languages = collections.Counter(row["language"] for row in questions)
    categories = collections.Counter(row["category"] for row in questions)
    return {
        "question_count": len(questions),
        "in_corpus_count": len(in_corpus),
        "out_of_corpus_count": len(out_of_corpus),
        "languages": dict(sorted(languages.items())),
        "categories": dict(sorted(categories.items())),
        "absence_checks": absence,
    }


def mode_payload(rows: Sequence[QuestionResult]) -> dict[str, Any]:
    return {
        "metrics": aggregate(rows),
        "by_language": grouped_aggregate(rows, "language"),
        "by_category": grouped_aggregate(rows, "category"),
        "per_question": [
            {
                "question_id": row.question_id,
                "source_question_id": row.source_question_id,
                "language": row.language,
                "category": row.category,
                "question": row.question,
                "gold_ids": row.gold_ids,
                "gold_ranks": row.ranks,
                "found_at_10": sum(row.relevance[:10]),
                "metrics_at_10": row.metrics(10),
                "top10_chunk_ids": [hit.chunk_id for hit in row.retrieved[:10]],
                "retrieved_chunk_ids": [hit.chunk_id for hit in row.retrieved],
            }
            for row in rows
        ],
    }


def format_float(value: float | int | None) -> str:
    if value is None:
        return "—"
    if isinstance(value, int):
        return str(value)
    return f"{value:.4f}"


def markdown_report(payload: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# RAG baseline — offline lexical measurement")
    lines.append("")
    lines.append(f"Generated: `{payload['generated_at']}`")
    lines.append("")
    lines.append("## Corpus")
    lines.append("")
    corpus = payload["corpus"]
    lines.append(f"- Path: `{corpus['path']}`")
    lines.append(f"- SHA-256: `{corpus['sha256']}`")
    lines.append(f"- Chunks: {corpus['chunks']:,}")
    lines.append(f"- Artifacts: {corpus['artifacts']:,}")
    lines.append(f"- Contextual notes: {corpus['contextualized_chunks']:,}")
    lines.append(f"- Languages: {corpus['languages']}")
    lines.append("")
    lines.append("## In-corpus retrieval")
    lines.append("")
    lines.append(
        "| Mode | Recall@5 | Recall@10 | Recall@20 | Recall@50 | Precision@5 | "
        "Precision@10 | MRR@10 | nDCG@10 | Hit@10 | Zero-hit |"
    )
    lines.append(
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    )
    for mode in ("raw_chunk", "contextual_chunk"):
        metrics = payload["modes"][mode]["metrics"]
        lines.append(
            "| {mode} | {r5} | {r10} | {r20} | {r50} | {p5} | {p10} | {mrr} | "
            "{ndcg} | {hit} | {zero} |".format(
                mode=mode,
                r5=format_float(metrics["recall_at_5"]),
                r10=format_float(metrics["recall_at_10"]),
                r20=format_float(metrics["recall_at_20"]),
                r50=format_float(metrics["recall_at_50"]),
                p5=format_float(metrics["precision_at_5"]),
                p10=format_float(metrics["precision_at_10"]),
                mrr=format_float(metrics["mrr_at_10"]),
                ndcg=format_float(metrics["ndcg_at_10"]),
                hit=format_float(metrics["hit_rate_at_10"]),
                zero=metrics["zero_hit_questions"],
            )
        )
    lines.append("")
    lines.append("## By language")
    lines.append("")
    lines.append("| Language | n | Raw R@10 | Contextual R@10 | Raw MRR@10 | Contextual MRR@10 |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
    raw_languages = payload["modes"]["raw_chunk"]["by_language"]
    contextual_languages = payload["modes"]["contextual_chunk"]["by_language"]
    for language in sorted(set(raw_languages) | set(contextual_languages)):
        raw = raw_languages.get(language, {})
        contextual = contextual_languages.get(language, {})
        lines.append(
            f"| {language} | {raw.get('questions', 0)} | "
            f"{format_float(raw.get('recall_at_10'))} | "
            f"{format_float(contextual.get('recall_at_10'))} | "
            f"{format_float(raw.get('mrr_at_10'))} | "
            f"{format_float(contextual.get('mrr_at_10'))} |"
        )
    lines.append("")
    lines.append("## By category")
    lines.append("")
    lines.append("| Category | n | Raw R@10 | Contextual R@10 |")
    lines.append("| --- | ---: | ---: | ---: |")
    raw_categories = payload["modes"]["raw_chunk"]["by_category"]
    contextual_categories = payload["modes"]["contextual_chunk"]["by_category"]
    for category in sorted(set(raw_categories) | set(contextual_categories)):
        raw = raw_categories.get(category, {})
        contextual = contextual_categories.get(category, {})
        lines.append(
            f"| {category} | {raw.get('questions', 0)} | "
            f"{format_float(raw.get('recall_at_10'))} | "
            f"{format_float(contextual.get('recall_at_10'))} |"
        )
    lines.append("")
    lines.append("## Out-of-corpus behaviour")
    lines.append("")
    lines.append(
        "| Mode | Questions | Empty results | Leak in top 10 | Mean top-1 score | "
        "Median top-1 score | Max top-1 score |"
    )
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for mode in ("raw_chunk", "contextual_chunk"):
        ooc = payload["out_of_corpus"][mode]
        lines.append(
            f"| {mode} | {ooc['questions']} | {ooc['empty_result_questions']} | "
            f"{ooc['leak_questions']} | {ooc['mean_top1_score']:.4f} | "
            f"{ooc['median_top1_score']:.4f} | {ooc['max_top1_score']:.4f} |"
        )
    lines.append("")
    lines.append("## Reproduction")
    lines.append("")
    lines.append("```bash")
    lines.append("python tooling/retrieval-lab/eval/evaluate_rag_baseline.py")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=("baseline", "full"), default="baseline")
    parser.add_argument("--questions", type=Path, default=None)
    parser.add_argument("--gold", type=Path, default=DEFAULT_GOLD)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--markdown", type=Path, default=None)
    parser.add_argument("--allow-corpus-mismatch", action="store_true")
    parser.add_argument("--generated-at", default=None)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    generated_at = args.generated_at or datetime.now(timezone.utc).isoformat()
    manifest = (
        json.loads(args.manifest.read_text(encoding="utf-8"))
        if args.manifest.exists()
        else {}
    )
    corpus_sha256 = sha256_file(args.corpus)
    chunks = load_corpus(args.corpus)
    gold_rows = read_jsonl(args.gold)
    gold_by_id = {row["question_id"]: row for row in gold_rows}

    if args.suite == "full":
        benchmark_questions = read_jsonl(DEFAULT_BENCHMARK_QUESTIONS)
        questions = [
            {
                "question_id": row["question_id"],
                "stratum": "in_corpus",
                "source_question_id": row["question_id"],
                "language": row["language"],
                "category": row["category"],
                "question": row["question"],
                "expected_behavior": row["expected_raw_behavior"],
                "relevant_chunk_ids": gold_by_id[row["question_id"]]["relevant_chunk_ids"],
            }
            for row in benchmark_questions
        ]
        questions_path = DEFAULT_BENCHMARK_QUESTIONS
    else:
        questions_path = args.questions or DEFAULT_FIXTURE
        questions = read_jsonl(questions_path)

    validation = validate_fixture(
        questions,
        chunks,
        gold_by_id,
        manifest.get("corpus", {}).get("sha256"),
        corpus_sha256,
        args.allow_corpus_mismatch,
        require_out_of_corpus=args.suite == "baseline",
    )

    modes: dict[str, Any] = {}
    indexes: dict[str, BM25Index] = {}
    for mode in ("raw_chunk", "contextual_chunk"):
        rows, index = evaluate_mode(chunks, questions, gold_by_id, mode)
        modes[mode] = mode_payload(rows)
        modes[mode]["index"] = {
            "vocabulary_size": index.vocabulary_size,
            "average_document_length": index.average_length,
        }
        indexes[mode] = index

    out_of_corpus = {
        mode: evaluate_out_of_corpus(chunks, questions, indexes[mode])
        for mode in ("raw_chunk", "contextual_chunk")
    }

    artifacts = {chunk.artifact_id for chunk in chunks}
    contextualized = sum(1 for chunk in chunks if chunk.note)
    payload: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": generated_at,
        "suite": args.suite,
        "question_source": str(questions_path.relative_to(REPO_ROOT)),
        "corpus": {
            "path": str(args.corpus.relative_to(REPO_ROOT)),
            "sha256": corpus_sha256,
            "chunks": len(chunks),
            "artifacts": len(artifacts),
            "contextualized_chunks": contextualized,
            "languages": dict(
                sorted(collections.Counter(chunk.language for chunk in chunks).items())
            ),
            "characters": sum(len(chunk.text) for chunk in chunks),
        },
        "index": {
            "tokenizer": "lexical-fold-v1 (offline port)",
            "bm25_k1": BM25_K1,
            "bm25_b": BM25_B,
            "search_depth": SEARCH_DEPTH,
            "vocabulary_size": indexes["contextual_chunk"].vocabulary_size,
            "average_document_length": indexes["contextual_chunk"].average_length,
        },
        "validation": validation,
        "modes": modes,
        "out_of_corpus": out_of_corpus,
        "deltas_contextual_minus_raw": {
            "recall_at_10": (
                modes["contextual_chunk"]["metrics"]["recall_at_10"]
                - modes["raw_chunk"]["metrics"]["recall_at_10"]
            ),
            "recall_at_50": (
                modes["contextual_chunk"]["metrics"]["recall_at_50"]
                - modes["raw_chunk"]["metrics"]["recall_at_50"]
            ),
            "mrr_at_10": (
                modes["contextual_chunk"]["metrics"]["mrr_at_10"]
                - modes["raw_chunk"]["metrics"]["mrr_at_10"]
            ),
            "ndcg_at_10": (
                modes["contextual_chunk"]["metrics"]["ndcg_at_10"]
                - modes["raw_chunk"]["metrics"]["ndcg_at_10"]
            ),
        },
    }

    output_path = args.output or (
        DEFAULT_OUTPUT if args.suite == "baseline" else EVAL_DIR / "results" / "rag_baseline_full.json"
    )
    markdown_path = args.markdown or (
        DEFAULT_MARKDOWN
        if args.suite == "baseline"
        else EVAL_DIR / "results" / "rag_baseline_full.md"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    markdown_path.write_text(markdown_report(payload), encoding="utf-8")

    metrics = modes["contextual_chunk"]["metrics"]
    print(
        "contextual BM25: "
        f"recall@10={metrics['recall_at_10']:.4f} "
        f"mrr@10={metrics['mrr_at_10']:.4f} "
        f"ndcg@10={metrics['ndcg_at_10']:.4f} "
        f"zero-hit={metrics['zero_hit_questions']}/{metrics['questions']}"
    )
    print(f"wrote {output_path}")
    print(f"wrote {markdown_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
