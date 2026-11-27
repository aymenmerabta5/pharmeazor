import { describe, expect, it } from "bun:test";
import {
  GRAPH_ONTOLOGY_VERSION,
  GRAPH_POPULATION_MODEL_VERSION,
  graphEvidenceId,
  validateGraphPopulationApproval,
  type GraphPopulationApproval,
} from "@repo/modules/retrieval";

const CHECKSUMS = {
  linkManifestSha256: "link-manifest",
  confidentMatchesSha256: "confident-matches",
  relationshipManifestSha256: "relationship-manifest",
  relationshipCandidatesSha256: "relationship-candidates",
};

function approval(overrides: Partial<GraphPopulationApproval> = {}): GraphPopulationApproval {
  return {
    schemaVersion: 1,
    status: "approved",
    approvedBy: "Person 1",
    approvedAt: "2026-11-27T00:00:00.000Z",
    reviewReference: "review-2026-11-27",
    ontologyVersion: GRAPH_ONTOLOGY_VERSION,
    modelVersion: GRAPH_POPULATION_MODEL_VERSION,
    entityTaxonomyVersion: "entity-mention-taxonomy-v0.1",
    linkTaxonomyVersion: "entity-link-candidate-taxonomy-v0.1",
    relationshipTaxonomyVersion: "relationship-candidate-taxonomy-v0.1",
    inputChecksums: CHECKSUMS,
    approvedNodeGroups: [
      "product",
      "substance",
      "organization",
      "clinical",
      "population",
      "dose_form",
      "route",
      "therapeutic_class",
    ],
    nodeLabels: {
      product: "MedicinalProduct",
      substance: "Substance",
      organization: "Organization",
      clinical: "ClinicalConcept",
      population: "PopulationGroup",
      dose_form: "DoseForm",
      route: "RouteOfAdministration",
      therapeutic_class: "TherapeuticClass",
    },
    approvedRelationshipKinds: [
      "product_has_dose_form",
      "product_has_route",
      "product_has_authorization",
      "product_has_atc_class",
      "authorization_held_by_organization",
    ],
    relationshipMappings: {
      product_has_dose_form: { type: "HAS_DOSE_FORM", direction: "forward" },
      product_has_route: { type: "HAS_ROUTE", direction: "forward" },
      product_has_authorization: { type: "AUTHORIZES", direction: "reverse" },
      product_has_atc_class: { type: "CLASSIFIED_AS", direction: "forward" },
      authorization_held_by_organization: {
        type: "AUTHORIZATION_HOLDER",
        direction: "forward",
      },
    },
    expiresAt: "2027-11-27T00:00:00.000Z",
    ...overrides,
  };
}

function validate(value: unknown) {
  return validateGraphPopulationApproval(value, {
    inputChecksums: CHECKSUMS,
    now: new Date("2026-11-28T00:00:00.000Z"),
  });
}

describe("graph population approval gate", () => {
  it("accepts a complete approval for the exact artifacts", () => {
    const result = validate(approval());
    expect(result.approved).toBe(true);
    expect(result.approval).not.toBeNull();
    expect(result.issues).toEqual([]);
  });

  it("rejects a template or unapproved status", () => {
    const result = validate({ ...approval(), status: "template" });
    expect(result.approved).toBe(false);
    expect(result.issues.join(" ")).toContain("status must be exactly 'approved'");
  });

  it("rejects changed artifact checksums", () => {
    const result = validate({
      ...approval(),
      inputChecksums: { ...CHECKSUMS, confidentMatchesSha256: "changed" },
    });
    expect(result.approved).toBe(false);
    expect(result.issues.join(" ")).toContain("inputChecksums.confidentMatchesSha256");
  });

  it("rejects unsupported ontology labels and relationship types", () => {
    const result = validate({
      ...approval(),
      nodeLabels: { ...approval().nodeLabels, product: "BrandOnly" },
      relationshipMappings: {
        ...approval().relationshipMappings,
        product_has_dose_form: { type: "RELATED_TO", direction: "forward" },
      },
    });
    expect(result.approved).toBe(false);
    expect(result.issues.join(" ")).toContain("Unsupported Neo4j node label");
    expect(result.issues.join(" ")).toContain("Unsupported Neo4j relationship type");
  });

  it("rejects excipient groups because the ontology does not approve them as nodes", () => {
    const result = validate({
      ...approval(),
      approvedNodeGroups: [...approval().approvedNodeGroups, "excipient"],
      nodeLabels: { ...approval().nodeLabels, excipient: "Substance" },
      approvedRelationshipKinds: [...approval().approvedRelationshipKinds],
      relationshipMappings: { ...approval().relationshipMappings },
    });
    expect(result.approved).toBe(false);
    expect(result.issues.join(" ")).toContain("Excipient and food/beverage");
  });

  it("rejects an expired approval", () => {
    const result = validate({ ...approval(), expiresAt: "2026-11-01T00:00:00.000Z" });
    expect(result.approved).toBe(false);
    expect(result.issues.join(" ")).toContain("expired");
  });
});

describe("graph evidence identity", () => {
  it("is deterministic and separate for text and structured spans", () => {
    const text = graphEvidenceId({
      kind: "text_span",
      textUnitId: "unit-1",
      documentSnapshotId: "snap-1",
      artifactId: "artifact-1",
      documentId: "doc-1",
      sectionId: "sec-1",
      sectionCode: "indications",
      sectionHeading: "Indications",
      sectionPath: ["Indications"],
      offsetEncoding: "utf16-code-unit",
      localStart: 1,
      localEnd: 5,
      documentStart: 10,
      documentEnd: 14,
      quote: "test",
      quoteSha256: "quote-hash",
      rawContentSha256: "raw-hash",
    });
    const row = graphEvidenceId({
      kind: "structured_row",
      sourceId: "SANTE_MSP",
      path: "name_map.csv",
      rowNumber: 2,
      rowSha256: "row-hash",
      schemaVersion: "name_map.csv-v1",
    });
    expect(text).toStartWith("ev_");
    expect(row).toStartWith("ev_");
    expect(text).not.toBe(row);
  });
});
