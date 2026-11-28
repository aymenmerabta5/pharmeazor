import {
  createRegistryService,
  createRetrievalService,
  type RegistryService,
  type RetrievalService,
} from "@repo/services/retrieval";
import { readRetrievalRuntimeConfig } from "../adapters/retrieval/config";
import { createHttpEmbeddingAdapter } from "../adapters/retrieval/embedding";
import { createNeo4jGraphRetrieval } from "../adapters/retrieval/graph";
import { postgresRetrievalIndex } from "../adapters/retrieval/postgres";
import { postgresRegistry } from "../adapters/retrieval/registry";
import { createHttpRerankerAdapter } from "../adapters/retrieval/reranker";
import { HttpNeo4jClient } from "../adapters/retrieval/neo4j-http";

/**
 * Server composition root for retrieval.
 *
 * Constructed per call so a reload or a test can change the environment
 * without a stale singleton. Every dependency is a port; the service itself
 * never imports an adapter.
 */
export function createRetrievalServiceFromEnv(): RetrievalService {
  const config = readRetrievalRuntimeConfig();
  const graph = config.graph
    ? createNeo4jGraphRetrieval({
        client: new HttpNeo4jClient({
          url: config.graph.url,
          user: config.graph.user,
          password: config.graph.password,
          database: config.graph.database,
          timeoutMs: config.graph.timeoutMs,
        }),
        model: config.embedding.model,
        limits: {
          entityLimit: config.graph.entityLimit,
          neighborLimit: config.graph.neighborLimit,
          evidenceLimit: config.graph.evidenceLimit,
        },
        candidateLimit: config.graph.candidateLimit,
        chunkLimit: config.graph.chunkLimit,
      })
    : null;
  return createRetrievalService({
    index: postgresRetrievalIndex,
    embedding: createHttpEmbeddingAdapter(config.embedding),
    reranker: config.reranker ? createHttpRerankerAdapter(config.reranker) : null,
    aliases: postgresRetrievalIndex,
    graph,
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
