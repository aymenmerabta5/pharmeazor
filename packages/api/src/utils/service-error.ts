import { ORPCError } from "@orpc/server";

type ORPCStatusCode = ConstructorParameters<typeof ORPCError>[0];

interface CodedORPCErrorOptions {
  message: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

interface CodedORPCErrorData {
  code: string;
  meta?: Record<string, unknown>;
}

interface CodedServiceError extends Error {
  code: string;
  meta?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCodedServiceError(error: unknown): error is CodedServiceError {
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") {
    return false;
  }
  return !("meta" in error) || error.meta === undefined || isRecord(error.meta);
}

const requestApplicationCodeAliases: Readonly<Record<string, string>> = {
  APPLICATION_UNAUTHENTICATED: "UNAUTHENTICATED",
  APPLICATION_ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  APPLICATION_EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  APPLICATION_ADMIN_REQUIRED: "ADMIN_FORBIDDEN",
  APPLICATION_CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  APPLICATION_BAD_REQUEST: "BAD_REQUEST",
  APPLICATION_NOT_FOUND: "NOT_FOUND",
  APPLICATION_NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  APPLICATION_CONFLICT: "CONFLICT",
  APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS",
  APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  APPLICATION_INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
};

export function createCodedORPCError(
  status: ORPCStatusCode,
  code: string,
  { message, meta, cause }: CodedORPCErrorOptions,
) {
  return new ORPCError<ORPCStatusCode, CodedORPCErrorData>(status, {
    message,
    data: { code, ...(meta ? { meta } : {}) },
    cause,
  });
}
export function throwCodedORPCError(
  status: ORPCStatusCode,
  code: string,
  options: CodedORPCErrorOptions,
): never {
  throw createCodedORPCError(status, code, options);
}
export function createServiceORPCError(
  error: unknown,
  {
    codeMap,
    fallbackMessage,
    fallbackCode = "BAD_REQUEST",
  }: {
    codeMap: Record<string, ORPCStatusCode>;
    fallbackMessage: string;
    fallbackCode?: ORPCStatusCode;
  },
): never {
  if (error instanceof ORPCError) throw error;
  if (isCodedServiceError(error)) {
    const publicCode = requestApplicationCodeAliases[error.code] ?? error.code;
    throw createCodedORPCError(codeMap[error.code] ?? fallbackCode, publicCode, {
      message: error.message,
      meta: error.meta,
      cause: error.cause ?? error,
    });
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: fallbackMessage, cause: error });
}
