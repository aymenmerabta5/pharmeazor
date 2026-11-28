import type { GraphOffsetEncoding, GraphSourceSpan } from "../../graph-chunk-types";
import type { LinkGroup } from "../extraction/entity-link-kinds";
import type { LinkContextConflict, LinkIdentityKeyRef } from "../extraction/entity-link-types";
import type {
  MetadataRecordRef,
  ObservationEvidence,
  StructuredRecordRef,
} from "../extraction/types";

/**
 * Deterministic, offline evaluation of candidate knowledge-graph artifacts.
 *
 * Nothing in this module reads files, connects to Neo4j, calls a model, or
 * mutates a candidate artifact. Callers supply already-loaded candidate
 * records and manually labelled gold annotations.
 */
export const KG_EVALUATION_VERSION = "kg-evaluation-v1" as const;
export const KG_GOLD_SCHEMA_VERSION = 1 as const;
export const KG_GOLD_PROTOCOL_VERSION = "kg-gold-v1" as const;

export type GoldAnnotationScope = "exhaustive" | "partial" | "not_annotated";
export type GoldDatasetStatus = "awaiting_manual_annotation" | "manually_labelled";
export type GoldLinkDecision = "same_entity" | "different_entity";

export interface GoldDocumentScope {
  readonly documentId: string;
  readonly documentSnapshotId: string;
  readonly artifactId: string;
  /** Exhaustive scopes allow precision; partial scopes only support recall. */
  readonly entityScope: GoldAnnotationScope;
  readonly relationshipScope: GoldAnnotationScope;
  readonly note: string | null;
}

export interface GoldStructuredRowScope {
  readonly sourceId: string;
  readonly path: string;
  readonly rowNumber: number;
  readonly entityScope: GoldAnnotationScope;
  readonly relationshipScope: GoldAnnotationScope;
  readonly note: string | null;
}

export interface GoldDatasetManifest {
  readonly schemaVersion: typeof KG_GOLD_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly protocolVersion: typeof KG_GOLD_PROTOCOL_VERSION;
  readonly status: GoldDatasetStatus;
  readonly description: string;
  readonly annotators: readonly string[];
  readonly documents: readonly GoldDocumentScope[];
  readonly structuredRows: readonly GoldStructuredRowScope[];
}

export interface GoldTextEntityRef {
  readonly kind: "text_span";
  readonly documentSnapshotId: string;
  readonly documentId: string;
  /** UTF-16 document offset into the clean Markdown body. */
  readonly documentStart: number;
  readonly documentEnd: number;
  readonly quote: string;
  readonly candidateKind: string;
}

export interface GoldStructuredRowEntityRef {
  readonly kind: "structured_row";
  readonly sourceId: string;
  readonly path: string;
  readonly rowNumber: number;
  readonly rawValue: string;
  readonly candidateKind: string;
}

export interface GoldMetadataEntityRef {
  readonly kind: "metadata";
  readonly sourceId: string;
  readonly artifactId: string;
  readonly field: string;
  readonly rawValue: string;
  readonly candidateKind: string;
}

export type GoldEntityRef = GoldTextEntityRef | GoldStructuredRowEntityRef | GoldMetadataEntityRef;

export interface GoldEntityAnnotation {
  readonly goldId: string;
  readonly entity: GoldEntityRef;
  readonly note: string | null;
}

export interface GoldRelationshipAnnotation {
  readonly goldId: string;
  readonly relationshipKind: string;
  readonly subject: GoldEntityRef;
  readonly object: GoldEntityRef;
  readonly note: string | null;
}

export interface GoldLinkAnnotation {
  readonly goldId: string;
  readonly decision: GoldLinkDecision;
  readonly group: LinkGroup;
  readonly left: GoldEntityRef;
  readonly right: GoldEntityRef;
  readonly note: string | null;
}

export interface GoldDataset {
  readonly manifest: GoldDatasetManifest;
  readonly entityMentions: readonly GoldEntityAnnotation[];
  readonly relationships: readonly GoldRelationshipAnnotation[];
  readonly entityLinks: readonly GoldLinkAnnotation[];
}

/** Compact text unit used by the evaluator; generated display text is excluded. */
export interface EvaluationTextUnit {
  readonly textUnitId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly documentSnapshotId: string;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly sectionHeading: string;
  readonly sectionPath: readonly string[];
  readonly content: string;
  readonly rawContentSha256: string;
  /** Hash of the whole clean Markdown document, not just this unit. */
  readonly documentContentSha256: string;
  readonly sourceSpan: GraphSourceSpan;
  readonly uniqueLocalSpan: GraphSourceSpan;
  readonly offsetEncoding: GraphOffsetEncoding;
}

export interface EvaluationDocumentProvenance {
  readonly artifactId: string;
  readonly documentId: string;
  readonly documentSnapshotId: string;
  readonly documentContentSha256: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly title: string;
  readonly documentType: string;
  readonly language: string;
  readonly jurisdiction: string | null;
}

export interface EvaluationTextEvidence {
  readonly kind: "text_span";
  readonly textUnitId: string;
  readonly documentSnapshotId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly sectionId: string;
  readonly sectionCode: string;
  readonly offsetEncoding: GraphOffsetEncoding;
  readonly localStart: number;
  readonly localEnd: number;
  readonly documentStart: number;
  readonly documentEnd: number;
  readonly quote: string;
  readonly quoteSha256: string;
  readonly rawContentSha256: string;
}

export type EvaluationObservationEvidence = ObservationEvidence;
export type EvaluationEntityEvidence = EvaluationTextEvidence | EvaluationObservationEvidence;

export interface EvaluationMention {
  readonly mentionId: string;
  readonly candidateKind: string;
  readonly family: string;
  readonly surfaceText: string;
  readonly normalizedSurface: string;
  readonly evidence: EvaluationTextEvidence;
  readonly document: EvaluationDocumentProvenance;
  readonly method: string;
  readonly matchQuality: string;
  readonly ontologyVersion: string;
}

export interface EvaluationObservation {
  readonly observationId: string;
  readonly candidateKind: string;
  readonly family: string;
  readonly rawValue: string;
  readonly normalizedValue: string;
  readonly evidence: EvaluationObservationEvidence;
  readonly ontologyVersion: string;
}

export interface EvaluationEndpoint {
  readonly endpointKind: "mention" | "observation";
  readonly endpointId: string;
  readonly candidateKind: string;
  readonly family: string;
  readonly label: string;
  readonly normalizedLabel: string;
  readonly evidence: EvaluationEntityEvidence;
}

export interface EvaluationTextSupport {
  readonly kind: "text_support";
  readonly scope: "clause" | "unit";
  readonly textUnitId: string;
  readonly documentSnapshotId: string;
  readonly artifactId: string;
  readonly documentId: string;
  readonly sectionId: string;
  readonly sectionCode: string;
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

export interface EvaluationStructuredSupport {
  readonly kind: "structured_row";
  readonly record: StructuredRecordRef;
  readonly subjectEndpointId: string;
  readonly objectEndpointId: string;
}

export interface EvaluationMetadataSupport {
  readonly kind: "metadata_row";
  readonly record: MetadataRecordRef;
  readonly subjectEndpointId: string;
  readonly objectEndpointId: string;
}

export type EvaluationRelationshipSupport =
  | EvaluationTextSupport
  | EvaluationStructuredSupport
  | EvaluationMetadataSupport;

export interface EvaluationRelationship {
  readonly relationshipId: string;
  readonly relationshipKind: string;
  readonly family: string;
  readonly subject: EvaluationEndpoint;
  readonly object: EvaluationEndpoint;
  readonly support: EvaluationRelationshipSupport;
  readonly method: string;
  readonly matchQuality: string;
  readonly ontologyVersion: string;
  readonly observationState: string;
}

export interface EvaluationLinkEndpoint extends EvaluationEndpoint {
  readonly sourceId: string;
  readonly jurisdiction: string | null;
  readonly documentType: string | null;
}

export interface EvaluationEntityCluster {
  readonly candidateClusterId: string;
  readonly extractionRunId: string;
  readonly status: "confident" | "ambiguous";
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
  readonly members: readonly EvaluationLinkEndpoint[];
  readonly duplicateState: "deduplicated" | "possible_duplicate";
  readonly reason: string | null;
  readonly ontologyVersion: string;
  readonly observationState: string;
}

export interface EvaluationUnresolvedLink {
  readonly unresolvedId: string;
  readonly extractionRunId: string;
  readonly group: LinkGroup;
  readonly endpoint: EvaluationLinkEndpoint;
  readonly baseKey: string;
  readonly exactKey: string;
  readonly reason: string;
  readonly identifierKeys: readonly string[];
  readonly contextKeys: readonly string[];
  readonly ontologyVersion: string;
  readonly observationState: string;
}

export interface KnowledgeGraphEvaluationInput {
  readonly textUnits: readonly EvaluationTextUnit[];
  readonly mentions: readonly EvaluationMention[];
  readonly observations: readonly EvaluationObservation[];
  readonly relationships: readonly EvaluationRelationship[];
  readonly confidentClusters: readonly EvaluationEntityCluster[];
  readonly ambiguousClusters: readonly EvaluationEntityCluster[];
  readonly unresolvedCandidates: readonly EvaluationUnresolvedLink[];
  readonly gold: GoldDataset;
  readonly artifacts: {
    readonly graphDiagnosticsByCode: Readonly<Record<string, number>>;
    readonly entityDiagnosticsByCode: Readonly<Record<string, number>>;
    readonly relationshipDiagnosticsByCode: Readonly<Record<string, number>>;
    readonly linkDiagnosticsByCode: Readonly<Record<string, number>>;
    readonly limited: boolean;
  };
}

export interface PrfCounts {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
}

export interface MacroMetrics {
  readonly kinds: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
}

export interface EntityEvaluation {
  readonly available: boolean;
  readonly reason: string | null;
  readonly goldAnnotations: number;
  readonly predictionsInPrecisionScope: number;
  readonly strict: PrfCounts;
  readonly relaxedSpan: PrfCounts & { readonly typeMismatches: number };
  readonly macro: MacroMetrics;
  readonly byKind: Readonly<Record<string, PrfCounts>>;
}

export interface RelationshipEvaluation {
  readonly available: boolean;
  readonly reason: string | null;
  readonly goldAnnotations: number;
  readonly predictionsInPrecisionScope: number;
  readonly strict: PrfCounts;
  readonly macro: MacroMetrics;
  readonly byKind: Readonly<Record<string, PrfCounts>>;
}

export interface LinkConfusion extends PrfCounts {
  readonly trueNegatives: number;
}

export interface EntityLinkEvaluation {
  readonly available: boolean;
  readonly reason: string | null;
  readonly goldPairs: number;
  readonly sameEntityPairs: number;
  readonly differentEntityPairs: number;
  readonly unresolvedGoldEndpoints: number;
  readonly confusion: LinkConfusion;
  readonly falseMerges: readonly string[];
  readonly falseSplits: readonly string[];
  readonly byGroup: Readonly<Record<string, LinkConfusion>>;
}

export type EvaluationSeverity = "error" | "warning" | "info";

export interface EvaluationDiagnostic {
  readonly code: string;
  readonly severity: EvaluationSeverity;
  readonly message: string;
  readonly count: number;
  readonly sampleIds: readonly string[];
}

export interface EvaluationCoverage {
  readonly textUnits: number;
  readonly mentions: number;
  readonly observations: number;
  readonly relationships: number;
  readonly confidentClusters: number;
  readonly ambiguousClusters: number;
  readonly unresolvedCandidates: number;
  readonly mentionQuotesValidated: number;
  readonly mentionSpansValidated: number;
  readonly observationEvidenceChecked: number;
  readonly relationshipSupportsValidated: number;
  readonly linkEndpointsChecked: number;
  readonly goldEntitiesChecked: number;
  readonly goldRelationshipsChecked: number;
  readonly goldLinkPairsChecked: number;
}

export interface EvaluationValidationSummary {
  readonly ok: boolean;
  readonly errors: number;
  readonly warnings: number;
  readonly diagnostics: readonly EvaluationDiagnostic[];
  readonly coverage: EvaluationCoverage;
}

export interface EvaluationScopeSummary {
  readonly documents: number;
  readonly exhaustiveEntityDocuments: number;
  readonly annotatedRelationshipDocuments: number;
  readonly exhaustiveRelationshipDocuments: number;
  readonly structuredRows: number;
  readonly exhaustiveEntityRows: number;
  readonly annotatedRelationshipRows: number;
  readonly exhaustiveRelationshipRows: number;
  readonly limited: boolean;
}

export interface EvaluationCounts {
  readonly textUnits: number;
  readonly mentions: number;
  readonly observations: number;
  readonly relationships: number;
  readonly confidentClusters: number;
  readonly ambiguousClusters: number;
  readonly unresolvedCandidates: number;
  readonly ambiguousByReason: Readonly<Record<string, number>>;
  readonly unresolvedByReason: Readonly<Record<string, number>>;
  readonly artifactDiagnostics: {
    readonly graph: Readonly<Record<string, number>>;
    readonly entities: Readonly<Record<string, number>>;
    readonly relationships: Readonly<Record<string, number>>;
    readonly links: Readonly<Record<string, number>>;
  };
}

export interface KnowledgeGraphEvaluationResult {
  readonly evaluationVersion: typeof KG_EVALUATION_VERSION;
  readonly status: "evaluated" | "insufficient_gold_labels" | "invalid_artifacts";
  readonly ontologyVersions: {
    readonly entity: string;
    readonly relationship: string;
    readonly link: string;
  };
  readonly scope: EvaluationScopeSummary;
  readonly validation: EvaluationValidationSummary;
  readonly metrics: {
    readonly entityMentions: EntityEvaluation;
    readonly relationships: RelationshipEvaluation;
    readonly entityLinks: EntityLinkEvaluation;
  };
  readonly counts: EvaluationCounts;
  readonly limitations: readonly string[];
}

export interface RawEvaluationIssue {
  readonly code: string;
  readonly severity: EvaluationSeverity;
  readonly message: string;
  readonly sampleId: string;
}
