import { describe, expect, it } from "bun:test";
import { retrieval } from "@repo/services";

const { createRetrievalService } = retrieval;
type EmbeddingPort = retrieval.EmbeddingPort;
type GraphRetrievalPort = retrieval.GraphRetrievalPort;
type RankedCandidate = retrieval.RankedCandidate;
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
    sectionCode: "indications",
    sectionCodes: ["indications"],
    sectionHeading: "Indications",
    sectionPath: "Résumé > Indications",
    content: `Content for ${chunkId}`,
    contextualizedContent: `Context for ${chunkId}`,
    sourceId: "ANPP_RCP",
    sourceName: "ANPP",
    authorityLevel: 1,
    authorityTier: "official",
    documentType: "smpc",
    language: "fr",
    medicineIds: ["MED001"],
    medicineNames: ["Paracétamol"],
    sourceUrls: [`https://example.test/${chunkId}`],
    injectionRisk: false,
    publicationDate: null,
    collectedAt: null,
    extractedAt: null,
    indexedAt: null,
    extractionStatus: null,
    reviewRequired: false,
    ...overrides,
  };
}

function ranked(...ids: string[]): RankedCandidate[] {
  return ids.map((chunkId, index) => ({ chunkId, score: 1 / (index + 1), rank: index + 1 }));
}

const embedding: EmbeddingPort = {
  model: "BAAI/bge-m3",
  dimensions: 1024,
  async embedQuery() {
    return [0.1, 0.2];
  },
  async embedDocuments(texts) {
    return texts.map(() => [0.1, 0.2]);
  },
};

function index(
  candidates: readonly RetrievalCandidate[],
  overrides: Partial<RetrievalIndexPort> = {},
): RetrievalIndexPort {
  const byId = new Map(candidates.map((entry) => [entry.chunkId, entry]));
  return {
    denseSearch: async () => ranked(...candidates.map((entry) => entry.chunkId)),
    lexicalSearch: async () => ranked(...candidates.map((entry) => entry.chunkId)),
    loadCandidates: async (ids: readonly string[]) =>
      ids.map((id) => byId.get(id)).filter((entry): entry is RetrievalCandidate => Boolean(entry)),
    ...overrides,
  };
}

function graph(search: GraphRetrievalPort["search"]): GraphRetrievalPort {
  return { search };
}

describe("optional graph retrieval arm", () => {
  it("keeps hybrid output unchanged when the graph arm is disabled", async () => {
    const service = createRetrievalService({
      index: index([candidate("a"), candidate("b")]),
      embedding,
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol indications" });

    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(["a", "b"]);
    expect(result.diagnostics.graph).toBe("disabled");
    expect(result.diagnostics.graphCandidates).toBe(0);
    expect(result.chunks[0]?.scores.graph).toBeUndefined();
  });

  it("fuses a graph-only chunk and exposes its graph score", async () => {
    const service = createRetrievalService({
      index: index([candidate("a"), candidate("g")], {
        denseSearch: async () => ranked("a"),
        lexicalSearch: async () => ranked("a"),
      }),
      embedding,
      graph: graph(async () => [{ chunkId: "g", score: 0.9, rank: 1 }]),
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol indications" });
    const graphChunk = result.chunks.find((chunk) => chunk.chunkId === "g");

    expect(graphChunk).toBeDefined();
    expect(graphChunk?.scores.graph).toBe(0.9);
    expect(graphChunk?.scores.graphRank).toBe(1);
    expect(result.diagnostics.graph).toBe("applied");
    expect(result.diagnostics.graphCandidates).toBe(1);
  });

  it("sums reciprocal-rank contributions when the graph and hybrid arms agree", async () => {
    const service = createRetrievalService({
      index: index([candidate("a")]),
      embedding,
      graph: graph(async () => [{ chunkId: "a", score: 0.9, rank: 1 }]),
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol indications" });
    const chunk = result.chunks[0]!;

    expect(result.chunks).toHaveLength(1);
    expect(chunk.scores.dense).toBeDefined();
    expect(chunk.scores.lexical).toBeDefined();
    expect(chunk.scores.graph).toBe(0.9);
    expect(chunk.scores.rrf).toBeGreaterThan(1 / 61);
  });

  it("returns the hybrid result when the graph arm fails", async () => {
    const warnings: string[] = [];
    const service = createRetrievalService({
      index: index([candidate("a")]),
      embedding,
      graph: graph(async () => {
        throw new Error("neo4j unavailable");
      }),
      warn: (message) => warnings.push(message),
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol indications" });

    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(["a"]);
    expect(result.diagnostics.graph).toBe("failed");
    expect(result.diagnostics.graphCandidates).toBe(0);
    expect(warnings.join(" ")).toContain("neo4j unavailable");
  });

  it("lets a graph-only result survive when both hybrid arms are empty", async () => {
    const service = createRetrievalService({
      index: index([candidate("g")], {
        denseSearch: async () => [],
        lexicalSearch: async () => [],
      }),
      embedding,
      graph: graph(async () => [{ chunkId: "g", score: 0.8, rank: 1 }]),
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol indications" });

    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(["g"]);
    expect(result.diagnostics.denseCandidates).toBe(0);
    expect(result.diagnostics.lexicalCandidates).toBe(0);
    expect(result.diagnostics.graphCandidates).toBe(1);
    expect(result.diagnostics.fusedCandidates).toBe(1);
  });

  it("deduplicates a graph candidate that repeats a hybrid chunk", async () => {
    const service = createRetrievalService({
      index: index([candidate("a")]),
      embedding,
      graph: graph(async () => [
        { chunkId: "a", score: 0.9, rank: 1 },
        { chunkId: "a", score: 0.7, rank: 2 },
      ]),
    });

    const result = await service.search(PRINCIPAL, { query: "paracetamol indications" });

    expect(result.chunks).toHaveLength(1);
    expect(result.diagnostics.graphCandidates).toBe(1);
    expect(result.chunks[0]?.scores.graph).toBe(0.9);
  });
});
