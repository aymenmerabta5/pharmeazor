import "server-only";

export type RequestApplicationErrorCode =
  | "APPLICATION_UNAUTHENTICATED"
  | "APPLICATION_ACCOUNT_SUSPENDED"
  | "APPLICATION_EMAIL_NOT_VERIFIED"
  | "APPLICATION_ADMIN_REQUIRED"
  | "APPLICATION_CAPABILITY_UNAVAILABLE"
  | "APPLICATION_BAD_REQUEST"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_NOT_IMPLEMENTED"
  | "APPLICATION_CONFLICT"
  | "APPLICATION_RATE_LIMITED"
  | "APPLICATION_RATE_LIMIT_UNAVAILABLE"
  | "APPLICATION_INTERNAL_ERROR";

export class RequestApplicationError extends Error {
  readonly code: RequestApplicationErrorCode;
  constructor(code: RequestApplicationErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RequestApplicationError";
    this.code = code;
  }
}
