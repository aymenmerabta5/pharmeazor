import type { RetrievalFilter, RetrievalRequest } from "./contracts";
import { RetrievalError } from "./errors";

/**
 * Retrieval budgets and fusion constants.
 *
 * The candidate depth follows the measured reranking evidence: 30 to 50 fused
 * candidates in, a handful out. Raising these numbers increases latency on
 * every call, so they are service policy rather than tool input.
 *
 * The rerank window covers the whole fusion window on purpose. A chunk that
 * only one arm found sits low in the fused order by construction, so a window
 * narrower than the fusion list silently discards exactly the identifier and
 * paraphrase hits the two arms exist to catch. Measured: an English question
 * put the correct French chunk at fused position 33 of 50; the reranker scored
 * it 0.99, but a 30-candidate window never showed it to the reranker.
 */
export const RETRIEVAL_LIMITS = {
  minQueryChars: 2,
  maxQueryChars: 512,
  defaultLimit: 6,
  maxLimit: 12,
  denseCandidates: 50,
  lexicalCandidates: 50,
  /**
   * The graph arm is a precision-oriented expansion, not a second full-text
   * search. A small candidate set keeps its contribution from flooding fusion
   * when a broad entity matches many documents.
   */
  graphCandidates: 30,
  fusionCandidates: 50,
  rerankCandidates: 50,
  rrfK: 60,
  bm25K1: 1.2,
  bm25B: 0.75,
  maxQueryTerms: 32,
  maxChunksPerArtifact: 3,
} as const;

const MEDICINE_ID = /^MED\d{3}$/;
const SECTION_CODE = /^[a-z][a-z0-9_]{1,47}$/;
const LANGUAGE = /^(en|fr|ar)$/;
const SOURCE_ID = /^[A-Z][A-Z0-9_]{1,47}$/;

function normalizeList(
  values: readonly string[] | undefined,
  pattern: RegExp,
  field: string,
): string[] {
  if (!values || values.length === 0) return [];
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!pattern.test(trimmed)) {
      throw new RetrievalError(
        "RETRIEVAL_INVALID_REQUEST",
        `${field} contains an invalid value: ${trimmed || "(empty)"}`,
      );
    }
    if (!normalized.includes(trimmed)) normalized.push(trimmed);
  }
  return normalized;
}

export function normalizeRetrievalRequest(request: RetrievalRequest): {
  query: string;
  limit: number;
  filter: RetrievalFilter;
  includeCandidateIds: boolean;
} {
  if (!request || typeof request.query !== "string") {
    throw new RetrievalError("RETRIEVAL_INVALID_REQUEST", "A retrieval query is required");
  }
  const query = request.query.trim();
  if (query.length < RETRIEVAL_LIMITS.minQueryChars) {
    throw new RetrievalError("RETRIEVAL_INVALID_REQUEST", "The retrieval query is too short");
  }
  if (query.length > RETRIEVAL_LIMITS.maxQueryChars) {
    throw new RetrievalError(
      "RETRIEVAL_INVALID_REQUEST",
      `The retrieval query exceeds ${RETRIEVAL_LIMITS.maxQueryChars} characters`,
    );
  }

  const requestedLimit = request.limit ?? RETRIEVAL_LIMITS.defaultLimit;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new RetrievalError(
      "RETRIEVAL_INVALID_REQUEST",
      "The result limit must be a positive integer",
    );
  }
  const limit = Math.min(requestedLimit, RETRIEVAL_LIMITS.maxLimit);

  return {
    query,
    limit,
    includeCandidateIds: request.includeCandidateIds === true,
    filter: {
      medicineIds: normalizeList(request.medicineIds, MEDICINE_ID, "medicineIds"),
      sectionCodes: normalizeList(request.sectionCodes, SECTION_CODE, "sectionCodes"),
      languages: normalizeList(request.languages, LANGUAGE, "languages"),
      sourceIds: normalizeList(request.sourceIds, SOURCE_ID, "sourceIds"),
    },
  };
}
