import { createHash } from "node:crypto";
import {
  DOSAGE_FORMS,
  compactKgText,
  compactRegisterKey,
  foldKgText,
  normalizeBrandKey,
  normalizeConditionKey,
  normalizeDosageForm,
  normalizeIngredientKey,
  normalizeJurisdiction,
  normalizeOrganizationKey,
  normalizeStrength,
  slugKey,
} from "../normalize";
import { linkGroupForKind, type LinkGroup, type LinkGroupDefinition } from "./entity-link-kinds";
import type {
  CandidateEntityCluster,
  LinkClusterOptions,
  LinkClusterResult,
  LinkContextConflict,
  LinkEndpointRef,
  LinkEvidence,
  LinkIdentityKeyRef,
  LinkRecord,
  UnresolvedLinkCandidate,
} from "./entity-link-types";
import type {
  ExtractionDiagnostic,
  MentionCandidateRecord,
  ObservationEvidence,
  StructuredObservationRecord,
  TextMentionEvidence,
} from "./types";

const MAX_ALIASES = 100;
const MAX_NAME_KEYS = 50;
const MAX_IDENTITY_KEYS = 50;
const MAX_CONTEXT_KEYS = 50;
const MAX_ENDPOINT_IDS = 20;
const DEFAULT_MAX_MEMBERS = 1000;
const WEAK_LABEL_LENGTH = 3;
const DOSAGE_FORM_KEYS = new Set(DOSAGE_FORMS.map((definition) => definition.key));
const GENERIC_LABELS = new Set([
  "unknown",
  "inconnu",
  "inconnue",
  "non renseigne",
  "non renseignee",
  "n a",
  "na",
  "medicament",
  "medicaments",
  "produit",
  "produits",
  "substance",
  "traitement",
]);

interface LabelKeys {
  readonly exactKey: string;
  readonly baseKey: string;
}

interface StructuredRowContext {
  readonly sourceId: string;
  readonly jurisdiction: string | null;
  readonly productIdentifierKeys: readonly string[];
  readonly productContextKeys: readonly string[];
  readonly classificationKeys: readonly string[];
}

interface IdentifierComponent {
  readonly group: LinkGroup;
  readonly baseKey: string;
  readonly records: LinkRecord[];
}

interface NoComponentRecord {
  readonly record: LinkRecord;
  readonly candidates: readonly IdentifierComponent[];
  readonly reason:
    | "multiple_identifier_components"
    | "conflicting_context_with_identifier_component";
}

/**
 * Build a candidate link record from one entity mention.
 *
 * Mention types that are values, identifiers, evidence references, or roles do
 * not enter the linking stage; they remain available as evidence/attributes.
 */
export function linkRecordFromMention(mention: MentionCandidateRecord): LinkRecord | null {
  const definition = linkGroupForKind(mention.candidateKind);
  if (!definition) return null;
  const label = mention.surfaceText.trim();
  if (label.length === 0) return null;
  const keys = labelKeys(definition.group, label);
  return {
    endpointKind: "mention",
    endpointId: mention.mentionId,
    candidateKind: mention.candidateKind,
    family: mention.family,
    label,
    normalizedLabel: mention.normalizedSurface,
    language: mention.language || null,
    sourceId: mention.document.sourceId,
    jurisdiction: mention.document.jurisdiction,
    documentType: mention.document.documentType,
    evidence: textLinkEvidence(mention.evidence),
    group: definition.group,
    exactKey: keys.exactKey,
    baseKey: keys.baseKey,
    identifierKeys: mentionIdentifierKeys(mention),
    classificationKeys: [],
    contextKeys: mentionContextKeys(mention, definition),
    rowKey: null,
  };
}

/**
 * Build candidate link records for all observations in one structured row.
 *
 * Product identifiers and form/strength/holder context are attached only to
 * product records. A DCI, UNII, or ATC code is never treated as a product
 * identity key.
 */
export function linkRecordsForStructuredRow(
  observations: readonly StructuredObservationRecord[],
): LinkRecord[] {
  if (observations.length === 0) return [];
  const context = buildStructuredRowContext(observations);
  const records: LinkRecord[] = [];
  for (const observation of observations) {
    const definition = linkGroupForKind(observation.candidateKind);
    if (!definition) continue;
    const label = observation.rawValue.trim();
    if (label.length === 0) continue;
    const keys = labelKeys(definition.group, label);
    const identifierKeys = definition.group === "product" ? context.productIdentifierKeys : [];
    const classificationKeys =
      definition.group === "therapeutic_class" ? context.classificationKeys : [];
    const contextKeys = observationContextKeys(observation, definition, context);
    records.push({
      endpointKind: "observation",
      endpointId: observation.observationId,
      candidateKind: observation.candidateKind,
      family: observation.family,
      label,
      normalizedLabel: observation.normalizedValue,
      language: observation.language,
      sourceId: observation.evidence.sourceId,
      jurisdiction: context.jurisdiction,
      documentType: null,
      evidence: observationLinkEvidence(observation.evidence),
      group: definition.group,
      exactKey: keys.exactKey,
      baseKey: keys.baseKey,
      identifierKeys,
      classificationKeys,
      contextKeys,
      rowKey: observationRowKey(observation),
    });
  }
  return records;
}

/**
 * Cluster candidate link records into confident, ambiguous, and unresolved
 * groups. Strong identifiers are authoritative only when their shared context
 * does not conflict. A name alone never overrides a conflicting identifier.
 */
export function clusterEntityLinks(
  records: readonly LinkRecord[],
  options: LinkClusterOptions,
): LinkClusterResult {
  const maxMembers = Math.max(1, options.maxMembers ?? DEFAULT_MAX_MEMBERS);
  const diagnostics: ExtractionDiagnostic[] = [];
  const sorted = dedupeRecords(records);
  const covered = new Set<string>();
  const confident: CandidateEntityCluster[] = [];
  const ambiguous: CandidateEntityCluster[] = [];
  const unresolved: UnresolvedLinkCandidate[] = [];

  const components = identifierComponents(sorted);
  const componentClusterIds = new Map<IdentifierComponent, string>();
  const componentsByBase = new Map<string, IdentifierComponent[]>();
  const recordsByBase = new Map<string, LinkRecord[]>();
  for (const component of components) {
    for (const baseKey of componentBaseKeys(component)) {
      const key = groupBaseKey(component.group, baseKey);
      const bucket = componentsByBase.get(key) ?? [];
      bucket.push(component);
      componentsByBase.set(key, bucket);
    }
  }
  for (const record of sorted) {
    const key = groupBaseKey(record.group, record.baseKey);
    const bucket = recordsByBase.get(key) ?? [];
    bucket.push(record);
    recordsByBase.set(key, bucket);
  }

  const noComponentRecords: NoComponentRecord[] = [];
  for (const record of sorted) {
    if (record.identifierKeys.length > 0) continue;
    const candidates = componentsByBase.get(groupBaseKey(record.group, record.baseKey)) ?? [];
    if (candidates.length === 0) continue;
    if (candidates.length === 1) {
      const candidate = candidates[0]!;
      if (componentContextCompatible(candidate, record)) {
        candidate.records.push(record);
        covered.add(endpointKey(record));
        continue;
      }
      noComponentRecords.push({
        record,
        candidates,
        reason: "conflicting_context_with_identifier_component",
      });
      continue;
    }
    noComponentRecords.push({
      record,
      candidates,
      reason: "multiple_identifier_components",
    });
  }

  const ambiguousBaseKeys = new Set(
    [...componentsByBase.entries()]
      .filter(([, baseComponents]) => baseComponents.length > 1)
      .map(([key]) => key),
  );
  for (const key of ambiguousBaseKeys) {
    const componentsForBase = componentsByBase.get(key) ?? [];
    const baseRecords = dedupeRecords([
      ...componentsForBase.flatMap((component) => component.records),
      ...(recordsByBase.get(key) ?? []),
    ]).filter((record) => !covered.has(endpointKey(record)));
    if (baseRecords.length === 0) continue;
    const cluster = buildCluster(baseRecords, "ambiguous", options, {
      reason: "multiple_identifier_components",
      componentCount: componentsForBase.length,
      reviewRequired: true,
    });
    ambiguous.push(cluster);
    for (const record of baseRecords) covered.add(endpointKey(record));
  }

  for (const component of components) {
    if (
      componentBaseKeys(component).some((baseKey) =>
        ambiguousBaseKeys.has(groupBaseKey(component.group, baseKey)),
      )
    ) {
      continue;
    }
    const componentRecords = component.records;
    const componentKeys = new Set(componentRecords.map(endpointKey));
    if (componentKeys.size === 0) continue;
    if (componentRecords.length === 1) {
      const record = componentRecords[0]!;
      unresolved.push(unresolvedFor(record, options, "singleton_identifier"));
      covered.add(endpointKey(record));
      continue;
    }
    const conflicts = contextConflicts(componentRecords);
    const groups = new Set(componentRecords.map((record) => record.group));
    const exactKeys = new Set(componentRecords.map((record) => record.exactKey));
    const roleConflict = hasRoleConflict(componentRecords);
    const weak = componentRecords.every((record) => isWeakLabel(record.label));
    const status =
      conflicts.length === 0 &&
      groups.size === 1 &&
      !roleConflict &&
      !weak &&
      (exactKeys.size === 1 || componentRecords.some((r) => r.identifierKeys.length > 0))
        ? "confident"
        : "ambiguous";
    const cluster = buildCluster(componentRecords, status, options, {
      reason:
        status === "confident"
          ? "shared_identifier"
          : conflicts.length > 0
            ? "conflicting_context"
            : groups.size > 1
              ? "group_conflict"
              : roleConflict
                ? "role_conflict"
                : weak
                  ? "weak_label"
                  : "ambiguous_identifier",
      componentCount: 1,
      exactKeyCount: exactKeys.size,
    });
    if (status === "confident") confident.push(cluster);
    else ambiguous.push(cluster);
    componentClusterIds.set(component, cluster.candidateClusterId);
    for (const record of componentRecords) covered.add(endpointKey(record));
  }

  const noComponentGroups = new Map<string, NoComponentRecord[]>();
  for (const entry of noComponentRecords) {
    if (covered.has(endpointKey(entry.record))) continue;
    const key = groupBaseKey(entry.record.group, entry.record.baseKey);
    const bucket = noComponentGroups.get(key) ?? [];
    bucket.push(entry);
    noComponentGroups.set(key, bucket);
  }
  for (const entries of noComponentGroups.values()) {
    const cluster = buildAmbiguousAlternativeCluster(entries, options, componentClusterIds);
    ambiguous.push(cluster);
    for (const entry of entries) covered.add(endpointKey(entry.record));
  }

  const nameGroups = new Map<string, LinkRecord[]>();
  for (const record of sorted) {
    if (covered.has(endpointKey(record))) continue;
    if (record.identifierKeys.length > 0) continue;
    const key = groupBaseKey(record.group, record.baseKey);
    const bucket = nameGroups.get(key) ?? [];
    bucket.push(record);
    nameGroups.set(key, bucket);
  }

  for (const groupRecords of nameGroups.values()) {
    if (groupRecords.length === 1) {
      const record = groupRecords[0]!;
      unresolved.push(
        unresolvedFor(
          record,
          options,
          isWeakLabel(record.label) ? "weak_label" : "singleton_no_safe_match",
        ),
      );
      covered.add(endpointKey(record));
      continue;
    }
    const definition = linkGroupForKind(groupRecords[0]!.candidateKind);
    const conflictContexts = definition?.conflictContexts ?? [];
    const conflicts = contextConflicts(groupRecords, conflictContexts);
    const exactKeys = new Set(groupRecords.map((record) => record.exactKey));
    const roleConflict = hasRoleConflict(groupRecords);
    const weak = groupRecords.every((record) => isWeakLabel(record.label));
    const exactKeyRequired = ["product", "substance", "excipient"].includes(groupRecords[0]!.group);
    const status =
      conflicts.length === 0 &&
      !roleConflict &&
      !weak &&
      (!exactKeyRequired || exactKeys.size === 1)
        ? "confident"
        : "ambiguous";
    const cluster = buildCluster(groupRecords, status, options, {
      reason:
        status === "confident"
          ? "exact_name_context"
          : conflicts.length > 0
            ? "conflicting_context"
            : roleConflict
              ? "role_conflict"
              : weak
                ? "weak_label"
                : "ambiguous_name_variant",
      componentCount: 0,
      exactKeyCount: exactKeys.size,
    });
    if (status === "confident") confident.push(cluster);
    else ambiguous.push(cluster);
    for (const record of groupRecords) covered.add(endpointKey(record));
  }

  for (const record of sorted) {
    if (covered.has(endpointKey(record))) continue;
    unresolved.push(
      unresolvedFor(
        record,
        options,
        isWeakLabel(record.label) ? "weak_label" : "unassigned_candidate",
      ),
    );
  }

  const sortedConfident = [...confident].sort(compareClusters);
  const sortedAmbiguous = [...ambiguous].sort(compareClusters);
  const sortedUnresolved = [...unresolved].sort(compareUnresolved);
  for (const cluster of [...sortedConfident, ...sortedAmbiguous]) {
    if (cluster.membersTruncated) {
      diagnostics.push({
        code: "link_member_cap_reached",
        severity: "info",
        message: `Cluster ${cluster.candidateClusterId} has ${cluster.memberCount} members; evidence members are capped at ${maxMembers}`,
      });
    }
  }

  return {
    confident: sortedConfident,
    ambiguous: sortedAmbiguous,
    unresolved: sortedUnresolved,
    diagnostics,
  };
}

function identifierComponents(records: readonly LinkRecord[]): IdentifierComponent[] {
  const unionFind = new UnionFind(records.length);
  const byIdentifier = new Map<string, number[]>();
  for (const [index, record] of records.entries()) {
    for (const key of record.identifierKeys) {
      const bucket = byIdentifier.get(key) ?? [];
      bucket.push(index);
      byIdentifier.set(key, bucket);
    }
  }
  for (const indexes of byIdentifier.values()) {
    for (let index = 1; index < indexes.length; index += 1) {
      unionFind.union(indexes[0]!, indexes[index]!);
    }
  }
  const roots = new Map<number, number[]>();
  for (const [index, record] of records.entries()) {
    if (record.identifierKeys.length === 0) continue;
    const root = unionFind.find(index);
    const bucket = roots.get(root) ?? [];
    bucket.push(index);
    roots.set(root, bucket);
  }
  const components: IdentifierComponent[] = [];
  for (const indexes of roots.values()) {
    const componentRecords = indexes.map((index) => records[index]!);
    const first = componentRecords[0]!;
    components.push({
      group: first.group,
      baseKey: first.baseKey,
      records: componentRecords,
    });
  }
  return components.sort(
    (left, right) =>
      left.group.localeCompare(right.group) ||
      left.baseKey.localeCompare(right.baseKey) ||
      left.records[0]!.endpointId.localeCompare(right.records[0]!.endpointId),
  );
}

function buildStructuredRowContext(
  observations: readonly StructuredObservationRecord[],
): StructuredRowContext {
  const sourceId = observations[0]?.evidence.sourceId ?? "unknown";
  let jurisdiction: string | null = null;
  const productIdentifierKeys = new Set<string>();
  const productContextKeys = new Set<string>();
  const classificationKeys = new Set<string>();
  for (const observation of observations) {
    const label = observation.rawValue.trim();
    if (!label) continue;
    switch (observation.candidateKind) {
      case "identifier_registration":
      case "regulatory_authorization": {
        const key = registrationKey(sourceId, label);
        if (key) productIdentifierKeys.add(key);
        if (sourceId === "BDPM_FR" && /^\d{5,}$/u.test(compactKgText(label))) {
          productIdentifierKeys.add(`cis:${compactKgText(label)}`);
        }
        break;
      }
      case "identifier_cis":
        productIdentifierKeys.add(`cis:${compactKgText(label)}`);
        break;
      case "identifier_ndc":
        productIdentifierKeys.add(`ndc:${compactKgText(label)}`);
        break;
      case "identifier_unii":
      case "identifier_dci":
        break;
      case "identifier_atc":
      case "atc_class":
        classificationKeys.add(`atc:${compactKgText(label)}`);
        break;
      case "dose_form":
        productContextKeys.add(`form:${normalizeDosageForm(label).key}`);
        break;
      case "strength":
        productContextKeys.add(`strength:${normalizeStrength(label)}`);
        break;
      case "organization":
        productContextKeys.add(`holder:${slugKey(normalizeOrganizationKey(label))}`);
        break;
      case "product_type":
        productContextKeys.add(`product_type:${slugKey(label)}`);
        break;
      case "schedule":
        productContextKeys.add(`schedule:${slugKey(label)}`);
        break;
      case "jurisdiction":
        jurisdiction = label;
        productContextKeys.add(`jurisdiction:${jurisdictionKey(label)}`);
        break;
      default:
        break;
    }
  }
  return {
    sourceId,
    jurisdiction,
    productIdentifierKeys: [...productIdentifierKeys].sort(),
    productContextKeys: [...productContextKeys].sort(),
    classificationKeys: [...classificationKeys].sort(),
  };
}

function mentionIdentifierKeys(mention: MentionCandidateRecord): string[] {
  if (linkGroupForKind(mention.candidateKind)?.group !== "product") return [];
  const keys = new Set<string>();
  const attributes = mention.attributes;
  const cis = stringAttribute(attributes, "cis");
  if (cis) keys.add(`cis:${compactKgText(cis)}`);
  const ndc = stringAttribute(attributes, "ndc");
  if (ndc) keys.add(`ndc:${compactKgText(ndc)}`);
  const registration =
    stringAttribute(attributes, "registrationNumber") ??
    stringAttribute(attributes, "registration_number");
  if (registration) {
    const key = registrationKey(mention.document.sourceId, registration);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

function mentionContextKeys(
  mention: MentionCandidateRecord,
  definition: LinkGroupDefinition,
): string[] {
  const keys = new Set<string>();
  if (definition.conflictContexts.includes("source")) {
    keys.add(`source:${slugKey(mention.document.sourceId)}`);
  }
  if (definition.conflictContexts.includes("jurisdiction") && mention.document.jurisdiction) {
    keys.add(`jurisdiction:${jurisdictionKey(mention.document.jurisdiction)}`);
  }
  if (definition.conflictContexts.includes("language") && mention.language) {
    keys.add(`language:${slugKey(mention.language)}`);
  }
  if (definition.group === "product") {
    for (const strength of [
      ...strengthTokens(mention.surfaceText),
      ...strengthTokens(mention.document.title),
    ]) {
      keys.add(`strength:${normalizeStrength(strength)}`);
    }
    const formKey = normalizeDosageForm(mention.document.title).key;
    if (DOSAGE_FORM_KEYS.has(formKey)) keys.add(`form:${formKey}`);
  }
  return [...keys].sort().slice(0, MAX_CONTEXT_KEYS);
}

function observationContextKeys(
  observation: StructuredObservationRecord,
  definition: LinkGroupDefinition,
  context: StructuredRowContext,
): string[] {
  const keys = new Set<string>();
  if (definition.conflictContexts.includes("source")) {
    keys.add(`source:${slugKey(observation.evidence.sourceId)}`);
  }
  if (definition.conflictContexts.includes("jurisdiction") && context.jurisdiction) {
    keys.add(`jurisdiction:${jurisdictionKey(context.jurisdiction)}`);
  }
  if (definition.conflictContexts.includes("language") && observation.language) {
    keys.add(`language:${slugKey(observation.language)}`);
  }
  if (definition.group === "product") {
    for (const key of context.productContextKeys) keys.add(key);
  }
  return [...keys].sort().slice(0, MAX_CONTEXT_KEYS);
}

function labelKeys(group: LinkGroup, label: string): LabelKeys {
  const exactKey = slugKey(label);
  switch (group) {
    case "product":
      return { exactKey, baseKey: normalizeBrandKey(label) };
    case "substance":
    case "excipient":
      return { exactKey, baseKey: slugKey(normalizeIngredientKey(label)) };
    case "organization":
      return {
        exactKey: slugKey(normalizeOrganizationKey(label)),
        baseKey: slugKey(normalizeOrganizationKey(label)),
      };
    case "clinical":
    case "food_or_beverage":
    case "population":
      return {
        exactKey: slugKey(normalizeConditionKey(label)),
        baseKey: slugKey(normalizeConditionKey(label)),
      };
    case "dose_form":
      return {
        exactKey: normalizeDosageForm(label).key,
        baseKey: normalizeDosageForm(label).key,
      };
    case "route":
    case "therapeutic_class":
      return { exactKey, baseKey: exactKey };
    default:
      return { exactKey, baseKey: exactKey };
  }
}

function jurisdictionKey(value: string): string {
  return normalizeJurisdiction(value)?.key ?? slugKey(value);
}

function registrationKey(sourceId: string, value: string): string | null {
  const compact = compactRegisterKey(value);
  if (!compact) return null;
  return `reg:${slugKey(sourceId || "unknown")}:${compact}`;
}

function strengthTokens(value: string): string[] {
  const tokens: string[] = [];
  const pattern = /\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|µg|ug|ml|cl|l|ui|iu|%)\b/giu;
  for (const match of value.matchAll(pattern)) tokens.push(match[0]);
  return tokens;
}

function textLinkEvidence(evidence: TextMentionEvidence): LinkEvidence {
  return {
    kind: "text_span",
    textUnitId: evidence.textUnitId,
    documentSnapshotId: evidence.documentSnapshotId,
    artifactId: evidence.artifactId,
    documentId: evidence.documentId,
    sectionId: evidence.sectionId,
    sectionCode: evidence.sectionCode,
    sectionHeading: evidence.sectionHeading,
    sectionPath: evidence.sectionPath,
    offsetEncoding: evidence.offsetEncoding,
    localStart: evidence.localStart,
    localEnd: evidence.localEnd,
    documentStart: evidence.documentStart,
    documentEnd: evidence.documentEnd,
    quote: evidence.quote,
    quoteSha256: evidence.quoteSha256,
    rawContentSha256: evidence.rawContentSha256,
  };
}

function observationLinkEvidence(evidence: ObservationEvidence): LinkEvidence {
  if (evidence.kind === "structured_record") {
    return {
      kind: "structured_row",
      sourceId: evidence.sourceId,
      path: evidence.path,
      rowNumber: evidence.rowNumber,
      rowSha256: evidence.rowSha256,
      schemaVersion: evidence.schemaVersion,
    };
  }
  return {
    kind: "metadata",
    sourceId: evidence.sourceId,
    artifactId: evidence.artifactId,
    field: evidence.field,
    contentSha256: evidence.contentSha256,
  };
}

function observationRowKey(observation: StructuredObservationRecord): string {
  const evidence = observation.evidence;
  return evidence.kind === "structured_record"
    ? [evidence.sourceId, evidence.path, String(evidence.rowNumber), evidence.rowSha256].join(":")
    : [evidence.sourceId, evidence.artifactId, evidence.field, evidence.contentSha256].join(":");
}

function buildCluster(
  records: readonly LinkRecord[],
  status: "confident" | "ambiguous",
  options: LinkClusterOptions,
  attributes: Readonly<Record<string, unknown>>,
): CandidateEntityCluster {
  const ordered = [...records].sort(compareRecords);
  const group = ordered[0]!.group;
  const aliases = uniqueStrings(ordered.map((record) => record.label)).slice(0, MAX_ALIASES);
  const aliasCount = uniqueStrings(ordered.map((record) => record.label)).length;
  const nameKeys = uniqueStrings(
    ordered.flatMap((record) => [record.exactKey, record.baseKey]),
  ).slice(0, MAX_NAME_KEYS);
  const identityKeys = identityKeyRefs(ordered);
  const contextKeys = uniqueStrings(ordered.flatMap((record) => record.contextKeys)).slice(
    0,
    MAX_CONTEXT_KEYS,
  );
  const conflicts = contextConflicts(ordered);
  const maxMembers = Math.max(1, options.maxMembers ?? DEFAULT_MAX_MEMBERS);
  const members = ordered.slice(0, maxMembers).map(toEndpointRef);
  const memberIds = ordered.map((record) => record.endpointId).sort();
  const candidateClusterId = `cl_${sha256(
    [options.extractionRunId, status, group, ...memberIds].join("\u0000"),
  ).slice(0, 32)}`;
  return {
    candidateClusterId,
    extractionRunId: options.extractionRunId,
    status,
    group,
    preferredLabel: preferredLabel(ordered),
    aliases,
    aliasCount,
    nameKeys,
    identityKeys,
    contextKeys,
    conflicts,
    memberCount: ordered.length,
    membersTruncated: ordered.length > maxMembers,
    members,
    duplicateState: status === "confident" ? "deduplicated" : "possible_duplicate",
    ontologyVersion: options.ontologyVersion,
    attributes: {
      ...attributes,
      memberKinds: uniqueStrings(ordered.map((record) => record.candidateKind)),
      sourceIds: uniqueStrings(ordered.map((record) => record.sourceId)).slice(0, 20),
      rowKeys: uniqueStrings(
        ordered.flatMap((record) => (record.rowKey ? [record.rowKey] : [])),
      ).slice(0, 20),
      reviewRequired: true,
    },
    observationState: "quarantined",
  };
}

function buildAmbiguousAlternativeCluster(
  entries: readonly NoComponentRecord[],
  options: LinkClusterOptions,
  componentClusterIds: ReadonlyMap<IdentifierComponent, string>,
): CandidateEntityCluster {
  const records = entries.map((entry) => entry.record);
  const candidateClusterIds = uniqueStrings(
    entries.flatMap((entry) =>
      entry.candidates.flatMap((candidate) => {
        const clusterId = componentClusterIds.get(candidate);
        return clusterId ? [clusterId] : [];
      }),
    ),
  );
  return buildCluster(records, "ambiguous", options, {
    reason: entries[0]!.reason,
    componentCount: entries[0]!.candidates.length,
    candidateClusterIds,
    reviewRequired: true,
  });
}

function unresolvedFor(
  record: LinkRecord,
  options: LinkClusterOptions,
  reason: string,
): UnresolvedLinkCandidate {
  const unresolvedId = `ul_${sha256(
    [options.extractionRunId, record.group, record.endpointKind, record.endpointId, reason].join(
      "\u0000",
    ),
  ).slice(0, 32)}`;
  return {
    unresolvedId,
    extractionRunId: options.extractionRunId,
    group: record.group,
    endpoint: toEndpointRef(record),
    baseKey: record.baseKey,
    exactKey: record.exactKey,
    reason,
    identifierKeys: record.identifierKeys,
    contextKeys: record.contextKeys,
    ontologyVersion: options.ontologyVersion,
    observationState: "quarantined",
  };
}

function toEndpointRef(record: LinkRecord): LinkEndpointRef {
  return {
    endpointKind: record.endpointKind,
    endpointId: record.endpointId,
    candidateKind: record.candidateKind,
    family: record.family,
    label: record.label,
    normalizedLabel: record.normalizedLabel,
    language: record.language,
    sourceId: record.sourceId,
    jurisdiction: record.jurisdiction,
    documentType: record.documentType,
    evidence: record.evidence,
  };
}

function identityKeyRefs(records: readonly LinkRecord[]): LinkIdentityKeyRef[] {
  const byKey = new Map<string, string[]>();
  for (const record of records) {
    for (const key of record.identifierKeys) {
      const bucket = byKey.get(key) ?? [];
      bucket.push(record.endpointId);
      byKey.set(key, bucket);
    }
  }
  return [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_IDENTITY_KEYS)
    .map(([key, endpointIds]) => ({
      key,
      count: endpointIds.length,
      endpointIds: uniqueStrings(endpointIds).slice(0, MAX_ENDPOINT_IDS),
    }));
}

function contextConflicts(
  records: readonly LinkRecord[],
  dimensions?: readonly string[],
): LinkContextConflict[] {
  const allowed = dimensions ? new Set(dimensions) : null;
  const byDimension = new Map<string, Set<string>>();
  for (const record of records) {
    for (const key of record.contextKeys) {
      const separator = key.indexOf(":");
      if (separator < 1) continue;
      const dimension = key.slice(0, separator);
      if (allowed && !allowed.has(dimension)) continue;
      const value = key.slice(separator + 1);
      const values = byDimension.get(dimension) ?? new Set<string>();
      values.add(value);
      byDimension.set(dimension, values);
    }
  }
  return [...byDimension.entries()]
    .filter(([, values]) => values.size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dimension, values]) => ({
      dimension,
      values: [...values].sort(),
    }));
}

function componentContextCompatible(component: IdentifierComponent, record: LinkRecord): boolean {
  const contexts = new Map<string, Set<string>>();
  for (const member of component.records) {
    for (const key of member.contextKeys) {
      const separator = key.indexOf(":");
      if (separator < 1) continue;
      const dimension = key.slice(0, separator);
      const value = key.slice(separator + 1);
      const values = contexts.get(dimension) ?? new Set<string>();
      values.add(value);
      contexts.set(dimension, values);
    }
  }
  for (const key of record.contextKeys) {
    const separator = key.indexOf(":");
    if (separator < 1) continue;
    const dimension = key.slice(0, separator);
    const value = key.slice(separator + 1);
    const values = contexts.get(dimension);
    if (values && values.size > 0 && !values.has(value)) return false;
  }
  return true;
}

function hasRoleConflict(records: readonly LinkRecord[]): boolean {
  const kinds = new Set(records.map((record) => record.candidateKind));
  if (kinds.size <= 1) return false;
  const group = records[0]?.group;
  return group === "clinical" || group === "organization";
}

function isWeakLabel(label: string): boolean {
  const folded = foldKgText(label);
  if (folded.length < WEAK_LABEL_LENGTH) return true;
  if (GENERIC_LABELS.has(folded)) return true;
  return !/[\p{L}\p{N}]/u.test(folded);
}

function preferredLabel(records: readonly LinkRecord[]): string {
  const counts = new Map<string, number>();
  for (const record of records) {
    const label = record.label.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return (
    [...counts.entries()].sort(
      ([leftLabel, leftCount], [rightLabel, rightCount]) =>
        rightCount - leftCount ||
        rightLabel.length - leftLabel.length ||
        leftLabel.localeCompare(rightLabel),
    )[0]?.[0] ??
    records[0]?.label ??
    ""
  );
}

function componentBaseKeys(component: IdentifierComponent): string[] {
  return uniqueStrings(component.records.map((record) => record.baseKey));
}

function groupBaseKey(group: LinkGroup, baseKey: string): string {
  return `${group}\u0000${baseKey}`;
}

function endpointKey(record: LinkRecord): string {
  return `${record.endpointKind}:${record.endpointId}`;
}

function dedupeRecords(records: readonly LinkRecord[]): LinkRecord[] {
  const byId = new Map<string, LinkRecord>();
  for (const record of records) {
    const key = endpointKey(record);
    if (!byId.has(key)) byId.set(key, record);
  }
  return [...byId.values()].sort(compareRecords);
}

function compareRecords(left: LinkRecord, right: LinkRecord): number {
  return (
    left.group.localeCompare(right.group) ||
    left.baseKey.localeCompare(right.baseKey) ||
    left.endpointKind.localeCompare(right.endpointKind) ||
    left.endpointId.localeCompare(right.endpointId)
  );
}

function compareClusters(left: CandidateEntityCluster, right: CandidateEntityCluster): number {
  return (
    left.group.localeCompare(right.group) ||
    left.preferredLabel.localeCompare(right.preferredLabel) ||
    left.candidateClusterId.localeCompare(right.candidateClusterId)
  );
}

function compareUnresolved(left: UnresolvedLinkCandidate, right: UnresolvedLinkCandidate): number {
  return (
    left.group.localeCompare(right.group) ||
    left.endpoint.label.localeCompare(right.endpoint.label) ||
    left.unresolvedId.localeCompare(right.unresolvedId)
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function stringAttribute(
  attributes: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = attributes[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

class UnionFind {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index]!;
    if (parent !== index) this.parents[index] = this.find(parent);
    return this.parents[index]!;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents[rightRoot] = leftRoot;
  }
}
