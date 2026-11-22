export { BILLING_PLAN_IDS } from "./billing";
export type { BillingPlanId } from "./billing";
export {
  RETRIEVAL_WIRE_VERSION,
  buildCitationStamp,
  formatRetrievalDate,
  parseRetrievalRegistryResponse,
  parseRetrievalSearchResponse,
  type CitationStampInput,
  type RetrievalDate,
  type RetrievalWireAuthority,
  type RetrievalWireChunk,
  type RetrievalWireDiagnostics,
  type RetrievalWireError,
  type RetrievalWireOverlap,
  type RetrievalWireOverlapEntry,
  type RetrievalWireRegistryError,
  type RetrievalWireRegistryProduct,
  type RetrievalWireRegistryResponse,
  type RetrievalWireResponse,
} from "./retrieval";

export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
