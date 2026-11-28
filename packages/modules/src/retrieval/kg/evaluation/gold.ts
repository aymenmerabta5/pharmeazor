import { LINK_GROUPS, linkGroupForKind, type LinkGroup } from "../extraction/entity-link-kinds";
import { MENTION_KINDS } from "../extraction/mention-kinds";
import { RELATIONSHIP_KINDS } from "../extraction/relationship-kinds";
import { goldRefIdentity } from "./evidence";
import type {
  EvaluationTextUnit,
  GoldAnnotationScope,
  GoldDataset,
  GoldDatasetManifest,
  GoldEntityAnnotation,
  GoldEntityRef,
  GoldLinkAnnotation,
  GoldRelationshipAnnotation,
  GoldStructuredRowScope,
  RawEvaluationIssue,
} from "./types";
import { KG_GOLD_PROTOCOL_VERSION, KG_GOLD_SCHEMA_VERSION } from "./types";

const MENTION_KIND_SET = new Set<string>(MENTION_KINDS);
const RELATIONSHIP_KIND_SET = new Set<string>(RELATIONSHIP_KINDS);
const LINK_GROUP_SET = new Set<string>(LINK_GROUPS);
const SCOPE_SET = new Set<string>(["exhaustive", "partial", "not_annotated"]);

export function parseGoldDatasetManifest(value: unknown): GoldDatasetManifest {
  const record = objectRecord(value, "gold manifest");
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== KG_GOLD_SCHEMA_VERSION) {
    throw new Error(
      `Gold manifest schemaVersion must be ${KG_GOLD_SCHEMA_VERSION}, received ${String(schemaVersion)}`,
    );
  }
  if (record.protocolVersion !== KG_GOLD_PROTOCOL_VERSION) {
    throw new Error(`Gold manifest protocolVersion must be ${KG_GOLD_PROTOCOL_VERSION}`);
  }
  const status = record.status;
  if (status !== "awaiting_manual_annotation" && status !== "manually_labelled") {
    throw new Error(
      "Gold manifest status must be 'awaiting_manual_annotation' or 'manually_labelled'",
    );
  }
  const documents = optionalArray(record.documents, "gold manifest documents", (entry, index) => {
    const document = objectRecord(entry, `gold document ${index}`);
    return {
      documentId: requiredString(document.documentId, `gold document ${index}.documentId`),
      documentSnapshotId: requiredString(
        document.documentSnapshotId,
        `gold document ${index}.documentSnapshotId`,
      ),
      artifactId: requiredString(document.artifactId, `gold document ${index}.artifactId`),
      entityScope: scopeValue(document.entityScope, `gold document ${index}.entityScope`),
      relationshipScope: scopeValue(
        document.relationshipScope,
        `gold document ${index}.relationshipScope`,
      ),
      note: optionalNote(document.note, `gold document ${index}.note`),
    };
  });
  const structuredRows = optionalArray(
    record.structuredRows,
    "gold manifest structuredRows",
    (entry, index) => {
      const row = objectRecord(entry, `gold structured row ${index}`);
      const rowNumber = row.rowNumber;
      if (!Number.isInteger(rowNumber) || (rowNumber as number) < 2) {
        throw new Error(`gold structured row ${index}.rowNumber must be an integer >= 2`);
      }
      return {
        sourceId: requiredString(row.sourceId, `gold structured row ${index}.sourceId`),
        path: requiredString(row.path, `gold structured row ${index}.path`),
        rowNumber: rowNumber as number,
        entityScope: scopeValue(row.entityScope, `gold structured row ${index}.entityScope`),
        relationshipScope: scopeValue(
          row.relationshipScope,
          `gold structured row ${index}.relationshipScope`,
        ),
        note: optionalNote(row.note, `gold structured row ${index}.note`),
      };
    },
  );
  return {
    schemaVersion: KG_GOLD_SCHEMA_VERSION,
    datasetId: requiredString(record.datasetId, "gold manifest datasetId"),
    protocolVersion: KG_GOLD_PROTOCOL_VERSION,
    status,
    description: requiredString(record.description, "gold manifest description", true),
    annotators: optionalArray(record.annotators, "gold manifest annotators", (entry, index) =>
      requiredString(entry, `gold manifest annotators[${index}]`),
    ),
    documents,
    structuredRows,
  };
}

export function parseGoldEntityAnnotation(value: unknown, context: string): GoldEntityAnnotation {
  const record = objectRecord(value, `gold entity ${context}`);
  const entity = parseGoldEntityRef(record.entity, `gold entity ${context}.entity`);
  if (entity.kind === "metadata") {
    throw new Error(`gold entity ${context}.entity.kind must be 'text_span' or 'structured_row'`);
  }
  return {
    goldId: requiredString(record.goldId, `gold entity ${context}.goldId`),
    entity,
    note: optionalNote(record.note, `gold entity ${context}.note`),
  };
}

export function parseGoldRelationshipAnnotation(
  value: unknown,
  context: string,
): GoldRelationshipAnnotation {
  const record = objectRecord(value, `gold relationship ${context}`);
  const relationshipKind = requiredString(
    record.relationshipKind,
    `gold relationship ${context}.relationshipKind`,
  );
  if (!RELATIONSHIP_KIND_SET.has(relationshipKind)) {
    throw new Error(
      `gold relationship ${context}.relationshipKind is not in the relationship taxonomy`,
    );
  }
  return {
    goldId: requiredString(record.goldId, `gold relationship ${context}.goldId`),
    relationshipKind,
    subject: parseGoldEntityRef(record.subject, `gold relationship ${context}.subject`),
    object: parseGoldEntityRef(record.object, `gold relationship ${context}.object`),
    note: optionalNote(record.note, `gold relationship ${context}.note`),
  };
}

export function parseGoldLinkAnnotation(value: unknown, context: string): GoldLinkAnnotation {
  const record = objectRecord(value, `gold link ${context}`);
  const decision = record.decision;
  if (decision !== "same_entity" && decision !== "different_entity") {
    throw new Error(`gold link ${context}.decision must be 'same_entity' or 'different_entity'`);
  }
  const group = record.group;
  if (typeof group !== "string" || !LINK_GROUP_SET.has(group)) {
    throw new Error(`gold link ${context}.group is not in the link taxonomy`);
  }
  return {
    goldId: requiredString(record.goldId, `gold link ${context}.goldId`),
    decision,
    group: group as LinkGroup,
    left: parseGoldEntityRef(record.left, `gold link ${context}.left`),
    right: parseGoldEntityRef(record.right, `gold link ${context}.right`),
    note: optionalNote(record.note, `gold link ${context}.note`),
  };
}

export function parseGoldEntityRef(value: unknown, context: string): GoldEntityRef {
  const record = objectRecord(value, context);
  const candidateKind = requiredString(record.candidateKind, `${context}.candidateKind`);
  if (!MENTION_KIND_SET.has(candidateKind)) {
    throw new Error(`${context}.candidateKind is not in the mention taxonomy`);
  }
  switch (record.kind) {
    case "text_span": {
      const documentStart = record.documentStart;
      const documentEnd = record.documentEnd;
      if (!Number.isInteger(documentStart) || (documentStart as number) < 0) {
        throw new Error(`${context}.documentStart must be a non-negative integer`);
      }
      if (!Number.isInteger(documentEnd) || (documentEnd as number) <= (documentStart as number)) {
        throw new Error(`${context}.documentEnd must be an integer greater than documentStart`);
      }
      return {
        kind: "text_span",
        documentSnapshotId: requiredString(
          record.documentSnapshotId,
          `${context}.documentSnapshotId`,
        ),
        documentId: requiredString(record.documentId, `${context}.documentId`),
        documentStart: documentStart as number,
        documentEnd: documentEnd as number,
        quote: requiredString(record.quote, `${context}.quote`, true),
        candidateKind,
      };
    }
    case "structured_row": {
      const rowNumber = record.rowNumber;
      if (!Number.isInteger(rowNumber) || (rowNumber as number) < 2) {
        throw new Error(`${context}.rowNumber must be an integer >= 2`);
      }
      return {
        kind: "structured_row",
        sourceId: requiredString(record.sourceId, `${context}.sourceId`),
        path: requiredString(record.path, `${context}.path`),
        rowNumber: rowNumber as number,
        rawValue: requiredString(record.rawValue, `${context}.rawValue`, true),
        candidateKind,
      };
    }
    case "metadata":
      return {
        kind: "metadata",
        sourceId: requiredString(record.sourceId, `${context}.sourceId`),
        artifactId: requiredString(record.artifactId, `${context}.artifactId`),
        field: requiredString(record.field, `${context}.field`),
        rawValue: requiredString(record.rawValue, `${context}.rawValue`, true),
        candidateKind,
      };
    default:
      throw new Error(`${context}.kind must be 'text_span', 'structured_row', or 'metadata'`);
  }
}

export interface GoldValidationResult {
  readonly issues: readonly RawEvaluationIssue[];
  readonly validEntityGoldIds: ReadonlySet<string>;
  readonly validRelationshipGoldIds: ReadonlySet<string>;
  readonly validLinkGoldIds: ReadonlySet<string>;
}

/**
 * Validate manually labelled gold annotations against the graph source text and
 * the temporary taxonomies. Invalid annotations are excluded from metrics so a
 * labelling typo never inflates or deflates a score silently.
 */
export function validateGoldDataset(
  gold: GoldDataset,
  textUnits: readonly EvaluationTextUnit[],
): GoldValidationResult {
  const issues: RawEvaluationIssue[] = [];
  const unitsBySnapshot = indexUnitsBySnapshot(textUnits);
  const manifest = gold.manifest;

  const annotationCount =
    gold.entityMentions.length + gold.relationships.length + gold.entityLinks.length;
  if (manifest.status === "awaiting_manual_annotation" && annotationCount > 0) {
    issues.push({
      code: "gold_status_labels_present",
      severity: "warning",
      message:
        "Gold manifest is marked awaiting_manual_annotation but contains labels; confirm the status before scoring",
      sampleId: manifest.datasetId,
    });
  }
  if (manifest.status === "manually_labelled" && annotationCount === 0) {
    issues.push({
      code: "gold_dataset_empty",
      severity: "warning",
      message: "Gold manifest is marked manually_labelled but contains no annotations",
      sampleId: manifest.datasetId,
    });
  }
  if (annotationCount > 0 && manifest.annotators.length === 0) {
    issues.push({
      code: "gold_annotator_missing",
      severity: "warning",
      message: "Gold annotations exist but the manifest names no annotator",
      sampleId: manifest.datasetId,
    });
  }

  const documentScopes = new Map<
    string,
    { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope }
  >();
  for (const [index, document] of manifest.documents.entries()) {
    const key = `${document.documentSnapshotId}\u0000${document.documentId}`;
    if (documentScopes.has(key)) {
      issues.push({
        code: "gold_document_scope_duplicate",
        severity: "error",
        message: `Gold manifest repeats document scope ${document.documentId}`,
        sampleId: `document:${index}`,
      });
      continue;
    }
    documentScopes.set(key, {
      entityScope: document.entityScope,
      relationshipScope: document.relationshipScope,
    });
  }
  const rowScopes = new Map<string, GoldStructuredRowScope>();
  for (const [index, row] of manifest.structuredRows.entries()) {
    const key = structuredRowScopeKey(row.sourceId, row.path, row.rowNumber);
    if (rowScopes.has(key)) {
      issues.push({
        code: "gold_structured_row_scope_duplicate",
        severity: "error",
        message: `Gold manifest repeats structured row ${row.path}:${row.rowNumber}`,
        sampleId: `structuredRow:${index}`,
      });
      continue;
    }
    rowScopes.set(key, row);
  }

  const validEntityGoldIds = new Set<string>();
  const seenEntityIds = new Set<string>();
  const seenEntityKeys = new Set<string>();
  for (const [index, annotation] of gold.entityMentions.entries()) {
    const context = `entity[${index}]:${annotation.goldId}`;
    if (seenEntityIds.has(annotation.goldId)) {
      issues.push(duplicateGoldId(context, annotation.goldId));
      continue;
    }
    seenEntityIds.add(annotation.goldId);
    const refIssues = validateGoldRef(annotation.entity, unitsBySnapshot, context);
    issues.push(...refIssues);
    const key = goldRefIdentity(annotation.entity);
    if (seenEntityKeys.has(key)) {
      issues.push({
        code: "gold_entity_duplicate",
        severity: "error",
        message: `Gold entity ${annotation.goldId} repeats another labelled entity`,
        sampleId: annotation.goldId,
      });
      continue;
    }
    seenEntityKeys.add(key);
    const scope = scopeForGoldRef(annotation.entity, documentScopes, rowScopes);
    if (scope === null) {
      issues.push({
        code: "gold_unscoped_annotation",
        severity: "warning",
        message: `Gold entity ${annotation.goldId} has no matching document or row scope; only recall can use it`,
        sampleId: annotation.goldId,
      });
    }
    if (refIssues.some((issue) => issue.severity === "error")) continue;
    if (scope?.entityScope === "not_annotated") continue;
    validEntityGoldIds.add(annotation.goldId);
  }

  const validRelationshipGoldIds = new Set<string>();
  const seenRelationshipIds = new Set<string>();
  const seenRelationshipKeys = new Set<string>();
  for (const [index, annotation] of gold.relationships.entries()) {
    const context = `relationship[${index}]:${annotation.goldId}`;
    if (seenRelationshipIds.has(annotation.goldId)) {
      issues.push(duplicateGoldId(context, annotation.goldId));
      continue;
    }
    seenRelationshipIds.add(annotation.goldId);
    const subjectIssues = validateGoldRef(
      annotation.subject,
      unitsBySnapshot,
      `${context}.subject`,
    );
    const objectIssues = validateGoldRef(annotation.object, unitsBySnapshot, `${context}.object`);
    issues.push(...subjectIssues, ...objectIssues);
    if (goldRefIdentity(annotation.subject) === goldRefIdentity(annotation.object)) {
      issues.push({
        code: "gold_relationship_self_reference",
        severity: "error",
        message: `Gold relationship ${annotation.goldId} uses the same endpoint twice`,
        sampleId: annotation.goldId,
      });
      continue;
    }
    if (!sameEvidenceBoundary(annotation.subject, annotation.object, unitsBySnapshot)) {
      issues.push({
        code: "gold_relationship_endpoints_not_co_located",
        severity: "error",
        message: `Gold relationship ${annotation.goldId} endpoints do not share one text unit or structured row`,
        sampleId: annotation.goldId,
      });
      continue;
    }
    const subjectScope = scopeForGoldRef(annotation.subject, documentScopes, rowScopes);
    const objectScope = scopeForGoldRef(annotation.object, documentScopes, rowScopes);
    if (subjectScope === null || objectScope === null) {
      issues.push({
        code: "gold_unscoped_annotation",
        severity: "warning",
        message: `Gold relationship ${annotation.goldId} has no matching document or row scope; only recall can use it`,
        sampleId: annotation.goldId,
      });
    }
    if (subjectIssues.some((issue) => issue.severity === "error")) continue;
    if (objectIssues.some((issue) => issue.severity === "error")) continue;
    if (
      subjectScope?.relationshipScope === "not_annotated" ||
      objectScope?.relationshipScope === "not_annotated"
    ) {
      continue;
    }
    const key = [
      annotation.relationshipKind,
      goldRefIdentity(annotation.subject),
      goldRefIdentity(annotation.object),
    ].join("||");
    if (seenRelationshipKeys.has(key)) {
      issues.push({
        code: "gold_relationship_duplicate",
        severity: "error",
        message: `Gold relationship ${annotation.goldId} repeats another labelled relationship`,
        sampleId: annotation.goldId,
      });
      continue;
    }
    seenRelationshipKeys.add(key);
    validRelationshipGoldIds.add(annotation.goldId);
  }

  const validLinkGoldIds = new Set<string>();
  const seenLinkIds = new Set<string>();
  const seenPairs = new Map<string, GoldLinkAnnotation>();
  for (const [index, annotation] of gold.entityLinks.entries()) {
    const context = `link[${index}]:${annotation.goldId}`;
    if (seenLinkIds.has(annotation.goldId)) {
      issues.push(duplicateGoldId(context, annotation.goldId));
      continue;
    }
    seenLinkIds.add(annotation.goldId);
    const leftIssues = validateGoldRef(annotation.left, unitsBySnapshot, `${context}.left`);
    const rightIssues = validateGoldRef(annotation.right, unitsBySnapshot, `${context}.right`);
    issues.push(...leftIssues, ...rightIssues);
    const leftKey = goldRefIdentity(annotation.left);
    const rightKey = goldRefIdentity(annotation.right);
    if (leftKey === rightKey) {
      issues.push({
        code: "gold_link_self_pair",
        severity: "error",
        message: `Gold link ${annotation.goldId} pairs an endpoint with itself`,
        sampleId: annotation.goldId,
      });
      continue;
    }
    for (const ref of [annotation.left, annotation.right]) {
      const definition = linkGroupForKind(ref.candidateKind);
      if (!definition) {
        issues.push({
          code: "gold_link_kind_not_linkable",
          severity: "error",
          message: `Gold link ${annotation.goldId} uses non-linkable kind ${ref.candidateKind}`,
          sampleId: annotation.goldId,
        });
      } else if (definition.group !== annotation.group) {
        issues.push({
          code: "gold_link_group_mismatch",
          severity: "error",
          message: `Gold link ${annotation.goldId} group ${annotation.group} does not match kind ${ref.candidateKind}`,
          sampleId: annotation.goldId,
        });
      }
    }
    const pairKey = [leftKey, rightKey].sort().join("\u0000");
    const existing = seenPairs.get(pairKey);
    if (existing) {
      const conflicting = existing.decision !== annotation.decision;
      issues.push({
        code: conflicting ? "gold_link_pair_conflict" : "gold_link_pair_duplicate",
        severity: conflicting ? "error" : "warning",
        message: `Gold link ${annotation.goldId} repeats pair ${existing.goldId}`,
        sampleId: annotation.goldId,
      });
      if (conflicting) {
        validLinkGoldIds.delete(existing.goldId);
      }
      continue;
    }
    seenPairs.set(pairKey, annotation);
    if (leftIssues.some((issue) => issue.severity === "error")) continue;
    if (rightIssues.some((issue) => issue.severity === "error")) continue;
    if (
      [annotation.left, annotation.right].some(
        (ref) => linkGroupForKind(ref.candidateKind)?.group !== annotation.group,
      )
    ) {
      continue;
    }
    validLinkGoldIds.add(annotation.goldId);
  }

  return { issues, validEntityGoldIds, validRelationshipGoldIds, validLinkGoldIds };
}

function validateGoldRef(
  ref: GoldEntityRef,
  unitsBySnapshot: ReadonlyMap<string, readonly EvaluationTextUnit[]>,
  context: string,
): RawEvaluationIssue[] {
  if (ref.kind === "text_span") {
    const unit = resolveGoldTextUnit(ref, unitsBySnapshot);
    if (!unit) {
      return [
        {
          code: "gold_text_span_unresolved",
          severity: "error",
          message: `${context} does not resolve to a unique raw span with the exact quote`,
          sampleId: context,
        },
      ];
    }
    return [];
  }
  if (ref.kind === "structured_row") {
    const issues: RawEvaluationIssue[] = [];
    if (!ref.sourceId.trim() || !ref.path.trim() || !ref.rawValue.trim()) {
      issues.push({
        code: "gold_structured_ref_incomplete",
        severity: "error",
        message: `${context} is missing a source, path, or raw value`,
        sampleId: context,
      });
    }
    if (!Number.isInteger(ref.rowNumber) || ref.rowNumber < 2) {
      issues.push({
        code: "gold_structured_ref_incomplete",
        severity: "error",
        message: `${context} has an invalid row number`,
        sampleId: context,
      });
    }
    return issues;
  }
  const issues: RawEvaluationIssue[] = [];
  if (!ref.sourceId.trim() || !ref.artifactId.trim() || !ref.field.trim() || !ref.rawValue.trim()) {
    issues.push({
      code: "gold_metadata_ref_incomplete",
      severity: "error",
      message: `${context} is missing a source, artifact, field, or raw value`,
      sampleId: context,
    });
  }
  return issues;
}

function scopeForGoldRef(
  ref: GoldEntityRef,
  documents: ReadonlyMap<
    string,
    { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope }
  >,
  rows: ReadonlyMap<string, GoldStructuredRowScope>,
): { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope } | null {
  if (ref.kind === "text_span") {
    return documents.get(`${ref.documentSnapshotId}\u0000${ref.documentId}`) ?? null;
  }
  if (ref.kind === "structured_row") {
    const row = rows.get(structuredRowScopeKey(ref.sourceId, ref.path, ref.rowNumber));
    return row ? { entityScope: row.entityScope, relationshipScope: row.relationshipScope } : null;
  }
  return null;
}

function sameEvidenceBoundary(
  left: GoldEntityRef,
  right: GoldEntityRef,
  unitsBySnapshot: ReadonlyMap<string, readonly EvaluationTextUnit[]>,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "text_span" && right.kind === "text_span") {
    const leftUnit = resolveGoldTextUnit(left, unitsBySnapshot);
    const rightUnit = resolveGoldTextUnit(right, unitsBySnapshot);
    return leftUnit !== null && rightUnit !== null && leftUnit.textUnitId === rightUnit.textUnitId;
  }
  if (left.kind === "structured_row" && right.kind === "structured_row") {
    return (
      left.sourceId === right.sourceId &&
      left.path === right.path &&
      left.rowNumber === right.rowNumber
    );
  }
  if (left.kind === "metadata" && right.kind === "metadata") {
    return (
      left.sourceId === right.sourceId &&
      left.artifactId === right.artifactId &&
      left.field === right.field
    );
  }
  return false;
}

function resolveGoldTextUnit(
  ref: Extract<GoldEntityRef, { readonly kind: "text_span" }>,
  unitsBySnapshot: ReadonlyMap<string, readonly EvaluationTextUnit[]>,
): EvaluationTextUnit | null {
  for (const unit of unitsBySnapshot.get(ref.documentSnapshotId) ?? []) {
    if (unit.documentId !== ref.documentId) continue;
    if (ref.documentStart < unit.sourceSpan.start || ref.documentEnd > unit.sourceSpan.end) {
      continue;
    }
    const localStart = ref.documentStart - unit.sourceSpan.start;
    const localEnd = ref.documentEnd - unit.sourceSpan.start;
    if (localStart < unit.uniqueLocalSpan.start || localEnd > unit.uniqueLocalSpan.end) {
      continue;
    }
    if (unit.content.slice(localStart, localEnd) !== ref.quote) continue;
    return unit;
  }
  return null;
}

export function indexUnitsBySnapshot(
  units: readonly EvaluationTextUnit[],
): ReadonlyMap<string, readonly EvaluationTextUnit[]> {
  const bySnapshot = new Map<string, EvaluationTextUnit[]>();
  for (const unit of units) {
    const bucket = bySnapshot.get(unit.documentSnapshotId) ?? [];
    bucket.push(unit);
    bySnapshot.set(unit.documentSnapshotId, bucket);
  }
  for (const bucket of bySnapshot.values()) {
    bucket.sort(
      (left, right) =>
        left.sourceSpan.start - right.sourceSpan.start ||
        left.sourceSpan.end - right.sourceSpan.end ||
        left.textUnitId.localeCompare(right.textUnitId),
    );
  }
  return bySnapshot;
}

export function structuredRowScopeKey(sourceId: string, path: string, rowNumber: number): string {
  return ["structured", sourceId, path, String(rowNumber)].join("|");
}

function duplicateGoldId(context: string, goldId: string): RawEvaluationIssue {
  return {
    code: "gold_id_duplicate",
    severity: "error",
    message: `${context} repeats a gold ID`,
    sampleId: goldId,
  };
}

function objectRecord(value: unknown, context: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be a JSON object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(value: unknown, context: string, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${context} must be a string`);
  if (!allowEmpty && !value.trim()) throw new Error(`${context} must not be empty`);
  if (allowEmpty && value.length === 0) throw new Error(`${context} must not be empty`);
  return value;
}

function optionalNote(value: unknown, context: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${context} must be a string or null`);
  return value;
}

function optionalArray<T>(
  value: unknown,
  context: string,
  parse: (entry: unknown, index: number) => T,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  return value.map(parse);
}

function scopeValue(value: unknown, context: string): GoldAnnotationScope {
  if (typeof value !== "string" || !SCOPE_SET.has(value)) {
    throw new Error(`${context} must be 'exhaustive', 'partial', or 'not_annotated'`);
  }
  return value as GoldAnnotationScope;
}
