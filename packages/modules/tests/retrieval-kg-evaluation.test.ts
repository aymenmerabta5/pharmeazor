import { describe, expect, it } from "bun:test";
import {
  ENTITY_LINK_TAXONOMY_VERSION,
  ENTITY_MENTION_TAXONOMY_VERSION,
  MENTION_KIND_DEFINITIONS,
  RELATIONSHIP_TAXONOMY_VERSION,
  buildMentionLexicon,
  chunkGraphMarkdownDocument,
  clusterEntityLinks,
  evaluationClusterFrom,
  evaluationMentionFrom,
  evaluationObservationFrom,
  evaluationRelationshipFrom,
  evaluationTextUnitFrom,
  evaluationUnresolvedFrom,
  evaluateKnowledgeGraph,
  extractStructuredRowRelationships,
  extractTextUnitMentions,
  linkRecordsForStructuredRow,
  sha256,
  type ChunkSourceDocument,
  type DocumentProvenance,
  type EvaluationEntityCluster,
  type EvaluationMention,
  type EvaluationObservation,
  type GoldDataset,
  type KnowledgeGraphEvaluationInput,
  type MentionLexiconSeed,
  type StructuredObservationRecord,
  type StructuredRecordRef,
} from "@repo/modules/retrieval";

const DOCUMENT: ChunkSourceDocument = {
  artifactId: "ART_EVAL",
  documentId: "DOC_EVAL",
  title: "Evaluation document",
  sourceId: "ANPP_RCP",
  sourceName: "ANPP",
  authorityLevel: 1,
  jurisdiction: "DZ",
  documentType: "smpc",
  language: "fr",
  medicineIds: ["MED_EVAL"],
  medicineNames: ["Doliprane"],
  inn: "paracetamol",
  brandName: "DOLIPRANE",
  strengthForm: "500 mg comprime",
  sourceUrls: ["https://example.test/eval"],
};

const SEEDS: MentionLexiconSeed[] = [
  {
    surface: "DOLIPRANE",
    candidateKind: "brand_term",
    sourceKind: "test",
    sourceId: "test-lexicon",
    sourceKey: "brand",
  },
  {
    surface: "douleur",
    candidateKind: "clinical_condition",
    sourceKind: "test",
    sourceId: "test-lexicon",
    sourceKey: "condition",
  },
];

function provenance(
  unit: ReturnType<typeof chunkGraphMarkdownDocument>["textUnits"][number],
  documentContentSha256: string,
): DocumentProvenance {
  return {
    artifactId: unit.artifactId,
    documentId: unit.documentId,
    documentSnapshotId: unit.documentSnapshotId,
    documentContentSha256,
    sourceId: DOCUMENT.sourceId,
    sourceName: DOCUMENT.sourceName,
    sourceUrl: DOCUMENT.sourceUrls[0] ?? null,
    title: DOCUMENT.title,
    documentType: DOCUMENT.documentType,
    language: DOCUMENT.language,
    jurisdiction: DOCUMENT.jurisdiction,
    authorityLevel: DOCUMENT.authorityLevel,
    publicationDate: null,
    collectedAt: null,
  };
}

function textFixture(): {
  readonly snapshotId: string;
  readonly units: ReturnType<typeof evaluationTextUnitFrom>[];
  readonly mentions: EvaluationMention[];
  readonly allMentions: ReturnType<typeof extractTextUnitMentions>["candidates"];
} {
  const markdown = ["## Indications", "DOLIPRANE 500 mg est indique dans la douleur."].join("\n\n");
  const result = chunkGraphMarkdownDocument(DOCUMENT, markdown);
  const unit = result.textUnits.find((candidate) => candidate.sectionCode === "indications")!;
  const extraction = extractTextUnitMentions({
    unit,
    lexicon: buildMentionLexicon(SEEDS),
    extractionRunId: "run_eval",
    document: provenance(unit, result.documentContentSha256),
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
  });
  return {
    snapshotId: unit.documentSnapshotId,
    units: result.textUnits.map((textUnit) =>
      evaluationTextUnitFrom(textUnit, result.documentContentSha256),
    ),
    mentions: extraction.candidates.map(evaluationMentionFrom),
    allMentions: extraction.candidates,
  };
}

function goldDataset(overrides: Partial<GoldDataset> = {}): GoldDataset {
  return {
    manifest: {
      schemaVersion: 1,
      datasetId: "kg-eval-test",
      protocolVersion: "kg-gold-v1",
      status: "manually_labelled",
      description: "Synthetic evaluation fixture; not shipped gold data.",
      annotators: ["test"],
      documents: [],
      structuredRows: [],
    },
    entityMentions: [],
    relationships: [],
    entityLinks: [],
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<KnowledgeGraphEvaluationInput> = {},
): KnowledgeGraphEvaluationInput {
  return {
    textUnits: [],
    mentions: [],
    observations: [],
    relationships: [],
    confidentClusters: [],
    ambiguousClusters: [],
    unresolvedCandidates: [],
    gold: goldDataset(),
    artifacts: {
      graphDiagnosticsByCode: {},
      entityDiagnosticsByCode: {},
      relationshipDiagnosticsByCode: {},
      linkDiagnosticsByCode: {},
      limited: false,
    },
    ...overrides,
  };
}

function mentionAt(
  mentions: readonly EvaluationMention[],
  kind: string,
  quote: string,
): EvaluationMention {
  const mention = mentions.find(
    (candidate) => candidate.candidateKind === kind && candidate.evidence.quote === quote,
  );
  if (!mention) throw new Error(`Missing ${kind} mention for ${quote}`);
  return mention;
}

function goldTextRef(mention: EvaluationMention, candidateKind = mention.candidateKind) {
  return {
    kind: "text_span" as const,
    documentSnapshotId: mention.evidence.documentSnapshotId,
    documentId: mention.evidence.documentId,
    documentStart: mention.evidence.documentStart,
    documentEnd: mention.evidence.documentEnd,
    quote: mention.evidence.quote,
    candidateKind,
  };
}

describe("entity extraction evaluation", () => {
  it("computes strict and relaxed precision, recall, and F1 on an exhaustive document", () => {
    const fixture = textFixture();
    const brand = mentionAt(fixture.mentions, "brand_term", "DOLIPRANE");
    const condition = mentionAt(fixture.mentions, "clinical_condition", "douleur");
    const quantity = fixture.mentions.find((mention) => mention.candidateKind === "quantity")!;
    const gold = goldDataset({
      manifest: {
        ...goldDataset().manifest,
        documents: [
          {
            documentId: brand.document.documentId,
            documentSnapshotId: fixture.snapshotId,
            artifactId: brand.document.artifactId,
            entityScope: "exhaustive",
            relationshipScope: "not_annotated",
            note: null,
          },
        ],
      },
      entityMentions: [
        { goldId: "E1", entity: goldTextRef(brand), note: null },
        { goldId: "E2", entity: goldTextRef(condition, "symptom"), note: null },
      ],
    });
    const evaluation = evaluateKnowledgeGraph(
      baseInput({
        textUnits: fixture.units,
        mentions: [brand, condition, quantity],
        gold,
      }),
    );

    expect(evaluation.status).toBe("evaluated");
    expect(evaluation.metrics.entityMentions.available).toBe(true);
    expect(evaluation.metrics.entityMentions.goldAnnotations).toBe(2);
    expect(evaluation.metrics.entityMentions.strict).toEqual({
      truePositives: 1,
      falsePositives: 2,
      falseNegatives: 1,
      precision: 0.333333,
      recall: 0.5,
      f1: 0.4,
    });
    expect(evaluation.metrics.entityMentions.relaxedSpan.typeMismatches).toBe(1);
    expect(evaluation.metrics.entityMentions.relaxedSpan.truePositives).toBe(2);
    expect(evaluation.metrics.entityMentions.byKind.brand_term?.truePositives).toBe(1);
    expect(evaluation.metrics.entityMentions.byKind.symptom?.falseNegatives).toBe(1);
  });

  it("reports unavailable metrics instead of fabricating a score when no gold labels exist", () => {
    const fixture = textFixture();
    const evaluation = evaluateKnowledgeGraph(
      baseInput({ textUnits: fixture.units, mentions: fixture.mentions }),
    );

    expect(evaluation.status).toBe("insufficient_gold_labels");
    expect(evaluation.metrics.entityMentions.available).toBe(false);
    expect(evaluation.metrics.entityMentions.reason).toBe("no_gold_entity_annotations");
    expect(evaluation.metrics.entityMentions.strict.precision).toBeNull();
    expect(evaluation.validation.ok).toBe(true);
  });
});

function structuredRow(
  path: string,
  rowNumber: number,
  values: Readonly<Record<string, string>>,
): StructuredRecordRef {
  return {
    kind: "structured_record",
    sourceId: "SANTE_MSP",
    sourceKind: "structured_row",
    path,
    rowNumber,
    rowSha256: sha256(JSON.stringify(Object.entries(values).sort())),
    schemaVersion: `${path}-v1`,
  };
}

function observation(
  id: string,
  candidateKind: string,
  rawValue: string,
  evidence: StructuredRecordRef,
): StructuredObservationRecord {
  const definition = MENTION_KIND_DEFINITIONS.find(
    (entry) => entry.candidateKind === candidateKind,
  )!;
  return {
    observationId: id,
    extractionRunId: "run_eval",
    candidateKind: candidateKind as StructuredObservationRecord["candidateKind"],
    family: definition.family,
    language: null,
    rawValue,
    normalizedValue: rawValue.toLowerCase(),
    evidence,
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    attributes: { reviewRequired: true },
    observationState: "quarantined",
  };
}

function goldStructuredRef(observationRecord: EvaluationObservation) {
  if (observationRecord.evidence.kind !== "structured_record") {
    throw new Error("Expected structured evidence");
  }
  return {
    kind: "structured_row" as const,
    sourceId: observationRecord.evidence.sourceId,
    path: observationRecord.evidence.path,
    rowNumber: observationRecord.evidence.rowNumber,
    rawValue: observationRecord.rawValue,
    candidateKind: observationRecord.candidateKind,
  };
}

describe("relationship extraction evaluation", () => {
  it("scores a matched structured relationship against an extra candidate", () => {
    const row = structuredRow("nomenclature_products.csv", 2, {
      brand: "DOLIPRANE",
      form: "COMPRIME",
      dosage: "500MG",
    });
    const product = observation("obs_product", "pharmaceutical_product", "DOLIPRANE", row);
    const form = observation("obs_form", "dose_form", "COMPRIME", row);
    const strength = observation("obs_strength", "strength", "500MG", row);
    const extraction = extractStructuredRowRelationships({
      observations: [product, form, strength],
      extractionRunId: "run_eval",
      ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
    });
    const relationships = extraction.relationships.map(evaluationRelationshipFrom);
    const doseForm = relationships.find(
      (relationship) => relationship.relationshipKind === "product_has_dose_form",
    )!;
    const productView = evaluationObservationFrom(product);
    const formView = evaluationObservationFrom(form);
    const gold = goldDataset({
      manifest: {
        ...goldDataset().manifest,
        structuredRows: [
          {
            sourceId: "SANTE_MSP",
            path: "nomenclature_products.csv",
            rowNumber: 2,
            entityScope: "not_annotated",
            relationshipScope: "exhaustive",
            note: null,
          },
        ],
      },
      relationships: [
        {
          goldId: "R1",
          relationshipKind: doseForm.relationshipKind,
          subject: goldStructuredRef(productView),
          object: goldStructuredRef(formView),
          note: null,
        },
      ],
    });
    const evaluation = evaluateKnowledgeGraph(
      baseInput({
        observations: [product, form, strength].map(evaluationObservationFrom),
        relationships,
        gold,
      }),
    );

    expect(evaluation.status).toBe("evaluated");
    expect(evaluation.metrics.relationships.available).toBe(true);
    expect(evaluation.metrics.relationships.strict).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
      precision: 0.5,
      recall: 1,
      f1: 0.666667,
    });
    expect(evaluation.metrics.relationships.byKind.product_has_strength?.falsePositives).toBe(1);
  });
});

describe("entity link evaluation", () => {
  it("scores same-entity and different-entity pairs, including false merges and splits", () => {
    const rowOne = structuredRow("nomenclature_products.csv", 2, { cis: "66313736" });
    const rowTwo = structuredRow("nomenclature_products.csv", 3, { cis: "66313736" });
    const rowThree = structuredRow("nomenclature_products.csv", 4, { brand: "PARACETAMOL" });
    const rowFour = structuredRow("nomenclature_products.csv", 5, { brand: "PARACETAMOL" });
    const rowFive = structuredRow("nomenclature_products.csv", 6, {
      brand: "IBUPROFENE",
      dosage: "200MG",
    });
    const rowSix = structuredRow("nomenclature_products.csv", 7, {
      brand: "IBUPROFENE",
      dosage: "400MG",
    });
    const observations = [
      observation("p1", "pharmaceutical_product", "DOLIPRANE", rowOne),
      observation("c1", "identifier_cis", "66313736", rowOne),
      observation("p2", "pharmaceutical_product", "DOLIPRANE", rowTwo),
      observation("c2", "identifier_cis", "66313736", rowTwo),
      observation("p3", "pharmaceutical_product", "PARACETAMOL", rowThree),
      observation("p4", "pharmaceutical_product", "PARACETAMOL", rowFour),
      observation("p5", "pharmaceutical_product", "IBUPROFENE", rowFive),
      observation("s5", "strength", "200MG", rowFive),
      observation("p6", "pharmaceutical_product", "IBUPROFENE", rowSix),
      observation("s6", "strength", "400MG", rowSix),
    ];
    const records = [
      linkRecordsForStructuredRow(observations.slice(0, 2)),
      linkRecordsForStructuredRow(observations.slice(2, 4)),
      linkRecordsForStructuredRow(observations.slice(4, 5)),
      linkRecordsForStructuredRow(observations.slice(5, 6)),
      linkRecordsForStructuredRow(observations.slice(6, 8)),
      linkRecordsForStructuredRow(observations.slice(8, 10)),
    ].flat();
    const clustered = clusterEntityLinks(records, {
      extractionRunId: "run_eval",
      ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
    });
    const productCluster = (cluster: (typeof clustered.confident)[number], a: string, b: string) =>
      cluster.members.some((member) => member.label === a) &&
      cluster.members.some((member) => member.label === b);
    const confidentA = clustered.confident.find((cluster) =>
      productCluster(cluster, "DOLIPRANE", "DOLIPRANE"),
    )!;
    const confidentB = clustered.confident.find((cluster) =>
      productCluster(cluster, "PARACETAMOL", "PARACETAMOL"),
    )!;
    const ambiguousC = clustered.ambiguous.find((cluster) =>
      productCluster(cluster, "IBUPROFENE", "IBUPROFENE"),
    )!;
    const memberRef = (cluster: (typeof clustered.confident)[number], index: number) => {
      const member = cluster.members[index]!;
      if (member.evidence.kind !== "structured_row") throw new Error("Expected structured member");
      return {
        kind: "structured_row" as const,
        sourceId: member.evidence.sourceId,
        path: member.evidence.path,
        rowNumber: member.evidence.rowNumber,
        rawValue: member.label,
        candidateKind: member.candidateKind,
      };
    };
    const gold = goldDataset({
      entityLinks: [
        {
          goldId: "L1",
          decision: "same_entity",
          group: "product",
          left: memberRef(confidentA, 0),
          right: memberRef(confidentA, 1),
          note: null,
        },
        {
          goldId: "L2",
          decision: "different_entity",
          group: "product",
          left: memberRef(confidentB, 0),
          right: memberRef(confidentB, 1),
          note: null,
        },
        {
          goldId: "L3",
          decision: "same_entity",
          group: "product",
          left: memberRef(ambiguousC, 0),
          right: memberRef(ambiguousC, 1),
          note: null,
        },
      ],
    });
    const evaluation = evaluateKnowledgeGraph(
      baseInput({
        observations: observations.map(evaluationObservationFrom),
        confidentClusters: clustered.confident.map(evaluationClusterFrom),
        ambiguousClusters: clustered.ambiguous.map(evaluationClusterFrom),
        unresolvedCandidates: clustered.unresolved.map(evaluationUnresolvedFrom),
        gold,
      }),
    );

    expect(evaluation.metrics.entityLinks.available).toBe(true);
    expect(evaluation.metrics.entityLinks.confusion).toEqual({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      trueNegatives: 0,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    });
    expect(evaluation.metrics.entityLinks.falseMerges).toEqual(["L2"]);
    expect(evaluation.metrics.entityLinks.falseSplits).toEqual(["L3"]);
    expect(
      Object.values(evaluation.counts.ambiguousByReason).reduce((total, count) => total + count, 0),
    ).toBeGreaterThan(0);
  });
});

describe("artifact validation", () => {
  it("detects tampered evidence, duplicate IDs, and invalid self-relationships", () => {
    const fixture = textFixture();
    const brand = mentionAt(fixture.mentions, "brand_term", "DOLIPRANE");
    const tampered: EvaluationMention = {
      ...brand,
      evidence: { ...brand.evidence, quote: "tampered quote" },
    };
    const duplicate: EvaluationMention = { ...brand };
    const relationship = {
      relationshipId: "rel_self",
      relationshipKind: "product_has_strength",
      family: "product_regulatory" as const,
      subject: {
        endpointKind: "mention" as const,
        endpointId: brand.mentionId,
        candidateKind: brand.candidateKind,
        family: brand.family,
        label: brand.surfaceText,
        normalizedLabel: brand.normalizedSurface,
        evidence: brand.evidence,
      },
      object: {
        endpointKind: "mention" as const,
        endpointId: brand.mentionId,
        candidateKind: brand.candidateKind,
        family: brand.family,
        label: brand.surfaceText,
        normalizedLabel: brand.normalizedSurface,
        evidence: brand.evidence,
      },
      support: {
        kind: "text_support" as const,
        scope: "clause" as const,
        textUnitId: brand.evidence.textUnitId,
        documentSnapshotId: brand.evidence.documentSnapshotId,
        artifactId: brand.evidence.artifactId,
        documentId: brand.evidence.documentId,
        sectionId: brand.evidence.sectionId,
        sectionCode: brand.evidence.sectionCode,
        offsetEncoding: brand.evidence.offsetEncoding,
        start: brand.evidence.localStart,
        end: brand.evidence.localEnd,
        documentStart: brand.evidence.documentStart,
        documentEnd: brand.evidence.documentEnd,
        quote: brand.evidence.quote,
        quoteSha256: brand.evidence.quoteSha256,
        rawContentSha256: brand.evidence.rawContentSha256,
        subjectEndpointId: brand.mentionId,
        objectEndpointId: brand.mentionId,
      },
      method: "section_clause",
      matchQuality: "section_clause",
      ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
      observationState: "quarantined",
    };
    const singleton: EvaluationEntityCluster = {
      candidateClusterId: "cl_singleton",
      extractionRunId: "run_eval",
      status: "confident",
      group: "product",
      preferredLabel: "DOLIPRANE",
      aliases: ["DOLIPRANE"],
      aliasCount: 1,
      nameKeys: ["doliprane"],
      identityKeys: [],
      contextKeys: [],
      conflicts: [],
      memberCount: 1,
      membersTruncated: false,
      members: [
        {
          endpointKind: "mention",
          endpointId: brand.mentionId,
          candidateKind: brand.candidateKind,
          family: brand.family,
          label: brand.surfaceText,
          normalizedLabel: brand.normalizedSurface,
          evidence: brand.evidence,
          sourceId: "ANPP_RCP",
          jurisdiction: "DZ",
          documentType: "smpc",
        },
      ],
      duplicateState: "deduplicated",
      reason: null,
      ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
      observationState: "quarantined",
    };
    const evaluation = evaluateKnowledgeGraph(
      baseInput({
        textUnits: fixture.units,
        mentions: [tampered, duplicate],
        relationships: [relationship],
        confidentClusters: [singleton],
      }),
    );

    const codes = evaluation.validation.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toContain("text_evidence_quote_mismatch");
    expect(codes).toContain("mention_id_duplicate");
    expect(codes).toContain("relationship_self_reference");
    expect(codes).toContain("link_confident_singleton");
    expect(evaluation.status).toBe("invalid_artifacts");
    expect(evaluation.validation.ok).toBe(false);
  });

  it("is deterministic for identical inputs", () => {
    const fixture = textFixture();
    const brand = mentionAt(fixture.mentions, "brand_term", "DOLIPRANE");
    const gold = goldDataset({
      manifest: {
        ...goldDataset().manifest,
        documents: [
          {
            documentId: brand.document.documentId,
            documentSnapshotId: fixture.snapshotId,
            artifactId: brand.document.artifactId,
            entityScope: "exhaustive",
            relationshipScope: "not_annotated",
            note: null,
          },
        ],
      },
      entityMentions: [{ goldId: "E1", entity: goldTextRef(brand), note: null }],
    });
    const input = baseInput({
      textUnits: fixture.units,
      mentions: [brand],
      gold,
    });

    expect(evaluateKnowledgeGraph(input)).toEqual(evaluateKnowledgeGraph(input));
  });
});
