/**
 * Retrieval-quality block for a benchmark report.
 *
 * Kept separate from the markdown renderer so the renderer stays pure and the
 * trace/annotation reads happen once, in the CLI, where the rest of the IO
 * already lives.
 */
import { ARM_RETRIEVAL_ORDERING, type RetrievalArm } from "../arms";
import type { GoldAnnotation } from "../dataset/schema";
import { computeRetrievalMetrics } from "../retrieval/metrics";
import { orderTraceChunks, type LoadedRetrievalTrace } from "../retrieval/trace";
import type { RetrievalOrdering, RetrievalTraceRow } from "../retrieval/types";

export interface RetrievalReportInput {
  arm: RetrievalArm;
  ordering: RetrievalOrdering;
  config_hash: string;
  trace_hash: string;
  questions_in_run: number;
  questions_with_passages: number;
  questions_with_annotations: number;
  average_returned_chunks: number;
  recall_at_5: number | null;
  recall_at_10: number | null;
  mrr: number | null;
  ndcg_at_10: number | null;
  candidate_recall_at_50: number | null;
}

export interface SummarizeRetrievalInput {
  arm: RetrievalArm;
  trace: LoadedRetrievalTrace;
  /** Questions actually scored in the run, in run order. */
  questionIds: readonly string[];
  annotations: readonly GoldAnnotation[];
}

/**
 * Re-orders each trace row with the arm's ordering and measures it against the
 * gold chunk ids.
 *
 * Retrieval is measured separately from generation on purpose: a change can
 * improve the answer and degrade retrieval, and a single blended number hides
 * which layer moved.
 */
export function summarizeRetrieval(input: SummarizeRetrievalInput): RetrievalReportInput {
  const ordering = ARM_RETRIEVAL_ORDERING[input.arm];
  const rows: RetrievalTraceRow[] = [];
  let withPassages = 0;
  let returnedChunks = 0;

  for (const questionId of input.questionIds) {
    const row = input.trace.rows.get(questionId);
    if (!row) continue;
    if (row.chunks.length > 0) {
      withPassages += 1;
      returnedChunks += row.chunks.length;
    }
    rows.push({ ...row, chunks: orderTraceChunks(row, ordering) });
  }

  const annotationIds = new Set(rows.map((row) => row.question_id));
  const annotations = input.annotations.filter((annotation) =>
    annotationIds.has(annotation.question_id),
  );

  const base: RetrievalReportInput = {
    arm: input.arm,
    ordering,
    config_hash: input.trace.configHash,
    trace_hash: input.trace.traceHash,
    questions_in_run: input.questionIds.length,
    questions_with_passages: withPassages,
    questions_with_annotations: annotations.length,
    average_returned_chunks: rows.length === 0 ? 0 : returnedChunks / rows.length,
    recall_at_5: null,
    recall_at_10: null,
    mrr: null,
    ndcg_at_10: null,
    candidate_recall_at_50: null,
  };

  if (annotations.length === 0) return base;

  const metrics = computeRetrievalMetrics(
    rows,
    annotations,
    input.trace.configHash,
    input.trace.traceHash,
  );

  return {
    ...base,
    questions_with_annotations: metrics.questions,
    recall_at_5: metrics.averages["recall@5"],
    recall_at_10: metrics.averages["recall@10"],
    mrr: metrics.averages.mrr,
    ndcg_at_10: metrics.averages["ndcg@10"],
    candidate_recall_at_50: metrics.averages["candidate_recall@50"],
  };
}
