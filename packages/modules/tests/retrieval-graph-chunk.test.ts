import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  GRAPH_CHUNKING_PROFILE,
  GRAPH_OFFSET_ENCODING,
  assertValidGraphChunkingResult,
  chunkGraphMarkdownDocument,
  chunkMarkdownDocument,
  graphDocumentBody,
  graphEvidenceSpan,
  type ChunkSourceDocument,
  type GraphChunkingResult,
} from "@repo/modules/retrieval";

const DOCUMENT: ChunkSourceDocument = {
  artifactId: "ART_GRAPH_CHARACTERIZATION",
  documentId: "DOC_GRAPH_CHARACTERIZATION",
  title: "Graph characterization document",
  sourceId: "ANPP_RCP",
  sourceName: "ANPP",
  authorityLevel: 1,
  jurisdiction: "DZ",
  documentType: "rcp",
  language: "fr",
  medicineIds: ["MED999"],
  medicineNames: ["Graph medicine"],
  inn: "graph medicine",
  brandName: null,
  strengthForm: null,
  sourceUrls: ["https://example.test/graph"],
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function chunk(markdown: string, options?: Parameters<typeof chunkGraphMarkdownDocument>[2]) {
  const result = chunkGraphMarkdownDocument(DOCUMENT, markdown, options);
  assertValidGraphChunkingResult(graphDocumentBody(markdown), result);
  return result;
}

function expectedTextUnitId(result: GraphChunkingResult, legacyChunkId: string): string {
  return `${GRAPH_CHUNKING_PROFILE}:${result.configHash.slice(0, 16)}:${result.documentSnapshotId
    .replace(/^snapshot_/u, "")
    .slice(0, 16)}:${legacyChunkId}`;
}

function expectSectionPure(result: GraphChunkingResult): void {
  for (const unit of result.textUnits) {
    expect(unit.sectionPath.length).toBeGreaterThan(0);
    expect(unit.blockIds).toHaveLength(1);
    expect(unit.rawContentSha256).toBe(sha256(unit.content));
    expect(unit.textUnitId).toBe(expectedTextUnitId(result, unit.legacyChunkId));
    expect(unit.legacyChunkId).toMatch(/^[A-Za-z0-9_.-]+#[a-z][a-z0-9_]{1,47}-[0-9]+#[0-9]+$/u);
  }
}

describe("graph-evidence-v1 section boundaries", () => {
  it("does not pack small clinical sections together", () => {
    const result = chunk(PACKED_MARKDOWN);

    expect(result.textUnits).toHaveLength(4);
    expect(result.textUnits.map((unit) => unit.sectionCode)).toEqual([
      "denomination",
      "indications",
      "dosage",
      "contraindications",
    ]);
    expect(result.textUnits.map((unit) => unit.legacyChunkId)).toEqual([
      "ART_GRAPH_CHARACTERIZATION#denomination-0#0",
      "ART_GRAPH_CHARACTERIZATION#indications-0#0",
      "ART_GRAPH_CHARACTERIZATION#dosage-0#0",
      "ART_GRAPH_CHARACTERIZATION#contraindications-0#0",
    ]);
    expect(result.textUnits[0]?.content).toBe("Paracetamol 500 mg.");
    expectSectionPure(result);
  });

  it("preserves section parents and effective inherited codes", () => {
    const markdown = [
      "# Title",
      "Document introduction.",
      "## 4.2 Posologie",
      "### Adultes",
      "500 mg par prise.",
      "### Enfants",
      "250 mg par prise.",
      "## 4.3 Contre-indications",
      "Insuffisance hepatique severe.",
    ].join("\n\n");
    const result = chunk(markdown);

    const byHeading = new Map(
      result.sections.map((section) => [section.heading, section] as const),
    );
    const title = byHeading.get("Title")!;
    const dosage = byHeading.get("4.2 Posologie")!;
    const adults = byHeading.get("Adultes")!;
    const children = byHeading.get("Enfants")!;

    expect(title.parentSectionId).toBeNull();
    expect(dosage.parentSectionId).toBe(title.sectionId);
    expect(adults.parentSectionId).toBe(dosage.sectionId);
    expect(children.parentSectionId).toBe(dosage.sectionId);
    expect(adults.ancestorSectionIds).toEqual([title.sectionId, dosage.sectionId]);
    expect(adults.sectionCode).toBe("dosage");
    expect(adults.headingCode).toBe("other");
    expect(adults.headingPath).toEqual(["Title", "4.2 Posologie", "Adultes"]);
  });

  it("handles the production title and provenance shape explicitly", () => {
    const markdown = [
      "# Paracetamol 500 mg",
      "> Source: ANPP — RCP",
      "## Posologie",
      "500 mg par prise.",
    ].join("\n\n");
    const result = chunk(markdown);

    expect(result.sections[0]?.heading).toBe("Paracetamol 500 mg");
    expect(result.sections[1]?.parentSectionId).toBe(result.sections[0]?.sectionId);
    expect(result.textUnits).toHaveLength(2);
    expect(result.textUnits[0]?.content).toBe("> Source: ANPP — RCP");
    expect(result.textUnits[1]?.sectionCode).toBe("dosage");
  });

  it("accepts up to three leading spaces before an ATX heading", () => {
    const result = chunk("  ## Posologie\n\n500 mg par prise.");

    expect(result.textUnits).toHaveLength(1);
    expect(result.textUnits[0]?.sectionCode).toBe("dosage");
    expect(result.textUnits[0]?.sectionHeading).toBe("Posologie");
    expect(result.textUnits[0]?.content).toBe("500 mg par prise.");
  });

  it("creates a root section when the document has no heading", () => {
    const result = chunk("Une phrase clinique sans titre.");

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.heading).toBeNull();
    expect(result.textUnits).toHaveLength(1);
    expect(result.textUnits[0]?.sectionHeading).toBe(DOCUMENT.title);
    expect(result.textUnits[0]?.sectionCode).toBe("other");
  });
});

describe("graph-evidence-v1 source mapping", () => {
  it("keeps every raw unit as an exact UTF-16 slice of the clean body", () => {
    const markdown = [
      "# Titre",
      "## Posologie",
      "Avant 😀 la dose est de 3 g.",
      "Après la dose, surveiller le patient.",
    ].join("\n\n");
    const body = graphDocumentBody(markdown);
    const result = chunkGraphMarkdownDocument(DOCUMENT, markdown);

    assertValidGraphChunkingResult(body, result);
    for (const unit of result.textUnits) {
      expect(body.text.slice(unit.sourceSpan.start, unit.sourceSpan.end)).toBe(unit.content);
      expect(body.text.slice(unit.uniqueSourceSpan.start, unit.uniqueSourceSpan.end)).toBe(
        unit.content.slice(unit.uniqueLocalSpan.start, unit.uniqueLocalSpan.end),
      );
    }

    const emojiUnit = result.textUnits.find((unit) => unit.content.includes("😀"))!;
    const quoteStart = emojiUnit.content.indexOf("😀");
    const quote = graphEvidenceSpan(emojiUnit, quoteStart, quoteStart + 2);
    expect(quote.quote).toBe("😀");
    expect(quote.offsetEncoding).toBe(GRAPH_OFFSET_ENCODING);
    expect(quote.quoteSha256).toBe(sha256("😀"));
    expect(quote.documentSnapshotId).toBe(result.documentSnapshotId);
    expect(quote.documentStart).toBe(emojiUnit.sourceSpan.start + quoteStart);
    expect(quote.documentEnd).toBe(emojiUnit.sourceSpan.start + quoteStart + 2);
    expect(() => graphEvidenceSpan(emojiUnit, quoteStart + 1, quoteStart + 2)).toThrow(
      "surrogate pair",
    );
  });

  it("recognises Arabic sentence punctuation without corrupting UTF-16 spans", () => {
    const sentence = `${"تناول الدواء حسب التوجيه ".repeat(12).trim()}؟`;
    const result = chunk(`${sentence} ${sentence}`, {
      maxChars: 400,
      overlapChars: 40,
    });

    expect(result.textUnits).toHaveLength(2);
    expect(result.textUnits[0]?.content.endsWith("؟")).toBe(true);
    expect(result.textUnits[1]?.content.startsWith("تناول")).toBe(true);
    expect(result.diagnostics.some((entry) => entry.code === "forced_word_boundary")).toBe(false);
  });

  it("rejects a text unit whose content no longer matches the source", () => {
    const markdown = "## Posologie\n\n500 mg par prise.";
    const body = graphDocumentBody(markdown);
    const result = chunkGraphMarkdownDocument(DOCUMENT, markdown);
    const unit = result.textUnits[0]!;
    const tampered: GraphChunkingResult = {
      ...result,
      textUnits: [{ ...unit, content: `${unit.content} ajoute` }],
    };

    expect(() => assertValidGraphChunkingResult(body, tampered)).toThrow(/Graph text unit/u);
    expect(() => graphEvidenceSpan(unit, 0, unit.content.length + 1)).toThrow(
      "ends after raw content",
    );
  });

  it("strips front matter without shifting offsets into the clean body", () => {
    const markdown = [
      "---",
      "title: Ignored header",
      "source: ANPP",
      "---",
      "",
      "## Posologie",
      "500 mg par prise.",
    ].join("\n");
    const body = graphDocumentBody(markdown);
    const result = chunkGraphMarkdownDocument(DOCUMENT, markdown);

    expect(body.text.startsWith("## Posologie")).toBe(true);
    expect(result.documentContentSha256).toBe(sha256(body.text));
    expect(result.textUnits[0]?.content).toBe("500 mg par prise.");
    assertValidGraphChunkingResult(body, result);
    expect(() =>
      chunkGraphMarkdownDocument(DOCUMENT, markdown, {
        expectedDocumentContentSha256: "0".repeat(64),
      }),
    ).toThrow("Graph source hash mismatch");
  });
});

describe("graph-evidence-v1 overlap", () => {
  it("reserves overlap capacity instead of silently losing it", () => {
    const result = chunk(numberedSentences(14), {
      maxChars: 400,
      overlapChars: 100,
    });

    expect(result.textUnits.length).toBeGreaterThan(1);
    expect(result.textUnits.every((unit) => unit.content.length <= 400)).toBe(true);
    const second = result.textUnits[1]!;
    expect(second.overlaps).toHaveLength(1);
    expect(second.overlaps[0]?.actualChars).toBeGreaterThan(0);
    expect(second.overlaps[0]?.actualChars).toBeLessThanOrEqual(100);
    expect(second.overlaps[0]?.alignment).toBe("sentence");
    expect(second.content.startsWith("Phrase ")).toBe(true);
    expect(second.uniqueLocalSpan.start).toBe(second.overlaps[0]?.actualChars ?? -1);
    expect(() => graphEvidenceSpan(second, 0, 1)).toThrow("unique source region");
  });

  it("does not split at common non-terminal abbreviations", () => {
    const second =
      "Surveiller le patient et contacter le medecin en cas de reaction inhabituelle. ".repeat(5);
    const result = chunk(`La dose, p. ex. 500 mg, est faible. ${second}`, {
      maxChars: 400,
      overlapChars: 40,
    });

    expect(result.textUnits.length).toBeGreaterThan(1);
    expect(result.textUnits[0]?.content).toContain("p. ex. 500 mg");
    expect(result.diagnostics.some((entry) => entry.code === "forced_word_boundary")).toBe(false);
  });

  it("records an explicit omission instead of cutting a sentence for overlap", () => {
    const sentence = `${"Un ".repeat(90).trim()}.`;
    const result = chunk(`${sentence} ${sentence}`, {
      maxChars: 400,
      overlapChars: 100,
    });

    expect(result.textUnits).toHaveLength(2);
    expect(result.textUnits[1]?.overlaps).toHaveLength(0);
    expect(
      result.diagnostics.some(
        (entry) =>
          entry.code === "overlap_omitted" && entry.textUnitId === result.textUnits[1]?.textUnitId,
      ),
    ).toBe(true);
  });

  it("rejects forged overlap spans, sizes, and self-predecessors", () => {
    const body = graphDocumentBody(numberedSentences(14));
    const result = chunkGraphMarkdownDocument(DOCUMENT, body.text, {
      maxChars: 400,
      overlapChars: 100,
    });
    const unit = result.textUnits[1]!;
    const overlap = unit.overlaps[0]!;
    const forgedSize: GraphChunkingResult = {
      ...result,
      textUnits: [
        result.textUnits[0]!,
        { ...unit, overlaps: [{ ...overlap, actualChars: 999 }] },
        ...result.textUnits.slice(2),
      ],
    };
    const selfPredecessor: GraphChunkingResult = {
      ...result,
      textUnits: [
        result.textUnits[0]!,
        {
          ...unit,
          overlaps: [{ ...overlap, predecessorTextUnitId: unit.textUnitId }],
        },
        ...result.textUnits.slice(2),
      ],
    };

    expect(() => assertValidGraphChunkingResult(body, forgedSize)).toThrow(/overlap size/u);
    expect(() => assertValidGraphChunkingResult(body, selfPredecessor)).toThrow(
      /earlier overlap predecessor/u,
    );
  });

  it("does not report cross-block overlap as an omitted semantic boundary", () => {
    const result = chunk("Premier paragraphe.\n\nDeuxieme paragraphe.", {
      maxChars: 400,
      overlapChars: 100,
    });

    expect(result.diagnostics.some((entry) => entry.code === "overlap_omitted")).toBe(false);
  });

  it("does not overlap across clinical section boundaries", () => {
    const result = chunk(PACKED_MARKDOWN, { maxChars: 400, overlapChars: 100 });
    const indications = result.textUnits.find((unit) => unit.sectionCode === "indications")!;

    expect(indications.overlaps).toHaveLength(0);
    expect(indications.content).not.toContain("Paracetamol 500 mg");
  });
});

describe("graph-evidence-v1 tables and lists", () => {
  it("keeps table rows whole and carries a derived header on later units", () => {
    const header = "| Substance | Dose | Population | Voie |";
    const separator = "| --- | --- | --- | --- |";
    const rows = Array.from(
      { length: 8 },
      (_, index) =>
        `| substance-${index + 1}-long-name | ${100 + index} mg | adulte insuffisance renale | orale |`,
    );
    const table = [header, separator, ...rows].join("\n");
    const result = chunk(table, { maxChars: 400, overlapChars: 0 });

    expect(result.textUnits.length).toBeGreaterThan(1);
    expect(result.textUnits.every((unit) => unit.blockKind === "table")).toBe(true);
    for (const row of rows) {
      expect(result.textUnits.some((unit) => unit.content.includes(row))).toBe(true);
    }
    const rowIds = result.textUnits.flatMap((unit) => unit.table?.rowIds ?? []);
    expect(new Set(rowIds).size).toBe(rows.length);

    const [first, ...later] = result.textUnits;
    expect(first?.table?.headerIncluded).toBe(true);
    expect(first?.content).toContain(header);
    for (const unit of later) {
      expect(unit.table?.headerIncluded).toBe(false);
      expect(unit.content).not.toContain(header);
      expect(unit.displayContent.startsWith(header)).toBe(true);
      expect(unit.generatedSpans[0]?.kind).toBe("table-header");
      expect(unit.displayContent.slice(unit.generatedSpans[0]!.localSpan.end)).toBe(unit.content);
    }
    expect(result.textUnits.every((unit) => !unit.content.includes("\r"))).toBe(true);
  });

  it("overlaps complete table rows without repeating a header inside raw evidence", () => {
    const header = "| Substance | Dose | Population | Voie |";
    const separator = "| --- | --- | --- | --- |";
    const rows = Array.from(
      { length: 8 },
      (_, index) =>
        `| substance-${index + 1}-long-name | ${100 + index} mg | adulte insuffisance renale | orale |`,
    );
    const table = [header, separator, ...rows].join("\n");
    const result = chunk(table, { maxChars: 500, overlapChars: 120 });
    const withOverlap = result.textUnits.find((unit) => unit.overlaps.length > 0);

    expect(withOverlap).toBeDefined();
    expect(withOverlap?.overlaps[0]?.alignment).toBe("table-row");
    expect(withOverlap?.overlaps[0]?.actualChars).toBeLessThanOrEqual(120);
    expect(withOverlap?.content.startsWith(header)).toBe(false);
    expect(withOverlap?.displayContent.startsWith(header)).toBe(true);
  });

  it("preserves nested list depth and parent item identity", () => {
    const list = ["- Parent", "  - Enfant A", "  - Enfant B", "- Frere"].join("\n");
    const result = chunk(list);
    const [unit] = result.textUnits;

    expect(result.textUnits).toHaveLength(1);
    expect(unit?.list?.itemParts.map((item) => item.depth)).toEqual([0, 2, 2, 0]);
    expect(unit?.list?.itemParts[1]?.parentItemId).toBe(unit?.list?.itemParts[0]?.itemId);
    expect(unit?.list?.itemParts[2]?.parentItemId).toBe(unit?.list?.itemParts[0]?.itemId);
    expect(unit?.list?.itemParts[3]?.parentItemId).toBeNull();
  });

  it("reports an oversized fenced block instead of silently exceeding the ceiling", () => {
    const fence = ["```", "x".repeat(500), "```"].join("\n");
    const result = chunk(fence, { maxChars: 400, overlapChars: 0 });

    expect(result.textUnits).toHaveLength(1);
    expect(result.textUnits[0]?.content.length).toBeGreaterThan(400);
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "oversized_atomic_block" && entry.severity === "warning",
      ),
    ).toBe(true);
  });

  it("warns but preserves a table row with a mismatched column count", () => {
    const markdown = [
      "| Dose | Population | Voie |",
      "| --- | --- | --- |",
      "| 500 mg | adulte |",
    ].join("\n");
    const result = chunk(markdown);

    expect(result.textUnits).toHaveLength(1);
    expect(result.textUnits[0]?.blockKind).toBe("table");
    expect(result.textUnits[0]?.content).toContain("| 500 mg | adulte |");
    expect(result.diagnostics.some((entry) => entry.code === "table_column_mismatch")).toBe(true);
  });

  it("keeps an unindented lazy continuation inside its list item", () => {
    const markdown = ["- Premiere ligne", "continuation non indentee", "- Deuxieme item"].join(
      "\n",
    );
    const result = chunk(markdown);
    const [unit] = result.textUnits;

    expect(result.textUnits).toHaveLength(1);
    expect(unit?.blockKind).toBe("list");
    expect(unit?.content).toContain("continuation non indentee");
    expect(unit?.list?.itemIds).toHaveLength(2);
  });

  it("keeps an oversized table row intact and reports the overflow", () => {
    const header = "| Substance | Dose |";
    const separator = "| --- | --- |";
    const longCell = "substance ".repeat(60).trim();
    const table = [header, separator, `| ${longCell} | 500 mg |`].join("\n");
    const result = chunk(table, { maxChars: 400, overlapChars: 0 });

    expect(result.textUnits).toHaveLength(1);
    expect(result.textUnits[0]?.content).toContain(longCell);
    expect(result.textUnits[0]?.content.length).toBeGreaterThan(400);
    expect(result.diagnostics.some((entry) => entry.code === "atomic-table-row-overflow")).toBe(
      true,
    );
  });

  it("never creates marker-only units or duplicates a continuation marker", () => {
    const unordered = chunk(`- ${"x".repeat(500)}`, {
      maxChars: 400,
      overlapChars: 0,
    });
    const ordered = chunk(`1. ${"x".repeat(500)}`, {
      maxChars: 400,
      overlapChars: 0,
    });
    for (const result of [unordered, ordered]) {
      expect(result.textUnits.every((unit) => unit.content.trim().length > 2)).toBe(true);
      expect(result.diagnostics.some((entry) => entry.code === "oversized_atomic_block")).toBe(
        true,
      );
    }
    expect(unordered.textUnits[0]?.content.startsWith("- x")).toBe(true);
    expect(ordered.textUnits[0]?.content.startsWith("1. x")).toBe(true);

    const withOverlap = chunk(`- Court. ${"mot ".repeat(74).trim()}.`, {
      maxChars: 400,
      overlapChars: 100,
    });
    const continuation = withOverlap.textUnits.find((unit) =>
      unit.list?.itemParts.some((part) => part.continued),
    );
    expect(continuation).toBeDefined();
    expect(continuation?.content.startsWith("- ")).toBe(false);
    expect(continuation?.displayContent.startsWith("- - ")).toBe(false);
    expect(continuation?.displayContent.startsWith("- ")).toBe(true);
  });

  it("splits long list items with item identity and a derived continuation marker", () => {
    const item = `- ${Array.from(
      { length: 8 },
      (_, index) =>
        `Clause ${index + 1} de securite clinique avec des mots supplementaires pour depasser la fenetre.`,
    ).join(" ")}`;
    const result = chunk(item, { maxChars: 400, overlapChars: 0 });

    expect(result.textUnits.length).toBeGreaterThan(1);
    expect(result.textUnits.every((unit) => unit.blockKind === "list")).toBe(true);
    expect(result.textUnits[0]?.content.startsWith("- Clause 1")).toBe(true);
    const itemId = result.textUnits[0]?.list?.itemIds[0];
    expect(itemId).toBeDefined();

    const continuation = result.textUnits[1]!;
    expect(continuation.content.startsWith("- ")).toBe(false);
    expect(continuation.displayContent.startsWith("- ")).toBe(true);
    expect(continuation.generatedSpans[0]?.kind).toBe("list-marker");
    expect(continuation.list?.itemIds).toEqual([itemId!]);
    expect(continuation.list?.itemParts[0]).toMatchObject({
      itemId: itemId!,
      partOrdinal: 1,
      continued: true,
    });
  });
});

describe("graph-evidence-v1 compatibility", () => {
  it("preserves the legacy grammar and profiles the identity without an extra # segment", () => {
    const [unit] = chunk(PACKED_MARKDOWN).textUnits;
    expect(unit?.legacyChunkId).toBe("ART_GRAPH_CHARACTERIZATION#denomination-0#0");
    expect(unit?.textUnitId).toMatch(
      new RegExp(
        `^${GRAPH_CHUNKING_PROFILE}:[a-f0-9]{16}:[a-f0-9]{16}:ART_GRAPH_CHARACTERIZATION#denomination-0#0$`,
        "u",
      ),
    );
    expect(unit?.textUnitId).not.toMatch(/^[A-Za-z0-9_.-]+#[a-z][a-z0-9_]{1,47}-[0-9]+#[0-9]+$/u);
  });

  it("characterizes the inherited early same-code insertion renumbering", () => {
    const before = chunk(
      ["## Posologie", "Premiere posologie.", "## Posologie", "Deuxieme posologie."].join("\n\n"),
    );
    const after = chunk(
      [
        "## Posologie",
        "Nouvelle posologie.",
        "## Posologie",
        "Premiere posologie.",
        "## Posologie",
        "Deuxieme posologie.",
      ].join("\n\n"),
    );

    expect(before.textUnits.map((unit) => unit.legacyChunkId)).toEqual([
      "ART_GRAPH_CHARACTERIZATION#dosage-0#0",
      "ART_GRAPH_CHARACTERIZATION#dosage-1#0",
    ]);
    expect(after.textUnits.map((unit) => unit.legacyChunkId)).toEqual([
      "ART_GRAPH_CHARACTERIZATION#dosage-0#0",
      "ART_GRAPH_CHARACTERIZATION#dosage-1#0",
      "ART_GRAPH_CHARACTERIZATION#dosage-2#0",
    ]);
  });

  it("does not mistake the graph diagnostic id for a hybrid lookup key", () => {
    const hybrid = chunkMarkdownDocument(DOCUMENT, PACKED_MARKDOWN);
    const graph = chunk(PACKED_MARKDOWN);

    expect(hybrid).toHaveLength(1);
    expect(hybrid[0]?.chunkId).toBe(graph.textUnits[0]?.legacyChunkId);
    expect(hybrid[0]?.content).not.toBe(graph.textUnits[0]?.content);
    expect(graph.textUnits[0]?.textUnitId).not.toBe(hybrid[0]?.chunkId);
  });

  it("changes identity when chunking configuration changes", () => {
    const narrow = chunk(PACKED_MARKDOWN, { maxChars: 400, overlapChars: 60 });
    const wide = chunk(PACKED_MARKDOWN, { maxChars: 800, overlapChars: 120 });

    expect(narrow.textUnits[0]?.legacyChunkId).toBe(wide.textUnits[0]?.legacyChunkId);
    expect(narrow.configHash).not.toBe(wide.configHash);
    expect(narrow.textUnits[0]?.textUnitId).not.toBe(wide.textUnits[0]?.textUnitId);
    expect(narrow.sectionTaxonomyVersion).toBe("clinical-heading-v1");
    expect(narrow.textHelperVersion).toBe("retrieval-text-v1");
    expect(narrow.algorithmVersion).toBe("graph-chunk-v1");
  });

  it("changes identity when the document snapshot changes", () => {
    const before = chunk(PACKED_MARKDOWN);
    const after = chunk(`${PACKED_MARKDOWN}\n\n## Appendice\n\nTexte ajoute.`);

    expect(before.textUnits[0]?.legacyChunkId).toBe(after.textUnits[0]?.legacyChunkId);
    expect(before.documentSnapshotId).not.toBe(after.documentSnapshotId);
    expect(before.textUnits[0]?.textUnitId).not.toBe(after.textUnits[0]?.textUnitId);
  });

  it("produces deterministic output for the same document and profile", () => {
    const first = chunk(PACKED_MARKDOWN);
    const second = chunk(PACKED_MARKDOWN);
    expect(second).toEqual(first);
  });
});
