import { createHash } from "node:crypto";
import { GRAPH_OFFSET_ENCODING } from "../../graph-chunk-types";
import type {
  EvaluationDocumentProvenance,
  EvaluationEndpoint,
  EvaluationEntityEvidence,
  EvaluationLinkEndpoint,
  EvaluationMention,
  EvaluationObservation,
  EvaluationObservationEvidence,
  EvaluationTextEvidence,
  EvaluationTextUnit,
  GoldEntityRef,
  RawEvaluationIssue,
} from "./types";

const SHA256_HEX = /^[a-f0-9]{64}$/u;

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX.test(value);
}

export function textSpanIdentity(
  documentSnapshotId: string,
  documentStart: number,
  documentEnd: number,
  candidateKind: string,
): string {
  return ["t", documentSnapshotId, String(documentStart), String(documentEnd), candidateKind].join(
    "|",
  );
}

export function textSpanOnlyIdentity(
  documentSnapshotId: string,
  documentStart: number,
  documentEnd: number,
): string {
  return ["t", documentSnapshotId, String(documentStart), String(documentEnd)].join("|");
}

export function observationEvidenceIdentity(evidence: EvaluationObservationEvidence): string {
  return evidence.kind === "structured_record"
    ? [
        "structured",
        evidence.sourceId,
        evidence.path,
        String(evidence.rowNumber),
        evidence.rowSha256,
      ].join("|")
    : [
        "metadata",
        evidence.sourceId,
        evidence.artifactId,
        evidence.field,
        evidence.contentSha256,
      ].join("|");
}

export function observationScopeKey(evidence: EvaluationObservationEvidence): string {
  return evidence.kind === "structured_record"
    ? ["structured", evidence.sourceId, evidence.path, String(evidence.rowNumber)].join("|")
    : ["metadata", evidence.sourceId, evidence.artifactId, evidence.field].join("|");
}

export function observationIdentity(observation: EvaluationObservation): string {
  return [
    "o",
    observationEvidenceIdentity(observation.evidence),
    observation.candidateKind,
    observation.rawValue,
  ].join("|");
}

/** Span/value identity that deliberately ignores the candidate kind. */
export function observationRelaxedKey(observation: EvaluationObservation): string {
  return observation.evidence.kind === "structured_record"
    ? [
        "s",
        observation.evidence.sourceId,
        observation.evidence.path,
        String(observation.evidence.rowNumber),
        observation.rawValue,
      ].join("|")
    : [
        "m",
        observation.evidence.sourceId,
        observation.evidence.artifactId,
        observation.evidence.field,
        observation.rawValue,
      ].join("|");
}

export function mentionSpanIdentity(mention: EvaluationMention): string {
  return textSpanOnlyIdentity(
    mention.evidence.documentSnapshotId,
    mention.evidence.documentStart,
    mention.evidence.documentEnd,
  );
}

export function mentionKindIdentity(mention: EvaluationMention): string {
  return textSpanIdentity(
    mention.evidence.documentSnapshotId,
    mention.evidence.documentStart,
    mention.evidence.documentEnd,
    mention.candidateKind,
  );
}

export function endpointIdentity(endpoint: EvaluationEndpoint | EvaluationLinkEndpoint): string {
  if (endpoint.evidence.kind === "text_span") {
    return textSpanIdentity(
      endpoint.evidence.documentSnapshotId,
      endpoint.evidence.documentStart,
      endpoint.evidence.documentEnd,
      endpoint.candidateKind,
    );
  }
  return observationRefIdentity(endpoint.evidence, endpoint.candidateKind, endpoint.label);
}

export function goldRefIdentity(ref: GoldEntityRef): string {
  switch (ref.kind) {
    case "text_span":
      return textSpanIdentity(
        ref.documentSnapshotId,
        ref.documentStart,
        ref.documentEnd,
        ref.candidateKind,
      );
    case "structured_row":
      return [
        "s",
        ref.sourceId,
        ref.path,
        String(ref.rowNumber),
        ref.candidateKind,
        ref.rawValue,
      ].join("|");
    case "metadata":
      return ["m", ref.sourceId, ref.artifactId, ref.field, ref.candidateKind, ref.rawValue].join(
        "|",
      );
  }
}

function observationRefIdentity(
  evidence: EvaluationObservationEvidence,
  candidateKind: string,
  rawValue: string,
): string {
  if (evidence.kind === "structured_record") {
    return [
      "s",
      evidence.sourceId,
      evidence.path,
      String(evidence.rowNumber),
      candidateKind,
      rawValue,
    ].join("|");
  }
  return [
    "m",
    evidence.sourceId,
    evidence.artifactId,
    evidence.field,
    candidateKind,
    rawValue,
  ].join("|");
}

/** Match identity used by gold annotations; row hashes stay validation-only. */
export function observationMatchIdentity(
  evidence: EvaluationObservationEvidence,
  candidateKind: string,
  rawValue: string,
): string {
  return observationRefIdentity(evidence, candidateKind, rawValue);
}

export function validateUnit(unit: EvaluationTextUnit): RawEvaluationIssue[] {
  const issues: RawEvaluationIssue[] = [];
  if (unit.offsetEncoding !== GRAPH_OFFSET_ENCODING) {
    issues.push({
      code: "text_unit_offset_encoding_invalid",
      severity: "error",
      message: `Text unit ${unit.textUnitId} declares an unsupported offset encoding`,
      sampleId: unit.textUnitId,
    });
  }
  if (sha256(unit.content) !== unit.rawContentSha256) {
    issues.push({
      code: "text_unit_content_hash_mismatch",
      severity: "error",
      message: `Text unit ${unit.textUnitId} content does not match its raw content hash`,
      sampleId: unit.textUnitId,
    });
  }
  if (
    unit.sourceSpan.start < 0 ||
    unit.sourceSpan.end < unit.sourceSpan.start ||
    unit.uniqueLocalSpan.start < 0 ||
    unit.uniqueLocalSpan.end < unit.uniqueLocalSpan.start
  ) {
    issues.push({
      code: "text_unit_source_span_invalid",
      severity: "error",
      message: `Text unit ${unit.textUnitId} has an invalid source span`,
      sampleId: unit.textUnitId,
    });
  }
  return issues;
}

export function validateTextEvidence(
  evidence: EvaluationTextEvidence,
  unit: EvaluationTextUnit | undefined,
  ownerId: string,
): RawEvaluationIssue[] {
  const issues: RawEvaluationIssue[] = [];
  if (!unit) {
    issues.push({
      code: "text_unit_missing",
      severity: "error",
      message: `Evidence for ${ownerId} references an unknown text unit ${evidence.textUnitId}`,
      sampleId: ownerId,
    });
    return issues;
  }
  const mismatch =
    evidence.documentSnapshotId !== unit.documentSnapshotId ||
    evidence.artifactId !== unit.artifactId ||
    evidence.documentId !== unit.documentId ||
    evidence.sectionId !== unit.sectionId ||
    evidence.sectionCode !== unit.sectionCode ||
    evidence.offsetEncoding !== unit.offsetEncoding;
  if (mismatch) {
    issues.push({
      code: "text_evidence_scope_mismatch",
      severity: "error",
      message: `Evidence for ${ownerId} does not match the identity of text unit ${unit.textUnitId}`,
      sampleId: ownerId,
    });
  }
  const { localStart, localEnd, documentStart, documentEnd } = evidence;
  const integers = [localStart, localEnd, documentStart, documentEnd].every((value) =>
    Number.isInteger(value),
  );
  const boundsValid =
    integers &&
    localStart >= 0 &&
    localEnd > localStart &&
    localEnd <= unit.content.length &&
    localStart >= unit.uniqueLocalSpan.start &&
    localEnd <= unit.uniqueLocalSpan.end;
  if (!boundsValid) {
    issues.push({
      code: "text_evidence_bounds_invalid",
      severity: "error",
      message: `Evidence for ${ownerId} falls outside the unique raw span of ${unit.textUnitId}`,
      sampleId: ownerId,
    });
    return issues;
  }
  if (
    splitsSurrogatePair(unit.content, localStart) ||
    splitsSurrogatePair(unit.content, localEnd)
  ) {
    issues.push({
      code: "text_evidence_surrogate_split",
      severity: "error",
      message: `Evidence for ${ownerId} splits a UTF-16 surrogate pair`,
      sampleId: ownerId,
    });
  }
  if (
    documentStart !== unit.sourceSpan.start + localStart ||
    documentEnd !== unit.sourceSpan.start + localEnd
  ) {
    issues.push({
      code: "text_evidence_document_offset_mismatch",
      severity: "error",
      message: `Evidence for ${ownerId} has document offsets that do not match text unit ${unit.textUnitId}`,
      sampleId: ownerId,
    });
  }
  const quote = unit.content.slice(localStart, localEnd);
  if (quote !== evidence.quote) {
    issues.push({
      code: "text_evidence_quote_mismatch",
      severity: "error",
      message: `Evidence for ${ownerId} does not quote the raw content at its span`,
      sampleId: ownerId,
    });
  }
  if (sha256(evidence.quote) !== evidence.quoteSha256) {
    issues.push({
      code: "text_evidence_quote_hash_mismatch",
      severity: "error",
      message: `Evidence for ${ownerId} has a quote hash that does not match the quote`,
      sampleId: ownerId,
    });
  }
  if (evidence.rawContentSha256 !== unit.rawContentSha256) {
    issues.push({
      code: "text_evidence_raw_hash_mismatch",
      severity: "error",
      message: `Evidence for ${ownerId} does not carry the raw content hash of ${unit.textUnitId}`,
      sampleId: ownerId,
    });
  }
  return issues;
}

export function validateDocumentProvenance(
  document: EvaluationDocumentProvenance,
  unit: EvaluationTextUnit,
  ownerId: string,
): RawEvaluationIssue[] {
  const issues: RawEvaluationIssue[] = [];
  if (
    document.artifactId !== unit.artifactId ||
    document.documentId !== unit.documentId ||
    document.documentSnapshotId !== unit.documentSnapshotId
  ) {
    issues.push({
      code: "document_provenance_scope_mismatch",
      severity: "error",
      message: `Document provenance for ${ownerId} does not match text unit ${unit.textUnitId}`,
      sampleId: ownerId,
    });
  }
  if (document.documentContentSha256 !== unit.documentContentSha256) {
    issues.push({
      code: "document_provenance_hash_mismatch",
      severity: "error",
      message: `Document provenance for ${ownerId} does not carry the document content hash`,
      sampleId: ownerId,
    });
  }
  for (const [field, value] of [
    ["sourceId", document.sourceId],
    ["sourceName", document.sourceName],
    ["title", document.title],
    ["documentType", document.documentType],
    ["language", document.language],
  ] as const) {
    if (!value.trim()) {
      issues.push({
        code: "document_provenance_field_missing",
        severity: "error",
        message: `Document provenance for ${ownerId} is missing ${field}`,
        sampleId: ownerId,
      });
    }
  }
  return issues;
}

export function validateObservationEvidence(
  evidence: EvaluationObservationEvidence,
  ownerId: string,
): RawEvaluationIssue[] {
  const issues: RawEvaluationIssue[] = [];
  if (evidence.kind === "structured_record") {
    if (!evidence.sourceId.trim() || !evidence.path.trim() || !evidence.schemaVersion.trim()) {
      issues.push({
        code: "observation_evidence_field_missing",
        severity: "error",
        message: `Structured evidence for ${ownerId} is missing a source, path, or schema version`,
        sampleId: ownerId,
      });
    }
    if (!Number.isInteger(evidence.rowNumber) || evidence.rowNumber < 2) {
      issues.push({
        code: "observation_row_number_invalid",
        severity: "error",
        message: `Structured evidence for ${ownerId} has an invalid row number`,
        sampleId: ownerId,
      });
    }
    if (!isSha256Hex(evidence.rowSha256)) {
      issues.push({
        code: "observation_row_hash_invalid",
        severity: "error",
        message: `Structured evidence for ${ownerId} has an invalid row hash`,
        sampleId: ownerId,
      });
    }
    return issues;
  }
  if (!evidence.sourceId.trim() || !evidence.artifactId.trim() || !evidence.field.trim()) {
    issues.push({
      code: "observation_evidence_field_missing",
      severity: "error",
      message: `Metadata evidence for ${ownerId} is missing a source, artifact, or field`,
      sampleId: ownerId,
    });
  }
  if (!evidence.contentSha256.trim()) {
    issues.push({
      code: "observation_metadata_hash_missing",
      severity: "warning",
      message: `Metadata evidence for ${ownerId} has no content hash`,
      sampleId: ownerId,
    });
  } else if (!isSha256Hex(evidence.contentSha256)) {
    issues.push({
      code: "observation_metadata_hash_invalid",
      severity: "error",
      message: `Metadata evidence for ${ownerId} has an invalid content hash`,
      sampleId: ownerId,
    });
  }
  return issues;
}

export function validateEndpointEvidence(
  endpoint: EvaluationEndpoint | EvaluationLinkEndpoint,
  unit: EvaluationTextUnit | undefined,
  ownerId: string,
): RawEvaluationIssue[] {
  if (endpoint.evidence.kind === "text_span") {
    return validateTextEvidence(endpoint.evidence, unit, ownerId);
  }
  return validateObservationEvidence(endpoint.evidence, ownerId);
}

export function evidenceIsText(
  evidence: EvaluationEntityEvidence,
): evidence is EvaluationTextEvidence {
  return evidence.kind === "text_span";
}

function splitsSurrogatePair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return false;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}
