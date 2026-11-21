import { RetrievalError } from "@repo/services/retrieval";

/**
 * Retrieval runtime configuration.
 *
 * These keys are owner-approved extension settings, so they are read directly
 * instead of being added to the generator-owned server schema. They are
 * server-only: never prefix them with NEXT_PUBLIC_ or EXPO_PUBLIC_.
 */

export interface EmbeddingRuntimeConfig {
  readonly url: string;
  readonly model: string;
  readonly dimensions: number;
  readonly mode: "tei" | "openai";
  readonly apiKey?: string;
  readonly timeoutMs: number;
  readonly batchSize: number;
}

export interface RerankerRuntimeConfig {
  readonly url: string;
  readonly model: string;
  readonly apiKey?: string;
  readonly timeoutMs: number;
}

export interface RetrievalRuntimeConfig {
  readonly embedding: EmbeddingRuntimeConfig;
  readonly reranker: RerankerRuntimeConfig | null;
  readonly requireRerank: boolean;
}

const BGE_M3_DIMENSIONS = 1024;

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RetrievalError("RETRIEVAL_NOT_CONFIGURED", `${name} must be a positive integer`);
  }
  return parsed;
}

export function readRetrievalRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RetrievalRuntimeConfig {
  const url = trimmed(env.RETRIEVAL_EMBEDDING_URL);
  if (!url) {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      "Retrieval is not configured: set RETRIEVAL_EMBEDDING_URL to a BGE-M3 HTTP endpoint and run bun run retrieval:ingest",
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      "RETRIEVAL_EMBEDDING_URL must be an http(s) URL",
    );
  }

  const mode = (trimmed(env.RETRIEVAL_EMBEDDING_MODE) ?? "tei").toLowerCase();
  if (mode !== "tei" && mode !== "openai") {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      "RETRIEVAL_EMBEDDING_MODE must be tei or openai",
    );
  }

  const dimensions = positiveInteger(
    env.RETRIEVAL_EMBEDDING_DIMENSIONS,
    BGE_M3_DIMENSIONS,
    "RETRIEVAL_EMBEDDING_DIMENSIONS",
  );
  if (dimensions !== BGE_M3_DIMENSIONS) {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      `The retrieval schema stores ${BGE_M3_DIMENSIONS}-dimensional BGE-M3 vectors; RETRIEVAL_EMBEDDING_DIMENSIONS must be ${BGE_M3_DIMENSIONS}`,
    );
  }

  const rerankerUrl = trimmed(env.RETRIEVAL_RERANKER_URL);
  const reranker = rerankerUrl
    ? {
        url: rerankerUrl,
        model: trimmed(env.RETRIEVAL_RERANKER_MODEL) ?? "BAAI/bge-reranker-v2-m3",
        ...(trimmed(env.RETRIEVAL_RERANKER_API_KEY)
          ? { apiKey: trimmed(env.RETRIEVAL_RERANKER_API_KEY)! }
          : {}),
        timeoutMs: positiveInteger(
          env.RETRIEVAL_RERANKER_TIMEOUT_MS,
          10_000,
          "RETRIEVAL_RERANKER_TIMEOUT_MS",
        ),
      }
    : null;

  return {
    embedding: {
      url: url.replace(/\/+$/, ""),
      model: trimmed(env.RETRIEVAL_EMBEDDING_MODEL) ?? "BAAI/bge-m3",
      dimensions,
      mode,
      ...(trimmed(env.RETRIEVAL_EMBEDDING_API_KEY)
        ? { apiKey: trimmed(env.RETRIEVAL_EMBEDDING_API_KEY)! }
        : {}),
      timeoutMs: positiveInteger(
        env.RETRIEVAL_EMBEDDING_TIMEOUT_MS,
        20_000,
        "RETRIEVAL_EMBEDDING_TIMEOUT_MS",
      ),
      batchSize: Math.min(
        64,
        positiveInteger(env.RETRIEVAL_EMBEDDING_BATCH_SIZE, 16, "RETRIEVAL_EMBEDDING_BATCH_SIZE"),
      ),
    },
    reranker,
    requireRerank: (trimmed(env.RETRIEVAL_REQUIRE_RERANK) ?? "false").toLowerCase() === "true",
  };
}
