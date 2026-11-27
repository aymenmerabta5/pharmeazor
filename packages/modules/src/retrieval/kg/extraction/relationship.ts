import { createHash } from "node:crypto";
import { graphEvidenceSpan } from "../../graph-chunk-validation";
import type { GraphTextUnit } from "../../graph-chunk-types";
import { foldKgText } from "../normalize";
import type { MentionKind } from "./mention-kinds";
import {
  RELATIONSHIP_KIND_DEFINITIONS,
  type RelationshipKindDefinition,
} from "./relationship-kinds";
import type {
  MentionRelationshipEndpoint,
  ObservationRelationshipEndpoint,
  RelationshipCandidateRecord,
  RelationshipMatchQuality,
  RelationshipMethod,
  RelationshipSupport,
  StructuredRelationshipInput,
  StructuredRelationshipResult,
  TextRelationshipInput,
  TextRelationshipResult,
} from "./relationship-types";
import type {
  ExtractionDiagnostic,
  MentionCandidateRecord,
  StructuredObservationRecord,
} from "./types";

interface TextSegment {
  readonly start: number;
  readonly end: number;
}

const SUBJECT_KIND_PRIORITY: Readonly<Record<string, number>> = {
  medicinal_product: 3,
  pharmaceutical_product: 2,
  brand_term: 1,
  regulatory_authorization: 1,
  source: 1,
};

const COMPILED_CUES = new Map<string, RegExp>();
const MAX_TEXT_SUPPORT_CHARS = 2000;

/**
 * Extract candidate relationships from one graph text unit and its mentions.
 *
 * Unit-scoped clinical rules require exactly one product candidate in the unit;
 * clause-scoped rules require both endpoints and any cue in the same clause.
 * These are explicit section/source rules, not general co-occurrence.
 */
export function extractTextRelationships(input: TextRelationshipInput): TextRelationshipResult {
  const relationships: RelationshipCandidateRecord[] = [];
  const diagnostics: ExtractionDiagnostic[] = [];
  const unit = input.unit;
  const mentions = input.mentions.filter(
    (mention) => mention.evidence.textUnitId === unit.textUnitId,
  );
  if (mentions.length === 0) return { relationships, diagnostics };

  const segments = clauseSegments(unit);
  const seen = new Set<string>();

  for (const definition of RELATIONSHIP_KIND_DEFINITIONS) {
    if (!definition.modes.includes("text")) continue;
    if (definition.sectionCodes && !definition.sectionCodes.includes(unit.sectionCode)) continue;
    if (definition.scope === "unit") {
      const subject = singleProductSubject(definition, mentions);
      if (!subject) continue;
      const objects = objectMentions(definition, mentions);
      for (const object of objects) {
        if (sameTextEndpoint(subject, object)) continue;
        const support = textSupport(unit, subject, object, "unit");
        const relationship = buildTextRelationship({
          definition,
          subject,
          object,
          support,
          runId: input.extractionRunId,
          ontologyVersion: input.ontologyVersion,
          method: "section_unit",
          matchQuality: "section_unit",
          unit,
          cuePattern: null,
        });
        if (!relationship) {
          diagnostics.push(
            supportDiagnostic(unit, subject, object, "The unit support span is invalid"),
          );
          continue;
        }
        if (seen.has(relationship.relationshipId)) continue;
        seen.add(relationship.relationshipId);
        relationships.push(relationship);
      }
      continue;
    }

    const cue = definition.cuePattern ? compileCue(definition.cuePattern) : null;
    for (const segment of segments) {
      if (cue && !cue.test(unit.content.slice(segment.start, segment.end))) continue;
      const subject = bestSubjectInSegment(definition, mentions, segment);
      if (!subject) continue;
      for (const object of objectsInSegment(definition, mentions, segment)) {
        if (sameTextEndpoint(subject, object)) continue;
        const support = textSupport(unit, subject, object, "clause");
        const relationship = buildTextRelationship({
          definition,
          subject,
          object,
          support,
          runId: input.extractionRunId,
          ontologyVersion: input.ontologyVersion,
          method: "section_clause",
          matchQuality: "section_clause",
          unit,
          cuePattern: definition.cuePattern ?? null,
        });
        if (!relationship) {
          diagnostics.push(
            supportDiagnostic(unit, subject, object, "The clause support span is invalid"),
          );
          continue;
        }
        if (seen.has(relationship.relationshipId)) continue;
        seen.add(relationship.relationshipId);
        relationships.push(relationship);
      }
    }
  }

  return { relationships, diagnostics };
}

/**
 * Extract candidate relationships that are explicit in one structured row.
 *
 * A row is the evidence boundary. Two observations from different rows are
 * never joined, even when their normalized values are equal.
 */
export function extractStructuredRowRelationships(
  input: StructuredRelationshipInput,
): StructuredRelationshipResult {
  const relationships: RelationshipCandidateRecord[] = [];
  const diagnostics: ExtractionDiagnostic[] = [];
  const byKind = groupByKind(input.observations);
  const seen = new Set<string>();

  for (const definition of RELATIONSHIP_KIND_DEFINITIONS) {
    if (!definition.modes.includes("structured_row")) continue;
    const subjects = structuredSubjects(definition, byKind);
    const objects = structuredObjects(definition, byKind);
    for (const subject of subjects) {
      for (const object of objects) {
        if (
          subject.observationId === object.observationId ||
          subject.normalizedValue === object.normalizedValue
        ) {
          continue;
        }
        const record = sharedObservationEvidence(subject, object);
        if (!record) continue;
        const support: RelationshipSupport =
          record.kind === "structured_record"
            ? {
                kind: "structured_row",
                record,
                subjectEndpointId: subject.observationId,
                objectEndpointId: object.observationId,
              }
            : {
                kind: "metadata_row",
                record,
                subjectEndpointId: subject.observationId,
                objectEndpointId: object.observationId,
              };
        const relationship = buildObservationRelationship({
          definition,
          subject,
          object,
          support,
          runId: input.extractionRunId,
          ontologyVersion: input.ontologyVersion,
          method: "structured_row",
          matchQuality: "explicit_column",
        });
        if (seen.has(relationship.relationshipId)) continue;
        seen.add(relationship.relationshipId);
        relationships.push(relationship);
      }
    }
  }

  return { relationships, diagnostics };
}

function buildTextRelationship(input: {
  readonly definition: RelationshipKindDefinition;
  readonly subject: MentionCandidateRecord;
  readonly object: MentionCandidateRecord;
  readonly support: RelationshipSupport | null;
  readonly runId: string;
  readonly ontologyVersion: string;
  readonly method: RelationshipMethod;
  readonly matchQuality: RelationshipMatchQuality;
  readonly unit: GraphTextUnit;
  readonly cuePattern: string | null;
}): RelationshipCandidateRecord | null {
  if (!input.support) return null;
  const subject = mentionEndpoint(input.subject);
  const object = mentionEndpoint(input.object);
  const relationshipId = relationshipIdFor({
    runId: input.runId,
    relationshipKind: input.definition.relationshipKind,
    subjectId: subject.endpointId,
    objectId: object.endpointId,
    support: input.support,
  });
  return {
    relationshipId,
    extractionRunId: input.runId,
    relationshipKind: input.definition.relationshipKind,
    family: input.definition.family,
    subject,
    object,
    support: input.support,
    method: input.method,
    matchQuality: input.matchQuality,
    ontologyVersion: input.ontologyVersion,
    attributes: {
      sectionCode: input.unit.sectionCode,
      sectionHeading: input.unit.sectionHeading,
      sectionPath: input.unit.sectionPath,
      documentType: input.subject.document.documentType,
      chunkingProfile: input.unit.profile,
      cuePattern: input.cuePattern,
      subjectCandidateKind: input.subject.candidateKind,
      objectCandidateKind: input.object.candidateKind,
      extractionRule: input.definition.relationshipKind,
      reviewRequired: true,
    },
    observationState: "quarantined",
  };
}

function buildObservationRelationship(input: {
  readonly definition: RelationshipKindDefinition;
  readonly subject: StructuredObservationRecord;
  readonly object: StructuredObservationRecord;
  readonly support: RelationshipSupport;
  readonly runId: string;
  readonly ontologyVersion: string;
  readonly method: RelationshipMethod;
  readonly matchQuality: RelationshipMatchQuality;
}): RelationshipCandidateRecord {
  const subject = observationEndpoint(input.subject);
  const object = observationEndpoint(input.object);
  const relationshipId = relationshipIdFor({
    runId: input.runId,
    relationshipKind: input.definition.relationshipKind,
    subjectId: subject.endpointId,
    objectId: object.endpointId,
    support: input.support,
  });
  return {
    relationshipId,
    extractionRunId: input.runId,
    relationshipKind: input.definition.relationshipKind,
    family: input.definition.family,
    subject,
    object,
    support: input.support,
    method: input.method,
    matchQuality: input.matchQuality,
    ontologyVersion: input.ontologyVersion,
    attributes: {
      subjectCandidateKind: input.subject.candidateKind,
      objectCandidateKind: input.object.candidateKind,
      extractionRule: input.definition.relationshipKind,
      reviewRequired: true,
    },
    observationState: "quarantined",
  };
}

function mentionEndpoint(mention: MentionCandidateRecord): MentionRelationshipEndpoint {
  return {
    endpointKind: "mention",
    endpointId: mention.mentionId,
    candidateKind: mention.candidateKind,
    family: mention.family,
    surfaceText: mention.surfaceText,
    normalizedSurface: mention.normalizedSurface,
    evidence: mention.evidence,
    document: mention.document,
  };
}

function observationEndpoint(
  observation: StructuredObservationRecord,
): ObservationRelationshipEndpoint {
  return {
    endpointKind: "observation",
    endpointId: observation.observationId,
    candidateKind: observation.candidateKind,
    family: observation.family,
    rawValue: observation.rawValue,
    normalizedValue: observation.normalizedValue,
    evidence: observation.evidence,
  };
}

function textSupport(
  unit: GraphTextUnit,
  subject: MentionCandidateRecord,
  object: MentionCandidateRecord,
  scope: "clause" | "unit",
): RelationshipSupport | null {
  const start =
    scope === "unit"
      ? object.evidence.localStart
      : Math.min(subject.evidence.localStart, object.evidence.localStart);
  const end =
    scope === "unit"
      ? object.evidence.localEnd
      : Math.max(subject.evidence.localEnd, object.evidence.localEnd);
  if (end - start > MAX_TEXT_SUPPORT_CHARS) return null;
  try {
    const span = graphEvidenceSpan(unit, start, end);
    return {
      kind: "text_support",
      scope,
      textUnitId: span.textUnitId,
      documentSnapshotId: span.documentSnapshotId,
      artifactId: unit.artifactId,
      documentId: unit.documentId,
      sectionId: unit.sectionId,
      sectionCode: unit.sectionCode,
      sectionHeading: unit.sectionHeading,
      sectionPath: unit.sectionPath,
      offsetEncoding: span.offsetEncoding,
      start: span.start,
      end: span.end,
      documentStart: span.documentStart,
      documentEnd: span.documentEnd,
      quote: span.quote,
      quoteSha256: span.quoteSha256,
      rawContentSha256: span.rawContentSha256,
      subjectEndpointId: subject.mentionId,
      objectEndpointId: object.mentionId,
    };
  } catch {
    return null;
  }
}

function relationshipIdFor(input: {
  readonly runId: string;
  readonly relationshipKind: string;
  readonly subjectId: string;
  readonly objectId: string;
  readonly support: RelationshipSupport;
}): string {
  const supportKey =
    input.support.kind === "text_support"
      ? [
          input.support.textUnitId,
          String(input.support.start),
          String(input.support.end),
          input.support.scope,
        ].join(":")
      : input.support.kind === "structured_row"
        ? [
            input.support.record.path,
            String(input.support.record.rowNumber),
            input.support.record.rowSha256,
          ].join(":")
        : [
            input.support.record.artifactId,
            input.support.record.field,
            input.support.record.contentSha256,
          ].join(":");
  const digest = sha256(
    [input.runId, input.relationshipKind, input.subjectId, input.objectId, supportKey].join(
      "\u0000",
    ),
  );
  return `rel_${digest.slice(0, 32)}`;
}

function singleProductSubject(
  definition: RelationshipKindDefinition,
  mentions: readonly MentionCandidateRecord[],
): MentionCandidateRecord | null {
  const subjects = subjectMentions(definition, mentions);
  if (subjects.length === 0) return null;
  const bySurface = new Map<string, MentionCandidateRecord>();
  for (const mention of subjects) {
    const existing = bySurface.get(mention.normalizedSurface);
    if (!existing || betterMention(mention, existing)) {
      bySurface.set(mention.normalizedSurface, mention);
    }
  }
  if (bySurface.size !== 1) return null;
  return [...bySurface.values()][0] ?? null;
}

function bestSubjectInSegment(
  definition: RelationshipKindDefinition,
  mentions: readonly MentionCandidateRecord[],
  segment: TextSegment,
): MentionCandidateRecord | null {
  const subjects = subjectMentions(definition, mentions).filter((mention) =>
    mentionInSegment(mention, segment),
  );
  return bestMention(subjects);
}

function objectsInSegment(
  definition: RelationshipKindDefinition,
  mentions: readonly MentionCandidateRecord[],
  segment: TextSegment,
): MentionCandidateRecord[] {
  return objectMentions(definition, mentions).filter((mention) =>
    mentionInSegment(mention, segment),
  );
}

function subjectMentions(
  definition: RelationshipKindDefinition,
  mentions: readonly MentionCandidateRecord[],
): MentionCandidateRecord[] {
  for (const kind of definition.subjectKinds) {
    const matching = mentions
      .filter((mention) => mention.candidateKind === kind)
      .filter(isDocumentProductMention);
    if (matching.length > 0) return matching;
  }
  return [];
}

function objectMentions(
  definition: RelationshipKindDefinition,
  mentions: readonly MentionCandidateRecord[],
): MentionCandidateRecord[] {
  const byValue = new Map<string, MentionCandidateRecord>();
  for (const kind of definition.objectKinds) {
    for (const mention of mentions) {
      if (mention.candidateKind !== kind) continue;
      const existing = byValue.get(mention.normalizedSurface);
      if (!existing || betterMention(mention, existing)) {
        byValue.set(mention.normalizedSurface, mention);
      }
    }
  }
  return [...byValue.values()].sort(
    (left, right) =>
      left.evidence.localStart - right.evidence.localStart ||
      left.evidence.localEnd - right.evidence.localEnd ||
      left.candidateKind.localeCompare(right.candidateKind),
  );
}

function bestMention(mentions: readonly MentionCandidateRecord[]): MentionCandidateRecord | null {
  return (
    [...mentions].sort(
      (left, right) =>
        kindPriority(right.candidateKind) - kindPriority(left.candidateKind) ||
        right.surfaceText.length - left.surfaceText.length ||
        left.mentionId.localeCompare(right.mentionId),
    )[0] ?? null
  );
}

function betterMention(
  candidate: MentionCandidateRecord,
  existing: MentionCandidateRecord,
): boolean {
  return (
    kindPriority(candidate.candidateKind) > kindPriority(existing.candidateKind) ||
    (kindPriority(candidate.candidateKind) === kindPriority(existing.candidateKind) &&
      candidate.surfaceText.length > existing.surfaceText.length) ||
    (kindPriority(candidate.candidateKind) === kindPriority(existing.candidateKind) &&
      candidate.surfaceText.length === existing.surfaceText.length &&
      candidate.mentionId < existing.mentionId)
  );
}

function kindPriority(kind: MentionKind): number {
  return SUBJECT_KIND_PRIORITY[kind] ?? 0;
}

function sameTextEndpoint(
  subject: MentionCandidateRecord,
  object: MentionCandidateRecord,
): boolean {
  return (
    subject.mentionId === object.mentionId ||
    subject.normalizedSurface === object.normalizedSurface ||
    (subject.evidence.localStart < object.evidence.localEnd &&
      object.evidence.localStart < subject.evidence.localEnd)
  );
}

function isDocumentProductMention(mention: MentionCandidateRecord): boolean {
  const title = foldKgText(mention.document.title);
  const surface = mention.normalizedSurface;
  if (title.length < 3 || surface.length < 3) return false;
  return title.includes(surface) || surface.includes(title);
}

function mentionInSegment(mention: MentionCandidateRecord, segment: TextSegment): boolean {
  return mention.evidence.localStart >= segment.start && mention.evidence.localEnd <= segment.end;
}

function structuredSubjects(
  definition: RelationshipKindDefinition,
  byKind: ReadonlyMap<string, readonly StructuredObservationRecord[]>,
): StructuredObservationRecord[] {
  if (definition.subjectKinds.includes("source")) {
    const sources = byKind.get("source") ?? [];
    const sourceId = sources.find(
      (observation) =>
        observation.evidence.kind === "structured_record" &&
        observation.rawValue === observation.evidence.sourceId,
    );
    return sourceId ? [sourceId] : sources.slice(0, 1);
  }
  for (const kind of definition.subjectKinds) {
    const matching = byKind.get(kind) ?? [];
    if (matching.length > 0) {
      return dedupeObservations(matching);
    }
  }
  return [];
}

function structuredObjects(
  definition: RelationshipKindDefinition,
  byKind: ReadonlyMap<string, readonly StructuredObservationRecord[]>,
): StructuredObservationRecord[] {
  const byValue = new Map<string, StructuredObservationRecord>();
  for (const kind of definition.objectKinds) {
    for (const observation of byKind.get(kind) ?? []) {
      if (!byValue.has(observation.normalizedValue)) {
        byValue.set(observation.normalizedValue, observation);
      }
    }
  }
  return [...byValue.values()].sort((left, right) =>
    left.observationId.localeCompare(right.observationId),
  );
}

function dedupeObservations(
  observations: readonly StructuredObservationRecord[],
): StructuredObservationRecord[] {
  const byValue = new Map<string, StructuredObservationRecord>();
  for (const observation of observations) {
    if (!byValue.has(observation.normalizedValue)) {
      byValue.set(observation.normalizedValue, observation);
    }
  }
  return [...byValue.values()].sort((left, right) =>
    left.observationId.localeCompare(right.observationId),
  );
}

function groupByKind(
  observations: readonly StructuredObservationRecord[],
): ReadonlyMap<string, readonly StructuredObservationRecord[]> {
  const byKind = new Map<string, StructuredObservationRecord[]>();
  for (const observation of observations) {
    const bucket = byKind.get(observation.candidateKind) ?? [];
    bucket.push(observation);
    byKind.set(observation.candidateKind, bucket);
  }
  return byKind;
}

function sharedObservationEvidence(
  subject: StructuredObservationRecord,
  object: StructuredObservationRecord,
): StructuredObservationRecord["evidence"] | null {
  const left = subject.evidence;
  const right = object.evidence;
  if (left.kind === "structured_record" && right.kind === "structured_record") {
    return left.path === right.path &&
      left.rowNumber === right.rowNumber &&
      left.rowSha256 === right.rowSha256
      ? left
      : null;
  }
  if (left.kind === "metadata" && right.kind === "metadata") {
    return left.artifactId === right.artifactId &&
      left.field === right.field &&
      left.contentSha256 === right.contentSha256
      ? left
      : null;
  }
  return null;
}

function clauseSegments(unit: GraphTextUnit): TextSegment[] {
  const segments: TextSegment[] = [];
  const content = unit.content;
  const uniqueStart = unit.uniqueLocalSpan.start;
  const uniqueEnd = unit.uniqueLocalSpan.end;
  let start = uniqueStart;
  const push = (from: number, to: number): void => {
    let left = Math.max(from, uniqueStart);
    let right = Math.min(to, uniqueEnd);
    while (left < right && /\s/u.test(content[left] ?? "")) left += 1;
    while (right > left && /\s/u.test(content[right - 1] ?? "")) right -= 1;
    if (right > left) segments.push({ start: left, end: right });
  };
  for (let index = uniqueStart; index < uniqueEnd; index += 1) {
    const character = content[index];
    if (character === "\n" || character === "\r") {
      push(start, index);
      start = index + 1;
      continue;
    }
    if (character === "." || character === ";" || character === "!" || character === "?") {
      if (
        character === "." &&
        /\d/u.test(content[index - 1] ?? "") &&
        /\d/u.test(content[index + 1] ?? "")
      ) {
        continue;
      }
      const next = content[index + 1];
      if (next === undefined || /\s/u.test(next)) {
        push(start, index + 1);
        start = index + 1;
      }
    }
  }
  push(start, uniqueEnd);
  return segments;
}

function compileCue(pattern: string): RegExp {
  const cached = COMPILED_CUES.get(pattern);
  if (cached) return cached;
  const compiled = new RegExp(pattern, "iu");
  COMPILED_CUES.set(pattern, compiled);
  return compiled;
}

function supportDiagnostic(
  unit: GraphTextUnit,
  subject: MentionCandidateRecord,
  object: MentionCandidateRecord,
  message: string,
): ExtractionDiagnostic {
  return {
    code: "invalid_relationship_support",
    severity: "warning",
    message,
    artifactId: unit.artifactId,
    textUnitId: unit.textUnitId,
    sectionId: unit.sectionId,
    sourceSpan: {
      start: Math.min(subject.evidence.localStart, object.evidence.localStart),
      end: Math.max(subject.evidence.localEnd, object.evidence.localEnd),
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
