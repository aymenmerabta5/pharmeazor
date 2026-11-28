import type {
  GraphRetrievalStatus,
  RankedCandidate,
  RetrievalPrincipal,
  RetrievalRequest,
  RetrievalResult,
  RetrievedChunk,
} from "./contracts";
import { RetrievalError, isRetrievalError } from "./errors";
import { AUTHORITY_PRECEDENCE, authorityDescriptor, findAuthorityOverlaps } from "./authority";
import { fuseRankedLists, type FusedCandidate } from "./fusion";
import { aliasCandidateKeys, expandQueryTerms, type QueryExpansion } from "./expand";
import { normalizeRetrievalRequest, RETRIEVAL_LIMITS } from "./policy";
import type {
  AliasPort,
  EmbeddingPort,
  GraphRetrievalPort,
  RerankPort,
  RetrievalIndexPort,
} from "./ports";
import { queryTerms } from "./tokenize";

export interface RetrievalServiceDependencies {
  readonly index: RetrievalIndexPort;
  readonly embedding: EmbeddingPort;
  readonly reranker?: RerankPort | null;
  /**
   * Optional brand-to-substance lookup. When it is missing or fails, the
   * lexical arm searches the original query; expansion is a recall aid, not a
   * correctness requirement.
   */
  readonly aliases?: AliasPort | null;
  /**
   * Optional third arm over published graph evidence. Its outage degrades to
   * the hybrid result; it never fails retrieval.
   */
  readonly graph?: GraphRetrievalPort | null;
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
  const aliases = dependencies.aliases ?? null;
  const graph = dependencies.graph ?? null;

  return {
    async search(
      principal: RetrievalPrincipal,
      request: RetrievalRequest,
      options: SearchOptions = {},
    ): Promise<RetrievalResult> {
      if (!principal || typeof principal.actorId !== "string" || !principal.actorId.trim()) {
        throw new RetrievalError("RETRIEVAL_UNAUTHENTICATED", "Authentication required");
      }
      const { query, limit, filter, includeCandidateIds } = normalizeRetrievalRequest(request);
      const startedAt = now();
      const terms = queryTerms(query, RETRIEVAL_LIMITS.maxQueryTerms);

      // Brand aliases are resolved before the lexical arm so a brand the corpus
      // never spells out still reaches the substance its documents use. A
      // failed lookup degrades to the original query instead of failing search.
      let expansion: QueryExpansion = {
        terms,
        expandedTerms: [],
        ambiguousAliases: [],
      };
      if (aliases) {
        try {
          const keys = aliasCandidateKeys(terms);
          const matches = keys.length > 0 ? await aliases.resolveAliases(keys) : [];
          expansion = expandQueryTerms(terms, matches);
        } catch {
          dependencies.warn?.("Alias expansion failed; searching the original query");
        }
      }

      // The graph arm does not need the query embedding, so it starts before
      // the embedding call and overlaps both hybrid arms. A graph outage is
      // contained here: retrieval continues with dense + lexical + rerank.
      let graphStatus: GraphRetrievalStatus = graph ? "applied" : "disabled";
      const graphCandidatesPromise: Promise<RankedCandidate[]> = graph
        ? Promise.resolve()
            .then(() =>
              graph.search({
                query,
                terms: expansion.terms,
                limit: RETRIEVAL_LIMITS.graphCandidates,
                filter,
              }),
            )
            .then((candidates) =>
              normalizeGraphCandidates(candidates, RETRIEVAL_LIMITS.graphCandidates),
            )
            .catch((cause) => {
              graphStatus = "failed";
              dependencies.warn?.(
                `Graph retrieval failed; returning hybrid results: ${
                  cause instanceof Error ? cause.message : "unknown error"
                }`,
              );
              return [];
            })
        : Promise.resolve([]);

      let queryEmbedding: number[];
      try {
        queryEmbedding = await dependencies.embedding.embedQuery(query, options.signal);
      } catch (cause) {
        if (isRetrievalError(cause)) throw cause;
        throw new RetrievalError("RETRIEVAL_EMBEDDING_FAILED", "Query embedding failed", { cause });
      }

      let dense: Awaited<ReturnType<RetrievalIndexPort["denseSearch"]>>;
      let lexical: Awaited<ReturnType<RetrievalIndexPort["lexicalSearch"]>>;
      let graphCandidates: RankedCandidate[];
      try {
        [dense, lexical, graphCandidates] = await Promise.all([
          dependencies.index.denseSearch({
            embedding: queryEmbedding,
            model: dependencies.embedding.model,
            limit: RETRIEVAL_LIMITS.denseCandidates,
            filter,
          }),
          dependencies.index.lexicalSearch({
            terms: expansion.terms,
            model: dependencies.embedding.model,
            limit: RETRIEVAL_LIMITS.lexicalCandidates,
            filter,
          }),
          graphCandidatesPromise,
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
          ...(graphCandidates.length > 0
            ? [{ arm: "graph" as const, candidates: graphCandidates }]
            : []),
        ],
        RETRIEVAL_LIMITS.rrfK,
      ).slice(0, RETRIEVAL_LIMITS.fusionCandidates);

      if (fused.length === 0) {
        return {
          chunks: [],
          authorityOverlaps: [],
          authorityPolicy: AUTHORITY_PRECEDENCE,
          diagnostics: {
            embeddingModel: dependencies.embedding.model,
            rerankerModel: reranker?.model ?? null,
            denseCandidates: dense.length,
            lexicalCandidates: lexical.length,
            graphCandidates: graphCandidates.length,
            fusedCandidates: 0,
            rerankedCandidates: 0,
            returnedChunks: 0,
            droppedForInjection: 0,
            rerank: reranker ? "applied" : "disabled",
            graph: graphStatus,
            elapsedMs: Math.round(now() - startedAt),
            expandedTerms: expansion.expandedTerms,
            ambiguousAliases: expansion.ambiguousAliases,
          },
          ...(includeCandidateIds ? { candidateChunkIds: [] as string[] } : {}),
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
          // A cross-encoder has never seen the Algerian brand either, so an
          // expanded query is reranked with the substance terms included. The
          // brand stays in the string; the substance is what anchors the score.
          const rerankQuery =
            expansion.expandedTerms.length > 0 ? expansion.terms.join(" ") : query;
          const ranked = await reranker.rerank({
            query: rerankQuery,
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
        const descriptor = authorityDescriptor(candidate.authorityLevel);
        selected.push({
          ...candidate,
          authority: {
            level: descriptor.level,
            tier: candidate.authorityTier,
            label: descriptor.label,
            official: descriptor.official,
            description: descriptor.description,
          },
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
        authorityOverlaps: findAuthorityOverlaps(selected),
        authorityPolicy: AUTHORITY_PRECEDENCE,
        diagnostics: {
          embeddingModel: dependencies.embedding.model,
          rerankerModel: reranker?.model ?? null,
          denseCandidates: dense.length,
          lexicalCandidates: lexical.length,
          graphCandidates: graphCandidates.length,
          fusedCandidates: fused.length,
          rerankedCandidates: reranked.length,
          returnedChunks: selected.length,
          droppedForInjection,
          rerank: rerankStatus,
          graph: graphStatus,
          elapsedMs: Math.round(now() - startedAt),
          expandedTerms: expansion.expandedTerms,
          ambiguousAliases: expansion.ambiguousAliases,
        },
        ...(includeCandidateIds
          ? { candidateChunkIds: fused.map((candidate) => candidate.chunkId) }
          : {}),
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
    ...(match?.graphScore !== undefined ? { graph: match.graphScore } : {}),
    ...(match?.graphRank !== undefined ? { graphRank: match.graphRank } : {}),
    rrf: match?.rrfScore ?? 0,
    ...(rerankScore !== undefined ? { rerank: rerankScore } : {}),
  };
}

/**
 * The graph adapter already ranks its candidates, but the service re-ranks
 * them so a future adapter cannot inject an out-of-order or duplicate list
 * into fusion. RRF consumes the rank, so this is a correctness boundary, not
 * a cosmetic sort.
 */
function normalizeGraphCandidates(
  candidates: readonly RankedCandidate[],
  limit: number,
): RankedCandidate[] {
  const seen = new Set<string>();
  const normalized: Array<{ chunkId: string; score: number }> = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.chunkId !== "string" || candidate.chunkId.length === 0) {
      continue;
    }
    if (!Number.isFinite(candidate.score)) continue;
    if (seen.has(candidate.chunkId)) continue;
    seen.add(candidate.chunkId);
    normalized.push({ chunkId: candidate.chunkId, score: candidate.score });
  }
  return normalized
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function citationLabel(candidate: {
  readonly sourceName: string;
  readonly documentType: string;
  readonly sectionHeading: string;
  readonly authorityLevel: number;
}): string {
  // The rank is part of the citation, so it must survive truncation: a long
  // section heading may be cut, the authority marker may not.
  const rank = `autorité ${candidate.authorityLevel}/4`;
  const prefix = `${candidate.sourceName} · ${candidate.documentType} · `;
  const suffix = ` (${rank})`;
  const room = 180 - prefix.length - suffix.length;
  if (room <= 0) return `${prefix}${suffix}`.slice(0, 180);
  const heading =
    candidate.sectionHeading.length > room
      ? `${candidate.sectionHeading.slice(0, Math.max(0, room - 3))}...`
      : candidate.sectionHeading;
  return `${prefix}${heading}${suffix}`;
}
