import type { GraphOffsetEncoding } from "../../graph-chunk-types";
import type { LinkGroup } from "./entity-link-kinds";
import type { MentionFamily, MentionKind } from "./mention-kinds";
import type { ExtractionDiagnostic } from "./types";

export type LinkCandidateStatus = "confident" | "ambiguous";
export type LinkEndpointKind = "mention" | "observation";
export type LinkCandidateObservationState = "quarantined";
export type LinkDuplicateState = "deduplicated" | "possible_duplicate";

export interface LinkTextEvidence {
  readonly kind: "text_span";
  readonly textUnitId: string;
  readonly documentSnapshotId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly sectionHeading: string;
  readonly sectionPath: readonly string[];
  readonly offsetEncoding: GraphOffsetEncoding;
  readonly localStart: number;
  readonly localEnd: number;
  readonly documentStart: number;
  readonly documentEnd: number;
  readonly quote: string;
  readonly quoteSha256: string;
  readonly rawContentSha256: string;
}

export interface LinkStructuredEvidence {
  readonly kind: "structured_row";
  readonly sourceId: string;
  readonly path: string;
  readonly rowNumber: number;
  readonly rowSha256: string;
  readonly schemaVersion: string;
}

export interface LinkMetadataEvidence {
  readonly kind: "metadata";
  readonly sourceId: string;
  readonly artifactId: string;
  readonly field: string;
  readonly contentSha256: string;
}

export type LinkEvidence = LinkTextEvidence | LinkStructuredEvidence | LinkMetadataEvidence;

export interface LinkEndpointRef {
  readonly endpointKind: LinkEndpointKind;
  readonly endpointId: string;
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly label: string;
  readonly normalizedLabel: string;
  readonly language: string | null;
  readonly sourceId: string;
  readonly jurisdiction: string | null;
  readonly documentType: string | null;
  readonly evidence: LinkEvidence;
}

export interface LinkRecord extends LinkEndpointRef {
  readonly group: LinkGroup;
  /** Full normalized name, including strength/salt/form when present. */
  readonly exactKey: string;
  /** Conservative name key used to gather possible aliases. */
  readonly baseKey: string;
  /** Strong identity keys such as CIS, UNII, NDC, or registration number. */
  readonly identifierKeys: readonly string[];
  /** Classification keys such as ATC; never used as product identity. */
  readonly classificationKeys: readonly string[];
  /** Conflict-bearing context values, encoded as `dimension:value`. */
  readonly contextKeys: readonly string[];
  readonly rowKey: string | null;
}

export interface LinkIdentityKeyRef {
  readonly key: string;
  readonly count: number;
  readonly endpointIds: readonly string[];
}

export interface LinkContextConflict {
  readonly dimension: string;
  readonly values: readonly string[];
}

export interface CandidateEntityCluster {
  readonly candidateClusterId: string;
  readonly extractionRunId: string;
  readonly status: LinkCandidateStatus;
  readonly group: LinkGroup;
  readonly preferredLabel: string;
  readonly aliases: readonly string[];
  readonly aliasCount: number;
  readonly nameKeys: readonly string[];
  readonly identityKeys: readonly LinkIdentityKeyRef[];
  readonly contextKeys: readonly string[];
  readonly conflicts: readonly LinkContextConflict[];
  readonly memberCount: number;
  readonly membersTruncated: boolean;
  readonly members: readonly LinkEndpointRef[];
  readonly duplicateState: LinkDuplicateState;
  readonly ontologyVersion: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly observationState: LinkCandidateObservationState;
  /** Deliberately absent: canonicalEntityId / resolvedEntityId. */
}

export interface UnresolvedLinkCandidate {
  readonly unresolvedId: string;
  readonly extractionRunId: string;
  readonly group: LinkGroup;
  readonly endpoint: LinkEndpointRef;
  readonly baseKey: string;
  readonly exactKey: string;
  readonly reason: string;
  readonly identifierKeys: readonly string[];
  readonly contextKeys: readonly string[];
  readonly ontologyVersion: string;
  readonly observationState: LinkCandidateObservationState;
}

export interface LinkClusterOptions {
  readonly extractionRunId: string;
  readonly ontologyVersion: string;
  readonly maxMembers?: number;
}

export interface LinkClusterResult {
  readonly confident: readonly CandidateEntityCluster[];
  readonly ambiguous: readonly CandidateEntityCluster[];
  readonly unresolved: readonly UnresolvedLinkCandidate[];
  readonly diagnostics: readonly ExtractionDiagnostic[];
}
