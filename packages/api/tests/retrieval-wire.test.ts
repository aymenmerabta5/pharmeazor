import { describe, expect, it } from "bun:test";

import {
  buildCitationStamp,
  formatRetrievalDate,
  parseRetrievalSearchResponse,
} from "@repo/contracts";
import type { RetrievalResult, RetrievedChunk } from "@repo/services/retrieval";

import { toRetrievalWireResponse } from "../src/retrieval/wire";

/**
 * The wire mapping is the single place where the service result becomes the
 * payload the agent reads. If a date is dropped here, the model has no way to
 * cite it, so these tests pin all four timestamps and the rendered stamp.
 */

function chunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunkId: "MED001__SRC_ANPP_RCP__DOC005__smpc#indications-0#0",
    artifactId: "MED001__SRC_ANPP_RCP__DOC005__smpc",
    documentId: "MED001__SRC_ANPP_RCP__DOC005",
    title: "PARACETAMOL 500 mg comprimé",
    sectionCode: "indications",
    sectionCodes: ["indications"],
    sectionHeading: "Indications thérapeutiques",
    sectionPath: "smpc > indications",
    content: "Traitement symptomatique des douleurs.",
    contextualizedContent: "Traitement symptomatique des douleurs.",
    sourceId: "ANPP_RCP",
    sourceName: "ANPP SmPC",
    authorityLevel: 1,
    authorityTier: "official",
    documentType: "smpc",
    language: "fr",
    medicineIds: ["MED001"],
    medicineNames: ["Paracétamol"],
    sourceUrls: ["https://example.test/doc"],
    injectionRisk: false,
    publicationDate: "2021-11-29",
    collectedAt: "2026-11-20",
    extractedAt: "2026-11-21",
    indexedAt: "2026-11-21",
    extractionStatus: "EXTRACTED",
    reviewRequired: false,
    authority: {
      level: 1,
      tier: "official",
      label: "Official Algerian",
      official: true,
      description: "ANPP summary of product characteristics",
    },
    scores: { rrf: 0.03, rerank: 0.98 },
    citation: {
      chunkId: "MED001__SRC_ANPP_RCP__DOC005__smpc#indications-0#0",
      label: "ANPP SmPC — indications",
    },
    ...overrides,
  };
}

function result(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunks: [chunk()],
    authorityOverlaps: [],
    authorityPolicy: "Source authority, lower wins.",
    diagnostics: {
      embeddingModel: "BAAI/bge-m3",
      rerankerModel: "BAAI/bge-reranker-v2-m3",
      denseCandidates: 50,
      lexicalCandidates: 50,
      graph: "applied",
      graphCandidates: 3,
      fusedCandidates: 50,
      rerankedCandidates: 50,
      returnedChunks: 1,
      droppedForInjection: 0,
      rerank: "applied",
      elapsedMs: 1_700,
      expandedTerms: [],
      ambiguousAliases: [],
    },
    ...overrides,
  };
}

describe("retrieval wire mapping", () => {
  it("emits all four dates and the rendered citation stamp", () => {
    const wire = toRetrievalWireResponse(result());
    const entry = wire.chunks[0]!;

    expect(entry.publicationDate).toBe("2021-11-29");
    expect(entry.collectedAt).toBe("2026-11-20");
    expect(entry.extractedAt).toBe("2026-11-21");
    expect(entry.indexedAt).toBe("2026-11-21");
    expect(entry.citationStamp).toBe("ANPP SmPC · published 2021-11-29 · extracted 2026-11-21");
  });

  it("never fills a missing publication date with the extraction date", () => {
    const wire = toRetrievalWireResponse(result({ chunks: [chunk({ publicationDate: null })] }));
    const entry = wire.chunks[0]!;

    expect(entry.publicationDate).toBeNull();
    expect(entry.citationStamp).toBe("ANPP SmPC · published unknown · extracted 2026-11-21");
    expect(entry.citationStamp).not.toContain("published 2026-11-21");
  });

  it("marks a partial extraction and a review flag", () => {
    const wire = toRetrievalWireResponse(
      result({ chunks: [chunk({ extractionStatus: "PARTIAL", reviewRequired: true })] }),
    );

    expect(wire.chunks[0]?.citationStamp).toBe(
      "ANPP SmPC · published 2021-11-29 · extracted 2026-11-21 · partial extraction · review required",
    );
  });

  it("passes the alias and graph diagnostics through to the agent", () => {
    const wire = toRetrievalWireResponse(result(), {
      expandedTerms: ["paracetamol"],
      ambiguousAliases: ["COPARAMOL"],
    });

    expect(wire.diagnostics.expandedTerms).toEqual(["paracetamol"]);
    expect(wire.diagnostics.ambiguousAliases).toEqual(["COPARAMOL"]);
    expect(wire.diagnostics.graph).toBe("applied");
    expect(wire.diagnostics.graphCandidates).toBe(3);
  });

  it("defaults missing graph diagnostics for an older producer payload", () => {
    const wire = toRetrievalWireResponse(result());
    const legacy = {
      ...wire,
      diagnostics: {
        embeddingModel: wire.diagnostics.embeddingModel,
        rerankerModel: wire.diagnostics.rerankerModel,
        rerank: wire.diagnostics.rerank,
        denseCandidates: wire.diagnostics.denseCandidates,
        lexicalCandidates: wire.diagnostics.lexicalCandidates,
        fusedCandidates: wire.diagnostics.fusedCandidates,
        rerankedCandidates: wire.diagnostics.rerankedCandidates,
        returnedChunks: wire.diagnostics.returnedChunks,
        droppedForInjection: wire.diagnostics.droppedForInjection,
        elapsedMs: wire.diagnostics.elapsedMs,
        expandedTerms: wire.diagnostics.expandedTerms,
        ambiguousAliases: wire.diagnostics.ambiguousAliases,
      },
    };

    const parsed = parseRetrievalSearchResponse(legacy);
    expect(parsed.diagnostics.graph).toBe("disabled");
    expect(parsed.diagnostics.graphCandidates).toBe(0);
  });

  it("round-trips the real producer payload through the harness parser", () => {
    const wire = toRetrievalWireResponse(result());
    const parsed = parseRetrievalSearchResponse(wire);

    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.chunks[0]?.chunkId).toBe("MED001__SRC_ANPP_RCP__DOC005__smpc#indications-0#0");
    expect(parsed.chunks[0]?.citation).toBe("ANPP SmPC — indications");
    expect(parsed.chunks[0]?.citationStamp).toBe(
      "ANPP SmPC · published 2021-11-29 · extracted 2026-11-21",
    );
  });

  it("accepts the legacy object citation shape", () => {
    const wire = toRetrievalWireResponse(result());
    const legacy = {
      ...wire,
      chunks: wire.chunks.map((chunk) => ({
        ...chunk,
        citation: { chunkId: chunk.chunkId, label: chunk.citation },
      })),
    };

    expect(parseRetrievalSearchResponse(legacy).chunks[0]?.citation).toBe(
      "ANPP SmPC — indications",
    );
  });

  it("treats an unparseable date as unknown rather than guessing", () => {
    expect(formatRetrievalDate(null)).toBe("unknown");
    expect(formatRetrievalDate("")).toBe("unknown");
    expect(formatRetrievalDate("not-a-date")).toBe("unknown");
    expect(formatRetrievalDate("2021-11-29T10:00:00Z")).toBe("2021-11-29");
    expect(
      buildCitationStamp({
        sourceName: "DailyMed label",
        publicationDate: null,
        extractedAt: "2026-11-21",
      }),
    ).toBe("DailyMed label · published unknown · extracted 2026-11-21");
  });
});
