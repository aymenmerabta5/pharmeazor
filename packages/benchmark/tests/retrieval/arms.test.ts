import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
  GraphArmNotReadyError,
  createTraceGateway,
  hasRerankScores,
  loadGraphTrace,
  loadRetrievalTrace,
  orderTraceChunks,
  type LoadedRetrievalTrace,
} from "../../src/retrieval/trace";
import { ARM_RETRIEVAL_ORDERING } from "../../src/arms";
import type { RetrievalTraceRow, TraceChunk } from "../../src/retrieval/types";

function chunk(chunkId: string, rank: number, scores: Record<string, unknown>): TraceChunk {
  return {
    rank,
    chunk_id: chunkId,
    artifact_id: "MED001__SRC_TEST__DOC001__smpc",
    section_code: "dosage",
    citation_label: `Source ${chunkId}`,
    text: `Text for ${chunkId}.`,
    injection_risk: false,
    scores,
  };
}

/**
 * The recorded trace stores the reranked order in `rank` and the fusion order
 * in `scores.rrf`. The two deliberately disagree here so an arm that reads the
 * wrong column fails the test instead of passing by accident.
 */
function row(): RetrievalTraceRow {
  return {
    question_id: "Q-1",
    query: "query",
    retrieval_config_hash: "a".repeat(64),
    config: "config",
    authority_policy: "policy",
    diagnostics: {},
    candidate_chunk_ids: ["chunk-a", "chunk-b", "chunk-c"],
    chunks: [
      chunk("chunk-a", 1, { rrf: 0.01, rerank: 0.9 }),
      chunk("chunk-b", 2, { rrf: 0.03, rerank: 0.5 }),
      chunk("chunk-c", 3, { rrf: 0.02, rerank: 0.1 }),
    ],
  };
}

function loaded(r: RetrievalTraceRow = row()): LoadedRetrievalTrace {
  return {
    rows: new Map([[r.question_id, r]]),
    configHash: r.retrieval_config_hash,
    traceHash: "b".repeat(64),
  };
}

describe("retrieval arm orderings", () => {
  it("fusion orders by the recorded RRF score, not the recorded rank", () => {
    const ordered = orderTraceChunks(row(), "fusion").map((c) => c.chunk_id);
    expect(ordered).toEqual(["chunk-b", "chunk-c", "chunk-a"]);
  });

  it("rerank and recorded keep the trace's cross-encoder order", () => {
    expect(orderTraceChunks(row(), "rerank").map((c) => c.chunk_id)).toEqual([
      "chunk-a",
      "chunk-b",
      "chunk-c",
    ]);
    expect(orderTraceChunks(row(), "recorded").map((c) => c.chunk_id)).toEqual([
      "chunk-a",
      "chunk-b",
      "chunk-c",
    ]);
  });

  it("does not mutate the trace row", () => {
    const original = row();
    orderTraceChunks(original, "fusion");
    expect(original.chunks.map((c) => c.chunk_id)).toEqual(["chunk-a", "chunk-b", "chunk-c"]);
  });

  it("falls back to the recorded order when a row has no fusion scores", () => {
    const legacy = row();
    const noScores: RetrievalTraceRow = {
      ...legacy,
      chunks: legacy.chunks.map((c) => ({ ...c, scores: {} })),
    };
    expect(orderTraceChunks(noScores, "fusion").map((c) => c.chunk_id)).toEqual([
      "chunk-a",
      "chunk-b",
      "chunk-c",
    ]);
  });

  it("maps each retrieval arm to its documented ordering", () => {
    expect(ARM_RETRIEVAL_ORDERING).toEqual({
      rag: "fusion",
      "rag-rerank": "rerank",
      "rag-graph": "recorded",
    });
  });
});

describe("trace gateway", () => {
  it("defaults to the recorded order", () => {
    const gateway = createTraceGateway(loaded());
    expect(gateway.ordering()).toBe("recorded");
    expect(gateway.search("Q-1")[0]?.chunk_id).toBe("chunk-a");
  });

  it("applies the arm's ordering to the passages it exposes", () => {
    const gateway = createTraceGateway(loaded(), { ordering: "fusion" });
    expect(gateway.search("Q-1").map((p) => p.chunk_id)).toEqual(["chunk-b", "chunk-c", "chunk-a"]);
    expect(gateway.search("Q-1")[0]?.evidence_id).toBe("E1");
  });

  it("returns an empty list for a question outside the trace", () => {
    expect(createTraceGateway(loaded()).search("Q-404")).toEqual([]);
  });

  it("reports whether every returned chunk has a rerank score", () => {
    expect(hasRerankScores(loaded())).toBe(true);
    const r = row();
    const withoutRerank: RetrievalTraceRow = {
      ...r,
      chunks: r.chunks.map((c) => ({ ...c, scores: { rrf: c.scores.rrf } })),
    };
    expect(hasRerankScores(loaded(withoutRerank))).toBe(false);
  });
});

describe("graph trace", () => {
  it("reports the graph arm as not ready when its trace is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-graph-"));
    try {
      await expect(loadGraphTrace(join(dir, "missing.jsonl"))).rejects.toBeInstanceOf(
        GraphArmNotReadyError,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not hide a malformed graph trace as 'not ready'", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-graph-"));
    const path = join(dir, "retrieval-trace-graph.jsonl");
    try {
      await writeFile(path, "{not json}\n", "utf8");
      const error = await loadGraphTrace(path).catch((cause: unknown) => cause);
      expect(error).not.toBeInstanceOf(GraphArmNotReadyError);
      expect(String(error)).toContain("not valid JSON");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads a graph trace once the pipeline produces one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-graph-"));
    const path = join(dir, "retrieval-trace-graph.jsonl");
    try {
      await writeFile(path, `${JSON.stringify(row())}\n`, "utf8");
      const trace = await loadGraphTrace(path);
      expect(trace.rows.get("Q-1")?.question_id).toBe("Q-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("still rejects a base trace that mixes configurations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-graph-"));
    const path = join(dir, "trace.jsonl");
    try {
      const second = { ...row(), question_id: "Q-2", retrieval_config_hash: "c".repeat(64) };
      await writeFile(path, `${JSON.stringify(row())}\n${JSON.stringify(second)}\n`, "utf8");
      await expect(loadRetrievalTrace(path)).rejects.toThrow(
        "mixes multiple retrieval configurations",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
