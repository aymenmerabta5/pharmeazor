import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  GRAPH_ONTOLOGY_VERSION,
  graphEntityLabels,
  graphEvidenceId,
  relationshipMapping,
  validateGraphPopulationApproval,
  type CandidateEntityCluster,
  type GraphEntityMemberPlan,
  type GraphEntityPlan,
  type GraphPopulationApproval,
  type GraphPopulationApprovalInputChecksums,
  type GraphRelationshipPlan,
  type LinkEvidence,
  type RelationshipCandidateRecord,
  type RelationshipSupport,
} from "@repo/modules/retrieval";
import { createJsonlSink, readJsonlFile } from "./artifact-jsonl";
import {
  readLinkArtifactInput,
  readRelationshipArtifactInput,
  type LinkArtifactInput,
  type RelationshipArtifactInput,
} from "./graph-artifacts";

const DEFAULT_LINK_DIR = "tooling/cleaning-lab/output/entity-links";
const DEFAULT_RELATIONSHIP_DIR = "tooling/cleaning-lab/output/relationships";
const DEFAULT_OUTPUT_DIR = "tooling/cleaning-lab/output/graph-population";
const DEFAULT_BATCH_SIZE = 500;

export type GraphPopulationMode = "validate" | "plan" | "apply";
export type GraphPopulationStatus =
  | "blocked_missing_approval"
  | "blocked_approval_invalid"
  | "ready"
  | "empty"
  | "imported"
  | "import_failed";

export interface GraphPopulationOptions {
  readonly linkDir?: string;
  readonly relationshipDir?: string;
  readonly approvalPath?: string;
  readonly outputDir?: string;
  readonly write?: boolean;
  readonly batchSize?: number;
}

export interface GraphPopulationApprovalState {
  readonly provided: boolean;
  readonly approved: boolean;
  readonly approvalSha256: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly reviewReference: string | null;
  readonly issues: readonly string[];
}

export interface GraphPopulationCounts {
  readonly confidentClusters: number;
  readonly confidentMembers: number;
  readonly ambiguousClusters: number;
  readonly ambiguousMembers: number;
  readonly unresolvedCandidates: number;
  readonly candidateRelationships: number;
  readonly resolvableRelationships: number;
  readonly selfLoopRelationships: number;
  readonly unresolvedEndpointRelationships: number;
  readonly eligibleEntities: number;
  readonly eligibleMembers: number;
  readonly eligibleRelationships: number;
  readonly rejectedEntities: number;
  readonly rejectedRelationships: number;
  readonly evidenceNodes: number;
  readonly importedNodes: number;
  readonly importedRelationships: number;
  readonly nodeGroups: Readonly<Record<string, number>>;
  readonly relationshipKinds: Readonly<Record<string, number>>;
}

export interface GraphPopulationReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly mode: GraphPopulationMode;
  readonly status: GraphPopulationStatus;
  readonly approval: GraphPopulationApprovalState;
  readonly input: {
    readonly linkDir: string;
    readonly linkManifestSha256: string;
    readonly confidentMatchesSha256: string;
    readonly relationshipDir: string;
    readonly relationshipManifestSha256: string;
    readonly relationshipCandidatesSha256: string;
  };
  readonly counts: GraphPopulationCounts;
  readonly files: Readonly<Record<string, string>>;
  readonly filesWritten: boolean;
  readonly checksums: Readonly<Record<string, string>>;
  readonly planId: string | null;
}

export interface GraphPopulationPlanResult {
  readonly report: GraphPopulationReport;
  readonly approval: GraphPopulationApproval;
  readonly entitiesPath: string;
  readonly relationshipsPath: string;
  readonly rejectedPath: string;
  readonly validationPath: string;
  readonly manifestPath: string;
  readonly batchSize: number;
}

interface LoadedInputs {
  readonly link: LinkArtifactInput;
  readonly relationship: RelationshipArtifactInput;
  readonly checksums: GraphPopulationApprovalInputChecksums;
}

interface EndpointEntity {
  readonly entityId: string;
  readonly group: string;
}

interface LoadedApproval {
  readonly state: GraphPopulationApprovalState;
  readonly approval: GraphPopulationApproval | null;
}

/**
 * Validate inputs and count what a future approved import would publish.
 *
 * No Neo4j connection is made and no candidate is published in this mode.
 */
export async function validateGraphPopulation(
  options: GraphPopulationOptions = {},
): Promise<GraphPopulationReport> {
  const inputs = await loadInputs(options);
  const approval = await loadApproval(options.approvalPath, inputs.checksums);
  const endpointMap = new Map<string, EndpointEntity>();
  const nodeGroups: Record<string, number> = {};
  let confidentClusters = 0;
  let confidentMembers = 0;
  for await (const cluster of readJsonlFile<CandidateEntityCluster>(
    inputs.link.confidentMatchesPath,
  )) {
    if (cluster.status !== "confident") continue;
    confidentClusters += 1;
    increment(nodeGroups, cluster.group);
    for (const member of cluster.members) {
      confidentMembers += 1;
      endpointMap.set(member.endpointId, {
        entityId: cluster.candidateClusterId,
        group: cluster.group,
      });
    }
  }

  let candidateRelationships = 0;
  let resolvableRelationships = 0;
  let selfLoopRelationships = 0;
  let unresolvedEndpointRelationships = 0;
  let eligibleRelationships = 0;
  const relationshipKinds: Record<string, number> = {};
  const approvedGroups = new Set<string>(approval.approval?.approvedNodeGroups ?? []);
  const approvedKinds = new Set<string>(approval.approval?.approvedRelationshipKinds ?? []);
  for await (const relationship of readJsonlFile<RelationshipCandidateRecord>(
    inputs.relationship.relationshipCandidatesPath,
  )) {
    candidateRelationships += 1;
    increment(relationshipKinds, relationship.relationshipKind);
    const subject = endpointMap.get(relationship.subject.endpointId);
    const object = endpointMap.get(relationship.object.endpointId);
    if (!subject || !object) {
      unresolvedEndpointRelationships += 1;
      continue;
    }
    resolvableRelationships += 1;
    if (subject.entityId === object.entityId) {
      selfLoopRelationships += 1;
      continue;
    }
    if (
      approval.state.approved &&
      approvedGroups.has(subject.group) &&
      approvedGroups.has(object.group) &&
      approvedKinds.has(relationship.relationshipKind)
    ) {
      eligibleRelationships += 1;
    }
  }

  const eligibleEntities = approval.state.approved
    ? Object.entries(nodeGroups)
        .filter(([group]) => approvedGroups.has(group))
        .reduce((total, [, count]) => total + count, 0)
    : 0;
  const eligibleMembers = approval.state.approved
    ? await countEligibleMembers(inputs.link.confidentMatchesPath, approvedGroups)
    : 0;
  const counts = {
    confidentClusters,
    confidentMembers,
    ambiguousClusters: numberCount(inputs.link.manifest.counts?.ambiguousClusters),
    ambiguousMembers: numberCount(inputs.link.manifest.counts?.ambiguousMembers),
    unresolvedCandidates: numberCount(inputs.link.manifest.counts?.unresolvedCandidates),
    candidateRelationships,
    resolvableRelationships,
    selfLoopRelationships,
    unresolvedEndpointRelationships,
    eligibleEntities,
    eligibleMembers,
    eligibleRelationships,
    rejectedEntities: approval.state.approved ? confidentClusters - eligibleEntities : 0,
    rejectedRelationships: approval.state.approved
      ? candidateRelationships - eligibleRelationships
      : 0,
    evidenceNodes: 0,
    importedNodes: 0,
    importedRelationships: 0,
    nodeGroups: sortRecord(nodeGroups),
    relationshipKinds: sortRecord(relationshipKinds),
  } satisfies GraphPopulationCounts;
  const status: GraphPopulationStatus = !approval.state.provided
    ? "blocked_missing_approval"
    : !approval.state.approved
      ? "blocked_approval_invalid"
      : eligibleEntities === 0
        ? "empty"
        : "ready";
  const report: GraphPopulationReport = baseReport({
    mode: "validate",
    status,
    approval: approval.state,
    inputs,
    counts,
    files: {},
    filesWritten: false,
    checksums: {},
    planId: null,
  });
  if (options.write !== false) {
    const written = await writeValidationArtifacts(
      report,
      resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR),
    );
    return { ...report, ...written, filesWritten: true };
  }
  return report;
}

/**
 * Build a deterministic plan from approved inputs. This never connects to
 * Neo4j; it only writes JSONL records that the importer can consume.
 */
export async function buildGraphPopulationPlan(
  options: GraphPopulationOptions = {},
): Promise<GraphPopulationPlanResult> {
  const inputs = await loadInputs(options);
  const loadedApproval = await loadApproval(options.approvalPath, inputs.checksums);
  if (!loadedApproval.approval || !loadedApproval.state.approved) {
    throw new Error(
      `Graph population is blocked: ${loadedApproval.state.issues.join("; ") || "approval required"}`,
    );
  }
  const approval = loadedApproval.approval;
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  await mkdir(outputDir, { recursive: true });
  const files = {
    entities: "entities.jsonl",
    relationships: "relationships.jsonl",
    rejected: "rejected-records.jsonl",
    validation: "validation.json",
    manifest: "manifest.json",
  };
  const entitiesPath = join(outputDir, files.entities);
  const relationshipsPath = join(outputDir, files.relationships);
  const rejectedPath = join(outputDir, files.rejected);
  const entitySink = await createJsonlSink(entitiesPath);
  const relationshipSink = await createJsonlSink(relationshipsPath);
  const rejectedSink = await createJsonlSink(rejectedPath);
  const endpointMap = new Map<string, EndpointEntity>();
  const approvedGroups = new Set<string>(approval.approvedNodeGroups);
  const evidenceIds = new Set<string>();
  const nodeGroups: Record<string, number> = {};
  const relationshipKinds: Record<string, number> = {};
  let confidentClusters = 0;
  let confidentMembers = 0;
  let eligibleEntities = 0;
  let eligibleMembers = 0;
  let rejectedEntities = 0;
  let candidateRelationships = 0;
  let eligibleRelationships = 0;
  let rejectedRelationships = 0;
  let selfLoopRelationships = 0;
  let unresolvedEndpointRelationships = 0;
  let resolvableRelationships = 0;
  try {
    for await (const cluster of readJsonlFile<CandidateEntityCluster>(
      inputs.link.confidentMatchesPath,
    )) {
      if (cluster.status !== "confident") continue;
      confidentClusters += 1;
      increment(nodeGroups, cluster.group);
      for (const member of cluster.members) {
        confidentMembers += 1;
        endpointMap.set(member.endpointId, {
          entityId: cluster.candidateClusterId,
          group: cluster.group,
        });
      }
      if (!approvedGroups.has(cluster.group)) {
        rejectedEntities += 1;
        await rejectedSink.write({
          recordKind: "entity",
          recordId: cluster.candidateClusterId,
          group: cluster.group,
          reason: "node_group_not_approved",
          memberCount: cluster.memberCount,
        });
        continue;
      }
      const plan = entityPlan(cluster, approval, evidenceIds);
      await entitySink.write(plan);
      eligibleEntities += 1;
      eligibleMembers += plan.members.length;
    }

    for await (const relationship of readJsonlFile<RelationshipCandidateRecord>(
      inputs.relationship.relationshipCandidatesPath,
    )) {
      candidateRelationships += 1;
      increment(relationshipKinds, relationship.relationshipKind);
      const mapping = relationshipMapping(relationship.relationshipKind, approval);
      if (!mapping) {
        rejectedRelationships += 1;
        await rejectedSink.write({
          recordKind: "relationship",
          recordId: relationship.relationshipId,
          relationshipKind: relationship.relationshipKind,
          reason: "relationship_kind_not_approved",
        });
        continue;
      }
      const subject = endpointMap.get(relationship.subject.endpointId);
      const object = endpointMap.get(relationship.object.endpointId);
      if (!subject || !object) {
        unresolvedEndpointRelationships += 1;
        rejectedRelationships += 1;
        await rejectedSink.write({
          recordKind: "relationship",
          recordId: relationship.relationshipId,
          relationshipKind: relationship.relationshipKind,
          reason: "endpoint_unresolved",
        });
        continue;
      }
      resolvableRelationships += 1;
      if (subject.entityId === object.entityId) {
        selfLoopRelationships += 1;
        rejectedRelationships += 1;
        await rejectedSink.write({
          recordKind: "relationship",
          recordId: relationship.relationshipId,
          relationshipKind: relationship.relationshipKind,
          reason: "self_loop",
        });
        continue;
      }
      if (!approvedGroups.has(subject.group) || !approvedGroups.has(object.group)) {
        rejectedRelationships += 1;
        await rejectedSink.write({
          recordKind: "relationship",
          recordId: relationship.relationshipId,
          relationshipKind: relationship.relationshipKind,
          reason: "endpoint_entity_group_not_approved",
        });
        continue;
      }
      const plan = relationshipPlan(relationship, mapping, subject, object, evidenceIds);
      await relationshipSink.write(plan);
      eligibleRelationships += 1;
    }
  } finally {
    await Promise.all([entitySink.close(), relationshipSink.close(), rejectedSink.close()]);
  }

  const counts = {
    confidentClusters,
    confidentMembers,
    ambiguousClusters: numberCount(inputs.link.manifest.counts?.ambiguousClusters),
    ambiguousMembers: numberCount(inputs.link.manifest.counts?.ambiguousMembers),
    unresolvedCandidates: numberCount(inputs.link.manifest.counts?.unresolvedCandidates),
    candidateRelationships,
    resolvableRelationships,
    selfLoopRelationships,
    unresolvedEndpointRelationships,
    eligibleEntities,
    eligibleMembers,
    eligibleRelationships,
    rejectedEntities,
    rejectedRelationships,
    evidenceNodes: evidenceIds.size,
    importedNodes: 0,
    importedRelationships: 0,
    nodeGroups: sortRecord(nodeGroups),
    relationshipKinds: sortRecord(relationshipKinds),
  } satisfies GraphPopulationCounts;
  const planId = `plan_${sha256(
    [
      loadedApproval.state.approvalSha256,
      inputs.link.manifestSha256,
      inputs.link.confidentMatchesSha256,
      inputs.relationship.manifestSha256,
      inputs.relationship.relationshipCandidatesSha256,
      entitySink.checksum,
      relationshipSink.checksum,
      rejectedSink.checksum,
    ].join("\u0000"),
  ).slice(0, 32)}`;
  const report = baseReport({
    mode: "plan",
    status: eligibleEntities > 0 ? "ready" : "empty",
    approval: loadedApproval.state,
    inputs,
    counts,
    files,
    filesWritten: true,
    checksums: {
      entities: entitySink.checksum,
      relationships: relationshipSink.checksum,
      rejected: rejectedSink.checksum,
    },
    planId,
  });
  await writePlanReports(report, outputDir, files);
  return {
    report,
    approval,
    entitiesPath,
    relationshipsPath,
    rejectedPath,
    validationPath: join(outputDir, files.validation),
    manifestPath: join(outputDir, files.manifest),
    batchSize: Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE),
  };
}

async function loadInputs(options: GraphPopulationOptions): Promise<LoadedInputs> {
  const link = await readLinkArtifactInput(resolve(options.linkDir ?? DEFAULT_LINK_DIR));
  const relationship = await readRelationshipArtifactInput(
    resolve(options.relationshipDir ?? DEFAULT_RELATIONSHIP_DIR),
  );
  if (
    String(link.manifest.entityArtifact?.manifestSha256) !==
    String(relationship.manifest.entityArtifact?.manifestSha256)
  ) {
    throw new Error("Link and relationship artifacts do not reference the same entity artifact");
  }
  return {
    link,
    relationship,
    checksums: {
      linkManifestSha256: link.manifestSha256,
      confidentMatchesSha256: link.confidentMatchesSha256,
      relationshipManifestSha256: relationship.manifestSha256,
      relationshipCandidatesSha256: relationship.relationshipCandidatesSha256,
    },
  };
}

async function loadApproval(
  approvalPath: string | undefined,
  checksums: GraphPopulationApprovalInputChecksums,
): Promise<LoadedApproval> {
  if (!approvalPath) {
    return {
      state: {
        provided: false,
        approved: false,
        approvalSha256: null,
        approvedBy: null,
        approvedAt: null,
        reviewReference: null,
        issues: ["A graph population approval file is required before publication"],
      },
      approval: null,
    };
  }
  let text: string;
  try {
    text = await readFile(approvalPath, "utf8");
  } catch (error) {
    return {
      state: {
        provided: true,
        approved: false,
        approvalSha256: null,
        approvedBy: null,
        approvedAt: null,
        reviewReference: null,
        issues: [error instanceof Error ? error.message : String(error)],
      },
      approval: null,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      state: {
        provided: true,
        approved: false,
        approvalSha256: sha256(text),
        approvedBy: null,
        approvedAt: null,
        reviewReference: null,
        issues: [
          `Approval JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
        ],
      },
      approval: null,
    };
  }
  const validation = validateGraphPopulationApproval(parsed, {
    inputChecksums: checksums,
    now: new Date(),
  });
  const record = isRecord(parsed) ? parsed : {};
  return {
    state: {
      provided: true,
      approved: validation.approved,
      approvalSha256: sha256(text),
      approvedBy: stringValue(record.approvedBy),
      approvedAt: stringValue(record.approvedAt),
      reviewReference: stringValue(record.reviewReference),
      issues: validation.issues,
    },
    approval: validation.approval,
  };
}

async function countEligibleMembers(
  path: string,
  approvedGroups: ReadonlySet<string>,
): Promise<number> {
  let count = 0;
  for await (const cluster of readJsonlFile<CandidateEntityCluster>(path)) {
    if (cluster.status !== "confident") continue;
    if (approvedGroups.has(cluster.group)) count += cluster.members.length;
  }
  return count;
}

function entityPlan(
  cluster: CandidateEntityCluster,
  approval: GraphPopulationApproval,
  evidenceIds: Set<string>,
): GraphEntityPlan {
  const members: GraphEntityMemberPlan[] = cluster.members.map((member) => {
    evidenceIds.add(graphEvidenceId(member.evidence));
    return {
      endpointKind: member.endpointKind,
      endpointId: member.endpointId,
      candidateKind: member.candidateKind,
      label: member.label,
      normalizedLabel: member.normalizedLabel,
      sourceId: member.sourceId,
      jurisdiction: member.jurisdiction,
      documentType: member.documentType,
      evidence: member.evidence,
    };
  });
  return {
    candidateClusterId: cluster.candidateClusterId,
    group: cluster.group,
    label: cluster.preferredLabel,
    labels: graphEntityLabels(cluster.group, approval),
    aliases: cluster.aliases,
    aliasCount: cluster.aliasCount,
    identityKeys: cluster.identityKeys.map((entry) => entry.key),
    contextKeys: cluster.contextKeys,
    memberCount: cluster.memberCount,
    members,
    ontologyVersion: GRAPH_ONTOLOGY_VERSION,
    reviewState: "approved_candidate",
    observationState: "quarantined",
  };
}

function relationshipPlan(
  relationship: RelationshipCandidateRecord,
  mapping: { readonly type: string; readonly direction: "forward" | "reverse" },
  subject: EndpointEntity,
  object: EndpointEntity,
  evidenceIds: Set<string>,
): GraphRelationshipPlan {
  const supportEvidence = relationshipSupportAsEvidence(relationship.support);
  evidenceIds.add(graphEvidenceId(supportEvidence));
  const forward = mapping.direction === "forward";
  return {
    relationshipId: relationship.relationshipId,
    relationshipKind: relationship.relationshipKind,
    neo4jType: mapping.type as GraphRelationshipPlan["neo4jType"],
    direction: mapping.direction,
    fromEntityId: forward ? subject.entityId : object.entityId,
    toEntityId: forward ? object.entityId : subject.entityId,
    support: relationship.support,
    supportSourceId:
      relationshipEndpointSourceId(relationship.subject) ??
      relationshipEndpointSourceId(relationship.object) ??
      "unknown",
    ontologyVersion: GRAPH_ONTOLOGY_VERSION,
    reviewState: "approved_candidate",
    observationState: "quarantined",
  };
}

function relationshipEndpointSourceId(
  endpoint: RelationshipCandidateRecord["subject"],
): string | null {
  return endpoint.endpointKind === "mention"
    ? endpoint.document.sourceId
    : endpoint.evidence.sourceId;
}

export function relationshipSupportAsEvidence(support: RelationshipSupport): LinkEvidence {
  if (support.kind === "text_support") {
    return {
      kind: "text_span",
      textUnitId: support.textUnitId,
      documentSnapshotId: support.documentSnapshotId,
      artifactId: support.artifactId,
      documentId: support.documentId,
      sectionId: support.sectionId,
      sectionCode: support.sectionCode,
      sectionHeading: support.sectionHeading,
      sectionPath: support.sectionPath,
      offsetEncoding: support.offsetEncoding,
      localStart: support.start,
      localEnd: support.end,
      documentStart: support.documentStart,
      documentEnd: support.documentEnd,
      quote: support.quote,
      quoteSha256: support.quoteSha256,
      rawContentSha256: support.rawContentSha256,
    };
  }
  if (support.kind === "structured_row") {
    return {
      kind: "structured_row",
      sourceId: support.record.sourceId,
      path: support.record.path,
      rowNumber: support.record.rowNumber,
      rowSha256: support.record.rowSha256,
      schemaVersion: support.record.schemaVersion,
    };
  }
  return {
    kind: "metadata",
    sourceId: support.record.sourceId,
    artifactId: support.record.artifactId,
    field: support.record.field,
    contentSha256: support.record.contentSha256,
  };
}

function baseReport(input: {
  readonly mode: GraphPopulationMode;
  readonly status: GraphPopulationStatus;
  readonly approval: GraphPopulationApprovalState;
  readonly inputs: LoadedInputs;
  readonly counts: GraphPopulationCounts;
  readonly files: Readonly<Record<string, string>>;
  readonly filesWritten: boolean;
  readonly checksums: Readonly<Record<string, string>>;
  readonly planId: string | null;
}): GraphPopulationReport {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: input.mode,
    status: input.status,
    approval: input.approval,
    input: {
      linkDir: relative(process.cwd(), input.inputs.link.directory).replaceAll("\\", "/"),
      linkManifestSha256: input.inputs.link.manifestSha256,
      confidentMatchesSha256: input.inputs.link.confidentMatchesSha256,
      relationshipDir: relative(process.cwd(), input.inputs.relationship.directory).replaceAll(
        "\\",
        "/",
      ),
      relationshipManifestSha256: input.inputs.relationship.manifestSha256,
      relationshipCandidatesSha256: input.inputs.relationship.relationshipCandidatesSha256,
    },
    counts: input.counts,
    files: input.files,
    filesWritten: input.filesWritten,
    checksums: input.checksums,
    planId: input.planId,
  };
}

async function writeValidationArtifacts(
  report: GraphPopulationReport,
  outputDir: string,
): Promise<{
  readonly files: Readonly<Record<string, string>>;
  readonly checksums: Readonly<Record<string, string>>;
}> {
  await mkdir(outputDir, { recursive: true });
  const files = { validation: "validation.json", manifest: "manifest.json" };
  const validationPayload = {
    ...report,
    files,
    filesWritten: true,
    checksums: {},
  };
  const validationText = `${JSON.stringify(validationPayload, null, 2)}\n`;
  const checksums = { validation: sha256(validationText) };
  await writeFile(join(outputDir, files.validation), validationText, "utf8");
  await writeFile(
    join(outputDir, files.manifest),
    `${JSON.stringify({ ...validationPayload, checksums }, null, 2)}\n`,
    "utf8",
  );
  return { files, checksums };
}

async function writePlanReports(
  report: GraphPopulationReport,
  outputDir: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const validationText = `${JSON.stringify({ ...report, filesWritten: true }, null, 2)}\n`;
  const manifest = {
    ...report,
    files,
    filesWritten: true,
    checksums: { ...report.checksums, validation: sha256(validationText) },
  };
  await writeFile(join(outputDir, files.validation), validationText, "utf8");
  await writeFile(
    join(outputDir, files.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortRecord(value: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function numberCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
