import type { GraphOffsetEncoding, GraphTextUnit } from "../../graph-chunk-types";
import type { MentionFamily, MentionKind } from "./mention-kinds";
import type { RelationshipFamily } from "./relationship-kinds";
import type {
  DocumentProvenance,
  ExtractionDiagnostic,
  MentionCandidateRecord,
  MetadataRecordRef,
  ObservationEvidence,
  StructuredObservationRecord,
  StructuredRecordRef,
  TextMentionEvidence,
} from "./types";

export type RelationshipMethod = "structured_row" | "section_clause" | "section_unit";
export type RelationshipObservationState = "quarantined";
export type RelationshipMatchQuality = "explicit_column" | "section_clause" | "section_unit";

export interface MentionRelationshipEndpoint {
  readonly endpointKind: "mention";
  readonly endpointId: string;
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly surfaceText: string;
  readonly normalizedSurface: string;
  readonly evidence: TextMentionEvidence;
  readonly document: DocumentProvenance;
}

export interface ObservationRelationshipEndpoint {
  readonly endpointKind: "observation";
  readonly endpointId: string;
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly rawValue: string;
  readonly normalizedValue: string;
  readonly evidence: ObservationEvidence;
}

export type RelationshipEndpoint = MentionRelationshipEndpoint | ObservationRelationshipEndpoint;

export interface TextRelationshipSupport {
  readonly kind: "text_support";
  readonly scope: "clause" | "unit";
  readonly textUnitId: string;
  readonly documentSnapshotId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly sectionHeading: string;
  readonly sectionPath: readonly string[];
  readonly offsetEncoding: GraphOffsetEncoding;
  readonly start: number;
  readonly end: number;
  readonly documentStart: number;
  readonly documentEnd: number;
  readonly quote: string;
  readonly quoteSha256: string;
  readonly rawContentSha256: string;
  readonly subjectEndpointId: string;
  readonly objectEndpointId: string;
}

export interface StructuredRelationshipSupport {
  readonly kind: "structured_row";
  readonly record: StructuredRecordRef;
  readonly subjectEndpointId: string;
  readonly objectEndpointId: string;
}

export interface MetadataRelationshipSupport {
  readonly kind: "metadata_row";
  readonly record: MetadataRecordRef;
  readonly subjectEndpointId: string;
  readonly objectEndpointId: string;
}

export type RelationshipSupport =
  | TextRelationshipSupport
  | StructuredRelationshipSupport
  | MetadataRelationshipSupport;

export interface RelationshipCandidateRecord {
  readonly relationshipId: string;
  readonly extractionRunId: string;
  readonly relationshipKind: string;
  readonly family: RelationshipFamily;
  readonly subject: RelationshipEndpoint;
  readonly object: RelationshipEndpoint;
  readonly support: RelationshipSupport;
  readonly method: RelationshipMethod;
  readonly matchQuality: RelationshipMatchQuality;
  readonly ontologyVersion: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly observationState: RelationshipObservationState;
  /** Deliberately absent: canonical ids, relationship truth, or confidence. */
}

export interface TextRelationshipInput {
  readonly unit: GraphTextUnit;
  readonly mentions: readonly MentionCandidateRecord[];
  readonly extractionRunId: string;
  readonly ontologyVersion: string;
}

export interface TextRelationshipResult {
  readonly relationships: readonly RelationshipCandidateRecord[];
  readonly diagnostics: readonly ExtractionDiagnostic[];
}

export interface StructuredRelationshipInput {
  readonly observations: readonly StructuredObservationRecord[];
  readonly extractionRunId: string;
  readonly ontologyVersion: string;
}

export interface StructuredRelationshipResult {
  readonly relationships: readonly RelationshipCandidateRecord[];
  readonly diagnostics: readonly ExtractionDiagnostic[];
}
