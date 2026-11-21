import { describe, expect, it } from "bun:test";
import { retrieval } from "@repo/services";

const { createRetrievalService, isRetrievalError } = retrieval;
type EmbeddingPort = retrieval.EmbeddingPort;
type RankedCandidate = retrieval.RankedCandidate;
type RerankPort = retrieval.RerankPort;
type RetrievalCandidate = retrieval.RetrievalCandidate;
type RetrievalIndexPort = retrieval.RetrievalIndexPort;

const PRINCIPAL = { actorId: "user_123" };

function candidate(
  chunkId: string,
  overrides: Partial<RetrievalCandidate> = {},
): RetrievalCandidate {
  return {
    chunkId,
    artifactId: `artifact_${chunkId}`,
    documentId: `doc_${chunkId}`,
    title: `Document ${chunkId}`,
    sectionCode: "dosage",
    sectionHeading: "Posologie",
    sectionPath: "Résumé > Posologie",
    content: `Content for ${chunkId}`,
    contextualizedContent: `Context for ${chunkId}`,
    sourceId: "ANPP_RCP",
    sourceName: "ANPP",
    authorityLevel: 1,
    documentType: "rcp",
    language: "fr",
    medicineIds: ["MED031"],
    medicineNames: ["Paracetamol"],
    sourceUrls: [`https://example.test/${chunkId}`],
    injectionRisk: false,
    ...overrides,
  };
}

function ranked(...ids: string[]): RankedCandidate[] {
  return ids.map((chunkId, index) => ({ chunkId, score: 1 / (index + 1), rank: index + 1 }));
}

function embedding(overrides: Partial<EmbeddingPort> = {}): EmbeddingPort {
  return {
    model: "BAAI/bge-m3",
    dimensions: 1024,
    async embedQuery() {
      return [0.1, 0.2];
    },
    async embedDocuments(texts) {
      return texts.map(() => [0.1, 0.2]);
    },
    ...overrides,
  };
}

function index(
  candidates: readonly RetrievalCandidate[],
  overrides: Partial<RetrievalIndexPort> = {},
) {
  const byId = new Map(candidates.map((entry) => [entry.chunkId, entry]));
  return {
    denseSearch: async () => ranked(...candidates.map((entry) => entry.chunkId)),
    lexicalSearch: async () => ranked(...candidates.map((entry) => entry.chunkId)),
    loadCandidates: async (ids: readonly string[]) =>
      ids.map((id) => byId.get(id)).filter((entry): entry is RetrievalCandidate => Boolean(entry)),
    ...overrides,
  } satisfies RetrievalIndexPort;
}

describe("retrieval service", () => {
  it("requires an authenticated principal", async () => {
    const service = createRetrievalService({
      index: index([]),
      embedding: embedding(),
    });
    await expect(service.search({ actorId: "  " }, { query: "paracetamol" })).rejects.toMatchObject(
      {
        code: "RETRIEVAL_UNAUTHENTICATED",
      },
    );
  });

  it("rejects a query that is too short or too long", async () => {
    const service = createRetrievalService({ index: index([]), embedding: embedding() });
    await expect(service.search(PRINCIPAL, { query: " a " })).rejects.toMatchObject({
      code: "RETRIEVAL_INVALID_REQUEST",
    });
    await expect(service.search(PRINCIPAL, { query: "x".repeat(513) })).rejects.toMatchObject({
      code: "RETRIEVAL_INVALID_REQUEST",
    });
  });

  it("runs both arms, fuses them, and reranks the fused candidates", async () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const seen: number[] = [];
    const reranker: RerankPort = {
      model: "BAAI/bge-reranker-v2-m3",
      async rerank(input) {
        seen.push(input.documents.length);
        return [
          { index: 2, score: 0.9 },
          { index: 0, score: 0.5 },
        ];
      },
    };
    const service = createRetrievalService({
      index: index(candidates),
      embedding: embedding(),
      reranker,
      now: () => 0,
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol dose", limit: 2 });

    expect(seen).toEqual([3]);
    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(["c", "a"]);
    expect(result.chunks[0]?.citation).toEqual({
      chunkId: "c",
      label: "ANPP · rcp · Posologie",
    });
    expect(result.chunks[0]?.scores.rerank).toBe(0.9);
    expect(result.chunks[0]?.scores.denseRank).toBe(3);
    expect(result.chunks[0]?.scores.lexicalRank).toBe(3);
    expect(result.diagnostics.rerank).toBe("applied");
    expect(result.diagnostics.returnedChunks).toBe(2);
  });

  it("drops chunks flagged as instruction injection", async () => {
    const candidates = [candidate("clean"), candidate("poisoned", { injectionRisk: true })];
    const service = createRetrievalService({ index: index(candidates), embedding: embedding() });
    const result = await service.search(PRINCIPAL, { query: "paracetamol" });
    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(["clean"]);
    expect(result.diagnostics.droppedForInjection).toBe(1);
  });

  it("caps how many chunks one document may contribute", async () => {
    const candidates = Array.from({ length: 5 }, (_, position) =>
      candidate(`chunk_${position}`, { artifactId: "artifact_shared" }),
    );
    const service = createRetrievalService({ index: index(candidates), embedding: embedding() });
    const result = await service.search(PRINCIPAL, { query: "paracetamol", limit: 12 });
    expect(result.chunks).toHaveLength(3);
    expect(new Set(result.chunks.map((chunk) => chunk.artifactId))).toEqual(
      new Set(["artifact_shared"]),
    );
  });

  it("falls back to fusion order when the reranker fails", async () => {
    const warnings: string[] = [];
    const service = createRetrievalService({
      index: index([candidate("a"), candidate("b")]),
      embedding: embedding(),
      reranker: {
        model: "BAAI/bge-reranker-v2-m3",
        async rerank() {
          throw new Error("reranker offline");
        },
      },
      warn: (message) => warnings.push(message),
    });
    const result = await service.search(PRINCIPAL, { query: "paracetamol" });
    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(["a", "b"]);
    expect(result.diagnostics.rerank).toBe("failed");
    expect(warnings).toHaveLength(1);
  });

  it("fails closed when reranking is required", async () => {
    const service = createRetrievalService({
      index: index([candidate("a"), candidate("b")]),
      embedding: embedding(),
      requireRerank: true,
      reranker: {
        model: "BAAI/bge-reranker-v2-m3",
        async rerank() {
          throw new Error("reranker offline");
        },
      },
    });
    try {
      await service.search(PRINCIPAL, { query: "paracetamol" });
      throw new Error("expected retrieval to fail");
    } catch (error) {
      expect(isRetrievalError(error)).toBe(true);
      expect((error as { code: string }).code).toBe("RETRIEVAL_RERANK_FAILED");
    }
  });

  it("reports an embedding outage as a typed failure", async () => {
    const service = createRetrievalService({
      index: index([candidate("a")]),
      embedding: embedding({
        async embedQuery() {
          throw new Error("connection refused");
        },
      }),
    });
    await expect(service.search(PRINCIPAL, { query: "paracetamol" })).rejects.toMatchObject({
      code: "RETRIEVAL_EMBEDDING_FAILED",
    });
  });

  it("returns an empty result when neither arm finds a candidate", async () => {
    const service = createRetrievalService({
      index: index([], {
        denseSearch: async () => [],
        lexicalSearch: async () => [],
      }),
      embedding: embedding(),
    });
    const result = await service.search(PRINCIPAL, { query: "unindexed" });
    expect(result.chunks).toEqual([]);
    expect(result.diagnostics.fusedCandidates).toBe(0);
  });
});
