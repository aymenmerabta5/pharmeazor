import type {
  RankedCandidate,
  RegistryLookupInput,
  RegistryPage,
  RetrievalCandidate,
  RetrievalFilter,
} from "./contracts";

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

export interface GraphRetrievalInput {
  readonly query: string;
  /** Folded query terms, already bounded by service policy. */
  readonly terms: readonly string[];
  readonly limit: number;
  readonly filter: RetrievalFilter;
}

/**
 * Optional third retrieval arm over published graph evidence.
 *
 * The adapter owns both the Neo4j read and the exact-quote bridge back to
 * `retrieval_chunks`. It must return only chunk ids that exist in the hybrid
 * index and must apply `RetrievalFilter` before ranking. Returning `[]` is the
 * normal state while no published graph exists.
 */
export interface GraphRetrievalPort {
  search(input: GraphRetrievalInput): Promise<RankedCandidate[]>;
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

/**
 * Deterministic lookup over the Algerian product register.
 *
 * Deliberately separate from `RetrievalIndexPort`: this answers a row question
 * (`is this brand registered, on which schedule, by whom`) and must not be
 * satisfied by a nearest-neighbour search over prose.
 */
export interface RegistryPort {
  lookupProducts(input: RegistryLookupInput): Promise<RegistryPage>;
}
