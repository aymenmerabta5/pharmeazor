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
  /**
   * Documents per HTTP request. TEI rejects a request whose `texts` array
   * exceeds its `max_client_batch_size` (32 by default), so a wider rerank
   * window must be split rather than sent whole.
   */
  readonly batchSize: number;
}

export interface GraphRuntimeConfig {
  readonly url: string;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly timeoutMs: number;
  readonly entityLimit: number;
  readonly neighborLimit: number;
  readonly evidenceLimit: number;
  readonly chunkLimit: number;
  readonly candidateLimit: number;
}

export interface RetrievalRuntimeConfig {
  readonly embedding: EmbeddingRuntimeConfig;
  readonly reranker: RerankerRuntimeConfig | null;
  /**
   * Null unless `RETRIEVAL_GRAPH_ENABLED=true`. The graph arm is optional and
   * disabled by default; enabling it without a Neo4j target is a configuration
   * error, not a silent no-op.
   */
  readonly graph: GraphRuntimeConfig | null;
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

function readGraphRuntimeConfig(env: NodeJS.ProcessEnv): GraphRuntimeConfig {
  const url = trimmed(env.NEO4J_HTTP_URL);
  const user = trimmed(env.NEO4J_USER);
  const password = env.NEO4J_PASSWORD;
  if (!url || !user || !password) {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      "RETRIEVAL_GRAPH_ENABLED is true but NEO4J_HTTP_URL, NEO4J_USER, and NEO4J_PASSWORD are not all set",
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new RetrievalError("RETRIEVAL_NOT_CONFIGURED", "NEO4J_HTTP_URL must be an http(s) URL");
  }
  if (
    /REPLACE_WITH|CHANGE_ME/iu.test(url) ||
    /REPLACE_WITH|CHANGE_ME/iu.test(user) ||
    /REPLACE_WITH|CHANGE_ME/iu.test(password)
  ) {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      "NEO4J_HTTP_URL, NEO4J_USER, and NEO4J_PASSWORD still contain placeholder values",
    );
  }
  const database = trimmed(env.NEO4J_DATABASE) ?? "neo4j";
  if (!/^[A-Za-z0-9_.-]+$/u.test(database)) {
    throw new RetrievalError(
      "RETRIEVAL_NOT_CONFIGURED",
      "NEO4J_DATABASE contains unsupported characters",
    );
  }
  return {
    url: url.replace(/\/+$/, ""),
    user,
    password,
    database,
    timeoutMs: positiveInteger(env.RETRIEVAL_GRAPH_TIMEOUT_MS, 3_000, "RETRIEVAL_GRAPH_TIMEOUT_MS"),
    entityLimit: positiveInteger(
      env.RETRIEVAL_GRAPH_ENTITY_LIMIT,
      24,
      "RETRIEVAL_GRAPH_ENTITY_LIMIT",
    ),
    neighborLimit: positiveInteger(
      env.RETRIEVAL_GRAPH_NEIGHBOR_LIMIT,
      48,
      "RETRIEVAL_GRAPH_NEIGHBOR_LIMIT",
    ),
    evidenceLimit: positiveInteger(
      env.RETRIEVAL_GRAPH_EVIDENCE_LIMIT,
      160,
      "RETRIEVAL_GRAPH_EVIDENCE_LIMIT",
    ),
    chunkLimit: positiveInteger(
      env.RETRIEVAL_GRAPH_CHUNK_LIMIT,
      200,
      "RETRIEVAL_GRAPH_CHUNK_LIMIT",
    ),
    candidateLimit: positiveInteger(
      env.RETRIEVAL_GRAPH_CANDIDATE_LIMIT,
      30,
      "RETRIEVAL_GRAPH_CANDIDATE_LIMIT",
    ),
  };
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
        batchSize: Math.min(
          64,
          positiveInteger(env.RETRIEVAL_RERANKER_BATCH_SIZE, 32, "RETRIEVAL_RERANKER_BATCH_SIZE"),
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
    graph:
      (trimmed(env.RETRIEVAL_GRAPH_ENABLED) ?? "false").toLowerCase() === "true"
        ? readGraphRuntimeConfig(env)
        : null,
    requireRerank: (trimmed(env.RETRIEVAL_REQUIRE_RERANK) ?? "false").toLowerCase() === "true",
  };
}
