import { goldRefIdentity, textSpanOnlyIdentity } from "./evidence";
import type { EvaluationIndexes } from "./indexes";
import { macroMetrics, prf } from "./metrics";
import {
  documentEntityScope,
  goldRefEntityScope,
  observationEntityScope,
  type EvaluationScopes,
} from "./scope";
import type {
  EntityEvaluation,
  EvaluationMention,
  EvaluationObservation,
  GoldDataset,
  GoldEntityAnnotation,
  PrfCounts,
} from "./types";

interface KindCounts {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
}

export function evaluateEntityMentions(input: {
  readonly gold: GoldDataset;
  readonly validGoldIds: ReadonlySet<string>;
  readonly mentions: readonly EvaluationMention[];
  readonly observations: readonly EvaluationObservation[];
  readonly indexes: EvaluationIndexes;
  readonly scopes: EvaluationScopes;
}): EntityEvaluation {
  const annotations = input.gold.entityMentions.filter((annotation) =>
    input.validGoldIds.has(annotation.goldId),
  );
  const predictionsInPrecisionScope = countPrecisionScope(
    input.mentions,
    input.observations,
    input.scopes,
  );
  if (annotations.length === 0) {
    return {
      available: false,
      reason:
        input.gold.entityMentions.length === 0
          ? "no_gold_entity_annotations"
          : "no_valid_gold_entity_annotations",
      goldAnnotations: 0,
      predictionsInPrecisionScope,
      strict: prf(0, 0, 0),
      relaxedSpan: { ...prf(0, 0, 0), typeMismatches: 0 },
      macro: macroMetrics([]),
      byKind: {},
    };
  }

  const strict = strictCounts(annotations, input);
  const relaxed = relaxedCounts(annotations, input);
  const byKind = kindCounts(annotations, input);
  const byKindMetrics: Record<string, PrfCounts> = {};
  for (const [kind, counts] of Object.entries(byKind).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    byKindMetrics[kind] = prf(counts.truePositives, counts.falsePositives, counts.falseNegatives);
  }
  return {
    available: true,
    reason: null,
    goldAnnotations: annotations.length,
    predictionsInPrecisionScope,
    strict: prf(strict.truePositives, strict.falsePositives, strict.falseNegatives),
    relaxedSpan: {
      ...prf(
        relaxed.counts.truePositives,
        relaxed.counts.falsePositives,
        relaxed.counts.falseNegatives,
      ),
      typeMismatches: relaxed.typeMismatches,
    },
    macro: macroMetrics(Object.values(byKindMetrics)),
    byKind: byKindMetrics,
  };
}

function strictCounts(
  annotations: readonly GoldEntityAnnotation[],
  input: Parameters<typeof evaluateEntityMentions>[0],
): KindCounts {
  let truePositives = 0;
  let falseNegatives = 0;
  const matched = new Set<string>();
  for (const annotation of annotations) {
    if (!isAnnotated(input.scopes, annotation)) continue;
    const prediction = predictionFor(annotation, input.indexes);
    if (!prediction) {
      falseNegatives += 1;
      continue;
    }
    truePositives += 1;
    matched.add(prediction);
  }
  let falsePositives = 0;
  for (const mention of input.mentions) {
    if (documentEntityScope(input.scopes, mention.evidence.documentSnapshotId) !== "exhaustive") {
      continue;
    }
    if (!matched.has(`m:${mention.mentionId}`)) falsePositives += 1;
  }
  for (const observation of input.observations) {
    if (observation.evidence.kind !== "structured_record") continue;
    if (observationEntityScope(input.scopes, observation) !== "exhaustive") continue;
    if (!matched.has(`o:${observation.observationId}`)) falsePositives += 1;
  }
  return { truePositives, falsePositives, falseNegatives };
}

function relaxedCounts(
  annotations: readonly GoldEntityAnnotation[],
  input: Parameters<typeof evaluateEntityMentions>[0],
): { readonly counts: KindCounts; readonly typeMismatches: number } {
  let truePositives = 0;
  let falseNegatives = 0;
  let typeMismatches = 0;
  const matched = new Set<string>();
  for (const annotation of annotations) {
    if (!isAnnotated(input.scopes, annotation)) continue;
    if (annotation.entity.kind === "text_span") {
      const spanKey = textSpanOnlyIdentity(
        annotation.entity.documentSnapshotId,
        annotation.entity.documentStart,
        annotation.entity.documentEnd,
      );
      const mention = input.indexes.mentionsBySpanKey.get(spanKey);
      if (!mention) {
        falseNegatives += 1;
        continue;
      }
      truePositives += 1;
      if (mention.candidateKind !== annotation.entity.candidateKind) typeMismatches += 1;
      matched.add(`m:${mention.mentionId}`);
      continue;
    }
    if (annotation.entity.kind === "metadata") continue;
    const ref = annotation.entity;
    const relaxedKey = ["s", ref.sourceId, ref.path, String(ref.rowNumber), ref.rawValue].join("|");
    const observation = input.indexes.observationsByRelaxedKey.get(relaxedKey);
    if (!observation) {
      falseNegatives += 1;
      continue;
    }
    truePositives += 1;
    if (observation.candidateKind !== annotation.entity.candidateKind) typeMismatches += 1;
    matched.add(`o:${observation.observationId}`);
  }
  let falsePositives = 0;
  for (const mention of input.mentions) {
    if (documentEntityScope(input.scopes, mention.evidence.documentSnapshotId) !== "exhaustive") {
      continue;
    }
    if (!matched.has(`m:${mention.mentionId}`)) falsePositives += 1;
  }
  for (const observation of input.observations) {
    if (observation.evidence.kind !== "structured_record") continue;
    if (observationEntityScope(input.scopes, observation) !== "exhaustive") continue;
    if (!matched.has(`o:${observation.observationId}`)) falsePositives += 1;
  }
  return {
    counts: { truePositives, falsePositives, falseNegatives },
    typeMismatches,
  };
}

function kindCounts(
  annotations: readonly GoldEntityAnnotation[],
  input: Parameters<typeof evaluateEntityMentions>[0],
): Readonly<Record<string, KindCounts>> {
  const counts = new Map<string, { tp: number; fp: number; fn: number }>();
  const kindFor = (kind: string) => {
    const existing = counts.get(kind) ?? { tp: 0, fp: 0, fn: 0 };
    counts.set(kind, existing);
    return existing;
  };
  const matched = new Set<string>();
  for (const annotation of annotations) {
    kindFor(annotation.entity.candidateKind);
    if (!isAnnotated(input.scopes, annotation)) continue;
    const prediction = predictionFor(annotation, input.indexes);
    if (prediction) {
      matched.add(prediction);
      kindFor(annotation.entity.candidateKind).tp += 1;
    } else {
      kindFor(annotation.entity.candidateKind).fn += 1;
    }
  }
  for (const mention of input.mentions) {
    if (documentEntityScope(input.scopes, mention.evidence.documentSnapshotId) !== "exhaustive") {
      continue;
    }
    const entry = kindFor(mention.candidateKind);
    if (!matched.has(`m:${mention.mentionId}`)) entry.fp += 1;
  }
  for (const observation of input.observations) {
    if (observation.evidence.kind !== "structured_record") continue;
    if (observationEntityScope(input.scopes, observation) !== "exhaustive") continue;
    const entry = kindFor(observation.candidateKind);
    if (!matched.has(`o:${observation.observationId}`)) entry.fp += 1;
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

function predictionFor(
  annotation: GoldEntityAnnotation,
  indexes: EvaluationIndexes,
): string | null {
  if (annotation.entity.kind === "text_span") {
    const mention = indexes.mentionsByKindKey.get(goldRefIdentity(annotation.entity));
    return mention ? `m:${mention.mentionId}` : null;
  }
  if (annotation.entity.kind === "metadata") return null;
  const observation = indexes.observationsByMatchKey.get(goldRefIdentity(annotation.entity));
  return observation ? `o:${observation.observationId}` : null;
}

function isAnnotated(scopes: EvaluationScopes, annotation: GoldEntityAnnotation): boolean {
  return goldRefEntityScope(scopes, annotation.entity) !== "not_annotated";
}

function countPrecisionScope(
  mentions: readonly EvaluationMention[],
  observations: readonly EvaluationObservation[],
  scopes: EvaluationScopes,
): number {
  let count = 0;
  for (const mention of mentions) {
    if (documentEntityScope(scopes, mention.evidence.documentSnapshotId) === "exhaustive") {
      count += 1;
    }
  }
  for (const observation of observations) {
    if (observation.evidence.kind !== "structured_record") continue;
    if (observationEntityScope(scopes, observation) === "exhaustive") count += 1;
  }
  return count;
}
