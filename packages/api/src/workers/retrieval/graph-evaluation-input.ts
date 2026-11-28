/**
 * Load and verify the candidate artifacts consumed by graph evaluation.
 *
 * Every artifact checksum and cross-artifact identity is verified before any
 * record reaches the evaluator. An optional text-unit limit supports
 * memory-constrained runs; filtered text-scoped records are dropped and counted
 * so a partial run can never look like a full-corpus run.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  ENTITY_LINK_TAXONOMY_VERSION,
  RELATIONSHIP_TAXONOMY_VERSION,
  evaluationClusterFrom,
  evaluationMentionFrom,
  evaluationObservationFrom,
  evaluationRelationshipFrom,
  evaluationTextUnitFrom,
  evaluationUnresolvedFrom,
  parseGoldDatasetManifest,
  parseGoldEntityAnnotation,
  parseGoldLinkAnnotation,
  parseGoldRelationshipAnnotation,
  type CandidateEntityCluster,
  type EvaluationEntityCluster,
  type EvaluationMention,
  type EvaluationObservation,
  type EvaluationRelationship,
  type EvaluationTextUnit,
  type EvaluationUnresolvedLink,
  type GoldDataset,
  type GraphTextUnit,
  type KnowledgeGraphEvaluationInput,
  type MentionCandidateRecord,
  type RelationshipCandidateRecord,
  type StructuredObservationRecord,
  type UnresolvedLinkCandidate,
} from "@repo/modules/retrieval";
import { readJsonlFile, sha256File } from "./artifact-jsonl";
import { readEntityArtifactInput } from "./entity-artifact-input";

export const GRAPH_EVALUATION_GOLD_FILES = {
  entityMentions: "entity-mentions.gold.jsonl",
  relationships: "relationships.gold.jsonl",
  entityLinks: "entity-links.gold.jsonl",
} as const;

const DEFAULT_GRAPH_DIR = "tooling/cleaning-lab/output/graph-evidence";
const DEFAULT_ENTITY_DIR = "tooling/cleaning-lab/output/entity-mentions";
const DEFAULT_RELATIONSHIP_DIR = "tooling/cleaning-lab/output/relationships";
const DEFAULT_LINK_DIR = "tooling/cleaning-lab/output/entity-links";
const DEFAULT_GOLD_DIR = "tooling/retrieval-lab/eval/graph-gold";
const SUPPORTED_RELATIONSHIP_EXTRACTOR = "relationship-extraction-v1";
const SUPPORTED_LINK_EXTRACTOR = "entity-link-extraction-v1";

export interface GraphEvaluationOptions {
  readonly graphDir?: string;
  readonly entityDir?: string;
  readonly relationshipDir?: string;
  readonly linkDir?: string;
  readonly goldDir?: string;
  readonly limit?: number | null;
}

export interface ArtifactIdentity {
  readonly directory: string;
  readonly manifestSha256: string;
}

export interface GraphEvaluationIdentities {
  readonly graph: ArtifactIdentity & {
    readonly profile: string;
    readonly configHash: string;
    readonly corpusSnapshotHash: string;
    readonly sourceManifestSha256: string;
  };
  readonly entity: ArtifactIdentity & {
    readonly mentionsChecksum: string;
    readonly observationsChecksum: string;
  };
  readonly relationship: ArtifactIdentity & {
    readonly candidatesChecksum: string;
  };
  readonly link: ArtifactIdentity;
  readonly gold: {
    readonly directory: string;
    readonly manifestSha256: string;
    readonly files: readonly { readonly name: string; readonly sha256: string }[];
  };
}

export interface GraphEvaluationFiltering {
  readonly enabled: boolean;
  readonly limit: number | null;
  readonly mentionsDropped: number;
  readonly relationshipsDropped: number;
  readonly clustersDropped: number;
  readonly unresolvedDropped: number;
}

export interface LoadedGraphEvaluationInput extends KnowledgeGraphEvaluationInput {
  readonly identities: GraphEvaluationIdentities;
  readonly filtering: GraphEvaluationFiltering;
}

interface GraphManifest {
  readonly schemaVersion?: unknown;
  readonly profile?: unknown;
  readonly config?: { readonly configHash?: unknown };
  readonly sourceManifestSha256?: unknown;
  readonly corpusSnapshotHash?: unknown;
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
}

interface RelationshipManifest {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly filesWritten?: unknown;
  readonly extractorVersion?: unknown;
  readonly ontologyVersion?: unknown;
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly entityArtifact?: {
    readonly manifestSha256?: unknown;
    readonly entityMentionsChecksum?: unknown;
    readonly structuredObservationsChecksum?: unknown;
  };
  readonly graphArtifact?: {
    readonly manifestSha256?: unknown;
    readonly profile?: unknown;
    readonly configHash?: unknown;
    readonly corpusSnapshotHash?: unknown;
  };
}

interface LinkManifest {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly filesWritten?: unknown;
  readonly extractorVersion?: unknown;
  readonly ontologyVersion?: unknown;
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly entityArtifact?: {
    readonly manifestSha256?: unknown;
    readonly entityMentionsChecksum?: unknown;
    readonly structuredObservationsChecksum?: unknown;
  };
}

interface GraphArtifact {
  readonly directory: string;
  readonly manifest: GraphManifest;
  readonly manifestSha256: string;
  readonly units: readonly EvaluationTextUnit[];
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
}

export async function loadGraphEvaluationInput(
  options: GraphEvaluationOptions = {},
): Promise<LoadedGraphEvaluationInput> {
  const graphDir = resolve(options.graphDir ?? DEFAULT_GRAPH_DIR);
  const entityDir = resolve(options.entityDir ?? DEFAULT_ENTITY_DIR);
  const relationshipDir = resolve(options.relationshipDir ?? DEFAULT_RELATIONSHIP_DIR);
  const linkDir = resolve(options.linkDir ?? DEFAULT_LINK_DIR);
  const goldDir = resolve(options.goldDir ?? DEFAULT_GOLD_DIR);
  const limit = normalizeLimit(options.limit);

  const graph = await readGraphArtifact(graphDir, limit);
  const entity = await readEntityArtifactInput(entityDir);
  const entityManifest = JSON.parse(await readFile(join(entityDir, "manifest.json"), "utf8")) as {
    readonly graphArtifact?: {
      readonly manifestSha256?: unknown;
      readonly profile?: unknown;
      readonly configHash?: unknown;
      readonly corpusSnapshotHash?: unknown;
      readonly sourceManifestSha256?: unknown;
    };
  };
  verifyEntityGraphIdentity(entityManifest.graphArtifact, graph);

  const unitIds = new Set(graph.units.map((unit) => unit.textUnitId));
  const mentions: EvaluationMention[] = [];
  let mentionsDropped = 0;
  for await (const mention of readJsonlFile<MentionCandidateRecord>(entity.mentionsPath)) {
    if (limit !== null && !unitIds.has(mention.evidence.textUnitId)) {
      mentionsDropped += 1;
      continue;
    }
    mentions.push(evaluationMentionFrom(mention));
  }
  const observations: EvaluationObservation[] = [];
  for await (const observation of readJsonlFile<StructuredObservationRecord>(
    entity.observationsPath,
  )) {
    observations.push(evaluationObservationFrom(observation));
  }
  const entityDiagnostics = await countDiagnostics(
    join(entityDir, requiredString(entity.manifest.files?.diagnostics, "entity diagnostics file")),
  );

  const relationship = await readRelationshipArtifact(
    relationshipDir,
    entity.manifestSha256,
    entity.mentionsChecksum,
    entity.observationsChecksum,
    graph,
  );
  const knownMentions = new Set(mentions.map((mention) => mention.mentionId));
  const knownObservations = new Set(observations.map((observation) => observation.observationId));
  const relationships: EvaluationRelationship[] = [];
  let relationshipsDropped = 0;
  for await (const record of readJsonlFile<RelationshipCandidateRecord>(
    relationship.candidatesPath,
  )) {
    const kept =
      endpointInScope(
        record.subject.endpointId,
        record.subject.endpointKind,
        knownMentions,
        knownObservations,
      ) &&
      endpointInScope(
        record.object.endpointId,
        record.object.endpointKind,
        knownMentions,
        knownObservations,
      );
    if (limit !== null && !kept) {
      relationshipsDropped += 1;
      continue;
    }
    relationships.push(evaluationRelationshipFrom(record));
  }

  const link = await readLinkArtifact(
    linkDir,
    entity.manifestSha256,
    entity.mentionsChecksum,
    entity.observationsChecksum,
  );
  const confidentClusters: EvaluationEntityCluster[] = [];
  const ambiguousClusters: EvaluationEntityCluster[] = [];
  let clustersDropped = 0;
  for await (const cluster of readJsonlFile<CandidateEntityCluster>(link.confidentPath)) {
    const mapped = evaluationClusterFrom(cluster);
    if (limit !== null && !clusterInScope(mapped, knownMentions, knownObservations)) {
      clustersDropped += 1;
      continue;
    }
    confidentClusters.push(mapped);
  }
  for await (const cluster of readJsonlFile<CandidateEntityCluster>(link.ambiguousPath)) {
    const mapped = evaluationClusterFrom(cluster);
    if (limit !== null && !clusterInScope(mapped, knownMentions, knownObservations)) {
      clustersDropped += 1;
      continue;
    }
    ambiguousClusters.push(mapped);
  }
  const unresolvedCandidates: EvaluationUnresolvedLink[] = [];
  let unresolvedDropped = 0;
  for await (const candidate of readJsonlFile<UnresolvedLinkCandidate>(link.unresolvedPath)) {
    const mapped = evaluationUnresolvedFrom(candidate);
    if (
      limit !== null &&
      !endpointInScope(
        mapped.endpoint.endpointId,
        mapped.endpoint.endpointKind,
        knownMentions,
        knownObservations,
      )
    ) {
      unresolvedDropped += 1;
      continue;
    }
    unresolvedCandidates.push(mapped);
  }

  const gold = await readGoldDataset(goldDir);
  const linkDiagnostics = await countDiagnostics(link.diagnosticsPath);
  const relationshipDiagnostics = await countDiagnostics(relationship.diagnosticsPath);

  return {
    textUnits: graph.units,
    mentions,
    observations,
    relationships,
    confidentClusters,
    ambiguousClusters,
    unresolvedCandidates,
    gold: gold.dataset,
    artifacts: {
      graphDiagnosticsByCode: graph.diagnosticsByCode,
      entityDiagnosticsByCode: entityDiagnostics,
      relationshipDiagnosticsByCode: relationshipDiagnostics,
      linkDiagnosticsByCode: linkDiagnostics,
      limited: limit !== null,
    },
    identities: {
      graph: {
        directory: relative(process.cwd(), graph.directory).replaceAll("\\", "/"),
        manifestSha256: graph.manifestSha256,
        profile: String(graph.manifest.profile),
        configHash: String(graph.manifest.config?.configHash),
        corpusSnapshotHash: String(graph.manifest.corpusSnapshotHash),
        sourceManifestSha256: String(graph.manifest.sourceManifestSha256),
      },
      entity: {
        directory: relative(process.cwd(), entityDir).replaceAll("\\", "/"),
        manifestSha256: entity.manifestSha256,
        mentionsChecksum: entity.mentionsChecksum,
        observationsChecksum: entity.observationsChecksum,
      },
      relationship: {
        directory: relative(process.cwd(), relationshipDir).replaceAll("\\", "/"),
        manifestSha256: relationship.manifestSha256,
        candidatesChecksum: relationship.candidatesChecksum,
      },
      link: {
        directory: relative(process.cwd(), linkDir).replaceAll("\\", "/"),
        manifestSha256: link.manifestSha256,
      },
      gold: {
        directory: relative(process.cwd(), goldDir).replaceAll("\\", "/"),
        manifestSha256: gold.manifestSha256,
        files: gold.files,
      },
    },
    filtering: {
      enabled: limit !== null,
      limit,
      mentionsDropped,
      relationshipsDropped,
      clustersDropped,
      unresolvedDropped,
    },
  };
}

async function readGraphArtifact(directory: string, limit: number | null): Promise<GraphArtifact> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as GraphManifest;
  if (manifest.schemaVersion !== 1 || manifest.profile !== "graph-evidence-v1") {
    throw new Error("Unsupported graph-evidence artifact manifest");
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const unitsFile = requiredString(files.textUnits, "graph files.textUnits");
  const diagnosticsFile = requiredString(files.diagnostics, "graph files.diagnostics");
  const sectionsFile = requiredString(files.sections, "graph files.sections");
  for (const [name, file] of [
    ["textUnits", unitsFile],
    ["diagnostics", diagnosticsFile],
    ["sections", sectionsFile],
  ] as const) {
    const actual = await sha256File(join(directory, file));
    if (actual !== requiredString(checksums[name], `graph checksums.${name}`)) {
      throw new Error(`Graph ${name} checksum mismatch`);
    }
  }
  const units: EvaluationTextUnit[] = [];
  for await (const unit of readJsonlFile<GraphTextUnit>(join(directory, unitsFile))) {
    units.push(evaluationTextUnitFrom(unit));
    if (limit !== null && units.length >= limit) break;
  }
  return {
    directory,
    manifest,
    manifestSha256: sha256(manifestText),
    units,
    diagnosticsByCode: await countDiagnostics(join(directory, diagnosticsFile)),
  };
}

async function readRelationshipArtifact(
  directory: string,
  entityManifestSha256: string,
  mentionsChecksum: string,
  observationsChecksum: string,
  graph: GraphArtifact,
): Promise<{
  readonly manifestSha256: string;
  readonly candidatesPath: string;
  readonly diagnosticsPath: string;
  readonly candidatesChecksum: string;
}> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as RelationshipManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "candidate_only") {
    throw new Error("Unsupported relationship artifact manifest");
  }
  if (manifest.filesWritten !== true) {
    throw new Error("The relationship artifact manifest does not describe written files");
  }
  if (manifest.ontologyVersion !== RELATIONSHIP_TAXONOMY_VERSION) {
    throw new Error(
      `Relationship ontology ${String(manifest.ontologyVersion)} is not ${RELATIONSHIP_TAXONOMY_VERSION}`,
    );
  }
  if (manifest.extractorVersion !== SUPPORTED_RELATIONSHIP_EXTRACTOR) {
    throw new Error(
      `Relationship extractor ${String(manifest.extractorVersion)} is not ${SUPPORTED_RELATIONSHIP_EXTRACTOR}`,
    );
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const candidatesPath = join(
    directory,
    requiredString(files.relationshipCandidates, "relationship files.relationshipCandidates"),
  );
  const diagnosticsPath = join(
    directory,
    requiredString(files.diagnostics, "relationship files.diagnostics"),
  );
  const candidatesChecksum = await sha256File(candidatesPath);
  if (
    candidatesChecksum !==
    requiredString(
      checksums.relationshipCandidates,
      "relationship checksums.relationshipCandidates",
    )
  ) {
    throw new Error("Relationship candidates checksum mismatch");
  }
  await verifyChecksum(diagnosticsPath, checksums.diagnostics, "relationship diagnostics");
  const taxonomyPath = join(
    directory,
    requiredString(files.taxonomy, "relationship files.taxonomy"),
  );
  await verifyChecksum(taxonomyPath, checksums.taxonomy, "relationship taxonomy");
  await verifyTaxonomy(taxonomyPath, RELATIONSHIP_TAXONOMY_VERSION, "relationship");
  if (String(manifest.entityArtifact?.manifestSha256) !== entityManifestSha256) {
    throw new Error("Relationship artifact was built from a different entity artifact");
  }
  if (String(manifest.entityArtifact?.entityMentionsChecksum) !== mentionsChecksum) {
    throw new Error("Relationship artifact entity mention checksum does not match");
  }
  if (String(manifest.entityArtifact?.structuredObservationsChecksum) !== observationsChecksum) {
    throw new Error("Relationship artifact observation checksum does not match");
  }
  if (String(manifest.graphArtifact?.manifestSha256) !== graph.manifestSha256) {
    throw new Error("Relationship artifact was built from a different graph artifact");
  }
  if (String(manifest.graphArtifact?.profile) !== String(graph.manifest.profile)) {
    throw new Error("Relationship artifact graph profile does not match");
  }
  if (String(manifest.graphArtifact?.configHash) !== String(graph.manifest.config?.configHash)) {
    throw new Error("Relationship artifact graph configuration does not match");
  }
  if (
    String(manifest.graphArtifact?.corpusSnapshotHash) !== String(graph.manifest.corpusSnapshotHash)
  ) {
    throw new Error("Relationship artifact graph snapshot does not match");
  }
  return {
    manifestSha256: sha256(manifestText),
    candidatesPath,
    diagnosticsPath,
    candidatesChecksum,
  };
}

async function readLinkArtifact(
  directory: string,
  entityManifestSha256: string,
  mentionsChecksum: string,
  observationsChecksum: string,
): Promise<{
  readonly manifestSha256: string;
  readonly confidentPath: string;
  readonly ambiguousPath: string;
  readonly unresolvedPath: string;
  readonly diagnosticsPath: string;
}> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as LinkManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "candidate_only") {
    throw new Error("Unsupported entity-link artifact manifest");
  }
  if (manifest.filesWritten !== true) {
    throw new Error("The entity-link artifact manifest does not describe written files");
  }
  if (manifest.ontologyVersion !== ENTITY_LINK_TAXONOMY_VERSION) {
    throw new Error(
      `Entity-link ontology ${String(manifest.ontologyVersion)} is not ${ENTITY_LINK_TAXONOMY_VERSION}`,
    );
  }
  if (manifest.extractorVersion !== SUPPORTED_LINK_EXTRACTOR) {
    throw new Error(
      `Entity-link extractor ${String(manifest.extractorVersion)} is not ${SUPPORTED_LINK_EXTRACTOR}`,
    );
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const confidentPath = join(
    directory,
    requiredString(files.confidentMatches, "link files.confidentMatches"),
  );
  const ambiguousPath = join(
    directory,
    requiredString(files.ambiguousMatches, "link files.ambiguousMatches"),
  );
  const unresolvedPath = join(
    directory,
    requiredString(files.unresolvedCandidates, "link files.unresolvedCandidates"),
  );
  const diagnosticsPath = join(
    directory,
    requiredString(files.diagnostics, "link files.diagnostics"),
  );
  await verifyChecksum(confidentPath, checksums.confidentMatches, "link confident matches");
  await verifyChecksum(ambiguousPath, checksums.ambiguousMatches, "link ambiguous matches");
  await verifyChecksum(
    unresolvedPath,
    checksums.unresolvedCandidates,
    "link unresolved candidates",
  );
  await verifyChecksum(diagnosticsPath, checksums.diagnostics, "link diagnostics");
  const taxonomyPath = join(directory, requiredString(files.taxonomy, "link files.taxonomy"));
  await verifyChecksum(taxonomyPath, checksums.taxonomy, "link taxonomy");
  await verifyTaxonomy(taxonomyPath, ENTITY_LINK_TAXONOMY_VERSION, "entity-link");
  if (String(manifest.entityArtifact?.manifestSha256) !== entityManifestSha256) {
    throw new Error("Entity-link artifact was built from a different entity artifact");
  }
  if (String(manifest.entityArtifact?.entityMentionsChecksum) !== mentionsChecksum) {
    throw new Error("Entity-link artifact entity mention checksum does not match");
  }
  if (String(manifest.entityArtifact?.structuredObservationsChecksum) !== observationsChecksum) {
    throw new Error("Entity-link artifact observation checksum does not match");
  }
  return {
    manifestSha256: sha256(manifestText),
    confidentPath,
    ambiguousPath,
    unresolvedPath,
    diagnosticsPath,
  };
}

async function readGoldDataset(directory: string): Promise<{
  readonly dataset: GoldDataset;
  readonly manifestSha256: string;
  readonly files: readonly { readonly name: string; readonly sha256: string }[];
}> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = parseGoldDatasetManifest(JSON.parse(manifestText));
  const entityMentions = await readGoldJsonl(
    join(directory, GOLD_ANNOTATIONS.entityMentions),
    parseGoldEntityAnnotation,
  );
  const relationships = await readGoldJsonl(
    join(directory, GOLD_ANNOTATIONS.relationships),
    parseGoldRelationshipAnnotation,
  );
  const entityLinks = await readGoldJsonl(
    join(directory, GOLD_ANNOTATIONS.entityLinks),
    parseGoldLinkAnnotation,
  );
  const files = await Promise.all(
    Object.values(GOLD_ANNOTATIONS).map(async (name) => ({
      name,
      sha256: await sha256File(join(directory, name)),
    })),
  );
  return {
    dataset: { manifest, entityMentions, relationships, entityLinks },
    manifestSha256: sha256(manifestText),
    files,
  };
}

const GOLD_ANNOTATIONS = GRAPH_EVALUATION_GOLD_FILES;

async function readGoldJsonl<T>(
  path: string,
  parse: (value: unknown, context: string) => T,
): Promise<T[]> {
  const text = await readFile(path, "utf8");
  const result: T[] = [];
  const lines = text.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (cause) {
      throw new Error(`Invalid JSON in ${path} at line ${index + 1}`, { cause });
    }
    result.push(parse(value, `${path}:${index + 1}`));
  }
  return result;
}

interface GraphIdentity {
  readonly manifestSha256?: unknown;
  readonly profile?: unknown;
  readonly configHash?: unknown;
  readonly corpusSnapshotHash?: unknown;
  readonly sourceManifestSha256?: unknown;
}

function verifyEntityGraphIdentity(value: GraphIdentity | undefined, graph: GraphArtifact): void {
  if (String(value?.manifestSha256) !== graph.manifestSha256) {
    throw new Error("Entity artifact was built from a different graph artifact");
  }
  if (String(value?.profile) !== String(graph.manifest.profile)) {
    throw new Error("Entity artifact graph profile does not match");
  }
  if (String(value?.configHash) !== String(graph.manifest.config?.configHash)) {
    throw new Error("Entity artifact graph configuration does not match");
  }
  if (String(value?.corpusSnapshotHash) !== String(graph.manifest.corpusSnapshotHash)) {
    throw new Error("Entity artifact graph snapshot does not match");
  }
  if (String(value?.sourceManifestSha256) !== String(graph.manifest.sourceManifestSha256)) {
    throw new Error("Entity artifact source manifest does not match");
  }
}

async function verifyChecksum(path: string, expected: unknown, name: string): Promise<void> {
  const actual = await sha256File(path);
  if (actual !== requiredString(expected, `${name} checksum`)) {
    throw new Error(`${name} checksum mismatch`);
  }
}

async function verifyTaxonomy(path: string, version: string, name: string): Promise<void> {
  const taxonomy = JSON.parse(await readFile(path, "utf8")) as {
    readonly version?: unknown;
    readonly status?: unknown;
  };
  if (taxonomy.version !== version || taxonomy.status !== "temporary_review_required") {
    throw new Error(`${name} taxonomy is not the expected temporary review artifact`);
  }
}

async function countDiagnostics(path: string): Promise<Readonly<Record<string, number>>> {
  const counts: Record<string, number> = {};
  for await (const diagnostic of readJsonlFile<{ readonly code?: unknown }>(path)) {
    const code = typeof diagnostic.code === "string" ? diagnostic.code : "unknown";
    counts[code] = (counts[code] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function clusterInScope(
  cluster: EvaluationEntityCluster,
  mentions: ReadonlySet<string>,
  observations: ReadonlySet<string>,
): boolean {
  return cluster.members.every((member) =>
    endpointInScope(member.endpointId, member.endpointKind, mentions, observations),
  );
}

function endpointInScope(
  endpointId: string,
  endpointKind: "mention" | "observation",
  mentions: ReadonlySet<string>,
  observations: ReadonlySet<string>,
): boolean {
  return endpointKind === "mention" ? mentions.has(endpointId) : observations.has(endpointId);
}

function normalizeLimit(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("limit must be a positive integer or null");
  }
  return value;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
