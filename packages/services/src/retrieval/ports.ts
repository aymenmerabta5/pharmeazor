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

/** One brand alias and the substance terms it stands for. */
export interface AliasMatch {
  /** Folded alias, space-joined; the key the lookup matched. */
  readonly aliasNorm: string;
  /** Display form, quoted back to the agent for disambiguation. */
  readonly aliasRaw: string;
  /** Folded substance labels. More than one means the brand is ambiguous. */
  readonly dciNorms: readonly string[];
  readonly dciLabels: readonly string[];
  readonly ambiguous: boolean;
}

/**
 * Brand lookup for query expansion.
 *
 * Optional: when it is absent or fails, retrieval runs on the original query.
 * Expansion raises recall but is not a correctness requirement, so its outage
 * must not take the corpus offline.
 */
export interface AliasPort {
  resolveAliases(keys: readonly string[]): Promise<readonly AliasMatch[]>;
}
