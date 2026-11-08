import "server-only";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { agentAdmissionPort } from "./admission-adapter";
import {
  isValidEveAdmissionLeaseId,
  isValidEveRuntimeEventId,
  isValidEveRuntimeEventType,
  isValidEveSessionId,
} from "@repo/services/eve";

const MAX_CALLBACK_BYTES = 4 * 1024;
const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type JsonObject = Record<string, unknown>;

function privateResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, code, error: message },
    { status, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
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
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_CALLBACK_BYTES) return null;
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
      if (length > MAX_CALLBACK_BYTES) {
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

function asObject(bytes: Uint8Array): JsonObject | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

export async function handleEveLifecycleCallback(request: Request): Promise<Response> {
  if (request.method !== "POST")
    return privateResponse(405, "method_not_allowed", "Method not allowed.");
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    return privateResponse(415, "unsupported_media_type", "Expected application/json.");
  }
  const secret = configuredSecret();
  if (!secret)
    return privateResponse(
      503,
      "eve_not_configured",
      "Eve lifecycle authentication is not configured.",
    );
  const bytes = await readBoundedBody(request);
  if (!bytes) return privateResponse(413, "payload_too_large", "Request body is too large.");
  if (!authenticated(request, bytes, secret)) {
    return privateResponse(401, "invalid_lifecycle_signature", "Invalid Eve lifecycle signature.");
  }
  const value = asObject(bytes);
  if (!value)
    return privateResponse(400, "invalid_lifecycle_event", "Invalid Eve lifecycle event.");
  const eventAtValue = value.eventAt;
  const eventId = value.eventId;
  const eventType = value.eventType;
  const eveSessionId = value.eveSessionId;
  const leaseId = value.leaseId;
  if (
    typeof eventAtValue !== "string" ||
    typeof eventId !== "string" ||
    typeof eventType !== "string" ||
    typeof eveSessionId !== "string" ||
    (leaseId !== undefined && typeof leaseId !== "string") ||
    !isValidEveRuntimeEventId(eventId) ||
    !isValidEveRuntimeEventType(eventType) ||
    !isValidEveSessionId(eveSessionId) ||
    (typeof leaseId === "string" && !isValidEveAdmissionLeaseId(leaseId))
  ) {
    return privateResponse(400, "invalid_lifecycle_event", "Invalid Eve lifecycle event.");
  }
  const eventAt = new Date(eventAtValue);
  const now = new Date();
  // eventAt is Eve-owned metadata. Do not compare it with the application
  // clock: durable steps may run on a host whose wall clock is skewed. Replay
  // protection is the signed request timestamp plus the durable event-id fence.
  if (!Number.isFinite(eventAt.getTime())) {
    return privateResponse(
      400,
      "invalid_lifecycle_event",
      "Invalid Eve lifecycle event timestamp.",
    );
  }
  try {
    await agentAdmissionPort.recordRuntimeEvent({
      eventAt,
      eventId,
      eventType,
      eveSessionId,
      ...(typeof leaseId === "string" ? { leaseId } : {}),
      receivedAt: now,
    });
  } catch {
    return privateResponse(
      503,
      "eve_lifecycle_unavailable",
      "Eve lifecycle storage is unavailable.",
    );
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}
