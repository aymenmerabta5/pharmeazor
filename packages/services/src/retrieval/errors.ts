export type RetrievalErrorCode =
  | "RETRIEVAL_UNAUTHENTICATED"
  | "RETRIEVAL_INVALID_REQUEST"
  | "RETRIEVAL_NOT_CONFIGURED"
  | "RETRIEVAL_INDEX_EMPTY"
  | "RETRIEVAL_EMBEDDING_FAILED"
  | "RETRIEVAL_RERANK_FAILED"
  | "RETRIEVAL_INDEX_FAILED";

export class RetrievalError extends Error {
  readonly code: RetrievalErrorCode;

  constructor(code: RetrievalErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "RetrievalError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function isRetrievalError(error: unknown): error is RetrievalError {
  return error instanceof RetrievalError;
}
