import { linkGroupForKind } from "../extraction/entity-link-kinds";
import { ENTITY_LINK_TAXONOMY_VERSION } from "../extraction/entity-link-kinds";
import {
  ENTITY_MENTION_TAXONOMY_VERSION,
  MENTION_KIND_DEFINITIONS,
} from "../extraction/mention-kinds";
import {
  RELATIONSHIP_TAXONOMY_VERSION,
  RELATIONSHIP_KIND_DEFINITIONS,
} from "../extraction/relationship-kinds";
import {
  endpointIdentity,
  evidenceIsText,
  mentionKindIdentity,
  observationEvidenceIdentity,
  observationIdentity,
  observationMatchIdentity,
  validateEndpointEvidence,
  validateDocumentProvenance,
  validateObservationEvidence,
  validateTextEvidence,
  validateUnit,
} from "./evidence";
import type { EvaluationIndexes } from "./indexes";
import type {
  EvaluationEntityCluster,
  EvaluationLinkEndpoint,
  EvaluationMention,
  EvaluationObservation,
  EvaluationRelationship,
  EvaluationTextEvidence,
  EvaluationTextUnit,
  KnowledgeGraphEvaluationInput,
  RawEvaluationIssue,
} from "./types";

const MAX_TEXT_SUPPORT_CHARS = 2000;
const MENTION_FAMILY = new Map<string, string>(
  MENTION_KIND_DEFINITIONS.map((definition) => [definition.candidateKind, definition.family]),
);
const RELATIONSHIP_DEFINITION = new Map(
  RELATIONSHIP_KIND_DEFINITIONS.map((definition) => [definition.relationshipKind, definition]),
);

export interface ArtifactCoverage {
  readonly textUnits: number;
  readonly mentions: number;
  readonly observations: number;
  readonly relationships: number;
  readonly confidentClusters: number;
  readonly ambiguousClusters: number;
  readonly unresolvedCandidates: number;
  readonly mentionQuotesValidated: number;
  readonly mentionSpansValidated: number;
  readonly observationEvidenceChecked: number;
  readonly relationshipSupportsValidated: number;
  readonly linkEndpointsChecked: number;
}

export interface ArtifactValidation {
  readonly issues: readonly RawEvaluationIssue[];
  readonly coverage: ArtifactCoverage;
  readonly ambiguousByReason: Readonly<Record<string, number>>;
  readonly unresolvedByReason: Readonly<Record<string, number>>;
}

export function validateArtifacts(
  input: KnowledgeGraphEvaluationInput,
  indexes: EvaluationIndexes,
): ArtifactValidation {
  const issues: RawEvaluationIssue[] = [];
  const units = new Map<string, EvaluationTextUnit>();
  for (const unit of input.textUnits) {
    if (units.has(unit.textUnitId)) {
      issues.push(
        issue(
          "text_unit_id_duplicate",
          "error",
          `Text unit ${unit.textUnitId} appears more than once`,
          unit.textUnitId,
        ),
      );
      continue;
    }
    units.set(unit.textUnitId, unit);
    issues.push(...validateUnit(unit));
  }

  const mentionIds = new Set<string>();
  const mentionKindKeys = new Map<string, EvaluationMention>();
  let mentionQuotesValidated = 0;
  for (const mention of input.mentions) {
    if (mentionIds.has(mention.mentionId)) {
      issues.push(
        issue(
          "mention_id_duplicate",
          "error",
          `Mention ${mention.mentionId} appears more than once`,
          mention.mentionId,
        ),
      );
    }
    mentionIds.add(mention.mentionId);
    const unit = units.get(mention.evidence.textUnitId);
    if (unit) mentionQuotesValidated += 1;
    issues.push(...validateTextEvidence(mention.evidence, unit, mention.mentionId));
    if (unit) {
      issues.push(...validateDocumentProvenance(mention.document, unit, mention.mentionId));
    }
    if (mention.ontologyVersion !== ENTITY_MENTION_TAXONOMY_VERSION) {
      issues.push(
        issue(
          "mention_ontology_version_mismatch",
          "error",
          `Mention ${mention.mentionId} declares an unsupported ontology version`,
          mention.mentionId,
        ),
      );
    }
    const expectedFamily = MENTION_FAMILY.get(mention.candidateKind);
    if (!expectedFamily) {
      issues.push(
        issue(
          "mention_kind_unknown",
          "error",
          `Mention ${mention.mentionId} uses unknown kind ${mention.candidateKind}`,
          mention.mentionId,
        ),
      );
    } else if (mention.family !== expectedFamily) {
      issues.push(
        issue(
          "mention_family_mismatch",
          "error",
          `Mention ${mention.mentionId} family ${mention.family} does not match ${expectedFamily}`,
          mention.mentionId,
        ),
      );
    }
    if (!mention.surfaceText.trim() || !mention.normalizedSurface.trim()) {
      issues.push(
        issue(
          "mention_surface_empty",
          "error",
          `Mention ${mention.mentionId} has an empty surface`,
          mention.mentionId,
        ),
      );
    }
    const kindKey = mentionKindIdentity(mention);
    const existing = mentionKindKeys.get(kindKey);
    if (existing) {
      const code =
        existing.normalizedSurface === mention.normalizedSurface
          ? "mention_duplicate"
          : "mention_span_kind_conflict";
      issues.push(
        issue(
          code,
          code === "mention_duplicate" ? "error" : "warning",
          `Mention ${mention.mentionId} shares a span and kind with ${existing.mentionId}`,
          mention.mentionId,
        ),
      );
    } else {
      mentionKindKeys.set(kindKey, mention);
    }
  }

  const observationIds = new Set<string>();
  const observationIdentities = new Map<string, EvaluationObservation>();
  const observationMatchKeys = new Map<string, EvaluationObservation>();
  for (const observation of input.observations) {
    if (observationIds.has(observation.observationId)) {
      issues.push(
        issue(
          "observation_id_duplicate",
          "error",
          `Observation ${observation.observationId} appears more than once`,
          observation.observationId,
        ),
      );
    }
    observationIds.add(observation.observationId);
    issues.push(...validateObservationEvidence(observation.evidence, observation.observationId));
    if (observation.ontologyVersion !== ENTITY_MENTION_TAXONOMY_VERSION) {
      issues.push(
        issue(
          "observation_ontology_version_mismatch",
          "error",
          `Observation ${observation.observationId} declares an unsupported ontology version`,
          observation.observationId,
        ),
      );
    }
    const expectedFamily = MENTION_FAMILY.get(observation.candidateKind);
    if (!expectedFamily) {
      issues.push(
        issue(
          "observation_kind_unknown",
          "error",
          `Observation ${observation.observationId} uses unknown kind ${observation.candidateKind}`,
          observation.observationId,
        ),
      );
    } else if (observation.family !== expectedFamily) {
      issues.push(
        issue(
          "observation_family_mismatch",
          "error",
          `Observation ${observation.observationId} family ${observation.family} does not match ${expectedFamily}`,
          observation.observationId,
        ),
      );
    }
    if (!observation.rawValue.trim() || !observation.normalizedValue.trim()) {
      issues.push(
        issue(
          "observation_value_empty",
          "error",
          `Observation ${observation.observationId} has an empty value`,
          observation.observationId,
        ),
      );
    }
    const identity = observationIdentity(observation);
    if (observationIdentities.has(identity)) {
      issues.push(
        issue(
          "observation_duplicate",
          "error",
          `Observation ${observation.observationId} duplicates another observation`,
          observation.observationId,
        ),
      );
    } else {
      observationIdentities.set(identity, observation);
    }
    const matchKey = observationMatchIdentity(
      observation.evidence,
      observation.candidateKind,
      observation.rawValue,
    );
    if (observationMatchKeys.has(matchKey)) {
      issues.push(
        issue(
          "observation_match_key_duplicate",
          "warning",
          `Observation ${observation.observationId} shares a match key with another observation`,
          observation.observationId,
        ),
      );
    } else {
      observationMatchKeys.set(matchKey, observation);
    }
  }

  const relationshipIds = new Set<string>();
  const relationshipIdentities = new Map<string, EvaluationRelationship>();
  let relationshipSupportsValidated = 0;
  for (const relationship of input.relationships) {
    if (relationshipIds.has(relationship.relationshipId)) {
      issues.push(
        issue(
          "relationship_id_duplicate",
          "error",
          `Relationship ${relationship.relationshipId} appears more than once`,
          relationship.relationshipId,
        ),
      );
    }
    relationshipIds.add(relationship.relationshipId);
    if (relationship.ontologyVersion !== RELATIONSHIP_TAXONOMY_VERSION) {
      issues.push(
        issue(
          "relationship_ontology_version_mismatch",
          "error",
          `Relationship ${relationship.relationshipId} declares an unsupported ontology version`,
          relationship.relationshipId,
        ),
      );
    }
    const definition = RELATIONSHIP_DEFINITION.get(relationship.relationshipKind);
    if (!definition) {
      issues.push(
        issue(
          "relationship_kind_unknown",
          "error",
          `Relationship ${relationship.relationshipId} uses unknown kind ${relationship.relationshipKind}`,
          relationship.relationshipId,
        ),
      );
    } else {
      if (relationship.family !== definition.family) {
        issues.push(
          issue(
            "relationship_family_mismatch",
            "error",
            `Relationship ${relationship.relationshipId} family does not match the taxonomy`,
            relationship.relationshipId,
          ),
        );
      }
      if (!definition.subjectKinds.includes(relationship.subject.candidateKind as never)) {
        issues.push(
          issue(
            "relationship_subject_kind_invalid",
            "error",
            `Relationship ${relationship.relationshipId} has an invalid subject kind`,
            relationship.relationshipId,
          ),
        );
      }
      if (!definition.objectKinds.includes(relationship.object.candidateKind as never)) {
        issues.push(
          issue(
            "relationship_object_kind_invalid",
            "error",
            `Relationship ${relationship.relationshipId} has an invalid object kind`,
            relationship.relationshipId,
          ),
        );
      }
      const mode = relationship.method.startsWith("structured") ? "structured_row" : "text";
      if (!definition.modes.includes(mode)) {
        issues.push(
          issue(
            "relationship_method_not_allowed",
            "error",
            `Relationship ${relationship.relationshipId} uses a method the taxonomy does not allow`,
            relationship.relationshipId,
          ),
        );
      }
    }
    validateRelationshipEndpoint(relationship, "subject", indexes, issues);
    validateRelationshipEndpoint(relationship, "object", indexes, issues);
    if (
      relationship.subject.endpointId === relationship.object.endpointId ||
      relationship.subject.normalizedLabel === relationship.object.normalizedLabel
    ) {
      issues.push(
        issue(
          "relationship_self_reference",
          "error",
          `Relationship ${relationship.relationshipId} uses the same endpoint twice`,
          relationship.relationshipId,
        ),
      );
    }
    if (
      relationship.subject.evidence.kind === "text_span" &&
      relationship.object.evidence.kind === "text_span" &&
      spansOverlap(relationship.subject.evidence, relationship.object.evidence)
    ) {
      issues.push(
        issue(
          "relationship_endpoint_overlap",
          "error",
          `Relationship ${relationship.relationshipId} endpoints overlap in the source text`,
          relationship.relationshipId,
        ),
      );
    }
    const identity = [
      relationship.relationshipKind,
      endpointIdentity(relationship.subject),
      endpointIdentity(relationship.object),
    ].join("||");
    if (relationshipIdentities.has(identity)) {
      issues.push(
        issue(
          "relationship_duplicate",
          "error",
          `Relationship ${relationship.relationshipId} duplicates another candidate`,
          relationship.relationshipId,
        ),
      );
    } else {
      relationshipIdentities.set(identity, relationship);
    }
    if (validateRelationshipSupport(relationship, indexes, issues)) {
      relationshipSupportsValidated += 1;
    }
    if (relationship.observationState !== "quarantined") {
      issues.push(
        issue(
          "relationship_state_not_quarantined",
          "error",
          `Relationship ${relationship.relationshipId} is not quarantined`,
          relationship.relationshipId,
        ),
      );
    }
  }

  const clusterIds = new Set<string>();
  const endpointOwners = new Map<string, string>();
  const confidentIdentityKeys = new Map<string, string>();
  const ambiguousByReason: Record<string, number> = {};
  let linkEndpointsChecked = 0;
  const clusters = [
    ...input.confidentClusters.map((cluster) => ({ cluster, expected: "confident" as const })),
    ...input.ambiguousClusters.map((cluster) => ({ cluster, expected: "ambiguous" as const })),
  ];
  for (const { cluster, expected } of clusters) {
    if (clusterIds.has(cluster.candidateClusterId)) {
      issues.push(
        issue(
          "link_cluster_id_duplicate",
          "error",
          `Cluster ${cluster.candidateClusterId} appears more than once`,
          cluster.candidateClusterId,
        ),
      );
    }
    clusterIds.add(cluster.candidateClusterId);
    issues.push(
      ...validateCluster(cluster, expected, indexes, endpointOwners, confidentIdentityKeys),
    );
    linkEndpointsChecked += cluster.members.length;
    if (cluster.status === "ambiguous") {
      const reason = cluster.reason ?? "unspecified";
      ambiguousByReason[reason] = (ambiguousByReason[reason] ?? 0) + 1;
    }
  }

  const unresolvedByReason: Record<string, number> = {};
  const unresolvedIds = new Set<string>();
  for (const candidate of input.unresolvedCandidates) {
    if (unresolvedIds.has(candidate.unresolvedId)) {
      issues.push(
        issue(
          "link_unresolved_id_duplicate",
          "error",
          `Unresolved candidate ${candidate.unresolvedId} appears more than once`,
          candidate.unresolvedId,
        ),
      );
    }
    unresolvedIds.add(candidate.unresolvedId);
    if (candidate.ontologyVersion !== ENTITY_LINK_TAXONOMY_VERSION) {
      issues.push(
        issue(
          "link_unresolved_ontology_version_mismatch",
          "error",
          `Unresolved candidate ${candidate.unresolvedId} declares an unsupported ontology version`,
          candidate.unresolvedId,
        ),
      );
    }
    if (!candidate.reason.trim()) {
      issues.push(
        issue(
          "link_unresolved_reason_missing",
          "error",
          `Unresolved candidate ${candidate.unresolvedId} has no reason`,
          candidate.unresolvedId,
        ),
      );
    }
    const reason = candidate.reason || "unspecified";
    unresolvedByReason[reason] = (unresolvedByReason[reason] ?? 0) + 1;
    collectLinkEndpoint(
      candidate.endpoint,
      candidate.unresolvedId,
      "unresolved",
      indexes,
      endpointOwners,
      issues,
    );
    linkEndpointsChecked += 1;
    const definition = linkGroupForKind(candidate.endpoint.candidateKind);
    if (!definition) {
      issues.push(
        issue(
          "link_endpoint_kind_not_linkable",
          "error",
          `Unresolved candidate ${candidate.unresolvedId} uses a non-linkable kind`,
          candidate.unresolvedId,
        ),
      );
    } else if (definition.group !== candidate.group) {
      issues.push(
        issue(
          "link_group_mismatch",
          "error",
          `Unresolved candidate ${candidate.unresolvedId} group does not match its endpoint kind`,
          candidate.unresolvedId,
        ),
      );
    }
    for (const key of candidate.identifierKeys) {
      const owner = confidentIdentityKeys.get(key);
      if (owner && owner !== candidate.unresolvedId) {
        issues.push(
          issue(
            "link_unresolved_identity_overlap",
            "warning",
            `Unresolved candidate ${candidate.unresolvedId} shares identity key ${key} with cluster ${owner}`,
            candidate.unresolvedId,
          ),
        );
        break;
      }
    }
  }

  return {
    issues,
    coverage: {
      textUnits: units.size,
      mentions: input.mentions.length,
      observations: input.observations.length,
      relationships: input.relationships.length,
      confidentClusters: input.confidentClusters.length,
      ambiguousClusters: input.ambiguousClusters.length,
      unresolvedCandidates: input.unresolvedCandidates.length,
      mentionQuotesValidated,
      mentionSpansValidated: input.mentions.length,
      observationEvidenceChecked: input.observations.length,
      relationshipSupportsValidated,
      linkEndpointsChecked,
    },
    ambiguousByReason: sortCounts(ambiguousByReason),
    unresolvedByReason: sortCounts(unresolvedByReason),
  };
}

function validateCluster(
  cluster: EvaluationEntityCluster,
  expectedStatus: "confident" | "ambiguous",
  indexes: EvaluationIndexes,
  endpointOwners: Map<string, string>,
  confidentIdentityKeys: Map<string, string>,
): RawEvaluationIssue[] {
  const local: RawEvaluationIssue[] = [];
  if (cluster.status !== expectedStatus) {
    local.push(
      issue(
        "link_cluster_status_mismatch",
        "error",
        `Cluster ${cluster.candidateClusterId} is stored under ${expectedStatus} but declares ${cluster.status}`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (cluster.ontologyVersion !== ENTITY_LINK_TAXONOMY_VERSION) {
    local.push(
      issue(
        "link_cluster_ontology_version_mismatch",
        "error",
        `Cluster ${cluster.candidateClusterId} declares an unsupported ontology version`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (cluster.status === "confident" && cluster.memberCount < 2) {
    local.push(
      issue(
        "link_confident_singleton",
        "error",
        `Confident cluster ${cluster.candidateClusterId} has fewer than two members`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (cluster.members.length > cluster.memberCount) {
    local.push(
      issue(
        "link_member_count_invalid",
        "error",
        `Cluster ${cluster.candidateClusterId} contains more evidence members than its member count`,
        cluster.candidateClusterId,
      ),
    );
  } else if (!cluster.membersTruncated && cluster.members.length !== cluster.memberCount) {
    local.push(
      issue(
        "link_member_count_invalid",
        "error",
        `Cluster ${cluster.candidateClusterId} member count does not match its evidence members`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (cluster.membersTruncated && cluster.memberCount <= cluster.members.length) {
    local.push(
      issue(
        "link_member_truncation_invalid",
        "error",
        `Cluster ${cluster.candidateClusterId} reports truncation without dropping members`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (!cluster.preferredLabel.trim()) {
    local.push(
      issue(
        "link_preferred_label_empty",
        "error",
        `Cluster ${cluster.candidateClusterId} has no preferred label`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (cluster.aliasCount < cluster.aliases.length) {
    local.push(
      issue(
        "link_alias_count_invalid",
        "error",
        `Cluster ${cluster.candidateClusterId} alias count is smaller than its alias list`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (new Set(cluster.aliases).size !== cluster.aliases.length) {
    local.push(
      issue(
        "link_alias_duplicate",
        "warning",
        `Cluster ${cluster.candidateClusterId} repeats an alias`,
        cluster.candidateClusterId,
      ),
    );
  }
  if (cluster.status === "confident" && cluster.conflicts.length > 0) {
    local.push(
      issue(
        "link_confident_with_conflicts",
        "error",
        `Confident cluster ${cluster.candidateClusterId} carries context conflicts`,
        cluster.candidateClusterId,
      ),
    );
  }
  const expectedDuplicateState =
    cluster.status === "confident" ? "deduplicated" : "possible_duplicate";
  if (cluster.duplicateState !== expectedDuplicateState) {
    local.push(
      issue(
        "link_duplicate_state_mismatch",
        "error",
        `Cluster ${cluster.candidateClusterId} duplicate state does not match its status`,
        cluster.candidateClusterId,
      ),
    );
  }
  for (const member of cluster.members) {
    collectLinkEndpoint(
      member,
      cluster.candidateClusterId,
      cluster.status,
      indexes,
      endpointOwners,
      local,
    );
    const definition = linkGroupForKind(member.candidateKind);
    if (!definition) {
      local.push(
        issue(
          "link_endpoint_kind_not_linkable",
          "error",
          `Cluster ${cluster.candidateClusterId} contains non-linkable kind ${member.candidateKind}`,
          cluster.candidateClusterId,
        ),
      );
    } else if (definition.group !== cluster.group) {
      local.push(
        issue(
          "link_group_mismatch",
          "error",
          `Cluster ${cluster.candidateClusterId} group does not match member kind ${member.candidateKind}`,
          cluster.candidateClusterId,
        ),
      );
    }
  }
  if (cluster.status === "confident") {
    for (const entry of cluster.identityKeys) {
      if (!entry.key.trim() || entry.count <= 0) {
        local.push(
          issue(
            "link_identity_key_invalid",
            "error",
            `Cluster ${cluster.candidateClusterId} has an invalid identity key`,
            cluster.candidateClusterId,
          ),
        );
        continue;
      }
      const owner = confidentIdentityKeys.get(entry.key);
      if (owner && owner !== cluster.candidateClusterId) {
        local.push(
          issue(
            "link_identity_key_split",
            "error",
            `Confident clusters ${owner} and ${cluster.candidateClusterId} share identity key ${entry.key}`,
            cluster.candidateClusterId,
          ),
        );
      } else if (!owner) {
        confidentIdentityKeys.set(entry.key, cluster.candidateClusterId);
      }
    }
  }
  return local;
}

function collectLinkEndpoint(
  endpoint: EvaluationLinkEndpoint,
  owner: string,
  status: string,
  indexes: EvaluationIndexes,
  endpointOwners: Map<string, string>,
  issues: RawEvaluationIssue[],
): void {
  issues.push(
    ...validateEndpointEvidence(
      endpoint,
      indexes.unitsById.get(
        endpoint.evidence.kind === "text_span" ? endpoint.evidence.textUnitId : "",
      ),
      endpoint.endpointId,
    ),
  );
  const key = endpointIdentity(endpoint);
  const existing = endpointOwners.get(key);
  if (existing) {
    issues.push(
      issue(
        "link_endpoint_duplicate",
        "error",
        `Link endpoint ${endpoint.endpointId} in ${owner} already appears in ${existing}`,
        endpoint.endpointId,
      ),
    );
  } else {
    endpointOwners.set(key, `${status}:${owner}`);
  }
  const record = resolveLinkEndpoint(endpoint, indexes, owner, issues);
  if (!record) return;
  const expectedLabel = evidenceIsText(endpoint.evidence)
    ? (record as EvaluationMention).surfaceText
    : (record as EvaluationObservation).rawValue;
  const expectedNormalized = evidenceIsText(endpoint.evidence)
    ? (record as EvaluationMention).normalizedSurface
    : (record as EvaluationObservation).normalizedValue;
  if (endpoint.label !== expectedLabel || endpoint.normalizedLabel !== expectedNormalized) {
    issues.push(
      issue(
        "link_endpoint_value_mismatch",
        "error",
        `Link endpoint ${endpoint.endpointId} in ${owner} does not match the source value`,
        endpoint.endpointId,
      ),
    );
  }
}

function resolveLinkEndpoint(
  endpoint: EvaluationLinkEndpoint,
  indexes: EvaluationIndexes,
  owner: string,
  issues: RawEvaluationIssue[],
): EvaluationMention | EvaluationObservation | null {
  if (endpoint.endpointKind === "mention") {
    if (endpoint.evidence.kind !== "text_span") {
      issues.push(
        issue(
          "link_endpoint_evidence_kind_invalid",
          "error",
          `Mention endpoint ${endpoint.endpointId} in ${owner} has non-text evidence`,
          endpoint.endpointId,
        ),
      );
      return null;
    }
    const mention = indexes.mentionsById.get(endpoint.endpointId);
    if (!mention) {
      issues.push(
        issue(
          "link_endpoint_missing",
          "error",
          `Link endpoint ${endpoint.endpointId} in ${owner} has no source mention`,
          endpoint.endpointId,
        ),
      );
      return null;
    }
    if (!sameTextEvidence(endpoint.evidence, mention.evidence)) {
      issues.push(
        issue(
          "link_endpoint_evidence_mismatch",
          "error",
          `Link endpoint ${endpoint.endpointId} in ${owner} does not match its mention evidence`,
          endpoint.endpointId,
        ),
      );
    }
    return mention;
  }
  if (endpoint.evidence.kind === "text_span") {
    issues.push(
      issue(
        "link_endpoint_evidence_kind_invalid",
        "error",
        `Observation endpoint ${endpoint.endpointId} in ${owner} has text evidence`,
        endpoint.endpointId,
      ),
    );
    return null;
  }
  const observation = indexes.observationsById.get(endpoint.endpointId);
  if (!observation) {
    issues.push(
      issue(
        "link_endpoint_missing",
        "error",
        `Link endpoint ${endpoint.endpointId} in ${owner} has no source observation`,
        endpoint.endpointId,
      ),
    );
    return null;
  }
  if (
    observationEvidenceIdentity(endpoint.evidence) !==
      observationEvidenceIdentity(observation.evidence) ||
    endpoint.candidateKind !== observation.candidateKind
  ) {
    issues.push(
      issue(
        "link_endpoint_evidence_mismatch",
        "error",
        `Link endpoint ${endpoint.endpointId} in ${owner} does not match its observation evidence`,
        endpoint.endpointId,
      ),
    );
  }
  return observation;
}

function validateRelationshipEndpoint(
  relationship: EvaluationRelationship,
  side: "subject" | "object",
  indexes: EvaluationIndexes,
  issues: RawEvaluationIssue[],
): EvaluationMention | EvaluationObservation | null {
  const endpoint = relationship[side];
  if (endpoint.endpointKind === "mention") {
    if (endpoint.evidence.kind !== "text_span") {
      issues.push(
        issue(
          "relationship_endpoint_evidence_kind_invalid",
          "error",
          `Relationship ${relationship.relationshipId} ${side} has non-text evidence`,
          relationship.relationshipId,
        ),
      );
      return null;
    }
    const mention = indexes.mentionsById.get(endpoint.endpointId);
    if (!mention) {
      issues.push(
        issue(
          "relationship_endpoint_missing",
          "error",
          `Relationship ${relationship.relationshipId} ${side} has no source mention`,
          relationship.relationshipId,
        ),
      );
      return null;
    }
    if (
      !sameTextEvidence(endpoint.evidence, mention.evidence) ||
      endpoint.label !== mention.surfaceText ||
      endpoint.normalizedLabel !== mention.normalizedSurface ||
      endpoint.candidateKind !== mention.candidateKind ||
      endpoint.family !== mention.family
    ) {
      issues.push(
        issue(
          "relationship_endpoint_evidence_mismatch",
          "error",
          `Relationship ${relationship.relationshipId} ${side} does not match its mention evidence`,
          relationship.relationshipId,
        ),
      );
    }
    return mention;
  }
  if (endpoint.evidence.kind === "text_span") {
    issues.push(
      issue(
        "relationship_endpoint_evidence_kind_invalid",
        "error",
        `Relationship ${relationship.relationshipId} ${side} has text evidence`,
        relationship.relationshipId,
      ),
    );
    return null;
  }
  const observation = indexes.observationsById.get(endpoint.endpointId);
  if (!observation) {
    issues.push(
      issue(
        "relationship_endpoint_missing",
        "error",
        `Relationship ${relationship.relationshipId} ${side} has no source observation`,
        relationship.relationshipId,
      ),
    );
    return null;
  }
  if (
    observationEvidenceIdentity(endpoint.evidence) !==
      observationEvidenceIdentity(observation.evidence) ||
    endpoint.candidateKind !== observation.candidateKind ||
    endpoint.family !== observation.family ||
    endpoint.label !== observation.rawValue ||
    endpoint.normalizedLabel !== observation.normalizedValue
  ) {
    issues.push(
      issue(
        "relationship_endpoint_evidence_mismatch",
        "error",
        `Relationship ${relationship.relationshipId} ${side} does not match its observation evidence`,
        relationship.relationshipId,
      ),
    );
  }
  return observation;
}

function validateRelationshipSupport(
  relationship: EvaluationRelationship,
  indexes: EvaluationIndexes,
  issues: RawEvaluationIssue[],
): boolean {
  const support = relationship.support;
  const supportCode = "relationship_support_invalid";
  if (relationship.method === "structured_row") {
    if (support.kind === "text_support") {
      issues.push(
        issue(
          supportCode,
          "error",
          `Relationship ${relationship.relationshipId} is structured but has text support`,
          relationship.relationshipId,
        ),
      );
      return false;
    }
    const subject = relationship.subject;
    const object = relationship.object;
    if (subject.evidence.kind === "text_span" || object.evidence.kind === "text_span") {
      issues.push(
        issue(
          supportCode,
          "error",
          `Relationship ${relationship.relationshipId} has text endpoints but structured support`,
          relationship.relationshipId,
        ),
      );
      return false;
    }
    const recordIdentity = observationEvidenceIdentity(support.record);
    if (
      observationEvidenceIdentity(subject.evidence) !== recordIdentity ||
      observationEvidenceIdentity(object.evidence) !== recordIdentity
    ) {
      issues.push(
        issue(
          "relationship_support_row_mismatch",
          "error",
          `Relationship ${relationship.relationshipId} support row does not match both endpoints`,
          relationship.relationshipId,
        ),
      );
      return false;
    }
    if (
      support.subjectEndpointId !== subject.endpointId ||
      support.objectEndpointId !== object.endpointId
    ) {
      issues.push(
        issue(
          "relationship_support_endpoint_mismatch",
          "error",
          `Relationship ${relationship.relationshipId} support names different endpoints`,
          relationship.relationshipId,
        ),
      );
      return false;
    }
    return true;
  }

  if (support.kind !== "text_support") {
    issues.push(
      issue(
        supportCode,
        "error",
        `Text relationship ${relationship.relationshipId} has no text support`,
        relationship.relationshipId,
      ),
    );
    return false;
  }
  const unit = indexes.unitsById.get(support.textUnitId);
  issues.push(
    ...validateTextEvidence(
      {
        kind: "text_span",
        textUnitId: support.textUnitId,
        documentSnapshotId: support.documentSnapshotId,
        artifactId: support.artifactId,
        documentId: support.documentId,
        sectionId: support.sectionId,
        sectionCode: support.sectionCode,
        offsetEncoding: support.offsetEncoding,
        localStart: support.start,
        localEnd: support.end,
        documentStart: support.documentStart,
        documentEnd: support.documentEnd,
        quote: support.quote,
        quoteSha256: support.quoteSha256,
        rawContentSha256: support.rawContentSha256,
      },
      unit,
      relationship.relationshipId,
    ),
  );
  if (relationship.method !== `section_${support.scope}`) {
    issues.push(
      issue(
        "relationship_support_scope_mismatch",
        "error",
        `Relationship ${relationship.relationshipId} method does not match its support scope`,
        relationship.relationshipId,
      ),
    );
  }
  if (
    support.subjectEndpointId !== relationship.subject.endpointId ||
    support.objectEndpointId !== relationship.object.endpointId
  ) {
    issues.push(
      issue(
        "relationship_support_endpoint_mismatch",
        "error",
        `Relationship ${relationship.relationshipId} support names different endpoints`,
        relationship.relationshipId,
      ),
    );
  }
  if (support.end - support.start > MAX_TEXT_SUPPORT_CHARS) {
    issues.push(
      issue(
        "relationship_support_too_long",
        "error",
        `Relationship ${relationship.relationshipId} support span exceeds ${MAX_TEXT_SUPPORT_CHARS} UTF-16 code units`,
        relationship.relationshipId,
      ),
    );
  }
  if (
    relationship.subject.evidence.kind !== "text_span" ||
    relationship.object.evidence.kind !== "text_span"
  ) {
    issues.push(
      issue(
        supportCode,
        "error",
        `Text relationship ${relationship.relationshipId} has non-text endpoints`,
        relationship.relationshipId,
      ),
    );
    return false;
  }
  const subject = relationship.subject.evidence;
  const object = relationship.object.evidence;
  if (subject.textUnitId !== support.textUnitId || object.textUnitId !== support.textUnitId) {
    issues.push(
      issue(
        "relationship_support_unit_mismatch",
        "error",
        `Relationship ${relationship.relationshipId} endpoints do not belong to the support unit`,
        relationship.relationshipId,
      ),
    );
  }
  if (support.scope === "clause") {
    if (
      support.start > Math.min(subject.localStart, object.localStart) ||
      support.end < Math.max(subject.localEnd, object.localEnd)
    ) {
      issues.push(
        issue(
          "relationship_support_does_not_cover_endpoints",
          "error",
          `Relationship ${relationship.relationshipId} clause support does not cover both endpoints`,
          relationship.relationshipId,
        ),
      );
    }
  } else if (support.start !== object.localStart || support.end !== object.localEnd) {
    issues.push(
      issue(
        "relationship_support_unit_span_mismatch",
        "error",
        `Relationship ${relationship.relationshipId} unit support does not match the object endpoint span`,
        relationship.relationshipId,
      ),
    );
  }
  return true;
}

function sameTextEvidence(left: EvaluationTextEvidence, right: EvaluationTextEvidence): boolean {
  return (
    left.textUnitId === right.textUnitId &&
    left.documentSnapshotId === right.documentSnapshotId &&
    left.artifactId === right.artifactId &&
    left.documentId === right.documentId &&
    left.sectionId === right.sectionId &&
    left.sectionCode === right.sectionCode &&
    left.localStart === right.localStart &&
    left.localEnd === right.localEnd &&
    left.documentStart === right.documentStart &&
    left.documentEnd === right.documentEnd &&
    left.quote === right.quote &&
    left.quoteSha256 === right.quoteSha256 &&
    left.rawContentSha256 === right.rawContentSha256
  );
}

function spansOverlap(left: EvaluationTextEvidence, right: EvaluationTextEvidence): boolean {
  return left.localStart < right.localEnd && right.localStart < left.localEnd;
}

function issue(
  code: string,
  severity: "error" | "warning" | "info",
  message: string,
  sampleId: string,
): RawEvaluationIssue {
  return { code, severity, message, sampleId };
}

function sortCounts(counts: Record<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}
