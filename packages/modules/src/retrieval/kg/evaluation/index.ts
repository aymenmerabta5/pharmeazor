import { ENTITY_LINK_TAXONOMY_VERSION } from "../extraction/entity-link-kinds";
import { ENTITY_MENTION_TAXONOMY_VERSION } from "../extraction/mention-kinds";
import { RELATIONSHIP_TAXONOMY_VERSION } from "../extraction/relationship-kinds";
import { evaluateEntityMentions } from "./entities";
import { validateGoldDataset } from "./gold";
import { buildEvaluationIndexes } from "./indexes";
import { evaluateEntityLinks } from "./linking";
import { sortedRecord } from "./metrics";
import { evaluateRelationships } from "./relationships";
import { buildEvaluationScopes } from "./scope";
import type {
  EvaluationDiagnostic,
  EvaluationSeverity,
  KnowledgeGraphEvaluationInput,
  KnowledgeGraphEvaluationResult,
  RawEvaluationIssue,
} from "./types";
import { KG_EVALUATION_VERSION } from "./types";
import { validateArtifacts } from "./validate";

const LIMITATIONS = [
  "No gold-standard labels are shipped in this repository. The committed dataset is an empty manual-annotation scaffold, so scored metrics stay unavailable until a reviewer fills it in.",
  "Gold annotations are human judgements against a temporary, unapproved taxonomy. A high score is not clinical validation and does not authorize canonical entities or graph publication.",
  "Precision is only defined for documents and structured rows whose gold scope is exhaustive. Partial scopes contribute recall only, and a missing precision is reported as null rather than zero.",
  "Entity-link metrics are pair-based. Gold pairs whose endpoints were not extracted are counted as unresolved and excluded from precision and recall, so linking is measured only on extracted candidates.",
  "Metadata observations are validated for provenance but are not scored by entity precision; they are direct projections of source metadata rather than text extraction.",
  "The evaluator is offline and independent of Neo4j. It does not call a model, alter Hybrid RAG, create canonical entities, or run the approval-gated importer.",
] as const;

export function evaluateKnowledgeGraph(
  input: KnowledgeGraphEvaluationInput,
): KnowledgeGraphEvaluationResult {
  const indexes = buildEvaluationIndexes(input.textUnits, input.mentions, input.observations);
  const artifactValidation = validateArtifacts(input, indexes);
  const goldValidation = validateGoldDataset(input.gold, input.textUnits);
  const scopes = buildEvaluationScopes(input.gold);

  const diagnostics = aggregateDiagnostics([
    ...artifactValidation.issues,
    ...goldValidation.issues,
  ]);
  if (input.artifacts.limited) {
    diagnostics.push({
      code: "evaluation_scope_limited",
      severity: "info",
      message:
        "The evaluator received a filtered artifact subset; counts and metrics describe that subset only",
      count: 1,
      sampleIds: [],
    });
  }

  const artifactErrors = artifactValidation.issues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const errors = diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .reduce((total, diagnostic) => total + diagnostic.count, 0);
  const warnings = diagnostics
    .filter((diagnostic) => diagnostic.severity === "warning")
    .reduce((total, diagnostic) => total + diagnostic.count, 0);

  const entityMentions = evaluateEntityMentions({
    gold: input.gold,
    validGoldIds: goldValidation.validEntityGoldIds,
    mentions: input.mentions,
    observations: input.observations,
    indexes,
    scopes,
  });
  const relationships = evaluateRelationships({
    gold: input.gold,
    validGoldIds: goldValidation.validRelationshipGoldIds,
    relationships: input.relationships,
    scopes,
  });
  const entityLinks = evaluateEntityLinks({
    gold: input.gold,
    validGoldIds: goldValidation.validLinkGoldIds,
    mentions: input.mentions,
    observations: input.observations,
    confidentClusters: input.confidentClusters,
  });

  const allUnavailable =
    !entityMentions.available && !relationships.available && !entityLinks.available;

  return {
    evaluationVersion: KG_EVALUATION_VERSION,
    status:
      artifactErrors > 0
        ? "invalid_artifacts"
        : allUnavailable
          ? "insufficient_gold_labels"
          : "evaluated",
    ontologyVersions: {
      entity: ENTITY_MENTION_TAXONOMY_VERSION,
      relationship: RELATIONSHIP_TAXONOMY_VERSION,
      link: ENTITY_LINK_TAXONOMY_VERSION,
    },
    scope: {
      documents: input.gold.manifest.documents.length,
      exhaustiveEntityDocuments: input.gold.manifest.documents.filter(
        (document) => document.entityScope === "exhaustive",
      ).length,
      annotatedRelationshipDocuments: input.gold.manifest.documents.filter(
        (document) => document.relationshipScope !== "not_annotated",
      ).length,
      exhaustiveRelationshipDocuments: input.gold.manifest.documents.filter(
        (document) => document.relationshipScope === "exhaustive",
      ).length,
      structuredRows: input.gold.manifest.structuredRows.length,
      exhaustiveEntityRows: input.gold.manifest.structuredRows.filter(
        (row) => row.entityScope === "exhaustive",
      ).length,
      annotatedRelationshipRows: input.gold.manifest.structuredRows.filter(
        (row) => row.relationshipScope !== "not_annotated",
      ).length,
      exhaustiveRelationshipRows: input.gold.manifest.structuredRows.filter(
        (row) => row.relationshipScope === "exhaustive",
      ).length,
      limited: input.artifacts.limited,
    },
    validation: {
      ok: errors === 0,
      errors,
      warnings,
      diagnostics,
      coverage: {
        ...artifactValidation.coverage,
        goldEntitiesChecked: input.gold.entityMentions.length,
        goldRelationshipsChecked: input.gold.relationships.length,
        goldLinkPairsChecked: input.gold.entityLinks.length,
      },
    },
    metrics: {
      entityMentions,
      relationships,
      entityLinks,
    },
    counts: {
      textUnits: input.textUnits.length,
      mentions: input.mentions.length,
      observations: input.observations.length,
      relationships: input.relationships.length,
      confidentClusters: input.confidentClusters.length,
      ambiguousClusters: input.ambiguousClusters.length,
      unresolvedCandidates: input.unresolvedCandidates.length,
      ambiguousByReason: artifactValidation.ambiguousByReason,
      unresolvedByReason: artifactValidation.unresolvedByReason,
      artifactDiagnostics: {
        graph: sortedRecord(Object.entries(input.artifacts.graphDiagnosticsByCode)),
        entities: sortedRecord(Object.entries(input.artifacts.entityDiagnosticsByCode)),
        relationships: sortedRecord(Object.entries(input.artifacts.relationshipDiagnosticsByCode)),
        links: sortedRecord(Object.entries(input.artifacts.linkDiagnosticsByCode)),
      },
    },
    limitations: LIMITATIONS,
  };
}

export function aggregateDiagnostics(
  issues: readonly RawEvaluationIssue[],
): EvaluationDiagnostic[] {
  const byCode = new Map<
    string,
    { severity: EvaluationSeverity; message: string; count: number; samples: Set<string> }
  >();
  for (const issue of issues) {
    const existing = byCode.get(issue.code);
    if (!existing) {
      byCode.set(issue.code, {
        severity: issue.severity,
        message: issue.message,
        count: 1,
        samples: new Set([issue.sampleId]),
      });
      continue;
    }
    existing.count += 1;
    if (severityRank(issue.severity) > severityRank(existing.severity)) {
      existing.severity = issue.severity;
      existing.message = issue.message;
    }
    if (existing.samples.size < 10) existing.samples.add(issue.sampleId);
  }
  return [...byCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, entry]) => ({
      code,
      severity: entry.severity,
      message: entry.message,
      count: entry.count,
      sampleIds: [...entry.samples].sort(),
    }));
}

function severityRank(severity: EvaluationSeverity): number {
  return severity === "error" ? 3 : severity === "warning" ? 2 : 1;
}

export * from "./types";
export {
  parseGoldDatasetManifest,
  parseGoldEntityAnnotation,
  parseGoldLinkAnnotation,
  parseGoldRelationshipAnnotation,
} from "./gold";
export {
  endpointIdentity,
  goldRefIdentity,
  mentionKindIdentity,
  mentionSpanIdentity,
  observationIdentity,
  observationMatchIdentity,
  observationRelaxedKey,
  sha256,
  textSpanIdentity,
  textSpanOnlyIdentity,
} from "./evidence";
export { buildEvaluationIndexes, type EvaluationIndexes } from "./indexes";
export {
  evaluationClusterFrom,
  evaluationMentionFrom,
  evaluationObservationFrom,
  evaluationRelationshipFrom,
  evaluationTextEvidenceFrom,
  evaluationTextUnitFrom,
  evaluationUnresolvedFrom,
} from "./from-artifacts";
export { buildEvaluationScopes, type EvaluationScopes } from "./scope";
export { f1From, linkConfusion, macroMetrics, mean, prf, rate, round } from "./metrics";
