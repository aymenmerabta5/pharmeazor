/**
 * Retrieval contracts.
 *
 * These types are deliberately transport-neutral: the oRPC layer, the Eve
 * tool, and the offline indexer all pass the same shapes. A retrieval
 * principal is resolved server-side; a caller may narrow the corpus, but it
 * may never widen what the principal is allowed to read.
 */

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
  readonly sectionHeading: string;
  readonly sectionPath: string;
  readonly content: string;
  readonly contextualizedContent: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly authorityLevel: number;
  readonly documentType: string;
  readonly language: string;
  readonly medicineIds: readonly string[];
  readonly medicineNames: readonly string[];
  readonly sourceUrls: readonly string[];
  /** True when ingest detected instruction-like text in the chunk. */
  readonly injectionRisk: boolean;
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

export interface RetrievedChunk extends RetrievalCandidate {
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
}

export interface RetrievalResult {
  readonly chunks: readonly RetrievedChunk[];
  readonly diagnostics: RetrievalDiagnostics;
}
