import "server-only";

/**
 * Shared typed error for service-layer domain failures.
 * Routes map `code` to transport-safe ORPC errors via createServiceORPCError.
 */
export class ServiceError<TCode extends string = string> extends Error {
  readonly code: TCode;
  constructor(code: TCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
export function isServiceError(error: unknown): error is ServiceError<string> {
  return error instanceof ServiceError;
}
