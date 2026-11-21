import type { RankedCandidate } from "./contracts";

/**
 * Reciprocal Rank Fusion.
 *
 * RRF combines rank positions, not raw scores, so a cosine similarity and a
 * BM25 score never need a shared scale. `k = 60` is the starting constant from
 * the retrieval design document; changing it invalidates the measured
 * baseline, so it is a policy decision, not a tuning knob on the request.
 */

export const DEFAULT_RRF_K = 60;

export type RetrievalArm = "dense" | "lexical";

export interface RankedList {
  readonly arm: RetrievalArm;
  readonly candidates: readonly RankedCandidate[];
}

export interface FusedCandidate {
  readonly chunkId: string;
  readonly rrfScore: number;
  readonly denseScore?: number;
  readonly denseRank?: number;
  readonly lexicalScore?: number;
  readonly lexicalRank?: number;
}

export function fuseRankedLists(lists: readonly RankedList[], k = DEFAULT_RRF_K): FusedCandidate[] {
  if (!Number.isInteger(k) || k < 0) throw new Error("RRF k must be a non-negative integer");
  const fused = new Map<string, FusedCandidate>();

  for (const list of lists) {
    for (const candidate of list.candidates) {
      if (!candidate.chunkId) continue;
      const contribution = 1 / (k + candidate.rank);
      const existing = fused.get(candidate.chunkId);
      if (!existing) {
        fused.set(candidate.chunkId, {
          chunkId: candidate.chunkId,
          rrfScore: contribution,
          ...(list.arm === "dense"
            ? { denseScore: candidate.score, denseRank: candidate.rank }
            : { lexicalScore: candidate.score, lexicalRank: candidate.rank }),
        });
        continue;
      }
      fused.set(candidate.chunkId, {
        ...existing,
        rrfScore: existing.rrfScore + contribution,
        ...(list.arm === "dense"
          ? { denseScore: candidate.score, denseRank: candidate.rank }
          : { lexicalScore: candidate.score, lexicalRank: candidate.rank }),
      });
    }
  }

  return [...fused.values()].sort((left, right) => {
    if (right.rrfScore !== left.rrfScore) return right.rrfScore - left.rrfScore;
    const leftBest = Math.min(left.denseRank ?? Infinity, left.lexicalRank ?? Infinity);
    const rightBest = Math.min(right.denseRank ?? Infinity, right.lexicalRank ?? Infinity);
    if (leftBest !== rightBest) return leftBest - rightBest;
    return left.chunkId.localeCompare(right.chunkId);
  });
}
