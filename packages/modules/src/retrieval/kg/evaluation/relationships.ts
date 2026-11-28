import { endpointIdentity, goldRefIdentity } from "./evidence";
import { macroMetrics, prf } from "./metrics";
import {
  endpointRelationshipScope,
  goldRefRelationshipScope,
  type EvaluationScopes,
} from "./scope";
import type {
  EvaluationRelationship,
  GoldDataset,
  GoldRelationshipAnnotation,
  PrfCounts,
  RelationshipEvaluation,
} from "./types";

export function evaluateRelationships(input: {
  readonly gold: GoldDataset;
  readonly validGoldIds: ReadonlySet<string>;
  readonly relationships: readonly EvaluationRelationship[];
  readonly scopes: EvaluationScopes;
}): RelationshipEvaluation {
  const annotations = input.gold.relationships.filter((annotation) =>
    input.validGoldIds.has(annotation.goldId),
  );
  const predictionsInPrecisionScope = input.relationships.filter((relationship) =>
    isPrecisionScope(relationship, input.scopes),
  ).length;
  if (annotations.length === 0) {
    return {
      available: false,
      reason:
        input.gold.relationships.length === 0
          ? "no_gold_relationship_annotations"
          : "no_valid_gold_relationship_annotations",
      goldAnnotations: 0,
      predictionsInPrecisionScope,
      strict: prf(0, 0, 0),
      macro: macroMetrics([]),
      byKind: {},
    };
  }

  const predictedByKey = new Map<string, EvaluationRelationship>();
  for (const relationship of input.relationships) {
    const key = relationshipKey(relationship);
    if (!predictedByKey.has(key)) predictedByKey.set(key, relationship);
  }

  const matched = new Set<string>();
  let truePositives = 0;
  let falseNegatives = 0;
  for (const annotation of annotations) {
    if (!isGoldAnnotated(annotation, input.scopes)) continue;
    const key = goldRelationshipKey(annotation);
    const relationship = predictedByKey.get(key);
    if (!relationship) {
      falseNegatives += 1;
      continue;
    }
    truePositives += 1;
    matched.add(relationship.relationshipId);
  }
  let falsePositives = 0;
  for (const relationship of input.relationships) {
    if (!isPrecisionScope(relationship, input.scopes)) continue;
    if (!matched.has(relationship.relationshipId)) falsePositives += 1;
  }

  const kindCounts = relationshipKindCounts(annotations, input, predictedByKey);
  const byKind: Record<string, PrfCounts> = {};
  for (const [kind, counts] of Object.entries(kindCounts).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    byKind[kind] = prf(counts.truePositives, counts.falsePositives, counts.falseNegatives);
  }

  return {
    available: true,
    reason: null,
    goldAnnotations: annotations.length,
    predictionsInPrecisionScope,
    strict: prf(truePositives, falsePositives, falseNegatives),
    macro: macroMetrics(Object.values(byKind)),
    byKind,
  };
}

function relationshipKindCounts(
  annotations: readonly GoldRelationshipAnnotation[],
  input: Parameters<typeof evaluateRelationships>[0],
  predictedByKey: ReadonlyMap<string, EvaluationRelationship>,
): Readonly<Record<string, Counts>> {
  const counts = new Map<string, { tp: number; fp: number; fn: number }>();
  const kindFor = (kind: string) => {
    const existing = counts.get(kind) ?? { tp: 0, fp: 0, fn: 0 };
    counts.set(kind, existing);
    return existing;
  };
  const matched = new Set<string>();
  for (const annotation of annotations) {
    kindFor(annotation.relationshipKind);
    if (!isGoldAnnotated(annotation, input.scopes)) continue;
    const relationship = predictedByKey.get(goldRelationshipKey(annotation));
    if (relationship) {
      matched.add(relationship.relationshipId);
      kindFor(annotation.relationshipKind).tp += 1;
    } else {
      kindFor(annotation.relationshipKind).fn += 1;
    }
  }
  for (const relationship of input.relationships) {
    if (!isPrecisionScope(relationship, input.scopes)) continue;
    const entry = kindFor(relationship.relationshipKind);
    if (!matched.has(relationship.relationshipId)) entry.fp += 1;
  }
  return Object.fromEntries(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, entry]) => [
        kind,
        {
          truePositives: entry.tp,
          falsePositives: entry.fp,
          falseNegatives: entry.fn,
        },
      ]),
  );
}

interface Counts {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
}

export function relationshipKey(relationship: EvaluationRelationship): string {
  return [
    relationship.relationshipKind,
    endpointIdentity(relationship.subject),
    endpointIdentity(relationship.object),
  ].join("||");
}

export function goldRelationshipKey(annotation: GoldRelationshipAnnotation): string {
  return [
    annotation.relationshipKind,
    goldRefIdentity(annotation.subject),
    goldRefIdentity(annotation.object),
  ].join("||");
}

function isPrecisionScope(relationship: EvaluationRelationship, scopes: EvaluationScopes): boolean {
  return (
    endpointRelationshipScope(scopes, relationship.subject.evidence) === "exhaustive" &&
    endpointRelationshipScope(scopes, relationship.object.evidence) === "exhaustive"
  );
}

function isGoldAnnotated(
  annotation: GoldRelationshipAnnotation,
  scopes: EvaluationScopes,
): boolean {
  return (
    goldRefRelationshipScope(scopes, annotation.subject) !== "not_annotated" &&
    goldRefRelationshipScope(scopes, annotation.object) !== "not_annotated"
  );
}
