import "server-only";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  isRetrievalError,
  type RetrievalErrorCode,
  type RetrievalRequest,
} from "@repo/services/retrieval";
import { createRetrievalServiceFromEnv } from "../composition/retrieval";

/**
 * Internal retrieval transport.
 *
 * The Eve harness runs outside the Next.js server (and is mounted inside it in
 * development), so it cannot import the `server-only` service graph. It calls
 * this route instead, signing the principal it resolved from its own session
 * with the shared `EVE_INTERNAL_AUTH_SECRET`. The principal never comes from
 * model output or the request body of a user-facing route.
 *
 * The signature scheme mirrors `packages/api/src/harness/lifecycle-callback.ts`
 * on purpose: one shared secret, one timestamped HMAC envelope.
 */

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_FILTER_VALUES = 20;
const MAX_FILTER_VALUE_CHARS = 64;
const MAX_PRINCIPAL_CHARS = 200;

type JsonObject = Record<string, unknown>;

function privateResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { ok: false, code, error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        ...headers,
      },
    },
  );
}

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_REQUEST_BYTES) return null;
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function authenticated(request: Request, body: Uint8Array, secret: string): boolean {
  const timestamp = request.headers.get("x-ghostinit-eve-timestamp") ?? "";
  const signature = request.headers.get("x-ghostinit-eve-signature") ?? "";
  if (!/^\d{13}$/.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) return false;
  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS
  ) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");
  const expectedBytes = Buffer.from(expected, "ascii");
  const receivedBytes = Buffer.from(signature, "ascii");
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function boundedString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) throw new Error(`${field} is out of bounds`);
  return trimmed;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_FILTER_VALUES) {
    throw new Error(`${field} must be an array of at most ${MAX_FILTER_VALUES} values`);
  }
  return value.map((entry, index) =>
    boundedString(entry, `${field}[${index}]`, MAX_FILTER_VALUE_CHARS),
  );
}

function parseEnvelope(value: JsonObject): {
  actorId: string;
  request: RetrievalRequest;
} {
  const principal = asObject(value.principal);
  if (!principal) throw new Error("principal is required");
  const actorId = boundedString(principal.id, "principal.id", MAX_PRINCIPAL_CHARS);

  const request = asObject(value.request);
  if (!request) throw new Error("request is required");
  const query = boundedString(request.query, "query", 512);
  const limit =
    request.limit === undefined
      ? undefined
      : (() => {
          if (typeof request.limit !== "number" || !Number.isInteger(request.limit)) {
            throw new Error("limit must be an integer");
          }
          return request.limit;
        })();
  const medicineIds = optionalStringArray(request.medicineIds, "medicineIds");
  const sectionCodes = optionalStringArray(request.sectionCodes, "sectionCodes");
  const languages = optionalStringArray(request.languages, "languages");
  const sourceIds = optionalStringArray(request.sourceIds, "sourceIds");

  return {
    actorId,
    request: {
      query,
      ...(limit === undefined ? {} : { limit }),
      ...(medicineIds ? { medicineIds } : {}),
      ...(sectionCodes ? { sectionCodes } : {}),
      ...(languages ? { languages } : {}),
      ...(sourceIds ? { sourceIds } : {}),
    },
  };
}

const STATUS_BY_CODE: Record<RetrievalErrorCode, number> = {
  RETRIEVAL_UNAUTHENTICATED: 401,
  RETRIEVAL_INVALID_REQUEST: 400,
  RETRIEVAL_NOT_CONFIGURED: 503,
  RETRIEVAL_INDEX_EMPTY: 404,
  RETRIEVAL_EMBEDDING_FAILED: 502,
  RETRIEVAL_RERANK_FAILED: 502,
  RETRIEVAL_INDEX_FAILED: 500,
};

/**
 * POST /api/retrieval/search
 *
 * Internal, server-to-server only. The Eve harness signs the body with
 * `EVE_INTERNAL_AUTH_SECRET`; no browser traffic may reach this route.
 */
export async function handleRetrievalSearch(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return privateResponse(405, "method_not_allowed", "Method not allowed.", { Allow: "POST" });
  }
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return privateResponse(415, "unsupported_media_type", "Expected application/json.");
  }
  const secret = configuredSecret();
  if (!secret) {
    return privateResponse(
      503,
      "retrieval_auth_not_configured",
      "Eve internal authentication is not configured.",
    );
  }
  const bytes = await readBoundedBody(request);
  if (!bytes) return privateResponse(413, "payload_too_large", "Request body is too large.");
  if (!authenticated(request, bytes, secret)) {
    return privateResponse(401, "invalid_retrieval_signature", "Invalid retrieval signature.");
  }

  let envelope: JsonObject;
  try {
    envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as JsonObject;
  } catch {
    return privateResponse(400, "invalid_retrieval_request", "Invalid JSON body.");
  }
  const parsed = asObject(envelope);
  if (!parsed) {
    return privateResponse(400, "invalid_retrieval_request", "Invalid retrieval envelope.");
  }

  let input: ReturnType<typeof parseEnvelope>;
  try {
    input = parseEnvelope(parsed);
  } catch (error) {
    return privateResponse(
      400,
      "invalid_retrieval_request",
      error instanceof Error ? error.message : "Invalid retrieval envelope.",
    );
  }

  try {
    const service = createRetrievalServiceFromEnv();
    const result = await service.search({ actorId: input.actorId }, input.request);
    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
    );
  } catch (error) {
    if (isRetrievalError(error)) {
      const status = STATUS_BY_CODE[error.code] ?? 500;
      const message =
        error.code === "RETRIEVAL_INDEX_FAILED" ? "Retrieval index query failed." : error.message;
      return privateResponse(status, error.code, message);
    }
    console.error("[retrieval] search failed", error);
    return privateResponse(500, "retrieval_failed", "Retrieval failed.");
  }
}
