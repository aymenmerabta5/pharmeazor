import { describe, expect, it } from "bun:test";

import { isRetrievalError } from "@repo/services/retrieval";

import { readRetrievalRuntimeConfig } from "../src/adapters/retrieval/config";

/**
 * The graph arm is opt-in and must fail closed: enabling it without a real
 * Neo4j target is a configuration error, never a silent no-op that would make
 * an operator believe graph evidence is being served.
 */

const BASE_ENV: Record<string, string | undefined> = {
  RETRIEVAL_EMBEDDING_URL: "http://localhost:8081/",
};

const GRAPH_ENV: Record<string, string | undefined> = {
  RETRIEVAL_GRAPH_ENABLED: "true",
  NEO4J_HTTP_URL: "http://localhost:7475/",
  NEO4J_USER: "neo4j",
  NEO4J_PASSWORD: "strong-password",
};

function expectNotConfigured(env: Record<string, string | undefined>): void {
  try {
    readRetrievalRuntimeConfig(env);
    throw new Error("expected readRetrievalRuntimeConfig to fail");
  } catch (error) {
    if (!isRetrievalError(error)) throw error;
    expect(error.code).toBe("RETRIEVAL_NOT_CONFIGURED");
  }
}

describe("retrieval runtime config", () => {
  it("keeps the graph arm disabled by default", () => {
    const config = readRetrievalRuntimeConfig({ ...BASE_ENV });
    expect(config.graph).toBeNull();
  });

  it("fails closed when the graph arm is enabled without Neo4j credentials", () => {
    expectNotConfigured({ ...BASE_ENV, RETRIEVAL_GRAPH_ENABLED: "true" });
    expectNotConfigured({
      ...BASE_ENV,
      RETRIEVAL_GRAPH_ENABLED: "true",
      NEO4J_HTTP_URL: "http://localhost:7475",
    });
    expectNotConfigured({
      ...BASE_ENV,
      RETRIEVAL_GRAPH_ENABLED: "true",
      NEO4J_HTTP_URL: "http://localhost:7475",
      NEO4J_USER: "neo4j",
    });
  });

  it("rejects placeholder Neo4j credentials and non-http targets", () => {
    expectNotConfigured({
      ...BASE_ENV,
      ...GRAPH_ENV,
      NEO4J_PASSWORD: "REPLACE_WITH_A_STRONG_NEO4J_PASSWORD",
    });
    expectNotConfigured({
      ...BASE_ENV,
      ...GRAPH_ENV,
      NEO4J_HTTP_URL: "bolt://localhost:7688",
    });
  });

  it("parses a valid graph target with the documented defaults", () => {
    const config = readRetrievalRuntimeConfig({ ...BASE_ENV, ...GRAPH_ENV });
    expect(config.graph).not.toBeNull();
    expect(config.graph).toMatchObject({
      url: "http://localhost:7475",
      user: "neo4j",
      database: "neo4j",
      timeoutMs: 3000,
      entityLimit: 24,
      neighborLimit: 48,
      evidenceLimit: 160,
      chunkLimit: 200,
      candidateLimit: 30,
    });
  });

  it("accepts explicit database and limit overrides", () => {
    const config = readRetrievalRuntimeConfig({
      ...BASE_ENV,
      ...GRAPH_ENV,
      NEO4J_DATABASE: "pharmeazor-graph",
      RETRIEVAL_GRAPH_TIMEOUT_MS: "1500",
      RETRIEVAL_GRAPH_ENTITY_LIMIT: "10",
      RETRIEVAL_GRAPH_CANDIDATE_LIMIT: "12",
    });
    expect(config.graph).toMatchObject({
      database: "pharmeazor-graph",
      timeoutMs: 1500,
      entityLimit: 10,
      candidateLimit: 12,
    });
  });

  it("rejects an unsafe database name and non-integer limits", () => {
    expectNotConfigured({ ...BASE_ENV, ...GRAPH_ENV, NEO4J_DATABASE: "bad/name" });
    expectNotConfigured({
      ...BASE_ENV,
      ...GRAPH_ENV,
      RETRIEVAL_GRAPH_TIMEOUT_MS: "soon",
    });
    expectNotConfigured({ ...BASE_ENV, ...GRAPH_ENV, RETRIEVAL_GRAPH_ENTITY_LIMIT: "0" });
  });
});
