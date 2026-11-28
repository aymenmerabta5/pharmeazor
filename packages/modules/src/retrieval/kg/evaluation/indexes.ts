import {
  mentionKindIdentity,
  mentionSpanIdentity,
  observationMatchIdentity,
  observationRelaxedKey,
} from "./evidence";
import { indexUnitsBySnapshot } from "./gold";
import type { EvaluationMention, EvaluationObservation, EvaluationTextUnit } from "./types";

export interface EvaluationIndexes {
  readonly unitsById: ReadonlyMap<string, EvaluationTextUnit>;
  readonly unitsBySnapshot: ReadonlyMap<string, readonly EvaluationTextUnit[]>;
  readonly mentionsById: ReadonlyMap<string, EvaluationMention>;
  readonly observationsById: ReadonlyMap<string, EvaluationObservation>;
  readonly mentionsByKindKey: ReadonlyMap<string, EvaluationMention>;
  readonly mentionsBySpanKey: ReadonlyMap<string, EvaluationMention>;
  readonly observationsByMatchKey: ReadonlyMap<string, EvaluationObservation>;
  readonly observationsByRelaxedKey: ReadonlyMap<string, EvaluationObservation>;
}

export function buildEvaluationIndexes(
  textUnits: readonly EvaluationTextUnit[],
  mentions: readonly EvaluationMention[],
  observations: readonly EvaluationObservation[],
): EvaluationIndexes {
  const unitsById = new Map<string, EvaluationTextUnit>();
  for (const unit of textUnits) {
    if (!unitsById.has(unit.textUnitId)) unitsById.set(unit.textUnitId, unit);
  }
  const mentionsById = new Map<string, EvaluationMention>();
  const mentionsByKindKey = new Map<string, EvaluationMention>();
  const mentionsBySpanKey = new Map<string, EvaluationMention>();
  for (const mention of mentions) {
    if (!mentionsById.has(mention.mentionId)) mentionsById.set(mention.mentionId, mention);
    const kindKey = mentionKindIdentity(mention);
    if (!mentionsByKindKey.has(kindKey)) mentionsByKindKey.set(kindKey, mention);
    const spanKey = mentionSpanIdentity(mention);
    if (!mentionsBySpanKey.has(spanKey)) mentionsBySpanKey.set(spanKey, mention);
  }
  const observationsById = new Map<string, EvaluationObservation>();
  const observationsByMatchKey = new Map<string, EvaluationObservation>();
  const observationsByRelaxedKey = new Map<string, EvaluationObservation>();
  for (const observation of observations) {
    if (!observationsById.has(observation.observationId)) {
      observationsById.set(observation.observationId, observation);
    }
    const key = observationMatchIdentity(
      observation.evidence,
      observation.candidateKind,
      observation.rawValue,
    );
    if (!observationsByMatchKey.has(key)) observationsByMatchKey.set(key, observation);
    const relaxedKey = observationRelaxedKey(observation);
    if (!observationsByRelaxedKey.has(relaxedKey)) {
      observationsByRelaxedKey.set(relaxedKey, observation);
    }
  }
  return {
    unitsById,
    unitsBySnapshot: indexUnitsBySnapshot(textUnits),
    mentionsById,
    observationsById,
    mentionsByKindKey,
    mentionsBySpanKey,
    observationsByMatchKey,
    observationsByRelaxedKey,
  };
}
