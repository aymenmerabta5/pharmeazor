import { describe, expect, it } from "bun:test";
import {
  ENTITY_LINK_TAXONOMY_VERSION,
  ENTITY_MENTION_TAXONOMY_VERSION,
  LINK_GROUPS,
  clusterEntityLinks,
  linkGroupForKind,
  linkRecordFromMention,
  linkRecordsForStructuredRow,
  type MentionCandidateRecord,
  type StructuredObservationRecord,
} from "@repo/modules/retrieval";

function observation(
  candidateKind: StructuredObservationRecord["candidateKind"],
  rawValue: string,
  rowNumber: number,
  sourceId = "SANTE_MSP",
  path = "name_map.csv",
  attributes: Readonly<Record<string, unknown>> = {},
): StructuredObservationRecord {
  return {
    observationId: `obs_${path}_${rowNumber}_${candidateKind}_${rawValue}`,
    extractionRunId: "run_entity_test",
    candidateKind,
    family:
      candidateKind.startsWith("clinical") || candidateKind === "adverse_effect"
        ? "clinical"
        : candidateKind.startsWith("identifier_") || candidateKind === "quantity"
          ? "value"
          : "product_regulatory",
    language: null,
    rawValue,
    normalizedValue: rawValue.toLowerCase(),
    evidence: {
      kind: "structured_record",
      sourceId,
      sourceKind: "structured_row",
      path,
      rowNumber,
      rowSha256: `row-hash-${rowNumber}`,
      schemaVersion: `${path}-v1`,
    },
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    attributes: { sourceFile: path, reviewRequired: true, ...attributes },
    observationState: "quarantined",
  };
}

function cluster(observations: readonly StructuredObservationRecord[], maxMembers = 1000) {
  const byRow = new Map<string, StructuredObservationRecord[]>();
  for (const entry of observations) {
    const evidence = entry.evidence;
    const key =
      evidence.kind === "structured_record"
        ? `${evidence.sourceId}:${evidence.path}:${evidence.rowNumber}:${evidence.rowSha256}`
        : `${evidence.sourceId}:${evidence.artifactId}:${evidence.field}:${evidence.contentSha256}`;
    const bucket = byRow.get(key) ?? [];
    bucket.push(entry);
    byRow.set(key, bucket);
  }
  return clusterEntityLinks(
    [...byRow.values()].flatMap((row) => linkRecordsForStructuredRow(row)),
    {
      extractionRunId: "run_link_test",
      ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
      maxMembers,
    },
  );
}

function mention(
  mentionId: string,
  candidateKind: MentionCandidateRecord["candidateKind"],
  surfaceText: string,
  documentId = "DOC1",
  sourceId = "ANPP_RCP",
): MentionCandidateRecord {
  return {
    mentionId,
    extractionRunId: "run_entity_test",
    candidateKind,
    family: candidateKind === "brand_term" ? "product_regulatory" : "clinical",
    surfaceText,
    normalizedSurface: surfaceText.toLowerCase(),
    language: "fr",
    script: "Latn",
    evidence: {
      kind: "text_span",
      textUnitId: `unit-${documentId}`,
      documentSnapshotId: `snapshot-${documentId}`,
      artifactId: `artifact-${documentId}`,
      documentId,
      sectionId: "sec-1",
      sectionCode: "indications",
      sectionHeading: "Indications",
      sectionPath: ["Indications"],
      offsetEncoding: "utf16-code-unit",
      localStart: 5,
      localEnd: 5 + surfaceText.length,
      documentStart: 105,
      documentEnd: 105 + surfaceText.length,
      quote: surfaceText,
      quoteSha256: `quote-hash-${mentionId}`,
      rawContentSha256: `raw-hash-${documentId}`,
    },
    document: {
      artifactId: `artifact-${documentId}`,
      documentId,
      documentSnapshotId: `snapshot-${documentId}`,
      documentContentSha256: `document-hash-${documentId}`,
      sourceId,
      sourceName: sourceId,
      sourceUrl: null,
      title: "DOLIPRANE 500 mg",
      documentType: "smpc",
      language: "fr",
      jurisdiction: "DZ",
      authorityLevel: 1,
      publicationDate: null,
      collectedAt: null,
    },
    method: "gazetteer",
    matchQuality: "exact",
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    attributes: {},
    observationState: "quarantined",
  };
}

describe("candidate entity-link taxonomy", () => {
  it("stays temporary and maps only linkable groups", () => {
    expect(ENTITY_LINK_TAXONOMY_VERSION).toBe("entity-link-candidate-taxonomy-v0.1");
    expect(LINK_GROUPS).toContain("product");
    expect(linkGroupForKind("brand_term")?.group).toBe("product");
    expect(linkGroupForKind("substance")?.group).toBe("substance");
    expect(linkGroupForKind("clinical_condition")?.group).toBe("clinical");
    expect(linkGroupForKind("identifier_registration")).toBeNull();
    expect(linkGroupForKind("quantity")).toBeNull();
  });
});

describe("structured-row entity linking", () => {
  it("links two product observations that share a registration identifier", () => {
    const records = [
      ...linkRecordsForStructuredRow([
        observation("brand_term", "DOLIPRANE", 2),
        observation("identifier_registration", "503/03 B 061/16", 2),
        observation("dose_form", "COMPRIME", 2),
        observation("strength", "500MG", 2),
        observation("organization", "LABORATOIRE TEST", 2),
      ]),
      ...linkRecordsForStructuredRow([
        observation("brand_term", "DOLIPRANE", 3),
        observation("identifier_registration", "503/03 B 061/16", 3),
        observation("dose_form", "COMPRIME", 3),
        observation("strength", "500MG", 3),
      ]),
    ];
    const result = clusterEntityLinks(records, {
      extractionRunId: "run_link_test",
      ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
    });

    expect(result.confident.filter((entry) => entry.group === "product")).toHaveLength(1);
    expect(result.ambiguous.filter((entry) => entry.group === "product")).toHaveLength(0);
    const candidate = result.confident.find((entry) => entry.group === "product")!;
    expect(candidate.group).toBe("product");
    expect(candidate.status).toBe("confident");
    expect(candidate.memberCount).toBe(2);
    expect(candidate.identityKeys.some((key) => key.key.startsWith("reg:"))).toBe(true);
    expect(candidate.observationState).toBe("quarantined");
    expect("canonicalEntityId" in candidate).toBe(false);
    expect("resolvedEntityId" in candidate).toBe(false);
    expect(candidate.members.every((member) => member.evidence.kind === "structured_row")).toBe(
      true,
    );
  });

  it("marks the same brand with different registration numbers as ambiguous", () => {
    const result = cluster([
      observation("brand_term", "DOLIPRANE", 2),
      observation("identifier_registration", "503/03 B 061/16", 2),
      observation("brand_term", "DOLIPRANE", 3),
      observation("identifier_registration", "504/04 B 062/17", 3),
    ]);

    expect(result.confident.filter((entry) => entry.group === "product")).toHaveLength(0);
    const candidate = result.ambiguous.find((entry) => entry.group === "product")!;
    expect(candidate.attributes.reason).toBe("multiple_identifier_components");
    expect(candidate.memberCount).toBe(2);
    expect(candidate.duplicateState).toBe("possible_duplicate");
  });

  it("does not merge different salt forms of the same ingredient base", () => {
    const result = cluster([
      observation("substance", "paracétamol", 2),
      observation("substance", "paracétamol", 3),
      observation("substance", "paracétamol sodique", 4),
    ]);

    expect(result.confident.filter((entry) => entry.group === "substance")).toHaveLength(0);
    const candidate = result.ambiguous.find((entry) => entry.group === "substance")!;
    expect(candidate.memberCount).toBe(3);
    expect(candidate.nameKeys).toContain("paracetamol");
  });

  it("keeps identical substance names confident when no variant is present", () => {
    const result = cluster([
      observation("substance", "paracétamol", 2),
      observation("substance", "Paracétamol", 3),
    ]);

    expect(result.confident).toHaveLength(1);
    expect(result.confident[0]!.group).toBe("substance");
    expect(result.confident[0]!.memberCount).toBe(2);
  });

  it("marks a cross-role clinical duplicate as ambiguous", () => {
    const result = cluster([
      observation("clinical_condition", "nausée", 9, "ANPP_RCP", "clinical.csv"),
      observation("adverse_effect", "Nausée", 10, "ANPP_RCP", "clinical.csv"),
    ]);

    expect(result.confident).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.attributes.reason).toBe("role_conflict");
  });

  it("attaches a name-only mention to a unique identifier component", () => {
    const structured = linkRecordsForStructuredRow([
      observation("brand_term", "DOLIPRANE", 2),
      observation("identifier_registration", "503/03 B 061/16", 2),
    ]);
    const textMention = linkRecordFromMention(
      mention("men_attach", "brand_term", "DOLIPRANE", "DOC1", "SANTE_MSP"),
    )!;
    const result = clusterEntityLinks([...structured, textMention], {
      extractionRunId: "run_link_test",
      ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
    });

    const candidate = result.confident.find((entry) => entry.group === "product")!;
    expect(candidate).toBeDefined();
    expect(candidate.memberCount).toBe(2);
    expect(candidate.members.some((member) => member.endpointKind === "mention")).toBe(true);
  });

  it("caps member evidence while preserving the full member count", () => {
    const result = cluster(
      [
        observation("substance", "paracétamol", 2),
        observation("substance", "paracétamol", 3),
        observation("substance", "paracétamol", 4),
      ],
      1,
    );
    const candidate = result.confident.find((entry) => entry.group === "substance")!;
    expect(candidate.memberCount).toBe(3);
    expect(candidate.members).toHaveLength(1);
    expect(candidate.membersTruncated).toBe(true);
    expect(result.diagnostics.some((entry) => entry.code === "link_member_cap_reached")).toBe(true);
  });

  it("emits a singleton as unresolved candidate", () => {
    const result = cluster([observation("organization", "LABORATOIRE UNIQUE", 2)]);
    expect(result.confident).toHaveLength(0);
    expect(result.ambiguous).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]!.reason).toBe("singleton_no_safe_match");
    expect(result.unresolved[0]!.observationState).toBe("quarantined");
  });
});

describe("mention linking evidence", () => {
  it("preserves the exact mention span and provenance", () => {
    const first = linkRecordFromMention(mention("men_1", "brand_term", "DOLIPRANE", "DOC1"));
    const second = linkRecordFromMention(mention("men_2", "brand_term", "DOLIPRANE", "DOC2"));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const result = clusterEntityLinks([first!, second!], {
      extractionRunId: "run_link_test",
      ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
    });

    expect(result.confident).toHaveLength(1);
    const member = result.confident[0]!.members[0]!;
    expect(member.endpointKind).toBe("mention");
    expect(member.evidence.kind).toBe("text_span");
    if (member.evidence.kind === "text_span") {
      expect(member.evidence.quote).toBe("DOLIPRANE");
      expect(member.evidence.localStart).toBe(5);
      expect(member.evidence.sectionPath).toEqual(["Indications"]);
      expect(member.evidence.quoteSha256).toContain("quote-hash");
    }
  });

  it("is deterministic for the same records", () => {
    const records = [
      observation("substance", "paracétamol", 2),
      observation("substance", "paracétamol", 3),
    ];
    const first = cluster(records);
    const second = cluster(records);
    expect(second.confident.map((entry) => entry.candidateClusterId)).toEqual(
      first.confident.map((entry) => entry.candidateClusterId),
    );
  });
});
