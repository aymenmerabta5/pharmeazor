import { describe, expect, it } from "bun:test";
import { chunkMarkdownDocument, type ChunkSourceDocument } from "@repo/modules/retrieval";

/**
 * These tests characterize the current production chunker. They intentionally
 * assert existing behavior, including behavior that should be revisited in a
 * later phase. Do not "fix" these expectations without changing the chunker
 * contract and updating the Phase 1 report.
 */
const DOCUMENT: ChunkSourceDocument = {
  artifactId: "ART_CHARACTERIZATION",
  documentId: "DOC_CHARACTERIZATION",
  title: "Characterization document",
  sourceId: "ANPP_RCP",
  sourceName: "ANPP",
  authorityLevel: 1,
  jurisdiction: "DZ",
  documentType: "rcp",
  language: "fr",
  medicineIds: ["MED999"],
  medicineNames: ["Characterization medicine"],
  inn: "characterization",
  brandName: null,
  strengthForm: null,
  sourceUrls: ["https://example.test/characterization"],
};

const PACKED_MARKDOWN = [
  "## Denomination",
  "Paracetamol 500 mg.",
  "## Indications",
  "Douleur legere.",
  "## Posologie",
  "500 mg par prise.",
  "## Contre-indications",
  "Insuffisance hepatique severe.",
].join("\n\n");

function numberedSentences(count: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `Phrase ${String(index + 1).padStart(2, "0")} explique une regle clinique distincte et facile a reconnaitre dans le texte.`,
  ).join(" ");
}

describe("production chunker characterization: overlap", () => {
  it("drops the requested overlap when each part already consumes the character budget", () => {
    // maxChars=400 and overlapChars=100 make the internal budget
    // max(400, 400 - 100) = 400. The overlap candidate is therefore over the
    // ceiling by the two-character separator and applyOverlap falls back to the
    // non-overlapped part.
    const chunks = chunkMarkdownDocument(DOCUMENT, numberedSentences(14), {
      maxChars: 400,
      overlapChars: 100,
      minGroupChars: 0,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.content).not.toContain("Phrase 05");
    expect(chunks[1]?.content.startsWith("Phrase 05")).toBe(true);
  });

  it("creates character-window overlap that can begin in the middle of a sentence", () => {
    const chunks = chunkMarkdownDocument(DOCUMENT, numberedSentences(14), {
      maxChars: 600,
      overlapChars: 60,
      minGroupChars: 0,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.content.startsWith("clinique distincte")).toBe(true);
    expect(chunks[1]?.content.startsWith("Phrase ")).toBe(false);
  });
});

describe("production chunker characterization: sections", () => {
  it("packs small adjacent clinical sections into one chunk by default", () => {
    const chunks = chunkMarkdownDocument(DOCUMENT, PACKED_MARKDOWN);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sectionCodes).toEqual([
      "denomination",
      "indications",
      "dosage",
      "contraindications",
    ]);
    expect(chunks[0]?.content).toContain("## Indications");
    expect(chunks[0]?.content).toContain("## Posologie");
    expect(chunks[0]?.content).toContain("## Contre-indications");
  });

  it("uses the first mapped code as primary while sectionCodes retains packed membership", () => {
    const [chunk] = chunkMarkdownDocument(DOCUMENT, PACKED_MARKDOWN);

    expect(chunk?.sectionCode).toBe("denomination");
    expect(chunk?.sectionHeading).toBe("Denomination");
    expect(chunk?.sectionPath).toBe("Denomination | Indications | Posologie | Contre-indications");
    expect(chunk?.sectionCodes).toContain("dosage");
    expect(chunk?.content).toContain("500 mg par prise.");
  });
});

describe("production chunker characterization: tables and lists", () => {
  it("splits Markdown table rows and repeats no header on later parts", () => {
    const header = "| Substance | Dose | Population | Voie |";
    const separator = "| --- | --- | --- | --- |";
    const rows = Array.from(
      { length: 8 },
      (_, index) =>
        `| substance-${index + 1}-long-name | ${100 + index} mg | adulte insuffisance renale | orale |`,
    );
    const table = [header, separator, ...rows].join("\n");
    const chunks = chunkMarkdownDocument(DOCUMENT, table, {
      maxChars: 400,
      overlapChars: 0,
      minGroupChars: 0,
    });

    expect(table).toContain(rows[4]!);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((chunk) => chunk.content.includes(rows[4]!))).toBe(false);
    expect(chunks.every((chunk) => !chunk.content.includes("\n"))).toBe(true);
    expect(chunks[0]?.content).toContain(header);
    expect(chunks[1]?.content).not.toContain(header);
  });

  it("splits one long list item and does not repeat its bullet", () => {
    const item = `- ${Array.from(
      { length: 8 },
      (_, index) =>
        `Clause ${index + 1} de securite clinique avec des mots supplementaires pour depasser la fenetre.`,
    ).join(" ")}`;
    const chunks = chunkMarkdownDocument(DOCUMENT, item, {
      maxChars: 400,
      overlapChars: 0,
      minGroupChars: 0,
    });

    expect(item.length).toBeGreaterThan(400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.content.startsWith("- Clause 1")).toBe(true);
    expect(chunks[1]?.content.startsWith("Clause ")).toBe(true);
    expect(chunks[1]?.content.startsWith("- ")).toBe(false);
  });
});

describe("production chunker characterization: identity", () => {
  it("renumbers later same-code chunks when an earlier section is inserted", () => {
    const before = chunkMarkdownDocument(
      DOCUMENT,
      ["## Posologie", "Premiere posologie.", "## Posologie", "Deuxieme posologie."].join("\n\n"),
      { minGroupChars: 0 },
    );
    const after = chunkMarkdownDocument(
      DOCUMENT,
      [
        "## Posologie",
        "Nouvelle posologie.",
        "## Posologie",
        "Premiere posologie.",
        "## Posologie",
        "Deuxieme posologie.",
      ].join("\n\n"),
      { minGroupChars: 0 },
    );

    expect(before.map((chunk) => chunk.chunkId)).toEqual([
      "ART_CHARACTERIZATION#dosage-0#0",
      "ART_CHARACTERIZATION#dosage-1#0",
    ]);
    expect(after.map((chunk) => chunk.chunkId)).toEqual([
      "ART_CHARACTERIZATION#dosage-0#0",
      "ART_CHARACTERIZATION#dosage-1#0",
      "ART_CHARACTERIZATION#dosage-2#0",
    ]);
    expect(after.find((chunk) => chunk.content.includes("Premiere posologie."))?.chunkId).toBe(
      "ART_CHARACTERIZATION#dosage-1#0",
    );
    expect(after.find((chunk) => chunk.content.includes("Deuxieme posologie."))?.chunkId).toBe(
      "ART_CHARACTERIZATION#dosage-2#0",
    );
  });
});
