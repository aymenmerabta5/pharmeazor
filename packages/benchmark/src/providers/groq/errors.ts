import { APICallError } from "ai";

export type ErrorClass = "transient" | "permanent";

export interface ClassifiedError {
  class: ErrorClass;
  status_code?: number;
  message: string;
  raw: unknown;
}

/**
 * Classify an error thrown by the AI SDK.
 *
 * Transient: worth retrying within a bounded budget.
 *   - HTTP 429 (rate limit)
 *   - HTTP 5xx (server / upstream failures)
 *   - network errors without a status
 *   - abort / timeout
 *   - provider returned unparseable output
 *
 * Permanent: do not retry.
 *   - HTTP 4xx other than 429 (bad request, unauthorized, forbidden, etc.)
 *   - anything the SDK marks as not retryable
 */
export function classifyGroqError(err: unknown): ClassifiedError {
  if (err instanceof APICallError) {
    const status = err.statusCode;
    if (typeof status === "number") {
      if (status === 429) {
        return { class: "transient", status_code: status, message: err.message, raw: err };
      }
      if (status >= 500) {
        return { class: "transient", status_code: status, message: err.message, raw: err };
      }
      if (status >= 400) {
        return { class: "permanent", status_code: status, message: err.message, raw: err };
      }
    }
    if (err.isRetryable === false) {
      return { class: "permanent", status_code: status, message: err.message, raw: err };
    }
    return { class: "transient", status_code: status, message: err.message, raw: err };
  }

  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return { class: "transient", message: err.message, raw: err };
    }
    return { class: "transient", message: err.message, raw: err };
  }

  return { class: "permanent", message: String(err), raw: err };
}
