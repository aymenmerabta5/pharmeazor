import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import {
  ENTITY_MENTION_TAXONOMY_VERSION,
  RELATIONSHIP_KINDS,
  RELATIONSHIP_TAXONOMY_VERSION,
  buildMentionLexicon,
  chunkGraphMarkdownDocument,
  clinicalMentionLexiconSeeds,
  extractStructuredRowRelationships,
  extractTextRelationships,
  extractTextUnitMentions,
  type ChunkSourceDocument,
  type DocumentProvenance,
  type GraphTextUnit,
  type MentionLexiconSeed,
  type StructuredObservationRecord,
} from "@repo/modules/retrieval";

const DOCUMENT: ChunkSourceDocument = {
  artifactId: "ART_RELATION",
  documentId: "DOC_RELATION",
  title: "DOLIPRANE EFFERALGAN 500 mg comprime",
  sourceId: "ANPP_RCP",
  sourceName: "ANPP",
  authorityLevel: 1,
  jurisdiction: "DZ",
  documentType: "smpc",
  language: "fr",
  medicineIds: ["MED999"],
  medicineNames: ["Relationship medicine"],
  inn: "relationship",
  brandName: "DOLIPRANE",
  strengthForm: "500 mg comprime",
  sourceUrls: ["https://example.test/relationship"],
};

function documentProvenance(unit: GraphTextUnit): DocumentProvenance {
  return {
    artifactId: unit.artifactId,
    documentId: unit.documentId,
    documentSnapshotId: unit.documentSnapshotId,
    documentContentSha256: unit.rawContentSha256,
    sourceId: "ANPP_RCP",
    sourceName: "ANPP",
    sourceUrl: "https://example.test/relationship",
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
    ["EFFERALGAN", "brand_term"],
    ["paracétamol", "substance"],
    ["voie orale", "route_of_administration"],
    ["adulte", "population_group"],
    ["fièvre", "clinical_condition"],
    ["douleur", "clinical_condition"],
    ["nausée", "adverse_effect"],
    ["LABORATOIRE TEST", "organization"],
    ["N02BE01", "atc_class"],
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

function mentionsFor(unit: GraphTextUnit) {
  return extractTextUnitMentions({
    unit,
    lexicon: buildMentionLexicon(seeds()),
    extractionRunId: "run_entity_test",
    document: documentProvenance(unit),
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
  }).candidates;
}

function extractText(markdown: string) {
  const result = chunkGraphMarkdownDocument(DOCUMENT, markdown);
  const relationships = result.textUnits.flatMap(
    (unit) =>
      extractTextRelationships({
        unit,
        mentions: mentionsFor(unit),
        extractionRunId: "run_relationship_test",
        ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
      }).relationships,
  );
  return { result, relationships };
}

let observationCounter = 0;
function observation(
  candidateKind: StructuredObservationRecord["candidateKind"],
  rawValue: string,
  rowNumber = 2,
  path = "name_map.csv",
): StructuredObservationRecord {
  observationCounter += 1;
  return {
    observationId: `obs_test_${observationCounter}`,
    extractionRunId: "run_entity_test",
    candidateKind,
    family:
      candidateKind === "clinical_condition" || candidateKind === "adverse_effect"
        ? "clinical"
        : candidateKind.startsWith("identifier_") || candidateKind === "quantity"
          ? "value"
          : "product_regulatory",
    language: null,
    rawValue,
    normalizedValue: rawValue.toLowerCase(),
    evidence: {
      kind: "structured_record",
      sourceId: "SANTE_MSP",
      sourceKind: "structured_row",
      path,
      rowNumber,
      rowSha256: `row-hash-${rowNumber}`,
      schemaVersion: `${path}-v1`,
    },
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    attributes: { sourceFile: path, reviewRequired: true },
    observationState: "quarantined",
  };
}

function extractStructured(observations: readonly StructuredObservationRecord[]) {
  return extractStructuredRowRelationships({
    observations,
    extractionRunId: "run_relationship_test",
    ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
  }).relationships;
}

describe("candidate relationship taxonomy", () => {
  it("stays temporary and covers structured and section-gated text relations", () => {
    expect(RELATIONSHIP_TAXONOMY_VERSION).toBe("relationship-candidate-taxonomy-v0.1");
    for (const kind of [
      "product_has_substance",
      "product_has_dose_form",
      "product_has_route",
      "product_has_authorization",
      "product_indicated_for_condition",
      "product_has_adverse_effect",
      "product_has_excipient",
      "authorization_held_by_organization",
      "source_has_jurisdiction",
    ]) {
      expect(RELATIONSHIP_KINDS as readonly string[]).toContain(kind);
    }
  });
});

describe("structured-row relationship extraction", () => {
  it("derives explicit product, authorization, and source relationships", () => {
    const relationships = extractStructured([
      observation("brand_term", "DOLIPRANE"),
      observation("substance", "paracétamol"),
      observation("dose_form", "COMPRIME"),
      observation("strength", "500MG"),
      observation("package_presentation", "B/20"),
      observation("atc_class", "N02BE01"),
      observation("organization", "LABORATOIRE TEST"),
      observation("regulatory_authorization", "503/03 B 061/16"),
    ]);
    const kinds = new Set(relationships.map((entry) => entry.relationshipKind));

    expect(kinds.has("product_has_substance")).toBe(true);
    expect(kinds.has("product_has_dose_form")).toBe(true);
    expect(kinds.has("product_has_strength")).toBe(true);
    expect(kinds.has("product_has_package")).toBe(true);
    expect(kinds.has("product_has_atc_class")).toBe(true);
    expect(kinds.has("product_held_by_organization")).toBe(true);
    expect(kinds.has("product_has_authorization")).toBe(true);
    expect(kinds.has("authorization_held_by_organization")).toBe(true);

    for (const relationship of relationships) {
      expect(relationship.observationState).toBe("quarantined");
      expect(relationship.method).toBe("structured_row");
      expect(relationship.support.kind).toBe("structured_row");
      expect("canonicalEntityId" in relationship).toBe(false);
      expect("resolvedEntityId" in relationship).toBe(false);
      expect(relationship.subject.endpointKind).toBe("observation");
      expect(relationship.object.endpointKind).toBe("observation");
      if (
        relationship.subject.endpointKind === "observation" &&
        relationship.object.endpointKind === "observation"
      ) {
        expect(relationship.subject.endpointId).not.toBe(relationship.object.endpointId);
        expect(relationship.subject.normalizedValue).not.toBe(relationship.object.normalizedValue);
      }
    }
  });

  it("never joins observations from different structured rows", () => {
    const relationships = extractStructured([
      observation("brand_term", "DOLIPRANE", 2),
      observation("substance", "paracétamol", 3),
    ]);
    expect(relationships.some((entry) => entry.relationshipKind === "product_has_substance")).toBe(
      false,
    );
  });

  it("derives source registry value relationships", () => {
    const relationships = extractStructured([
      observation("source", "ANPP_RCP", 2, "sources.csv"),
      observation("jurisdiction", "DZ", 2, "sources.csv"),
      observation("language", "fr", 2, "sources.csv"),
      observation("source_type", "official_agency", 2, "sources.csv"),
    ]);
    const kinds = new Set(relationships.map((entry) => entry.relationshipKind));
    expect(kinds.has("source_has_jurisdiction")).toBe(true);
    expect(kinds.has("source_has_language")).toBe(true);
    expect(kinds.has("source_has_type")).toBe(true);
  });
});

describe("section-gated text relationship extraction", () => {
  it("derives clinical, composition, route, holder, and ATC candidates with exact support", () => {
    const markdown = [
      "## Indications",
      "DOLIPRANE est destiné au traitement de la fièvre et de la douleur.",
      "## Effets indésirables",
      "DOLIPRANE peut provoquer une nausée.",
      "## Composition",
      "DOLIPRANE contient du paracétamol.",
      "## Excipients",
      "DOLIPRANE contient de l'amidon de maïs, du talc.",
      "## Dosage",
      "DOLIPRANE est administré par voie orale chez l'adulte.",
      "## Autres informations",
      "DOLIPRANE, titulaire : LABORATOIRE TEST.",
      "DOLIPRANE ATC N02BE01.",
    ].join("\n\n");
    const { result, relationships } = extractText(markdown);
    const kinds = new Set(relationships.map((entry) => entry.relationshipKind));

    expect(kinds.has("product_indicated_for_condition")).toBe(true);
    expect(kinds.has("product_has_adverse_effect")).toBe(true);
    expect(kinds.has("product_has_substance")).toBe(true);
    expect(kinds.has("product_has_excipient")).toBe(true);
    expect(kinds.has("product_has_route")).toBe(true);
    expect(kinds.has("product_targets_population")).toBe(true);
    expect(kinds.has("product_held_by_organization")).toBe(true);
    expect(kinds.has("product_has_atc_class")).toBe(true);

    for (const relationship of relationships) {
      expect(relationship.observationState).toBe("quarantined");
      expect("canonicalEntityId" in relationship).toBe(false);
      expect("resolvedEntityId" in relationship).toBe(false);
      if (
        relationship.subject.endpointKind === "mention" &&
        relationship.object.endpointKind === "mention"
      ) {
        expect(relationship.subject.endpointId).not.toBe(relationship.object.endpointId);
        expect(relationship.subject.normalizedSurface).not.toBe(
          relationship.object.normalizedSurface,
        );
      }
      const support = relationship.support;
      if (support.kind !== "text_support") {
        throw new Error("Expected text support");
      }
      const unit = result.textUnits.find((entry) => entry.textUnitId === support.textUnitId)!;
      expect(unit).toBeDefined();
      expect(unit.content.slice(support.start, support.end)).toBe(support.quote);
      expect(sha256(support.quote)).toBe(support.quoteSha256);
      expect(support.documentSnapshotId).toBe(result.documentSnapshotId);
    }
  });

  it("does not create unit-scoped product relations when the unit has several products", () => {
    const { relationships } = extractText(
      ["## Indications", "DOLIPRANE et EFFERALGAN sont destinés au traitement de la fièvre."].join(
        "\n\n",
      ),
    );
    expect(
      relationships.some((entry) => entry.relationshipKind === "product_indicated_for_condition"),
    ).toBe(false);
  });

  it("does not use a clinical section as an indication relation", () => {
    const { relationships } = extractText(
      ["## Mises en garde", "DOLIPRANE peut être associé à la fièvre."].join("\n\n"),
    );
    expect(
      relationships.some((entry) => entry.relationshipKind === "product_indicated_for_condition"),
    ).toBe(false);
  });

  it("is deterministic for the same unit and mentions", () => {
    const markdown = ["## Indications", "DOLIPRANE est destiné au traitement de la fièvre."].join(
      "\n\n",
    );
    const first = extractText(markdown).relationships.map((entry) => entry.relationshipId);
    const second = extractText(markdown).relationships.map((entry) => entry.relationshipId);
    expect(second).toEqual(first);
  });
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
