import { describe, expect, it } from "bun:test";
import { createTraceGateway } from "../../src/retrieval/trace";
import { computeRetrievalMetrics } from "../../src/retrieval/metrics";
import type { GoldAnnotation } from "../../src/dataset/schema";
import type { RetrievalTraceRow } from "../../src/retrieval/types";

function annotation(questionId: string, chunkIds: string[]): GoldAnnotation {
  return {
    question_id: questionId,
    gold_status: "VERIFIED",
    expected_behavior: "ANSWER",
    reference_answer: "reference",
    expected_facts: [],
    forbidden_claims: [],
    relevant_chunk_ids: chunkIds,
    evidence_bundle: [],
    answerable_without_corpus: false,
    difficulty: "medium",
    reviewer_notes: "",
    reviewed_by: "test",
    reviewed_at: "2026-01-01T00:00:00Z",
    verification_status: "VERIFIED",
  } as unknown as GoldAnnotation;
}

function traceRow(questionId: string, chunkIds: string[], injectedIndex = -1): RetrievalTraceRow {
  return {
    question_id: questionId,
    query: "query",
    retrieval_config_hash: "a".repeat(64),
    config: "config",
    authority_policy: "policy",
    diagnostics: {},
    candidate_chunk_ids: chunkIds,
    chunks: chunkIds.map((chunk_id, index) => ({
      rank: index + 1,
      chunk_id,
      artifact_id: "MED001__SRC_TEST__DOC001__smpc",
      section_code: "dosage",
      citation_label: "Test source",
      text: `Passage ${index + 1}.`,
      injection_risk: index === injectedIndex,
      scores: {},
    })),
  };
}

describe("retrieval metrics", () => {
  it("computes recall, precision, MRR and nDCG from the trace", () => {
    const metrics = computeRetrievalMetrics(
      [traceRow("Q-1", ["c1", "c2", "c3"]), traceRow("Q-2", ["x", "c4"])],
      [annotation("Q-1", ["c1", "c9"]), annotation("Q-2", ["c4"])],
      "a".repeat(64),
      "b".repeat(64),
    );

    expect(metrics.questions).toBe(2);
    expect(metrics.averages["recall@1"]).toBe(0.25);
    expect(metrics.averages["recall@5"]).toBe(0.75);
    expect(metrics.averages["precision@5"]).toBeCloseTo(0.2);
    expect(metrics.averages.mrr).toBe(0.75);
    expect(metrics.averages["ndcg@10"]).toBeGreaterThan(0);
  });
});

describe("createTraceGateway", () => {
  it("assigns stable E markers, filters injection and caps passages", () => {
    const row = traceRow("Q-1", ["c1", "c2", "c3"], 1);
    const gateway = createTraceGateway(
      {
        rows: new Map([["Q-1", row]]),
        configHash: "a".repeat(64),
        traceHash: "b".repeat(64),
      },
      { maxPassages: 2 },
    );

    const passages = gateway.search("Q-1");
    expect(passages.map((passage) => passage.chunk_id)).toEqual(["c1", "c3"]);
    expect(passages.map((passage) => passage.evidence_id)).toEqual(["E1", "E2"]);
    expect(gateway.search("Q-2")).toEqual([]);
    expect(gateway.configHash()).toBe("a".repeat(64));
  });
});
