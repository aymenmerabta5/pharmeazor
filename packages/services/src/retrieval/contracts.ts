/**
 * Retrieval contracts.
 *
 * These types are deliberately transport-neutral: the oRPC layer, the Eve
 * tool, and the offline indexer all pass the same shapes. A retrieval
 * principal is resolved server-side; a caller may narrow the corpus, but it
 * may never widen what the principal is allowed to read.
 */

import type { AuthorityOverlap } from "./authority";

export interface RetrievalPrincipal {
  /** Authenticated actor id. Never taken from a request body. */
  readonly actorId: string;
}

export interface RetrievalRequest {
  readonly query: string;
  readonly limit?: number;
  /** Semantic filters, not authorization filters. */
  readonly medicineIds?: readonly string[];
  readonly sectionCodes?: readonly string[];
  readonly languages?: readonly string[];
  readonly sourceIds?: readonly string[];
}

export interface RetrievalFilter {
  readonly medicineIds: readonly string[];
  readonly sectionCodes: readonly string[];
  readonly languages: readonly string[];
  readonly sourceIds: readonly string[];
}

export interface RankedCandidate {
  readonly chunkId: string;
  readonly score: number;
  /** One-based rank inside the arm that produced it. */
  readonly rank: number;
}

export interface RetrievalCandidate {
  readonly chunkId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly title: string;
  readonly sectionCode: string;
  /** Every section the chunk covers; packed chunks cover more than one. */
  readonly sectionCodes: readonly string[];
  readonly sectionHeading: string;
  readonly sectionPath: string;
  readonly content: string;
  readonly contextualizedContent: string;
  readonly sourceId: string;
  readonly sourceName: string;
  /** Source authority rank; lower wins. Assigned by the source registry. */
  readonly authorityLevel: number;
  readonly authorityTier: string | null;
  readonly documentType: string;
  readonly language: string;
  readonly medicineIds: readonly string[];
  readonly medicineNames: readonly string[];
  readonly sourceUrls: readonly string[];
  /** True when ingest detected instruction-like text in the chunk. */
  readonly injectionRisk: boolean;
  /**
   * When the regulator published or last revised the source document, as a
   * `YYYY-MM-DD` string, or null when the source did not state one.
   *
   * This is the currency of the clinical claim. It is never substituted with an
   * ingestion timestamp: a 2013 label extracted in 2026 is old evidence, and
   * reporting the extraction date in its place would say the opposite.
   */
  readonly publicationDate: string | null;
  /** When the application fetched the source document. */
  readonly collectedAt: string | null;
  /** When the application parsed and normalised the document. */
  readonly extractedAt: string | null;
  /** When the chunk entered the vector index. */
  readonly indexedAt: string | null;
  /** `EXTRACTED`, `PARTIAL`, or null when the source recorded no status. */
  readonly extractionStatus: string | null;
  /** True when the extraction pipeline flagged the document for review. */
  readonly reviewRequired: boolean;
}

export interface RetrievalScores {
  readonly dense?: number;
  readonly denseRank?: number;
  readonly lexical?: number;
  readonly lexicalRank?: number;
  readonly rrf: number;
  readonly rerank?: number;
}

export interface RetrievalCitation {
  /** Stable chunk id; the only citation identifier the model may use. */
  readonly chunkId: string;
  readonly label: string;
}

/** Authority metadata attached to every returned passage. */
export interface RetrievedAuthority {
  readonly level: number;
  readonly tier: string | null;
  readonly label: string;
  readonly official: boolean;
  readonly description: string;
}

export interface RetrievedChunk extends RetrievalCandidate {
  readonly authority: RetrievedAuthority;
  readonly scores: RetrievalScores;
  readonly citation: RetrievalCitation;
}

export type RerankStatus = "applied" | "disabled" | "failed";

export interface RetrievalDiagnostics {
  readonly embeddingModel: string;
  readonly rerankerModel: string | null;
  readonly denseCandidates: number;
  readonly lexicalCandidates: number;
  readonly fusedCandidates: number;
  readonly rerankedCandidates: number;
  readonly returnedChunks: number;
  readonly droppedForInjection: number;
  readonly rerank: RerankStatus;
  readonly elapsedMs: number;
  /** Terms the alias layer appended to the lexical query, if any. */
  readonly expandedTerms: readonly string[];
  /** Brands that matched more than one substance and were therefore not expanded. */
  readonly ambiguousAliases: readonly string[];
}

export interface RetrievalResult {
  readonly chunks: readonly RetrievedChunk[];
  /**
   * Passages covering the same medicine and section from sources of different
   * authority. The model follows `preferredChunkId` when they disagree.
   */
  readonly authorityOverlaps: readonly AuthorityOverlap[];
  /** Prompt-ready precedence rule, so the model never has to infer it. */
  readonly authorityPolicy: string;
  readonly diagnostics: RetrievalDiagnostics;
}
