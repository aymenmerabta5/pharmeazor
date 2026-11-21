import type { RankedCandidate, RetrievalCandidate, RetrievalFilter } from "./contracts";

/**
 * Inward-facing retrieval ports. Adapters live in `packages/api`; domain code
 * never imports an HTTP client, a vector SDK, or a database driver.
 */

export interface EmbeddingPort {
  readonly model: string;
  readonly dimensions: number;
  embedQuery(text: string, signal?: AbortSignal): Promise<number[]>;
  embedDocuments(texts: readonly string[], signal?: AbortSignal): Promise<number[][]>;
}

export interface DenseSearchInput {
  readonly embedding: readonly number[];
  readonly model: string;
  readonly limit: number;
  readonly filter: RetrievalFilter;
}

export interface LexicalSearchInput {
  readonly terms: readonly string[];
  readonly model: string;
  readonly limit: number;
  readonly filter: RetrievalFilter;
}

export interface RetrievalIndexPort {
  denseSearch(input: DenseSearchInput): Promise<RankedCandidate[]>;
  lexicalSearch(input: LexicalSearchInput): Promise<RankedCandidate[]>;
  loadCandidates(chunkIds: readonly string[]): Promise<RetrievalCandidate[]>;
}

export interface RerankInput {
  readonly query: string;
  readonly documents: readonly string[];
  readonly topN: number;
  readonly signal?: AbortSignal;
}

export interface RerankResult {
  /** Zero-based index into `RerankInput.documents`. */
  readonly index: number;
  readonly score: number;
}

export interface RerankPort {
  readonly model: string;
  rerank(input: RerankInput): Promise<RerankResult[]>;
}
