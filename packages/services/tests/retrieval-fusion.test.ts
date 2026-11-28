import { describe, expect, it } from "bun:test";
import { retrieval } from "@repo/services";

const { DEFAULT_RRF_K, fuseRankedLists } = retrieval;

function candidate(chunkId: string, rank: number, score = 1) {
  return { chunkId, rank, score };
}

describe("reciprocal rank fusion", () => {
  it("scores each arm by rank position, not raw score", () => {
    const fused = fuseRankedLists([
      { arm: "dense", candidates: [candidate("a", 1, 0.99), candidate("b", 2, 0.1)] },
      { arm: "lexical", candidates: [candidate("c", 1, 42)] },
    ]);
    expect(fused).toHaveLength(3);
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / (DEFAULT_RRF_K + 1), 12);
    expect(fused.find((entry) => entry.chunkId === "a")?.denseRank).toBe(1);
    expect(fused.find((entry) => entry.chunkId === "c")?.lexicalScore).toBe(42);
  });

  it("sums contributions for chunks found by both arms", () => {
    const fused = fuseRankedLists([
      { arm: "dense", candidates: [candidate("a", 2, 0.8), candidate("b", 1, 0.9)] },
      { arm: "lexical", candidates: [candidate("a", 1, 20)] },
    ]);
    expect(fused[0]?.chunkId).toBe("a");
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61 + 1 / 62, 12);
    expect(fused[0]?.denseRank).toBe(2);
    expect(fused[0]?.lexicalRank).toBe(1);
  });

  it("fuses a third graph arm and records its score and rank", () => {
    const fused = fuseRankedLists([
      { arm: "dense", candidates: [candidate("a", 1, 0.99)] },
      { arm: "graph", candidates: [candidate("a", 1, 0.9), candidate("g", 2, 0.4)] },
    ]);
    const a = fused.find((entry) => entry.chunkId === "a");
    const g = fused.find((entry) => entry.chunkId === "g");

    expect(a?.rrfScore).toBeCloseTo(1 / 61 + 1 / 61, 12);
    expect(a?.graphScore).toBe(0.9);
    expect(a?.graphRank).toBe(1);
    expect(g?.graphScore).toBe(0.4);
    expect(g?.graphRank).toBe(2);
  });

  it("uses the graph rank when breaking a score tie", () => {
    const fused = fuseRankedLists([
      { arm: "graph", candidates: [candidate("z", 1), candidate("y", 1)] },
    ]);
    expect(fused.map((entry) => entry.chunkId)).toEqual(["y", "z"]);
  });

  it("breaks score ties by best rank and then by id", () => {
    const fused = fuseRankedLists([
      { arm: "dense", candidates: [candidate("z", 1), candidate("y", 1)] },
    ]);
    expect(fused.map((entry) => entry.chunkId)).toEqual(["y", "z"]);
  });

  it("rejects an invalid k", () => {
    expect(() => fuseRankedLists([], -1)).toThrow("RRF k must be a non-negative integer");
    expect(() => fuseRankedLists([], 1.5)).toThrow("RRF k must be a non-negative integer");
  });

  it("ignores entries without an id", () => {
    const fused = fuseRankedLists([{ arm: "dense", candidates: [candidate("", 1)] }]);
    expect(fused).toEqual([]);
  });
});
