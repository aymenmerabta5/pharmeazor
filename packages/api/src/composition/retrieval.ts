import {
  createRegistryService,
  createRetrievalService,
  type RegistryService,
  type RetrievalService,
} from "@repo/services/retrieval";
import { readRetrievalRuntimeConfig } from "../adapters/retrieval/config";
import { createHttpEmbeddingAdapter } from "../adapters/retrieval/embedding";
import { postgresRetrievalIndex } from "../adapters/retrieval/postgres";
import { postgresRegistry } from "../adapters/retrieval/registry";
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
    aliases: postgresRetrievalIndex,
    requireRerank: config.requireRerank,
    warn: (message) => console.warn(`[retrieval] ${message}`),
  });
}

/**
 * The register lookup needs no embedding server: it is a SQL query over 9.5k
 * rows. Keeping it out of `createRetrievalServiceFromEnv` means a register
 * question still works while the embedding service is down.
 */
export function createRegistryServiceFromEnv(): RegistryService {
  return createRegistryService({
    registry: postgresRegistry,
    warn: (message, detail) => console.warn(`[retrieval] ${message}`, detail),
  });
}
