import "server-only";
import {
  isRetrievalError,
  type RetrievalErrorCode,
  type RetrievalRequest,
} from "@repo/services/retrieval";
import { createRetrievalServiceFromEnv } from "../composition/retrieval";
import {
  asObject,
  boundedString,
  optionalStringArray,
  privateResponse,
  readSignedEnvelope,
  requirePrincipalId,
  type JsonObject,
} from "./envelope";
import { toRetrievalWireResponse } from "./wire";

/**
 * Internal retrieval transport.
 *
 * The Eve harness runs outside the Next.js server (and is mounted inside it in
 * development), so it cannot import the `server-only` service graph. It calls
 * this route instead, signing the principal it resolved from its own session
 * with the shared `EVE_INTERNAL_AUTH_SECRET`. The principal never comes from
 * model output or the request body of a user-facing route.
 *
 * Authentication, body bounds and JSON parsing live in `./envelope`, which the
 * registry route uses too, so the two internal routes cannot drift apart in
 * how they decide a caller is trustworthy.
 */

const MAX_QUERY_CHARS = 512;

function parseEnvelope(value: JsonObject): {
  actorId: string;
  request: RetrievalRequest;
} {
  const actorId = requirePrincipalId(value);

  const request = asObject(value.request);
  if (!request) throw new Error("request is required");
  const query = boundedString(request.query, "query", MAX_QUERY_CHARS);
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
  const envelope = await readSignedEnvelope(request);
  if (!envelope.ok) return envelope.response;

  let input: ReturnType<typeof parseEnvelope>;
  try {
    input = parseEnvelope(envelope.envelope);
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
    return Response.json(toRetrievalWireResponse(result), {
      headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
    });
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
