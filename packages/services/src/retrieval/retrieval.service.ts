import type {
  RetrievalPrincipal,
  RetrievalRequest,
  RetrievalResult,
  RetrievedChunk,
} from "./contracts";
import { RetrievalError, isRetrievalError } from "./errors";
import { fuseRankedLists, type FusedCandidate } from "./fusion";
import { normalizeRetrievalRequest, RETRIEVAL_LIMITS } from "./policy";
import type { EmbeddingPort, RerankPort, RetrievalIndexPort } from "./ports";
import { queryTerms } from "./tokenize";

export interface RetrievalServiceDependencies {
  readonly index: RetrievalIndexPort;
  readonly embedding: EmbeddingPort;
  readonly reranker?: RerankPort | null;
  /**
   * When true, a reranker outage fails the request instead of silently
   * returning fusion order. Set this in production deployments where ranking
   * quality is a stated guarantee.
   */
  readonly requireRerank?: boolean;
  readonly now?: () => number;
  readonly warn?: (message: string) => void;
}

export interface SearchOptions {
  readonly signal?: AbortSignal;
}

/**
 * The retrieval use case.
 *
 * One call executes the whole fixed pipeline: query embedding, dense and BM25
 * arms in parallel, Reciprocal Rank Fusion, and cross-encoder reranking. The
 * model never chooses an arm or sees an intermediate ranking.
 */
export function createRetrievalService(dependencies: RetrievalServiceDependencies) {
  const now = dependencies.now ?? (() => performance.now());
  const reranker = dependencies.reranker ?? null;

  return {
    async search(
      principal: RetrievalPrincipal,
      request: RetrievalRequest,
      options: SearchOptions = {},
    ): Promise<RetrievalResult> {
      if (!principal || typeof principal.actorId !== "string" || !principal.actorId.trim()) {
        throw new RetrievalError("RETRIEVAL_UNAUTHENTICATED", "Authentication required");
      }
      const { query, limit, filter } = normalizeRetrievalRequest(request);
      const startedAt = now();

      let queryEmbedding: number[];
      try {
        queryEmbedding = await dependencies.embedding.embedQuery(query, options.signal);
      } catch (cause) {
        if (isRetrievalError(cause)) throw cause;
        throw new RetrievalError("RETRIEVAL_EMBEDDING_FAILED", "Query embedding failed", { cause });
      }

      let dense: Awaited<ReturnType<RetrievalIndexPort["denseSearch"]>>;
      let lexical: Awaited<ReturnType<RetrievalIndexPort["lexicalSearch"]>>;
      try {
        [dense, lexical] = await Promise.all([
          dependencies.index.denseSearch({
            embedding: queryEmbedding,
            model: dependencies.embedding.model,
            limit: RETRIEVAL_LIMITS.denseCandidates,
            filter,
          }),
          dependencies.index.lexicalSearch({
            terms: queryTerms(query, RETRIEVAL_LIMITS.maxQueryTerms),
            model: dependencies.embedding.model,
            limit: RETRIEVAL_LIMITS.lexicalCandidates,
            filter,
          }),
        ]);
      } catch (cause) {
        if (isRetrievalError(cause)) throw cause;
        throw new RetrievalError("RETRIEVAL_INDEX_FAILED", "Retrieval index query failed", {
          cause,
        });
      }

      const fused = fuseRankedLists(
        [
          { arm: "dense", candidates: dense },
          { arm: "lexical", candidates: lexical },
        ],
        RETRIEVAL_LIMITS.rrfK,
      ).slice(0, RETRIEVAL_LIMITS.fusionCandidates);

      if (fused.length === 0) {
        return {
          chunks: [],
          diagnostics: {
            embeddingModel: dependencies.embedding.model,
            rerankerModel: reranker?.model ?? null,
            denseCandidates: dense.length,
            lexicalCandidates: lexical.length,
            fusedCandidates: 0,
            rerankedCandidates: 0,
            returnedChunks: 0,
            droppedForInjection: 0,
            rerank: reranker ? "applied" : "disabled",
            elapsedMs: Math.round(now() - startedAt),
          },
        };
      }

      const candidateIds = fused
        .slice(0, RETRIEVAL_LIMITS.rerankCandidates)
        .map((candidate) => candidate.chunkId);
      const loaded = await dependencies.index.loadCandidates(candidateIds);
      const byId = new Map(loaded.map((candidate) => [candidate.chunkId, candidate]));
      const ordered = fused
        .map((candidate) => byId.get(candidate.chunkId))
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

      let rerankStatus: RetrievalResult["diagnostics"]["rerank"] = reranker
        ? "applied"
        : "disabled";
      let reranked: Array<{ candidate: (typeof ordered)[number]; score?: number }> = ordered.map(
        (candidate) => ({ candidate }),
      );

      if (reranker && ordered.length > 1) {
        try {
          const ranked = await reranker.rerank({
            query,
            documents: ordered.map((candidate) => candidate.contextualizedContent),
            topN: Math.min(ordered.length, RETRIEVAL_LIMITS.rerankCandidates),
            ...(options.signal ? { signal: options.signal } : {}),
          });
          const seen = new Set<number>();
          const reordered: typeof reranked = [];
          for (const item of ranked) {
            if (!Number.isInteger(item.index) || item.index < 0 || item.index >= ordered.length) {
              continue;
            }
            if (seen.has(item.index)) continue;
            seen.add(item.index);
            reordered.push({
              candidate: ordered[item.index]!,
              ...(Number.isFinite(item.score) ? { score: item.score } : {}),
            });
          }
          // A reranker may return fewer rows than it was given; keep the rest
          // in fusion order rather than losing candidates.
          for (let index = 0; index < ordered.length; index += 1) {
            if (seen.has(index)) continue;
            reordered.push({ candidate: ordered[index]! });
          }
          reranked = reordered;
        } catch (cause) {
          if (dependencies.requireRerank) {
            throw new RetrievalError("RETRIEVAL_RERANK_FAILED", "Reranking failed", { cause });
          }
          rerankStatus = "failed";
          dependencies.warn?.("Retrieval reranker failed; returning fusion order");
        }
      }

      const perArtifact = new Map<string, number>();
      const selected: RetrievedChunk[] = [];
      let droppedForInjection = 0;
      for (const { candidate, score } of reranked) {
        if (candidate.injectionRisk) {
          droppedForInjection += 1;
          continue;
        }
        const count = perArtifact.get(candidate.artifactId) ?? 0;
        if (count >= RETRIEVAL_LIMITS.maxChunksPerArtifact) continue;
        perArtifact.set(candidate.artifactId, count + 1);
        selected.push({
          ...candidate,
          scores: scoresFor(candidate.chunkId, fused, score),
          citation: {
            chunkId: candidate.chunkId,
            label: citationLabel(candidate),
          },
        });
        if (selected.length >= limit) break;
      }

      return {
        chunks: selected,
        diagnostics: {
          embeddingModel: dependencies.embedding.model,
          rerankerModel: reranker?.model ?? null,
          denseCandidates: dense.length,
          lexicalCandidates: lexical.length,
          fusedCandidates: fused.length,
          rerankedCandidates: reranked.length,
          returnedChunks: selected.length,
          droppedForInjection,
          rerank: rerankStatus,
          elapsedMs: Math.round(now() - startedAt),
        },
      };
    },
  };
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;

function scoresFor(
  chunkId: string,
  fused: readonly FusedCandidate[],
  rerankScore: number | undefined,
): RetrievedChunk["scores"] {
  const match = fused.find((candidate) => candidate.chunkId === chunkId);
  return {
    ...(match?.denseScore !== undefined ? { dense: match.denseScore } : {}),
    ...(match?.denseRank !== undefined ? { denseRank: match.denseRank } : {}),
    ...(match?.lexicalScore !== undefined ? { lexical: match.lexicalScore } : {}),
    ...(match?.lexicalRank !== undefined ? { lexicalRank: match.lexicalRank } : {}),
    rrf: match?.rrfScore ?? 0,
    ...(rerankScore !== undefined ? { rerank: rerankScore } : {}),
  };
}

function citationLabel(candidate: {
  readonly sourceName: string;
  readonly documentType: string;
  readonly sectionHeading: string;
}): string {
  const label = `${candidate.sourceName} · ${candidate.documentType} · ${candidate.sectionHeading}`;
  return label.length > 180 ? `${label.slice(0, 177)}...` : label;
}
