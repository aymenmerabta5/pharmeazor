/**
 * Benchmark arm registry.
 *
 * Every arm answers the same human-reviewed question set with the same model,
 * prompt generation settings and review workflow. Only the evidence condition
 * changes, which is what makes the deltas interpretable:
 *
 *   evidenceGain = oracle   - raw        value of perfect evidence
 *   systemGain   = rag      - raw        value of the full retrieval system
 *   retrievalGap = oracle   - rag        headroom retrieval leaves on the table
 *   rerankGain   = rerank   - rag        value of the cross-encoder ordering
 *   graphGain    = graph    - rerank     value of graph-expanded retrieval
 *
 * `rag`, `rag-rerank` and `rag-graph` read the same recorded trace schema and
 * differ only in the ordering they select from it. The graph arm is scaffolded
 * and refuses to run until a graph trace exists; it never falls back to the
 * base trace, because a silent fallback would report a graph number that was
 * measured without a graph.
 */
import type { RetrievalOrdering } from "./retrieval/types";

export const BENCHMARK_ARMS = ["raw", "oracle", "rag", "rag-rerank", "rag-graph"] as const;
export type BenchmarkArm = (typeof BENCHMARK_ARMS)[number];

/** Arms that consume a recorded retrieval trace. */
export const RETRIEVAL_ARMS = ["rag", "rag-rerank", "rag-graph"] as const;
export type RetrievalArm = (typeof RETRIEVAL_ARMS)[number];

export function isBenchmarkArm(value: string | undefined | null): value is BenchmarkArm {
  return (
    value !== undefined && value !== null && (BENCHMARK_ARMS as readonly string[]).includes(value)
  );
}

export function isRetrievalArm(value: BenchmarkArm | undefined | null): value is RetrievalArm {
  return value === "rag" || value === "rag-rerank" || value === "rag-graph";
}

/** Human-readable arm name used in reports and logs. */
export const ARM_LABELS: Record<BenchmarkArm, string> = {
  raw: "RAW (closed book)",
  oracle: "Oracle (curated evidence)",
  rag: "RAG (hybrid retrieval, fusion order)",
  "rag-rerank": "RAG + reranker (cross-encoder order)",
  "rag-graph": "RAG + graph (scaffolded, not ready)",
};

export const ARM_SHORT_LABELS: Record<BenchmarkArm, string> = {
  raw: "RAW",
  oracle: "Oracle",
  rag: "RAG",
  "rag-rerank": "RAG+rerank",
  "rag-graph": "RAG+graph",
};

/**
 * Ordering a retrieval arm reads out of the recorded trace.
 *
 * `fusion` sorts by the recorded reciprocal-rank-fusion score, `rerank` keeps
 * the cross-encoder order, and `recorded` trusts the trace's own rank column
 * (the graph trace is expected to arrive pre-ordered).
 */
export const ARM_RETRIEVAL_ORDERING: Record<RetrievalArm, RetrievalOrdering> = {
  rag: "fusion",
  "rag-rerank": "rerank",
  "rag-graph": "recorded",
};

export function armLabel(arm: BenchmarkArm | undefined): string {
  if (!arm) return ARM_LABELS.raw;
  return ARM_LABELS[arm];
}
