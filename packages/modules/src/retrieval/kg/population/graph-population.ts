import { createHash } from "node:crypto";
import {
  ENTITY_LINK_TAXONOMY_VERSION,
  ENTITY_MENTION_TAXONOMY_VERSION,
  RELATIONSHIP_KINDS,
  RELATIONSHIP_TAXONOMY_VERSION,
  type LinkEvidence,
  type LinkGroup,
  type RelationshipSupport,
} from "../extraction/index";

/**
 * Temporary graph-population model.
 *
 * The ontology and all upstream candidate taxonomies are still unapproved.
 * This module defines the approval contract and plan records only; it never
 * creates canonical entities or writes a graph.
 */
export const GRAPH_POPULATION_MODEL_VERSION = "graph-population-v0.1" as const;
export const GRAPH_POPULATION_APPROVAL_SCHEMA_VERSION = 1 as const;
export const GRAPH_ONTOLOGY_VERSION = "0.1" as const;
export const GRAPH_ENTITY_LABEL = "GraphEntity" as const;

export const GRAPH_POPULATION_NODE_LABELS = [
  "MedicinalProduct",
  "Substance",
  "Organization",
  "ClinicalConcept",
  "PopulationGroup",
  "DoseForm",
  "RouteOfAdministration",
  "TherapeuticClass",
] as const;

export type GraphPopulationNodeLabel = (typeof GRAPH_POPULATION_NODE_LABELS)[number];

/**
 * Only binary ontology relationships whose domain and range can be supported
 * directly by the current link/relationship candidates are eligible.
 * Composition and clinical statements still require assertion/composition
 * nodes and remain out of scope.
 */
export const GRAPH_POPULATION_RELATIONSHIP_TYPES = [
  "HAS_DOSE_FORM",
  "HAS_ROUTE",
  "CLASSIFIED_AS",
  "AUTHORIZES",
  "AUTHORIZATION_HOLDER",
  "ISSUED_BY",
  "MANUFACTURER_OF",
  "PUBLISHED_BY",
  "HAS_PACKAGE",
  "HAS_TERM",
  "DUPLICATE_OF",
] as const;

export type GraphPopulationRelationshipType = (typeof GRAPH_POPULATION_RELATIONSHIP_TYPES)[number];

export type GraphPopulationDirection = "forward" | "reverse";

export interface GraphPopulationApprovalInputChecksums {
  readonly linkManifestSha256: string;
  readonly confidentMatchesSha256: string;
  readonly relationshipManifestSha256: string;
  readonly relationshipCandidatesSha256: string;
}

export interface GraphPopulationApproval {
  readonly schemaVersion: 1;
  readonly status: "approved";
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly reviewReference: string;
  readonly ontologyVersion: string;
  readonly modelVersion: string;
  readonly entityTaxonomyVersion: string;
  readonly linkTaxonomyVersion: string;
  readonly relationshipTaxonomyVersion: string;
  readonly inputChecksums: GraphPopulationApprovalInputChecksums;
  readonly approvedNodeGroups: readonly LinkGroup[];
  readonly nodeLabels: Readonly<Record<string, GraphPopulationNodeLabel>>;
  readonly approvedRelationshipKinds: readonly string[];
  readonly relationshipMappings: Readonly<
    Record<
      string,
      {
        readonly type: GraphPopulationRelationshipType;
        readonly direction: GraphPopulationDirection;
      }
    >
  >;
  readonly expiresAt?: string;
}

export interface GraphApprovalExpectation {
  readonly inputChecksums: GraphPopulationApprovalInputChecksums;
  readonly ontologyVersion?: string;
  readonly modelVersion?: string;
  readonly entityTaxonomyVersion?: string;
  readonly linkTaxonomyVersion?: string;
  readonly relationshipTaxonomyVersion?: string;
  readonly now?: Date;
}

export interface GraphApprovalValidation {
  readonly approved: boolean;
  readonly approval: GraphPopulationApproval | null;
  readonly issues: readonly string[];
}

export interface GraphEntityMemberPlan {
  readonly endpointKind: "mention" | "observation";
  readonly endpointId: string;
  readonly candidateKind: string;
  readonly label: string;
  readonly normalizedLabel: string;
  readonly sourceId: string;
  readonly jurisdiction: string | null;
  readonly documentType: string | null;
  readonly evidence: LinkEvidence;
}

export interface GraphEntityPlan {
  readonly candidateClusterId: string;
  readonly group: LinkGroup;
  readonly label: string;
  readonly labels: readonly string[];
  readonly aliases: readonly string[];
  readonly aliasCount: number;
  readonly identityKeys: readonly string[];
  readonly contextKeys: readonly string[];
  readonly memberCount: number;
  readonly members: readonly GraphEntityMemberPlan[];
  readonly ontologyVersion: string;
  readonly reviewState: "approved_candidate";
  readonly observationState: "quarantined";
}

export interface GraphRelationshipPlan {
  readonly relationshipId: string;
  readonly relationshipKind: string;
  readonly neo4jType: GraphPopulationRelationshipType;
  readonly direction: GraphPopulationDirection;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly support: RelationshipSupport;
  readonly supportSourceId: string;
  readonly ontologyVersion: string;
  readonly reviewState: "approved_candidate";
  readonly observationState: "quarantined";
}

const NODE_LABELS = new Set<string>(GRAPH_POPULATION_NODE_LABELS);
const RELATIONSHIP_TYPES = new Set<string>(GRAPH_POPULATION_RELATIONSHIP_TYPES);
const RELATIONSHIP_KIND_SET = new Set<string>(RELATIONSHIP_KINDS);
const LINK_GROUPS: readonly LinkGroup[] = [
  "product",
  "substance",
  "excipient",
  "organization",
  "clinical",
  "food_or_beverage",
  "population",
  "dose_form",
  "route",
  "therapeutic_class",
];
const LINK_GROUP_SET = new Set<string>(LINK_GROUPS);
const DIRECTIONS = new Set<GraphPopulationDirection>(["forward", "reverse"]);

/**
 * Validate an approval file against the exact upstream artifacts.
 *
 * The function is deliberately fail-closed: any missing reviewer identity,
 * version mismatch, changed checksum, unknown label/type, or expired approval
 * blocks publication.
 */
export function validateGraphPopulationApproval(
  value: unknown,
  expected: GraphApprovalExpectation,
): GraphApprovalValidation {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return { approved: false, approval: null, issues: ["Approval document is not an object"] };
  }
  if (value.schemaVersion !== GRAPH_POPULATION_APPROVAL_SCHEMA_VERSION) {
    issues.push(`Approval schemaVersion must be ${GRAPH_POPULATION_APPROVAL_SCHEMA_VERSION}`);
  }
  if (value.status !== "approved") {
    issues.push("Approval status must be exactly 'approved'");
  }
  requiredText(value.approvedBy, "approvedBy", issues);
  requiredText(value.reviewReference, "reviewReference", issues);
  const approvedAt = requiredText(value.approvedAt, "approvedAt", issues);
  if (approvedAt && Number.isNaN(Date.parse(approvedAt))) {
    issues.push("approvedAt must be an ISO date");
  }
  if (expected.now && approvedAt && Date.parse(approvedAt) > expected.now.getTime()) {
    issues.push("approvedAt is in the future");
  }
  if (value.ontologyVersion !== (expected.ontologyVersion ?? GRAPH_ONTOLOGY_VERSION)) {
    issues.push("ontologyVersion does not match the approved ontology");
  }
  if (value.modelVersion !== (expected.modelVersion ?? GRAPH_POPULATION_MODEL_VERSION)) {
    issues.push("modelVersion does not match the population model");
  }
  if (
    value.entityTaxonomyVersion !==
    (expected.entityTaxonomyVersion ?? ENTITY_MENTION_TAXONOMY_VERSION)
  ) {
    issues.push("entityTaxonomyVersion does not match the entity taxonomy");
  }
  if (
    value.linkTaxonomyVersion !== (expected.linkTaxonomyVersion ?? ENTITY_LINK_TAXONOMY_VERSION)
  ) {
    issues.push("linkTaxonomyVersion does not match the link taxonomy");
  }
  if (
    value.relationshipTaxonomyVersion !==
    (expected.relationshipTaxonomyVersion ?? RELATIONSHIP_TAXONOMY_VERSION)
  ) {
    issues.push("relationshipTaxonomyVersion does not match the relationship taxonomy");
  }
  if (!isRecord(value.inputChecksums)) {
    issues.push("inputChecksums must be an object");
  } else {
    for (const [key, expectedValue] of Object.entries(expected.inputChecksums)) {
      if (value.inputChecksums[key] !== expectedValue) {
        issues.push(`inputChecksums.${key} does not match the artifact`);
      }
    }
  }
  if (typeof value.expiresAt === "string" && !Number.isNaN(Date.parse(value.expiresAt))) {
    if (Date.parse(value.expiresAt) <= (expected.now ?? new Date()).getTime()) {
      issues.push("Approval has expired");
    }
  } else if (value.expiresAt !== undefined) {
    issues.push("expiresAt must be an ISO date when present");
  }

  const approvedNodeGroups = Array.isArray(value.approvedNodeGroups)
    ? value.approvedNodeGroups.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (approvedNodeGroups.length === 0) issues.push("approvedNodeGroups must not be empty");
  for (const group of approvedNodeGroups) {
    if (!LINK_GROUP_SET.has(group)) issues.push(`Unknown link group in approval: ${group}`);
  }
  if (!isRecord(value.nodeLabels)) {
    issues.push("nodeLabels must be an object");
  } else {
    for (const [group, label] of Object.entries(value.nodeLabels)) {
      if (!LINK_GROUP_SET.has(group)) issues.push(`Unknown node-label group: ${group}`);
      if (typeof label !== "string" || !NODE_LABELS.has(label)) {
        issues.push(`Unsupported Neo4j node label for ${group}: ${String(label)}`);
      }
    }
    const labelKeys = Object.keys(value.nodeLabels).sort();
    if (labelKeys.join("|") !== [...approvedNodeGroups].sort().join("|")) {
      issues.push("nodeLabels must cover exactly the approved node groups");
    }
  }
  if (approvedNodeGroups.includes("excipient") || approvedNodeGroups.includes("food_or_beverage")) {
    issues.push("Excipient and food/beverage groups are not approved ontology node labels");
  }

  const approvedRelationshipKinds = Array.isArray(value.approvedRelationshipKinds)
    ? value.approvedRelationshipKinds.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (approvedRelationshipKinds.length === 0) {
    issues.push("approvedRelationshipKinds must not be empty");
  }
  for (const kind of approvedRelationshipKinds) {
    if (!RELATIONSHIP_KIND_SET.has(kind)) {
      issues.push(`Unknown relationship kind in approval: ${kind}`);
    }
  }
  if (!isRecord(value.relationshipMappings)) {
    issues.push("relationshipMappings must be an object");
  } else {
    for (const [kind, mapping] of Object.entries(value.relationshipMappings)) {
      if (!RELATIONSHIP_KIND_SET.has(kind)) {
        issues.push(`Unknown relationship mapping: ${kind}`);
      }
      if (!isRecord(mapping)) {
        issues.push(`Relationship mapping ${kind} must be an object`);
        continue;
      }
      if (typeof mapping.type !== "string" || !RELATIONSHIP_TYPES.has(mapping.type)) {
        issues.push(`Unsupported Neo4j relationship type for ${kind}: ${String(mapping.type)}`);
      }
      if (mapping.direction !== "forward" && mapping.direction !== "reverse") {
        issues.push(`Unsupported direction for ${kind}: ${String(mapping.direction)}`);
      } else if (!DIRECTIONS.has(mapping.direction)) {
        issues.push(`Unsupported direction for ${kind}`);
      }
    }
    const mappingKeys = Object.keys(value.relationshipMappings).sort();
    if (mappingKeys.join("|") !== [...approvedRelationshipKinds].sort().join("|")) {
      issues.push("relationshipMappings must cover exactly the approved relationship kinds");
    }
  }

  if (issues.length > 0) return { approved: false, approval: null, issues };
  return {
    approved: true,
    approval: value as unknown as GraphPopulationApproval,
    issues: [],
  };
}

export function graphEntityLabels(group: LinkGroup, approval: GraphPopulationApproval): string[] {
  const specific = approval.nodeLabels[group];
  return specific ? [GRAPH_ENTITY_LABEL, specific] : [GRAPH_ENTITY_LABEL];
}

export function relationshipMapping(
  kind: string,
  approval: GraphPopulationApproval,
): {
  readonly type: GraphPopulationRelationshipType;
  readonly direction: GraphPopulationDirection;
} | null {
  return approval.relationshipMappings[kind] ?? null;
}

export function graphEvidenceId(evidence: LinkEvidence): string {
  return `ev_${createHash("sha256")
    .update(
      [
        evidence.kind,
        evidence.kind === "text_span"
          ? [
              evidence.textUnitId,
              String(evidence.localStart),
              String(evidence.localEnd),
              evidence.quoteSha256,
            ].join(":")
          : evidence.kind === "structured_row"
            ? [
                evidence.sourceId,
                evidence.path,
                String(evidence.rowNumber),
                evidence.rowSha256,
              ].join(":")
            : [evidence.sourceId, evidence.artifactId, evidence.field, evidence.contentSha256].join(
                ":",
              ),
      ].join("|"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32)}`;
}

function requiredText(value: unknown, name: string, issues: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${name} must be a non-empty string`);
    return "";
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
