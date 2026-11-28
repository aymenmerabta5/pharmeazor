import {
  endpointIdentity,
  goldRefIdentity,
  mentionKindIdentity,
  observationMatchIdentity,
} from "./evidence";
import { linkConfusion } from "./metrics";
import type {
  EntityLinkEvaluation,
  EvaluationEntityCluster,
  EvaluationMention,
  EvaluationObservation,
  GoldDataset,
  LinkConfusion,
} from "./types";

export function evaluateEntityLinks(input: {
  readonly gold: GoldDataset;
  readonly validGoldIds: ReadonlySet<string>;
  readonly mentions: readonly EvaluationMention[];
  readonly observations: readonly EvaluationObservation[];
  readonly confidentClusters: readonly EvaluationEntityCluster[];
}): EntityLinkEvaluation {
  const annotations = input.gold.entityLinks.filter((annotation) =>
    input.validGoldIds.has(annotation.goldId),
  );
  if (annotations.length === 0) {
    return emptyLinkEvaluation(
      input.gold.entityLinks.length === 0
        ? "no_gold_link_annotations"
        : "no_valid_gold_link_annotations",
      annotations.filter((annotation) => annotation.decision === "same_entity").length,
      annotations.filter((annotation) => annotation.decision === "different_entity").length,
    );
  }

  const endpointIds = resolveEndpointIds(input.mentions, input.observations);
  const confidentClusterByEndpoint = new Map<string, string>();
  for (const cluster of input.confidentClusters) {
    for (const member of cluster.members) {
      const key = endpointIdentity(member);
      if (!confidentClusterByEndpoint.has(key)) {
        confidentClusterByEndpoint.set(key, cluster.candidateClusterId);
      }
    }
  }

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let unresolvedGoldEndpoints = 0;
  const falseMerges: string[] = [];
  const falseSplits: string[] = [];
  const groups = new Map<string, { tp: number; fp: number; fn: number; tn: number }>();
  const groupFor = (group: string) => {
    const existing = groups.get(group) ?? { tp: 0, fp: 0, fn: 0, tn: 0 };
    groups.set(group, existing);
    return existing;
  };

  for (const annotation of annotations) {
    const leftKey = goldRefIdentity(annotation.left);
    const rightKey = goldRefIdentity(annotation.right);
    const leftId = endpointIds.get(leftKey);
    const rightId = endpointIds.get(rightKey);
    if (!leftId) unresolvedGoldEndpoints += 1;
    if (!rightId) unresolvedGoldEndpoints += 1;
    if (!leftId || !rightId) continue;
    const leftCluster = confidentClusterByEndpoint.get(leftKey);
    const rightCluster = confidentClusterByEndpoint.get(rightKey);
    const predictedLinked =
      leftCluster !== undefined && rightCluster !== undefined && leftCluster === rightCluster;
    const entry = groupFor(annotation.group);
    if (annotation.decision === "same_entity") {
      if (predictedLinked) {
        truePositives += 1;
        entry.tp += 1;
      } else {
        falseNegatives += 1;
        entry.fn += 1;
        if (falseSplits.length < 20) falseSplits.push(annotation.goldId);
      }
    } else if (predictedLinked) {
      falsePositives += 1;
      entry.fp += 1;
      if (falseMerges.length < 20) falseMerges.push(annotation.goldId);
    } else {
      trueNegatives += 1;
      entry.tn += 1;
    }
  }

  const byGroup: Record<string, LinkConfusion> = {};
  for (const [group, entry] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    byGroup[group] = linkConfusion(entry.tp, entry.fp, entry.fn, entry.tn);
  }

  return {
    available:
      unresolvedGoldEndpoints === 0 ||
      truePositives + falsePositives + falseNegatives + trueNegatives > 0,
    reason:
      unresolvedGoldEndpoints > 0 &&
      truePositives + falsePositives + falseNegatives + trueNegatives === 0
        ? "gold_link_endpoints_not_extracted"
        : null,
    goldPairs: annotations.length,
    sameEntityPairs: annotations.filter((annotation) => annotation.decision === "same_entity")
      .length,
    differentEntityPairs: annotations.filter(
      (annotation) => annotation.decision === "different_entity",
    ).length,
    unresolvedGoldEndpoints,
    confusion: linkConfusion(truePositives, falsePositives, falseNegatives, trueNegatives),
    falseMerges,
    falseSplits,
    byGroup,
  };
}

function emptyLinkEvaluation(
  reason: string,
  sameEntityPairs: number,
  differentEntityPairs: number,
): EntityLinkEvaluation {
  return {
    available: false,
    reason,
    goldPairs: 0,
    sameEntityPairs,
    differentEntityPairs,
    unresolvedGoldEndpoints: 0,
    confusion: linkConfusion(0, 0, 0, 0),
    falseMerges: [],
    falseSplits: [],
    byGroup: {},
  };
}

function resolveEndpointIds(
  mentions: readonly EvaluationMention[],
  observations: readonly EvaluationObservation[],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const mention of mentions) {
    const key = mentionKindIdentity(mention);
    if (!result.has(key)) result.set(key, mention.mentionId);
  }
  for (const observation of observations) {
    const key = observationMatchIdentity(
      observation.evidence,
      observation.candidateKind,
      observation.rawValue,
    );
    if (!result.has(key)) result.set(key, observation.observationId);
  }
  return result;
}
