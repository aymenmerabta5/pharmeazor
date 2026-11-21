import type { RetrievalFilter, RetrievalRequest } from "./contracts";
import { RetrievalError } from "./errors";

/**
 * Retrieval budgets and fusion constants.
 *
 * The candidate depth follows the measured reranking evidence: 30 to 50 fused
 * candidates in, a handful out. Raising these numbers increases latency on
 * every call, so they are service policy rather than tool input.
 */
export const RETRIEVAL_LIMITS = {
  minQueryChars: 2,
  maxQueryChars: 512,
  defaultLimit: 6,
  maxLimit: 12,
  denseCandidates: 50,
  lexicalCandidates: 50,
  fusionCandidates: 50,
  rerankCandidates: 30,
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
    filter: {
      medicineIds: normalizeList(request.medicineIds, MEDICINE_ID, "medicineIds"),
      sectionCodes: normalizeList(request.sectionCodes, SECTION_CODE, "sectionCodes"),
      languages: normalizeList(request.languages, LANGUAGE, "languages"),
      sourceIds: normalizeList(request.sourceIds, SOURCE_ID, "sourceIds"),
    },
  };
}
