import { createHmac } from "node:crypto";

import {
  parseRetrievalSearchResponse,
  type RetrievalWireChunk,
  type RetrievalWireResponse,
} from "@repo/contracts";

/**
 * Client for the application's internal retrieval route.
 *
 * The retrieval service lives behind `server-only` in the Next.js process, so
 * the harness cannot import it. This module signs a request with the shared
 * `EVE_INTERNAL_AUTH_SECRET` exactly like `agent/hooks/admission-lifecycle.ts`
 * does for lifecycle callbacks. Keep the envelope and header names in sync
 * with `packages/api/src/retrieval/http.ts`.
 *
 * The response shape is not parsed here. `@repo/contracts` owns the wire
 * contract, and the application builds the same object from the same types, so
 * a field added on one side cannot drift from the other.
 */

const SEARCH_PATH = "/api/retrieval/search";
const REQUEST_TIMEOUT_MS = 20_000;

export type RetrievalClientChunk = RetrievalWireChunk;
export type RetrievalClientResult = RetrievalWireResponse;

export interface RetrievalClientRequest {
  readonly query: string;
  readonly limit?: number;
  readonly medicineIds?: readonly string[];
  readonly sectionCodes?: readonly string[];
  readonly languages?: readonly string[];
  readonly sourceIds?: readonly string[];
}

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

function applicationOrigin(): string | null {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) return null;
  try {
    const value = new URL(configured);
    const loopback =
      value.hostname === "localhost" ||
      value.hostname === "127.0.0.1" ||
      value.hostname === "[::1]";
    if (
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      (value.protocol !== "https:" && !(value.protocol === "http:" && loopback))
    ) {
      return null;
    }
    return value.origin;
  } catch {
    return null;
  }
}

export async function searchMedicalCorpus(
  principalId: string,
  input: RetrievalClientRequest,
): Promise<RetrievalClientResult> {
  const origin = applicationOrigin();
  if (!origin) {
    throw new Error(
      "Medical corpus retrieval is unavailable: BETTER_AUTH_URL must be an absolute http(s) URL for this deployment.",
    );
  }
  const secret = configuredSecret();
  if (!secret) {
    throw new Error(
      "Medical corpus retrieval is unavailable: EVE_INTERNAL_AUTH_SECRET is not configured.",
    );
  }

  const body = JSON.stringify({
    principal: { id: principalId },
    request: {
      query: input.query,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.medicineIds?.length ? { medicineIds: input.medicineIds } : {}),
      ...(input.sectionCodes?.length ? { sectionCodes: input.sectionCodes } : {}),
      ...(input.languages?.length ? { languages: input.languages } : {}),
      ...(input.sourceIds?.length ? { sourceIds: input.sourceIds } : {}),
    },
  });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");

  let response: Response;
  try {
    response = await fetch(new URL(SEARCH_PATH, origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GhostInit-Eve-Signature": signature,
        "X-GhostInit-Eve-Timestamp": timestamp,
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "network failure";
    throw new Error(`Medical corpus retrieval request failed: ${detail}`);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Medical corpus retrieval returned an unreadable response (HTTP ${response.status}).`,
    );
  }

  // A proxy or cache can return a non-2xx status with a body that still says
  // `ok: true`. Trust the status in that case rather than the body.
  const claimsOk =
    typeof payload === "object" && payload !== null && (payload as { ok?: unknown }).ok === true;
  if (!response.ok && claimsOk) {
    throw new Error(`Medical corpus retrieval failed (HTTP ${response.status})`);
  }

  return parseRetrievalSearchResponse(payload);
}
