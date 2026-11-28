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
  /**
   * Offline evaluation only: include the fused candidate ids before the result
   * limit is applied. Never set this from a request path that reaches a model.
   */
  readonly includeCandidateIds?: boolean;
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
  /** Graph evidence score, present only when the optional graph arm ran. */
  readonly graph?: number;
  readonly graphRank?: number;
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

/**
 * State of the optional graph arm.
 *
 * `applied` means the arm ran, even if it found nothing. `failed` means the
 * arm was enabled but its Neo4j or bridge query failed, and the hybrid result
 * was returned without it. A failed graph arm never fails retrieval.
 */
export type GraphRetrievalStatus = "applied" | "disabled" | "failed";

export interface RetrievalDiagnostics {
  readonly embeddingModel: string;
  readonly rerankerModel: string | null;
  readonly denseCandidates: number;
  readonly lexicalCandidates: number;
  /** Candidates the graph arm contributed before fusion, after deduplication. */
  readonly graphCandidates: number;
  readonly fusedCandidates: number;
  readonly rerankedCandidates: number;
  readonly returnedChunks: number;
  readonly droppedForInjection: number;
  readonly rerank: RerankStatus;
  readonly graph: GraphRetrievalStatus;
  readonly elapsedMs: number;
  /** Terms the alias layer appended to the lexical query, if any. */
  readonly expandedTerms: readonly string[];
  /** Brands that matched more than one substance and were therefore not expanded. */
  readonly ambiguousAliases: readonly string[];
}

/** How a registry query should be matched. */
export type RegistryQueryKind = "auto" | "brand" | "substance" | "registration";

/**
 * One row of the Algerian product register.
 *
 * These are register facts. `registrationStatus` and `withdrawalReason` are the
 * reason this table exists: a brand that is no longer registered must not be
 * presented as available, and a vector index cannot answer that reliably.
 */
export interface RegistryProduct {
  readonly registrationNumber: string;
  readonly brand: string;
  readonly dci: string | null;
  readonly dciCode: string | null;
  readonly form: string | null;
  readonly dosage: string | null;
  readonly pack: string | null;
  /** `LISTE I`, `LISTE II`, `STUPEFIANT`, or null. */
  readonly schedule: string | null;
  readonly holder: string | null;
  readonly holderCountry: string | null;
  /** `GE` (generic), `RE` (reference), `BIO`, or null. */
  readonly productType: string | null;
  /** `registered`, `withdrawn`, `non_renewed`, or `unknown`. */
  readonly registrationStatus: string;
  readonly withdrawalDate: string | null;
  readonly withdrawalReason: string | null;
  readonly shelfLife: string | null;
  readonly isCombination: boolean;
  readonly inScope: boolean;
  readonly medicineIds: readonly string[];
}

export interface RegistryLookupInput {
  readonly query: string;
  readonly kind: RegistryQueryKind;
  readonly limit: number;
  readonly includeWithdrawn: boolean;
  /** True when the query looks like a registration number rather than a name. */
  readonly registrationShaped: boolean;
}

export interface RegistryPage {
  readonly products: readonly RegistryProduct[];
  /** Rows matching the query, before the page limit. */
  readonly total: number;
  /** True when the register held more rows than the caller asked for. */
  readonly truncated: boolean;
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
  /** Present only when `includeCandidateIds` was requested, for offline evaluation. */
  readonly candidateChunkIds?: readonly string[];
}
