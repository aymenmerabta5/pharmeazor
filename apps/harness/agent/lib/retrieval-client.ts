import { createHmac } from "node:crypto";

/**
 * Client for the application's internal retrieval route.
 *
 * The retrieval service lives behind `server-only` in the Next.js process, so
 * the harness cannot import it. This module signs a request with the shared
 * `EVE_INTERNAL_AUTH_SECRET` exactly like `agent/hooks/admission-lifecycle.ts`
 * does for lifecycle callbacks. Keep the envelope and header names in sync
 * with `packages/api/src/retrieval/http.ts`.
 */

const SEARCH_PATH = "/api/retrieval/search";
const REQUEST_TIMEOUT_MS = 20_000;

export interface RetrievalClientRequest {
  readonly query: string;
  readonly limit?: number;
  readonly medicineIds?: readonly string[];
  readonly sectionCodes?: readonly string[];
  readonly languages?: readonly string[];
  readonly sourceIds?: readonly string[];
}

export interface RetrievalClientChunk {
  readonly chunkId: string;
  readonly citation: string;
  readonly title: string;
  readonly sectionHeading: string;
  readonly sectionPath: string;
  readonly sourceName: string;
  readonly documentType: string;
  readonly language: string;
  readonly authorityLevel: number;
  readonly medicineNames: readonly string[];
  readonly content: string;
  readonly contentTruncated: boolean;
}

export interface RetrievalClientResult {
  readonly chunks: readonly RetrievalClientChunk[];
  readonly diagnostics: {
    readonly embeddingModel: string;
    readonly rerankerModel: string | null;
    readonly rerank: string;
    readonly denseCandidates: number;
    readonly lexicalCandidates: number;
    readonly returnedChunks: number;
    readonly elapsedMs: number;
  };
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Retrieval response is missing ${field}`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Retrieval response has an invalid ${field}`);
  }
  return value;
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
  const envelope = asRecord(payload);
  if (!response.ok || !envelope || envelope.ok !== true) {
    const code = envelope && typeof envelope.code === "string" ? `${envelope.code}: ` : "";
    const message =
      envelope && typeof envelope.error === "string" ? envelope.error : `HTTP ${response.status}`;
    throw new Error(`Medical corpus retrieval failed (${code}${message})`);
  }

  if (!Array.isArray(envelope.chunks)) {
    throw new Error("Medical corpus retrieval returned no chunk list.");
  }
  const chunks: RetrievalClientChunk[] = envelope.chunks.map((entry, index) => {
    const chunk = asRecord(entry);
    if (!chunk) throw new Error(`Retrieval response chunk ${index} is not an object`);
    const citation = asRecord(chunk.citation);
    if (!citation) throw new Error(`Retrieval response chunk ${index} has no citation`);
    const content = requireString(chunk.content, `chunks[${index}].content`);
    const truncated = content.length > 4_000;
    return {
      chunkId: requireString(chunk.chunkId, `chunks[${index}].chunkId`),
      citation: requireString(citation.label, `chunks[${index}].citation.label`),
      title: requireString(chunk.title, `chunks[${index}].title`),
      sectionHeading: requireString(chunk.sectionHeading, `chunks[${index}].sectionHeading`),
      sectionPath: requireString(chunk.sectionPath, `chunks[${index}].sectionPath`),
      sourceName: requireString(chunk.sourceName, `chunks[${index}].sourceName`),
      documentType: requireString(chunk.documentType, `chunks[${index}].documentType`),
      language: requireString(chunk.language, `chunks[${index}].language`),
      authorityLevel: requireNumber(chunk.authorityLevel, `chunks[${index}].authorityLevel`),
      medicineNames: Array.isArray(chunk.medicineNames)
        ? chunk.medicineNames.filter((name): name is string => typeof name === "string")
        : [],
      content: truncated ? `${content.slice(0, 4_000)}…` : content,
      contentTruncated: truncated,
    };
  });

  const diagnostics = asRecord(envelope.diagnostics) ?? {};
  return {
    chunks,
    diagnostics: {
      embeddingModel: optionalString(diagnostics.embeddingModel) ?? "unknown",
      rerankerModel: optionalString(diagnostics.rerankerModel),
      rerank: optionalString(diagnostics.rerank) ?? "unknown",
      denseCandidates: requireNumber(diagnostics.denseCandidates ?? 0, "denseCandidates"),
      lexicalCandidates: requireNumber(diagnostics.lexicalCandidates ?? 0, "lexicalCandidates"),
      returnedChunks: requireNumber(diagnostics.returnedChunks ?? chunks.length, "returnedChunks"),
      elapsedMs: requireNumber(diagnostics.elapsedMs ?? 0, "elapsedMs"),
    },
  };
}
