import { createRetrievalService, type RetrievalService } from "@repo/services/retrieval";
import { readRetrievalRuntimeConfig } from "../adapters/retrieval/config";
import { createHttpEmbeddingAdapter } from "../adapters/retrieval/embedding";
import { postgresRetrievalIndex } from "../adapters/retrieval/postgres";
import { createHttpRerankerAdapter } from "../adapters/retrieval/reranker";

/**
 * Server composition root for retrieval.
 *
 * Constructed per call so a reload or a test can change the environment
 * without a stale singleton. Every dependency is a port; the service itself
 * never imports an adapter.
 */
export function createRetrievalServiceFromEnv(): RetrievalService {
  const config = readRetrievalRuntimeConfig();
  return createRetrievalService({
    index: postgresRetrievalIndex,
    embedding: createHttpEmbeddingAdapter(config.embedding),
    reranker: config.reranker ? createHttpRerankerAdapter(config.reranker) : null,
    requireRerank: config.requireRerank,
    warn: (message) => console.warn(`[retrieval] ${message}`),
  });
}
