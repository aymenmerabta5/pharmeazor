import "server-only";

export type StorageErrorCode =
  | "STORAGE_UNAUTHENTICATED"
  | "STORAGE_ACTOR_BANNED"
  | "STORAGE_FORBIDDEN"
  | "STORAGE_INVALID_FILE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "STORAGE_ATTACHMENT_NOT_FOUND"
  | "STORAGE_WRITE_FAILED";

export class StorageServiceError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "StorageServiceError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
