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
  RetrievedAuthority,
  RetrievedChunk,
} from "./contracts";
export { RetrievalError, isRetrievalError, type RetrievalErrorCode } from "./errors";
export {
  AUTHORITY_PRECEDENCE,
  authorityDescriptor,
  authorityLabel,
  claimScopeForSource,
  compareAuthority,
  findAuthorityOverlaps,
  isOfficialAuthority,
  numericClaims,
  type AuthorityDescriptor,
  type AuthorityOverlap,
  type AuthorityOverlapEntry,
  type AuthorityOverlapInput,
  type ClaimScope,
} from "./authority";
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
