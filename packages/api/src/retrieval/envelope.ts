import "server-only";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed server-to-server envelope.
 *
 * The Eve harness runs outside the Next.js server (and is mounted inside it in
 * development), so it cannot import the `server-only` service graph. It signs
 * the principal it resolved from its own session with the shared
 * `EVE_INTERNAL_AUTH_SECRET`; the route trusts only that signature. The
 * principal never comes from model output or a public request body.
 *
 * One implementation serves retrieval and the registry lookup, so the two
 * internal routes cannot drift in how they authenticate.
 */

const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_FILTER_VALUES = 20;
const MAX_FILTER_VALUE_CHARS = 64;
const MAX_PRINCIPAL_CHARS = 200;

export type JsonObject = Record<string, unknown>;

export function privateResponse(
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

export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function boundedString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximum) throw new Error(`${field} is out of bounds`);
  return trimmed;
}

export function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_FILTER_VALUES) {
    throw new Error(`${field} must be an array of at most ${MAX_FILTER_VALUES} values`);
  }
  return value.map((entry, index) =>
    boundedString(entry, `${field}[${index}]`, MAX_FILTER_VALUE_CHARS),
  );
}

export function requirePrincipalId(value: JsonObject): string {
  const principal = asObject(value.principal);
  if (!principal) throw new Error("principal is required");
  return boundedString(principal.id, "principal.id", MAX_PRINCIPAL_CHARS);
}

export type SignedEnvelopeResult =
  | { readonly ok: true; readonly envelope: JsonObject }
  | { readonly ok: false; readonly response: Response };

/**
 * Verify method, content type, shared secret, freshness, signature and JSON
 * shape in that order. Every failure is a private, no-store response with the
 * same code the retrieval route has always returned.
 */
export async function readSignedEnvelope(request: Request): Promise<SignedEnvelopeResult> {
  if (request.method !== "POST") {
    return {
      ok: false,
      response: privateResponse(405, "method_not_allowed", "Method not allowed.", {
        Allow: "POST",
      }),
    };
  }
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return {
      ok: false,
      response: privateResponse(415, "unsupported_media_type", "Expected application/json."),
    };
  }
  const secret = configuredSecret();
  if (!secret) {
    return {
      ok: false,
      response: privateResponse(
        503,
        "retrieval_auth_not_configured",
        "Eve internal authentication is not configured.",
      ),
    };
  }
  const bytes = await readBoundedBody(request);
  if (!bytes) {
    return {
      ok: false,
      response: privateResponse(413, "payload_too_large", "Request body is too large."),
    };
  }
  if (!authenticated(request, bytes, secret)) {
    return {
      ok: false,
      response: privateResponse(401, "invalid_retrieval_signature", "Invalid retrieval signature."),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return {
      ok: false,
      response: privateResponse(400, "invalid_retrieval_request", "Invalid JSON body."),
    };
  }
  const envelope = asObject(parsed);
  if (!envelope) {
    return {
      ok: false,
      response: privateResponse(400, "invalid_retrieval_request", "Invalid retrieval envelope."),
    };
  }
  return { ok: true, envelope };
}
