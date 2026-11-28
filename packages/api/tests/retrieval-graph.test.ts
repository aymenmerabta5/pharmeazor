import { describe, expect, it } from "bun:test";

import type { RetrievalFilter } from "@repo/services/retrieval";

import { bridgeGraphEvidence, type GraphChunkSource } from "../src/adapters/retrieval/graph-bridge";
import { readPublishedGraphEvidence } from "../src/adapters/retrieval/graph-evidence";
import { createNeo4jGraphRetrieval } from "../src/adapters/retrieval/graph";
import type {
  Neo4jClient,
  Neo4jQueryResult,
  Neo4jStatement,
} from "../src/adapters/retrieval/neo4j-http";

/**
 * The graph arm is only allowed to serve fully published records. The reader
 * checks the Cypher predicate and re-checks every row in code, so these tests
 * feed it candidate rows that the query should have excluded and assert that
 * they never reach the bridge.
 */

const PUBLISHED = {
  publicationState: "published",
  reviewState: "approved",
  observationState: "promoted",
} as const;

const FILTER: RetrievalFilter = {
  medicineIds: [],
  sectionCodes: [],
  languages: [],
  sourceIds: [],
};

function entityRow(
  entityId: string,
  label: string,
  isSeed: boolean,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    entityId,
    label,
    aliases: [],
    isSeed,
    ...PUBLISHED,
    ...overrides,
  };
}

function evidenceRow(
  entityId: string,
  evidenceId: string,
  artifactId: string,
  quote: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    entityId,
    evidenceId,
    artifactId,
    quote,
    kind: "text_span",
    ...PUBLISHED,
    ...overrides,
  };
}

class FakeNeo4jClient implements Neo4jClient {
  readonly calls: Array<{
    readonly statement: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  }> = [];

  constructor(
    private readonly entityRows: ReadonlyArray<Readonly<Record<string, unknown>>>,
    private readonly evidenceRows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  ) {}

  async run(_statements: readonly Neo4jStatement[]): Promise<readonly Neo4jQueryResult[]> {
    return [];
  }

  async query(
    statement: string,
    parameters: Readonly<Record<string, unknown>> = {},
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    this.calls.push({ statement, parameters });
    return statement.includes("HAS_EVIDENCE") ? this.evidenceRows : this.entityRows;
  }
}

describe("published graph evidence reader", () => {
  it("drops candidate entities and evidence even when the fake returns them", async () => {
    const client = new FakeNeo4jClient(
      [
        entityRow("e1", "Paracétamol", true),
        entityRow("e2", "Paracétamol", true, {
          publicationState: undefined,
          reviewState: "approved_candidate",
          observationState: "quarantined",
        }),
      ],
      [
        evidenceRow("e1", "ev1", "art1", "Doliprane est indiqué chez l'adulte."),
        evidenceRow("e2", "ev2", "art1", "Candidate evidence must not leak.", {
          publicationState: undefined,
          reviewState: "approved_candidate",
          observationState: "quarantined",
        }),
      ],
    );

    const evidence = await readPublishedGraphEvidence(client, { terms: ["paracetamol"] });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidenceId).toBe("ev1");
    expect(evidence[0]?.score).toBe(1);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.parameters.entityIds).toEqual(["e1"]);
  });

  it("expands one hop through a published relationship and halves the neighbour score", async () => {
    const client = new FakeNeo4jClient(
      [
        entityRow("e1", "Paracétamol", true),
        entityRow("e3", "Douleur", false),
        entityRow("e4", "Douleur", false, {
          publicationState: undefined,
          reviewState: "approved_candidate",
          observationState: "quarantined",
        }),
      ],
      [
        evidenceRow("e1", "ev1", "art1", "Paracétamol indiqué."),
        evidenceRow("e3", "ev3", "art2", "Douleur légère à modérée."),
        evidenceRow("e4", "ev4", "art2", "Candidate neighbour evidence."),
      ],
    );

    const evidence = await readPublishedGraphEvidence(client, { terms: ["paracetamol"] });

    expect(evidence.find((entry) => entry.evidenceId === "ev1")?.score).toBe(1);
    expect(evidence.find((entry) => entry.evidenceId === "ev3")?.score).toBe(0.5);
    expect(evidence.find((entry) => entry.evidenceId === "ev4")).toBeUndefined();
  });

  it("counts the same quote once at the strongest entity score", async () => {
    const client = new FakeNeo4jClient(
      [entityRow("e1", "Paracétamol", true), entityRow("e3", "Douleur", false)],
      [
        evidenceRow("e1", "ev1", "art1", "Shared quote."),
        evidenceRow("e3", "ev3", "art1", "Shared quote."),
      ],
    );

    const evidence = await readPublishedGraphEvidence(client, { terms: ["paracetamol"] });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidenceId).toBe("ev1");
    expect(evidence[0]?.score).toBe(1);
  });

  it("does not query Neo4j when the query has no usable terms", async () => {
    const client = new FakeNeo4jClient([], []);
    const evidence = await readPublishedGraphEvidence(client, { terms: ["a", " "] });
    expect(evidence).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it("does not query evidence when no published entity survives", async () => {
    const client = new FakeNeo4jClient(
      [
        entityRow("e2", "Paracétamol", true, {
          publicationState: undefined,
          reviewState: "approved_candidate",
          observationState: "quarantined",
        }),
      ],
      [],
    );

    const evidence = await readPublishedGraphEvidence(client, { terms: ["paracetamol"] });

    expect(evidence).toEqual([]);
    expect(client.calls).toHaveLength(1);
  });

  it("drops non-text-span evidence even when the fake returns it", async () => {
    const client = new FakeNeo4jClient(
      [entityRow("e1", "Paracétamol", true)],
      [
        evidenceRow("e1", "ev1", "art1", "Text span quote."),
        evidenceRow("e1", "ev2", "art1", "", {
          kind: "structured_row",
          quote: "registers carry no quote",
        }),
        evidenceRow("e1", "ev3", "art1", "", {
          kind: "metadata",
          quote: "metadata carries no quote",
        }),
      ],
    );

    const evidence = await readPublishedGraphEvidence(client, { terms: ["paracetamol"] });

    expect(evidence.map((entry) => entry.evidenceId)).toEqual(["ev1"]);
  });

  it("drops evidence rows missing a quote, artifact id, or evidence id", async () => {
    const client = new FakeNeo4jClient(
      [entityRow("e1", "Paracétamol", true)],
      [
        evidenceRow("e1", "ev1", "art1", ""),
        evidenceRow("e1", "ev2", "", "Doliprane est indiqué."),
        evidenceRow("e1", "", "art1", "Doliprane est indiqué."),
        evidenceRow("e1", "ev4", "art1", "Doliprane est indiqué."),
      ],
    );

    const evidence = await readPublishedGraphEvidence(client, { terms: ["paracetamol"] });

    expect(evidence.map((entry) => entry.evidenceId)).toEqual(["ev4"]);
  });
});

describe("graph evidence to chunk bridge", () => {
  it("matches the exact quote inside the same artifact only", () => {
    const ranked = bridgeGraphEvidence(
      [{ evidenceId: "ev1", entityId: "e1", artifactId: "art1", quote: "exact quote", score: 1 }],
      [
        { chunkId: "c1", artifactId: "art1", content: "prefix exact quote suffix" },
        { chunkId: "c2", artifactId: "art1", content: "EXACT QUOTE" },
        { chunkId: "c3", artifactId: "art2", content: "exact quote" },
      ],
      10,
    );

    expect(ranked.map((entry) => entry.chunkId)).toEqual(["c1"]);
  });

  it("sums distinct quotes that land in the same chunk", () => {
    const ranked = bridgeGraphEvidence(
      [
        { evidenceId: "ev1", entityId: "e1", artifactId: "art1", quote: "first", score: 0.5 },
        { evidenceId: "ev2", entityId: "e1", artifactId: "art1", quote: "second", score: 0.25 },
      ],
      [{ chunkId: "c1", artifactId: "art1", content: "first and second" }],
      10,
    );

    expect(ranked).toEqual([{ chunkId: "c1", score: 0.75, rank: 1 }]);
  });

  it("deduplicates, ranks by score, and applies the candidate limit", () => {
    const ranked = bridgeGraphEvidence(
      [
        { evidenceId: "ev1", entityId: "e1", artifactId: "art1", quote: "low", score: 0.2 },
        { evidenceId: "ev2", entityId: "e1", artifactId: "art1", quote: "high", score: 0.9 },
      ],
      [
        { chunkId: "c1", artifactId: "art1", content: "low" },
        { chunkId: "c2", artifactId: "art1", content: "high" },
        { chunkId: "c3", artifactId: "art1", content: "high low" },
      ],
      2,
    );

    expect(ranked.map((entry) => entry.chunkId)).toEqual(["c3", "c2"]);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.rank).toBe(2);
  });
});

describe("Neo4j graph retrieval composition", () => {
  it("passes the request filter, model, and published evidence to the bridge", async () => {
    const client = new FakeNeo4jClient(
      [entityRow("e1", "Paracétamol", true)],
      [evidenceRow("e1", "ev1", "art1", "Doliprane est indiqué.")],
    );
    let seen: Parameters<GraphChunkSource["loadChunks"]>[0] | null = null;
    const source: GraphChunkSource = {
      async loadChunks(query) {
        seen = query;
        return [
          {
            chunkId: "chunk-1",
            artifactId: "art1",
            content: "Doliprane est indiqué. Chez l'adulte.",
          },
        ];
      },
    };
    const filter: RetrievalFilter = {
      medicineIds: ["MED001"],
      sectionCodes: ["indications"],
      languages: ["fr"],
      sourceIds: ["ANPP_RCP"],
    };
    const adapter = createNeo4jGraphRetrieval({ client, chunks: source, model: "BAAI/bge-m3" });

    const ranked = await adapter.search({
      query: "paracetamol",
      terms: ["paracetamol"],
      limit: 10,
      filter,
    });

    expect(ranked).toEqual([{ chunkId: "chunk-1", score: 1, rank: 1 }]);
    expect(seen).not.toBeNull();
    expect(seen!.filter).toEqual(filter);
    expect(seen!.model).toBe("BAAI/bge-m3");
    expect(seen!.artifactIds).toEqual(["art1"]);
    expect(seen!.quotes).toEqual(["Doliprane est indiqué."]);
  });

  it("returns an empty list when no published graph evidence exists", async () => {
    const client = new FakeNeo4jClient([], []);
    const source: GraphChunkSource = {
      async loadChunks() {
        throw new Error("the bridge must not run without evidence");
      },
    };
    const adapter = createNeo4jGraphRetrieval({ client, chunks: source, model: "BAAI/bge-m3" });

    const ranked = await adapter.search({
      query: "paracetamol",
      terms: ["paracetamol"],
      limit: 10,
      filter: FILTER,
    });

    expect(ranked).toEqual([]);
  });
});
