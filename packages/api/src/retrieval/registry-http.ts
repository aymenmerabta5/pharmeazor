import "server-only";
import {
  REGISTRY_LIMITS,
  isRegistryError,
  type RegistryLookupRequest,
} from "@repo/services/retrieval";
import { createRegistryServiceFromEnv } from "../composition/retrieval";
import { asObject, privateResponse, readSignedEnvelope, requirePrincipalId } from "./envelope";
import { toRegistryWireResponse } from "./wire";

/**
 * Internal product-register transport.
 *
 * Same signed envelope as the search route, different question: this one
 * answers "is this product registered, on which schedule, by whom" from the
 * register tables. It is deliberately not a retrieval route — no embedding
 * server, no reranker, no similarity — so a register question still answers
 * while the models are down.
 *
 * The principal is required and verified but does not narrow the rows: the
 * register is public regulatory data. It is checked so an unauthenticated
 * caller cannot use this route as an open proxy.
 */

const MAX_QUERY_CHARS = REGISTRY_LIMITS.maxQueryChars;

function parseEnvelope(value: Record<string, unknown>): RegistryLookupRequest {
  requirePrincipalId(value);

  const request = asObject(value.request);
  if (!request) throw new Error("request is required");

  if (typeof request.query !== "string") throw new Error("request.query must be a string");
  const query = request.query.trim();
  if (query.length === 0 || query.length > MAX_QUERY_CHARS) {
    throw new Error(`request.query must be 1-${MAX_QUERY_CHARS} characters`);
  }

  const kind = request.kind;
  if (
    kind !== undefined &&
    kind !== "auto" &&
    kind !== "brand" &&
    kind !== "substance" &&
    kind !== "registration"
  ) {
    throw new Error("request.kind must be auto, brand, substance, or registration");
  }

  const limit = request.limit;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit))) {
    throw new Error("request.limit must be an integer");
  }

  const includeWithdrawn = request.includeWithdrawn;
  if (includeWithdrawn !== undefined && typeof includeWithdrawn !== "boolean") {
    throw new Error("request.includeWithdrawn must be a boolean");
  }

  return {
    query,
    ...(kind === undefined ? {} : { kind }),
    ...(limit === undefined ? {} : { limit }),
    ...(includeWithdrawn === undefined ? {} : { includeWithdrawn }),
  };
}

/**
 * POST /api/retrieval/registry
 *
 * Internal, server-to-server only.
 */
export async function handleRegistryLookup(request: Request): Promise<Response> {
  const envelope = await readSignedEnvelope(request);
  if (!envelope.ok) return envelope.response;

  let input: RegistryLookupRequest;
  try {
    input = parseEnvelope(envelope.envelope);
  } catch (error) {
    return privateResponse(
      400,
      "invalid_registry_request",
      error instanceof Error ? error.message : "Invalid registry envelope.",
    );
  }

  try {
    const service = createRegistryServiceFromEnv();
    const result = await service.lookup(input);
    return Response.json(toRegistryWireResponse(result), {
      headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
    });
  } catch (error) {
    if (isRegistryError(error)) {
      const status = error.code === "REGISTRY_INVALID_REQUEST" ? 400 : 503;
      return privateResponse(status, error.code, error.message);
    }
    console.error("[retrieval] registry lookup failed", error);
    return privateResponse(500, "registry_failed", "Product register lookup failed.");
  }
}
