import { observationScopeKey } from "./evidence";
import { structuredRowScopeKey } from "./gold";
import type {
  EvaluationEntityEvidence,
  EvaluationObservation,
  GoldAnnotationScope,
  GoldDataset,
  GoldEntityRef,
} from "./types";

export interface ScopeDecision {
  readonly scope: GoldAnnotationScope;
  readonly key: string;
}

export interface EvaluationScopes {
  readonly documents: ReadonlyMap<
    string,
    { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope }
  >;
  readonly rows: ReadonlyMap<
    string,
    { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope }
  >;
}

export function buildEvaluationScopes(gold: GoldDataset): EvaluationScopes {
  const documents = new Map<
    string,
    { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope }
  >();
  for (const document of gold.manifest.documents) {
    documents.set(document.documentSnapshotId, {
      entityScope: document.entityScope,
      relationshipScope: document.relationshipScope,
    });
  }
  const rows = new Map<
    string,
    { entityScope: GoldAnnotationScope; relationshipScope: GoldAnnotationScope }
  >();
  for (const row of gold.manifest.structuredRows) {
    rows.set(structuredRowScopeKey(row.sourceId, row.path, row.rowNumber), {
      entityScope: row.entityScope,
      relationshipScope: row.relationshipScope,
    });
  }
  return { documents, rows };
}

export function documentEntityScope(
  scopes: EvaluationScopes,
  documentSnapshotId: string,
): GoldAnnotationScope {
  return scopes.documents.get(documentSnapshotId)?.entityScope ?? "not_annotated";
}

export function documentRelationshipScope(
  scopes: EvaluationScopes,
  documentSnapshotId: string,
): GoldAnnotationScope {
  return scopes.documents.get(documentSnapshotId)?.relationshipScope ?? "not_annotated";
}

export function observationEntityScope(
  scopes: EvaluationScopes,
  observation: EvaluationObservation,
): GoldAnnotationScope {
  return scopes.rows.get(observationScopeKey(observation.evidence))?.entityScope ?? "not_annotated";
}

export function observationRelationshipScope(
  scopes: EvaluationScopes,
  observation: EvaluationObservation,
): GoldAnnotationScope {
  return (
    scopes.rows.get(observationScopeKey(observation.evidence))?.relationshipScope ?? "not_annotated"
  );
}

export function endpointRelationshipScope(
  scopes: EvaluationScopes,
  evidence: EvaluationEntityEvidence,
): GoldAnnotationScope {
  if (evidence.kind === "text_span") {
    return documentRelationshipScope(scopes, evidence.documentSnapshotId);
  }
  return scopes.rows.get(observationScopeKey(evidence))?.relationshipScope ?? "not_annotated";
}

export function goldRefRelationshipScope(
  scopes: EvaluationScopes,
  ref: GoldEntityRef,
): GoldAnnotationScope {
  if (ref.kind === "text_span") {
    return scopes.documents.get(ref.documentSnapshotId)?.relationshipScope ?? "partial";
  }
  if (ref.kind === "structured_row") {
    return (
      scopes.rows.get(structuredRowScopeKey(ref.sourceId, ref.path, ref.rowNumber))
        ?.relationshipScope ?? "partial"
    );
  }
  return "partial";
}

export function goldRefEntityScope(
  scopes: EvaluationScopes,
  ref: GoldEntityRef,
): GoldAnnotationScope {
  if (ref.kind === "text_span") {
    return scopes.documents.get(ref.documentSnapshotId)?.entityScope ?? "partial";
  }
  if (ref.kind === "structured_row") {
    return (
      scopes.rows.get(structuredRowScopeKey(ref.sourceId, ref.path, ref.rowNumber))?.entityScope ??
      "partial"
    );
  }
  return "not_annotated";
}
