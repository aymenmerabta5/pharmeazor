import "server-only";

export type {
  RankedCandidate,
  RerankStatus,
  RetrievalCandidate,
  RetrievalCitation,
  RetrievalDiagnostics,
  RetrievalFilter,
  RetrievalPrincipal,
  RetrievalRequest,
  RetrievalResult,
  RetrievalScores,
  RetrievedChunk,
} from "./contracts";
export { RetrievalError, isRetrievalError, type RetrievalErrorCode } from "./errors";
export {
  DEFAULT_RRF_K,
  fuseRankedLists,
  type FusedCandidate,
  type RankedList,
  type RetrievalArm,
} from "./fusion";
export { normalizeRetrievalRequest, RETRIEVAL_LIMITS } from "./policy";
export {
  LEXICAL_TOKENIZER_VERSION,
  lexicalDocumentLength,
  queryTerms,
  termFrequencies,
  tokenizeForLexical,
} from "./tokenize";
export type {
  DenseSearchInput,
  EmbeddingPort,
  LexicalSearchInput,
  RerankInput,
  RerankPort,
  RerankResult,
  RetrievalIndexPort,
} from "./ports";
export {
  createRetrievalService,
  type RetrievalService,
  type RetrievalServiceDependencies,
  type SearchOptions,
} from "./retrieval.service";
