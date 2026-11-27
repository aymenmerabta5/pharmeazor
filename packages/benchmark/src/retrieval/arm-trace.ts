/**
 * Trace selection shared by the retrieval arms' run and evaluate paths.
 *
 * `rag` and `rag-rerank` read the same trace file and differ only in ordering;
 * `rag-graph` has its own trace and must never fall back to the base one.
 */
import type { RetrievalArm } from "../arms";
import {
  hasRerankScores,
  loadGraphTrace,
  loadRetrievalTrace,
  type LoadedRetrievalTrace,
} from "./trace";

export interface ArmTracePaths {
  /** `data/v1/retrieval-trace.jsonl` */
  base: string;
  /** `data/v1/retrieval-trace-graph.jsonl` */
  graph: string;
}

export async function loadArmTrace(
  arm: RetrievalArm,
  paths: ArmTracePaths,
): Promise<LoadedRetrievalTrace> {
  if (arm === "rag-graph") return await loadGraphTrace(paths.graph);

  const trace = await loadRetrievalTrace(paths.base);
  if (arm === "rag-rerank" && !hasRerankScores(trace)) {
    throw new Error(
      "the recorded retrieval trace has no rerank scores; the RAG + reranker arm " +
        "needs a trace produced with the cross-encoder enabled",
    );
  }
  return trace;
}
