import type { GraphOffsetEncoding, GraphTextUnit } from "../../graph-chunk-types";
import type { MentionFamily, MentionKind } from "./mention-kinds";

export type MentionMethod = "gazetteer" | "regex" | "cue" | "structured_field" | "metadata";
export type MatchQuality = "exact" | "normalized" | "pattern" | "cue";
export type CandidateObservationState = "quarantined";

export interface DocumentProvenance {
  readonly artifactId: string;
  readonly documentId: string;
  readonly documentSnapshotId: string;
  readonly documentContentSha256: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceUrl: string | null;
  readonly title: string;
  readonly documentType: string;
  readonly language: string;
  readonly jurisdiction: string | null;
  readonly authorityLevel: number | null;
  readonly publicationDate: string | null;
  readonly collectedAt: string | null;
}

export interface TextMentionEvidence {
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

export interface MentionCandidateRecord {
  readonly mentionId: string;
  readonly extractionRunId: string;
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly surfaceText: string;
  readonly normalizedSurface: string;
  readonly language: string;
  readonly script: string;
  readonly evidence: TextMentionEvidence;
  readonly document: DocumentProvenance;
  readonly method: MentionMethod;
  readonly matchQuality: MatchQuality;
  readonly ontologyVersion: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly observationState: CandidateObservationState;
  /** Deliberately absent: canonicalEntityId / resolvedEntityId. */
}

export interface StructuredRecordRef {
  readonly kind: "structured_record";
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly path: string;
  readonly rowNumber: number;
  readonly rowSha256: string;
  readonly schemaVersion: string;
}

export interface MetadataRecordRef {
  readonly kind: "metadata";
  readonly sourceId: string;
  readonly artifactId: string;
  readonly field: string;
  readonly contentSha256: string;
}

export type ObservationEvidence = StructuredRecordRef | MetadataRecordRef;

export interface StructuredObservationRecord {
  readonly observationId: string;
  readonly extractionRunId: string;
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly language: string | null;
  readonly rawValue: string;
  readonly normalizedValue: string;
  readonly evidence: ObservationEvidence;
  readonly ontologyVersion: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly observationState: CandidateObservationState;
}

export interface ExtractionDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly artifactId?: string;
  readonly textUnitId?: string;
  readonly sectionId?: string;
  readonly sourceSpan?: { readonly start: number; readonly end: number };
}

export interface TextExtractionInput {
  readonly unit: GraphTextUnit;
  readonly lexicon: MentionLexiconPort;
  readonly extractionRunId: string;
  readonly document: DocumentProvenance;
  readonly ontologyVersion: string;
}

export interface TextExtractionResult {
  readonly candidates: readonly MentionCandidateRecord[];
  readonly diagnostics: readonly ExtractionDiagnostic[];
}

export interface MentionLexiconMatch {
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly surfaceText: string;
  readonly normalizedSurface: string;
  readonly start: number;
  readonly end: number;
  readonly matchQuality: MatchQuality;
  readonly sourceRefs: readonly MentionLexiconSourceRef[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface MentionLexiconSourceRef {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly sourceKey: string;
}

export interface MentionLexiconPort {
  match(text: string): readonly MentionLexiconMatch[];
}

export interface MentionLexiconSeed {
  readonly surface: string;
  readonly candidateKind: MentionKind;
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}
