import { describe, expect, it } from "bun:test";
import {
  ENTITY_MENTION_TAXONOMY_VERSION,
  MENTION_KINDS,
  buildMentionLexicon,
  chunkGraphMarkdownDocument,
  clinicalMentionLexiconSeeds,
  extractTextUnitMentions,
  type ChunkSourceDocument,
  type DocumentProvenance,
  type GraphTextUnit,
  type MentionLexiconSeed,
} from "@repo/modules/retrieval";

const DOCUMENT: ChunkSourceDocument = {
  artifactId: "ART_ENTITY",
  documentId: "DOC_ENTITY",
  title: "Entity extraction document",
  sourceId: "ANPP_RCP",
  sourceName: "ANPP",
  authorityLevel: 1,
  jurisdiction: "DZ",
  documentType: "smpc",
  language: "fr",
  medicineIds: ["MED999"],
  medicineNames: ["Entity medicine"],
  inn: "entity",
  brandName: "DOLIPRANE",
  strengthForm: "500 mg comprime",
  sourceUrls: ["https://example.test/entity"],
};

function documentProvenance(unit: GraphTextUnit): DocumentProvenance {
  return {
    artifactId: unit.artifactId,
    documentId: unit.documentId,
    documentSnapshotId: unit.documentSnapshotId,
    documentContentSha256: unit.rawContentSha256,
    sourceId: "ANPP_RCP",
    sourceName: "ANPP",
    sourceUrl: "https://example.test/entity",
    title: DOCUMENT.title,
    documentType: "smpc",
    language: "fr",
    jurisdiction: "DZ",
    authorityLevel: 1,
    publicationDate: null,
    collectedAt: null,
  };
}

function seeds(): MentionLexiconSeed[] {
  const base = [
    ["DOLIPRANE", "brand_term"],
    ["paracétamol", "substance"],
    ["voie orale", "route_of_administration"],
    ["adulte", "population_group"],
    ["douleur", "clinical_condition"],
    ["nausée", "adverse_effect"],
    ["INR", "laboratory_test"],
    ["COX-2", "biological_target"],
    ["pamplemousse", "food_or_beverage"],
  ] as const;
  return [
    ...base.map(([surface, candidateKind]) => ({
      surface,
      candidateKind,
      sourceKind: "test",
      sourceId: "test-lexicon",
      sourceKey: `${candidateKind}:${surface}`,
    })),
    ...clinicalMentionLexiconSeeds(),
  ];
}

function extract(unit: GraphTextUnit) {
  return extractTextUnitMentions({
    unit,
    lexicon: buildMentionLexicon(seeds()),
    extractionRunId: "run_entity_test",
    document: documentProvenance(unit),
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
  });
}

describe("entity mention taxonomy", () => {
  it("keeps the ontology temporary and covers product, regulatory, clinical, and value kinds", () => {
    expect(ENTITY_MENTION_TAXONOMY_VERSION).toBe("entity-mention-taxonomy-v0.1");
    for (const kind of [
      "medicinal_product",
      "brand_term",
      "substance",
      "dose_form",
      "route_of_administration",
      "atc_class",
      "regulatory_authorization",
      "organization",
      "clinical_condition",
      "adverse_effect",
      "laboratory_test",
      "population_group",
      "identifier_registration",
      "identifier_ndc",
      "identifier_unii",
      "quantity",
      "package_presentation",
    ]) {
      expect(MENTION_KINDS as readonly string[]).toContain(kind);
    }
  });
});

describe("deterministic mention lexicon", () => {
  it("matches folded aliases and prefers a longer overlapping surface", () => {
    const lexicon = buildMentionLexicon([
      ...seeds(),
      {
        surface: "DOLIPRANE 500 mg",
        candidateKind: "medicinal_product",
        sourceKind: "test",
        sourceId: "test-lexicon",
        sourceKey: "product",
      },
    ]);
    const matches = lexicon.match(
      "DOLIPRANE 500 mg contient du PARACETAMOL. Voie orale chez l'adulte avec pamplemousse et COX-2.",
    );

    expect(
      matches.some(
        (match) =>
          match.candidateKind === "medicinal_product" && match.surfaceText === "DOLIPRANE 500 mg",
      ),
    ).toBe(true);
    expect(matches.some((match) => match.candidateKind === "brand_term")).toBe(false);
    expect(matches.some((match) => match.candidateKind === "substance")).toBe(true);
    expect(matches.some((match) => match.candidateKind === "route_of_administration")).toBe(true);
    expect(matches.some((match) => match.candidateKind === "population_group")).toBe(true);
    expect(matches.some((match) => match.candidateKind === "biological_target")).toBe(true);
  });
});

describe("graph text-unit entity extraction", () => {
  it("extracts text, pattern, and clinical-bullet mentions with exact evidence", () => {
    const markdown = [
      "## Indications",
      "DOLIPRANE 500 mg est indiqué dans la douleur. ATC N02BE01. Enregistrement 003/12 A 131/06/23.",
      "## Effets indésirables",
      "- Nausée",
      "- Vertige",
    ].join("\n\n");
    const result = chunkGraphMarkdownDocument(DOCUMENT, markdown);
    const indications = result.textUnits.find((unit) => unit.sectionCode === "indications")!;
    const adverse = result.textUnits.find((unit) => unit.sectionCode === "adverse_effects")!;

    const indicationExtraction = extract(indications);
    const adverseExtraction = extract(adverse);
    const all = [...indicationExtraction.candidates, ...adverseExtraction.candidates];

    expect(all.some((mention) => mention.candidateKind === "brand_term")).toBe(true);
    expect(all.some((mention) => mention.candidateKind === "clinical_condition")).toBe(true);
    expect(all.some((mention) => mention.candidateKind === "identifier_atc")).toBe(true);
    expect(all.some((mention) => mention.candidateKind === "identifier_registration")).toBe(true);
    expect(all.some((mention) => mention.candidateKind === "quantity")).toBe(true);
    expect(all.some((mention) => mention.candidateKind === "adverse_effect")).toBe(true);
    expect(all.every((mention) => mention.observationState === "quarantined")).toBe(true);

    for (const mention of all) {
      expect(mention.evidence.localStart).toBeGreaterThanOrEqual(
        mention.evidence.textUnitId === indications.textUnitId
          ? indications.uniqueLocalSpan.start
          : adverse.uniqueLocalSpan.start,
      );
      expect(mention.evidence.quote).toBe(
        (mention.evidence.textUnitId === indications.textUnitId
          ? indications.content
          : adverse.content
        ).slice(mention.evidence.localStart, mention.evidence.localEnd),
      );
      expect(mention.evidence.documentStart).toBe(
        mention.evidence.textUnitId === indications.textUnitId
          ? indications.sourceSpan.start + mention.evidence.localStart
          : adverse.sourceSpan.start + mention.evidence.localStart,
      );
      expect(mention.evidence.documentSnapshotId).toBe(result.documentSnapshotId);
      expect("canonicalEntityId" in mention).toBe(false);
    }
    expect(new Set(all.map((mention) => mention.mentionId)).size).toBe(all.length);
  });

  it("ignores overlap text and generated display prefixes", () => {
    const markdown = Array.from(
      { length: 24 },
      (_, index) => `DOLIPRANE regle ${index + 1} est courte.`,
    ).join(" ");
    const overlapResult = chunkGraphMarkdownDocument(DOCUMENT, markdown, {
      maxChars: 400,
      overlapChars: 100,
    });
    const overlapped = overlapResult.textUnits.find((unit) => unit.overlaps.length > 0)!;
    const overlapExtraction = extract(overlapped);
    expect(
      overlapExtraction.candidates.every(
        (mention) => mention.evidence.localStart >= overlapped.uniqueLocalSpan.start,
      ),
    ).toBe(true);

    const table = [
      "| Brand | Dose | Population | Voie |",
      "| --- | --- | --- | --- |",
      `| DOLIPRANE | 500 mg | adulte insuffisance renale | orale |`,
      ...Array.from(
        { length: 7 },
        (_, index) =>
          `| autre-produit-${index + 1}-avec-un-nom-long | ${250 - index} mg | adulte insuffisance renale | orale |`,
      ),
    ].join("\n");
    const tableResult = chunkGraphMarkdownDocument(DOCUMENT, table, {
      maxChars: 400,
      overlapChars: 0,
    });
    const later = tableResult.textUnits.find((unit) => unit.table?.headerIncluded === false)!;
    const tableExtraction = extract(later);
    expect(tableExtraction.candidates.some((mention) => mention.surfaceText === "DOLIPRANE")).toBe(
      false,
    );
  });
});
