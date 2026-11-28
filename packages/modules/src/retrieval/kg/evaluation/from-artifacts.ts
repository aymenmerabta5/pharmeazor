import { GRAPH_OFFSET_ENCODING, type GraphTextUnit } from "../../graph-chunk-types";
import type {
  CandidateEntityCluster,
  LinkEndpointRef,
  LinkEvidence,
  LinkTextEvidence,
  RelationshipCandidateRecord,
  RelationshipEndpoint,
  RelationshipSupport,
  TextRelationshipSupport,
  UnresolvedLinkCandidate,
} from "../extraction/index";
import type {
  MentionCandidateRecord,
  StructuredObservationRecord,
  TextMentionEvidence,
} from "../extraction/types";
import type {
  EvaluationDocumentProvenance,
  EvaluationEndpoint,
  EvaluationEntityCluster,
  EvaluationEntityEvidence,
  EvaluationLinkEndpoint,
  EvaluationMention,
  EvaluationObservation,
  EvaluationObservationEvidence,
  EvaluationRelationship,
  EvaluationRelationshipSupport,
  EvaluationTextEvidence,
  EvaluationTextSupport,
  EvaluationTextUnit,
  EvaluationUnresolvedLink,
} from "./types";

/**
 * Map persisted candidate artifact records to the compact evaluation model.
 *
 * The mapping is deliberate: display text, generator metadata, and mutable
 * attributes that are irrelevant to evidence validation are not carried into
 * the evaluator. The evidence identity is preserved exactly.
 */
export function evaluationTextUnitFrom(
  unit: GraphTextUnit,
  documentContentSha256?: string,
): EvaluationTextUnit {
  return {
    textUnitId: unit.textUnitId,
    artifactId: unit.artifactId,
    documentId: unit.documentId,
    documentSnapshotId: unit.documentSnapshotId,
    sectionId: unit.sectionId,
    sectionCode: unit.sectionCode,
    sectionHeading: unit.sectionHeading,
    sectionPath: unit.sectionPath,
    content: unit.content,
    rawContentSha256: unit.rawContentSha256,
    documentContentSha256:
      documentContentSha256 ??
      (unit as GraphTextUnit & { readonly document_content_sha256?: string })
        .document_content_sha256 ??
      unit.rawContentSha256,
    sourceSpan: unit.sourceSpan,
    uniqueLocalSpan: unit.uniqueLocalSpan,
    offsetEncoding: GRAPH_OFFSET_ENCODING,
  };
}

export function evaluationMentionFrom(mention: MentionCandidateRecord): EvaluationMention {
  return {
    mentionId: mention.mentionId,
    candidateKind: mention.candidateKind,
    family: mention.family,
    surfaceText: mention.surfaceText,
    normalizedSurface: mention.normalizedSurface,
    evidence: evaluationTextEvidenceFrom(mention.evidence),
    document: evaluationDocumentFrom(mention.document),
    method: mention.method,
    matchQuality: mention.matchQuality,
    ontologyVersion: mention.ontologyVersion,
  };
}

export function evaluationObservationFrom(
  observation: StructuredObservationRecord,
): EvaluationObservation {
  return {
    observationId: observation.observationId,
    candidateKind: observation.candidateKind,
    family: observation.family,
    rawValue: observation.rawValue,
    normalizedValue: observation.normalizedValue,
    evidence: observation.evidence,
    ontologyVersion: observation.ontologyVersion,
  };
}

export function evaluationRelationshipFrom(
  relationship: RelationshipCandidateRecord,
): EvaluationRelationship {
  return {
    relationshipId: relationship.relationshipId,
    relationshipKind: relationship.relationshipKind,
    family: relationship.family,
    subject: evaluationRelationshipEndpointFrom(relationship.subject),
    object: evaluationRelationshipEndpointFrom(relationship.object),
    support: evaluationRelationshipSupportFrom(relationship.support),
    method: relationship.method,
    matchQuality: relationship.matchQuality,
    ontologyVersion: relationship.ontologyVersion,
    observationState: relationship.observationState,
  };
}

export function evaluationClusterFrom(cluster: CandidateEntityCluster): EvaluationEntityCluster {
  const reason = cluster.attributes.reason;
  return {
    candidateClusterId: cluster.candidateClusterId,
    extractionRunId: cluster.extractionRunId,
    status: cluster.status,
    group: cluster.group,
    preferredLabel: cluster.preferredLabel,
    aliases: cluster.aliases,
    aliasCount: cluster.aliasCount,
    nameKeys: cluster.nameKeys,
    identityKeys: cluster.identityKeys,
    contextKeys: cluster.contextKeys,
    conflicts: cluster.conflicts,
    memberCount: cluster.memberCount,
    membersTruncated: cluster.membersTruncated,
    members: cluster.members.map(evaluationLinkEndpointFrom),
    duplicateState: cluster.duplicateState,
    reason: typeof reason === "string" ? reason : null,
    ontologyVersion: cluster.ontologyVersion,
    observationState: cluster.observationState,
  };
}

export function evaluationUnresolvedFrom(
  candidate: UnresolvedLinkCandidate,
): EvaluationUnresolvedLink {
  return {
    unresolvedId: candidate.unresolvedId,
    extractionRunId: candidate.extractionRunId,
    group: candidate.group,
    endpoint: evaluationLinkEndpointFrom(candidate.endpoint),
    baseKey: candidate.baseKey,
    exactKey: candidate.exactKey,
    reason: candidate.reason,
    identifierKeys: candidate.identifierKeys,
    contextKeys: candidate.contextKeys,
    ontologyVersion: candidate.ontologyVersion,
    observationState: candidate.observationState,
  };
}

export function evaluationTextEvidenceFrom(
  evidence: TextMentionEvidence | LinkTextEvidence | TextRelationshipSupport,
): EvaluationTextEvidence {
  return {
    kind: "text_span",
    textUnitId: evidence.textUnitId,
    documentSnapshotId: evidence.documentSnapshotId,
    artifactId: evidence.artifactId,
    documentId: evidence.documentId,
    sectionId: evidence.sectionId,
    sectionCode: evidence.sectionCode,
    offsetEncoding: evidence.offsetEncoding,
    localStart: "localStart" in evidence ? evidence.localStart : evidence.start,
    localEnd: "localEnd" in evidence ? evidence.localEnd : evidence.end,
    documentStart: evidence.documentStart,
    documentEnd: evidence.documentEnd,
    quote: evidence.quote,
    quoteSha256: evidence.quoteSha256,
    rawContentSha256: evidence.rawContentSha256,
  };
}

function evaluationDocumentFrom(
  document: MentionCandidateRecord["document"],
): EvaluationDocumentProvenance {
  return {
    artifactId: document.artifactId,
    documentId: document.documentId,
    documentSnapshotId: document.documentSnapshotId,
    documentContentSha256: document.documentContentSha256,
    sourceId: document.sourceId,
    sourceName: document.sourceName,
    title: document.title,
    documentType: document.documentType,
    language: document.language,
    jurisdiction: document.jurisdiction,
  };
}

function evaluationRelationshipEndpointFrom(endpoint: RelationshipEndpoint): EvaluationEndpoint {
  if (endpoint.endpointKind === "mention") {
    return {
      endpointKind: "mention",
      endpointId: endpoint.endpointId,
      candidateKind: endpoint.candidateKind,
      family: endpoint.family,
      label: endpoint.surfaceText,
      normalizedLabel: endpoint.normalizedSurface,
      evidence: evaluationTextEvidenceFrom(endpoint.evidence),
    };
  }
  return {
    endpointKind: "observation",
    endpointId: endpoint.endpointId,
    candidateKind: endpoint.candidateKind,
    family: endpoint.family,
    label: endpoint.rawValue,
    normalizedLabel: endpoint.normalizedValue,
    evidence: endpoint.evidence,
  };
}

function evaluationRelationshipSupportFrom(
  support: RelationshipSupport,
): EvaluationRelationshipSupport {
  if (support.kind === "text_support") {
    return {
      kind: "text_support",
      scope: support.scope,
      textUnitId: support.textUnitId,
      documentSnapshotId: support.documentSnapshotId,
      artifactId: support.artifactId,
      documentId: support.documentId,
      sectionId: support.sectionId,
      sectionCode: support.sectionCode,
      offsetEncoding: support.offsetEncoding,
      start: support.start,
      end: support.end,
      documentStart: support.documentStart,
      documentEnd: support.documentEnd,
      quote: support.quote,
      quoteSha256: support.quoteSha256,
      rawContentSha256: support.rawContentSha256,
      subjectEndpointId: support.subjectEndpointId,
      objectEndpointId: support.objectEndpointId,
    } satisfies EvaluationTextSupport;
  }
  if (support.kind === "structured_row") {
    return {
      kind: "structured_row",
      record: support.record,
      subjectEndpointId: support.subjectEndpointId,
      objectEndpointId: support.objectEndpointId,
    };
  }
  return {
    kind: "metadata_row",
    record: support.record,
    subjectEndpointId: support.subjectEndpointId,
    objectEndpointId: support.objectEndpointId,
  };
}

function evaluationLinkEndpointFrom(endpoint: LinkEndpointRef): EvaluationLinkEndpoint {
  return {
    endpointKind: endpoint.endpointKind,
    endpointId: endpoint.endpointId,
    candidateKind: endpoint.candidateKind,
    family: endpoint.family,
    label: endpoint.label,
    normalizedLabel: endpoint.normalizedLabel,
    evidence: evaluationLinkEvidenceFrom(endpoint.evidence),
    sourceId: endpoint.sourceId,
    jurisdiction: endpoint.jurisdiction,
    documentType: endpoint.documentType,
  };
}

function evaluationLinkEvidenceFrom(evidence: LinkEvidence): EvaluationEntityEvidence {
  if (evidence.kind === "text_span") {
    return evaluationTextEvidenceFrom(evidence);
  }
  if (evidence.kind === "structured_row") {
    return {
      kind: "structured_record",
      sourceId: evidence.sourceId,
      sourceKind: "structured_row",
      path: evidence.path,
      rowNumber: evidence.rowNumber,
      rowSha256: evidence.rowSha256,
      schemaVersion: evidence.schemaVersion,
    } satisfies EvaluationObservationEvidence;
  }
  return {
    kind: "metadata",
    sourceId: evidence.sourceId,
    artifactId: evidence.artifactId,
    field: evidence.field,
    contentSha256: evidence.contentSha256,
  };
}
