/**
 * Offline, candidate-only relationship extraction.
 *
 * Reads the graph-evidence text units and the candidate entity artifact.
 * Emits versioned relationship candidates with exact text support or an
 * explicit structured row reference. No canonical entity, entity link,
 * relationship truth, database row, embedding, or retrieval index is produced.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  ENTITY_MENTION_TAXONOMY_VERSION,
  RELATIONSHIP_KIND_DEFINITIONS,
  RELATIONSHIP_TAXONOMY_VERSION,
  extractStructuredRowRelationships,
  extractTextRelationships,
  type ExtractionDiagnostic,
  type GraphTextUnit,
  type MentionCandidateRecord,
  type RelationshipCandidateRecord,
  type StructuredObservationRecord,
} from "@repo/modules/retrieval";
import { createJsonlSink, readJsonlFile, sha256File, type JsonlSink } from "./artifact-jsonl";

const DEFAULT_GRAPH_DIR = "tooling/cleaning-lab/output/graph-evidence";
const DEFAULT_ENTITY_DIR = "tooling/cleaning-lab/output/entity-mentions";
const DEFAULT_OUTPUT_DIR = "tooling/cleaning-lab/output/relationships";
const EXTRACTOR_VERSION = "relationship-extraction-v1" as const;
const SUPPORTED_ENTITY_EXTRACTOR_VERSION = "entity-extraction-v1" as const;

export interface RelationshipExportOptions {
  readonly graphDir?: string;
  readonly entityDir?: string;
  readonly outputDir?: string;
  readonly dryRun?: boolean;
}

interface EntityArtifactManifest {
  readonly schemaVersion?: unknown;
  readonly status?: unknown;
  readonly extractorVersion?: unknown;
  readonly ontologyVersion?: unknown;
  readonly filesWritten?: unknown;
  readonly graphArtifact?: {
    readonly manifestSha256?: unknown;
    readonly profile?: unknown;
    readonly configHash?: unknown;
    readonly corpusSnapshotHash?: unknown;
    readonly sourceManifestSha256?: unknown;
  };
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly counts?: Readonly<Record<string, unknown>>;
}

interface GraphArtifactManifest {
  readonly schemaVersion?: unknown;
  readonly profile?: unknown;
  readonly config?: {
    readonly configHash?: unknown;
  };
  readonly sourceManifestSha256?: unknown;
  readonly corpusSnapshotHash?: unknown;
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
}

interface EntityArtifactInput {
  readonly directory: string;
  readonly manifest: EntityArtifactManifest;
  readonly manifestSha256: string;
  readonly mentionsPath: string;
  readonly observationsPath: string;
  readonly mentionsChecksum: string;
  readonly observationsChecksum: string;
}

interface GraphArtifactInput {
  readonly directory: string;
  readonly manifest: GraphArtifactManifest;
  readonly manifestSha256: string;
  readonly unitsPath: string;
}

interface Counts {
  readonly byKind: Record<string, number>;
  readonly byMethod: Record<string, number>;
  structuredRows: number;
  textUnits: number;
  mentions: number;
  observations: number;
  textRelationships: number;
  structuredRelationships: number;
  diagnostics: number;
}

export interface RelationshipExportReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly status: "candidate_only";
  readonly extractorVersion: string;
  readonly ontologyVersion: string;
  readonly entityArtifact: {
    readonly directory: string;
    readonly manifestSha256: string;
    readonly extractorVersion: string;
    readonly ontologyVersion: string;
    readonly entityMentionsChecksum: string;
    readonly structuredObservationsChecksum: string;
  };
  readonly graphArtifact: {
    readonly directory: string;
    readonly manifestSha256: string;
    readonly profile: string;
    readonly configHash: string;
    readonly corpusSnapshotHash: string;
  };
  readonly outputDir: string;
  readonly files: {
    readonly relationshipCandidates: string;
    readonly diagnostics: string;
    readonly taxonomy: string;
    readonly manifest: string;
  };
  readonly filesWritten: boolean;
  readonly checksums: {
    readonly relationshipCandidates: string;
    readonly diagnostics: string;
    readonly taxonomy: string;
  };
  readonly counts: {
    readonly relationships: number;
    readonly relationshipsByKind: Readonly<Record<string, number>>;
    readonly relationshipsByMethod: Readonly<Record<string, number>>;
    readonly textRelationships: number;
    readonly structuredRelationships: number;
    readonly documentsWithTextRelations: number;
    readonly textUnitsScanned: number;
    readonly mentionsScanned: number;
    readonly structuredObservations: number;
    readonly structuredRows: number;
    readonly diagnostics: number;
    readonly unobservedKinds: readonly string[];
  };
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
}

export async function runRelationshipExtraction(
  options: RelationshipExportOptions = {},
): Promise<RelationshipExportReport> {
  const graphDir = resolve(options.graphDir ?? DEFAULT_GRAPH_DIR);
  const entityDir = resolve(options.entityDir ?? DEFAULT_ENTITY_DIR);
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const dryRun = options.dryRun === true;
  const entity = await readEntityArtifact(entityDir);
  const graph = await readGraphArtifact(graphDir);
  if (String(entity.manifest.graphArtifact?.manifestSha256) !== graph.manifestSha256) {
    throw new Error(
      "Graph manifest hash does not match the manifest recorded by the entity artifact",
    );
  }
  if (String(entity.manifest.graphArtifact?.profile) !== String(graph.manifest.profile)) {
    throw new Error("Graph profile does not match the entity artifact");
  }
  if (
    String(entity.manifest.graphArtifact?.sourceManifestSha256) !==
    String(graph.manifest.sourceManifestSha256)
  ) {
    throw new Error("Graph source manifest does not match the entity artifact");
  }
  if (
    String(entity.manifest.graphArtifact?.configHash) !== String(graph.manifest.config?.configHash)
  ) {
    throw new Error("Graph config hash does not match the entity artifact");
  }
  if (
    String(entity.manifest.graphArtifact?.corpusSnapshotHash) !==
    String(graph.manifest.corpusSnapshotHash)
  ) {
    throw new Error("Graph corpus snapshot does not match the entity artifact");
  }

  const runId = relationshipRunId(entity, graph);
  const files = {
    relationshipCandidates: "relationship-candidates.jsonl",
    diagnostics: "diagnostics.jsonl",
    taxonomy: "taxonomy.json",
    manifest: "manifest.json",
  };
  if (!dryRun) await mkdir(outputDir, { recursive: true });
  const relationshipSink = await createJsonlSink(
    dryRun ? null : join(outputDir, files.relationshipCandidates),
  );
  const diagnosticSink = await createJsonlSink(dryRun ? null : join(outputDir, files.diagnostics));
  const counts: Counts = {
    byKind: emptyRelationshipKindCounts(),
    byMethod: {
      structured_row: 0,
      section_clause: 0,
      section_unit: 0,
    },
    structuredRows: 0,
    textUnits: 0,
    mentions: 0,
    observations: 0,
    textRelationships: 0,
    structuredRelationships: 0,
    diagnostics: 0,
  };
  const diagnosticsByCode: Record<string, number> = {};
  const documents = new Set<string>();
  const seen = new Set<string>();
  try {
    await processStructuredObservations({
      path: entity.observationsPath,
      runId,
      relationshipSink,
      diagnosticSink,
      counts,
      diagnosticsByCode,
      seen,
    });
    await processTextRelationships({
      graph,
      entity,
      runId,
      relationshipSink,
      diagnosticSink,
      counts,
      diagnosticsByCode,
      documents,
      seen,
    });
  } finally {
    await Promise.all([relationshipSink.close(), diagnosticSink.close()]);
  }

  const taxonomyText = `${JSON.stringify(
    {
      version: RELATIONSHIP_TAXONOMY_VERSION,
      status: "temporary_review_required",
      sourceEntityTaxonomy: ENTITY_MENTION_TAXONOMY_VERSION,
      definitions: RELATIONSHIP_KIND_DEFINITIONS,
    },
    null,
    2,
  )}\n`;
  const unobservedKinds = RELATIONSHIP_KIND_DEFINITIONS.map(
    (definition) => definition.relationshipKind,
  ).filter((kind) => counts.byKind[kind] === 0);
  const report: RelationshipExportReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun,
    status: "candidate_only",
    extractorVersion: EXTRACTOR_VERSION,
    ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
    entityArtifact: {
      directory: relative(process.cwd(), entity.directory).replaceAll("\\", "/"),
      manifestSha256: entity.manifestSha256,
      extractorVersion: String(entity.manifest.extractorVersion),
      ontologyVersion: String(entity.manifest.ontologyVersion),
      entityMentionsChecksum: entity.mentionsChecksum,
      structuredObservationsChecksum: entity.observationsChecksum,
    },
    graphArtifact: {
      directory: relative(process.cwd(), graph.directory).replaceAll("\\", "/"),
      manifestSha256: graph.manifestSha256,
      profile: String(graph.manifest.profile),
      configHash: String(graph.manifest.config?.configHash),
      corpusSnapshotHash: String(graph.manifest.corpusSnapshotHash),
    },
    outputDir: relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    files,
    filesWritten: false,
    checksums: {
      relationshipCandidates: relationshipSink.checksum,
      diagnostics: diagnosticSink.checksum,
      taxonomy: sha256(taxonomyText),
    },
    counts: {
      relationships: relationshipSink.count,
      relationshipsByKind: counts.byKind,
      relationshipsByMethod: counts.byMethod,
      textRelationships: counts.textRelationships,
      structuredRelationships: counts.structuredRelationships,
      documentsWithTextRelations: documents.size,
      textUnitsScanned: counts.textUnits,
      mentionsScanned: counts.mentions,
      structuredObservations: counts.observations,
      structuredRows: counts.structuredRows,
      diagnostics: counts.diagnostics,
      unobservedKinds,
    },
    diagnosticsByCode,
  };

  if (dryRun) return report;
  await writeFile(join(outputDir, files.taxonomy), taxonomyText, "utf8");
  await writeFile(
    join(outputDir, files.manifest),
    `${JSON.stringify({ ...report, filesWritten: true }, null, 2)}\n`,
    "utf8",
  );
  return { ...report, filesWritten: true };
}

async function readEntityArtifact(directory: string): Promise<EntityArtifactInput> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as EntityArtifactManifest;
  if (manifest.schemaVersion !== 1 || manifest.status !== "candidate_only") {
    throw new Error("Unsupported entity artifact manifest");
  }
  if (manifest.filesWritten !== true) {
    throw new Error("The entity artifact manifest does not describe written files");
  }
  if (manifest.ontologyVersion !== ENTITY_MENTION_TAXONOMY_VERSION) {
    throw new Error(
      `Entity ontology ${String(manifest.ontologyVersion)} is not ${ENTITY_MENTION_TAXONOMY_VERSION}`,
    );
  }
  if (manifest.extractorVersion !== SUPPORTED_ENTITY_EXTRACTOR_VERSION) {
    throw new Error(
      `Entity extractor ${String(manifest.extractorVersion)} is not ${SUPPORTED_ENTITY_EXTRACTOR_VERSION}`,
    );
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const mentionsFile = requiredString(files.entityMentions, "entity files.entityMentions");
  const observationsFile = requiredString(
    files.structuredObservations,
    "entity files.structuredObservations",
  );
  const taxonomyFile = requiredString(files.taxonomy, "entity files.taxonomy");
  const mentionsPath = join(directory, mentionsFile);
  const observationsPath = join(directory, observationsFile);
  const taxonomyPath = join(directory, taxonomyFile);
  const mentionsChecksum = await sha256File(mentionsPath);
  const observationsChecksum = await sha256File(observationsPath);
  if (
    mentionsChecksum !== requiredString(checksums.entityMentions, "entity checksums.entityMentions")
  ) {
    throw new Error("Entity mentions checksum mismatch");
  }
  if (
    observationsChecksum !==
    requiredString(checksums.structuredObservations, "entity checksums.structuredObservations")
  ) {
    throw new Error("Structured observations checksum mismatch");
  }
  const taxonomyChecksum = await sha256File(taxonomyPath);
  if (taxonomyChecksum !== requiredString(checksums.taxonomy, "entity checksums.taxonomy")) {
    throw new Error("Entity taxonomy checksum mismatch");
  }
  const taxonomy = JSON.parse(await readFile(taxonomyPath, "utf8")) as {
    readonly version?: unknown;
    readonly status?: unknown;
  };
  if (
    taxonomy.version !== ENTITY_MENTION_TAXONOMY_VERSION ||
    taxonomy.status !== "temporary_review_required"
  ) {
    throw new Error("Entity taxonomy is not the expected temporary review artifact");
  }
  return {
    directory,
    manifest,
    manifestSha256: sha256(manifestText),
    mentionsPath,
    observationsPath,
    mentionsChecksum,
    observationsChecksum,
  };
}

async function readGraphArtifact(directory: string): Promise<GraphArtifactInput> {
  const manifestPath = join(directory, "manifest.json");
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as GraphArtifactManifest;
  if (manifest.schemaVersion !== 1 || manifest.profile !== "graph-evidence-v1") {
    throw new Error("Unsupported graph-evidence artifact manifest");
  }
  const files = manifest.files ?? {};
  const checksums = manifest.checksums ?? {};
  const unitsFile = requiredString(files.textUnits, "graph files.textUnits");
  const unitsPath = join(directory, unitsFile);
  const actualChecksum = await sha256File(unitsPath);
  if (actualChecksum !== requiredString(checksums.textUnits, "graph checksums.textUnits")) {
    throw new Error("Graph text-units checksum mismatch");
  }
  return {
    directory,
    manifest,
    manifestSha256: sha256(manifestText),
    unitsPath,
  };
}

async function processStructuredObservations(input: {
  readonly path: string;
  readonly runId: string;
  readonly relationshipSink: JsonlSink;
  readonly diagnosticSink: JsonlSink;
  readonly counts: Counts;
  readonly diagnosticsByCode: Record<string, number>;
  readonly seen: Set<string>;
}): Promise<void> {
  let currentKey: string | null = null;
  let currentGroup: StructuredObservationRecord[] = [];
  for await (const observation of readJsonlFile<StructuredObservationRecord>(input.path)) {
    const key = observationGroupKey(observation);
    if (key !== currentKey) {
      if (currentKey !== null) {
        await flushObservationGroup(input, currentGroup);
      }
      currentKey = key;
      currentGroup = [];
    }
    currentGroup.push(observation);
  }
  if (currentKey !== null) await flushObservationGroup(input, currentGroup);
}

async function flushObservationGroup(
  input: {
    readonly runId: string;
    readonly relationshipSink: JsonlSink;
    readonly diagnosticSink: JsonlSink;
    readonly counts: Counts;
    readonly diagnosticsByCode: Record<string, number>;
    readonly seen: Set<string>;
  },
  observations: readonly StructuredObservationRecord[],
): Promise<void> {
  input.counts.structuredRows += 1;
  input.counts.observations += observations.length;
  const result = extractStructuredRowRelationships({
    observations,
    extractionRunId: input.runId,
    ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
  });
  await writeRelationships(input, result.relationships, "structured");
  await writeDiagnostics(input, result.diagnostics);
}

async function processTextRelationships(input: {
  readonly graph: GraphArtifactInput;
  readonly entity: EntityArtifactInput;
  readonly runId: string;
  readonly relationshipSink: JsonlSink;
  readonly diagnosticSink: JsonlSink;
  readonly counts: Counts;
  readonly diagnosticsByCode: Record<string, number>;
  readonly documents: Set<string>;
  readonly seen: Set<string>;
}): Promise<void> {
  const unitIterator = readJsonlFile<GraphTextUnit>(input.graph.unitsPath)[Symbol.asyncIterator]();
  let nextUnit = await unitIterator.next();
  for await (const group of groupMentionsByUnit(input.entity.mentionsPath)) {
    while (!nextUnit.done && nextUnit.value.textUnitId !== group.textUnitId) {
      nextUnit = await unitIterator.next();
    }
    if (nextUnit.done) {
      throw new Error(`No graph text unit found for entity mention group ${group.textUnitId}`);
    }
    const unit = nextUnit.value;
    const mismatch = group.mentions.find(
      (mention) =>
        mention.evidence.documentSnapshotId !== unit.documentSnapshotId ||
        mention.evidence.artifactId !== unit.artifactId,
    );
    if (mismatch) {
      throw new Error(
        `Entity mention ${mismatch.mentionId} does not match graph unit ${unit.textUnitId}`,
      );
    }
    input.counts.textUnits += 1;
    input.counts.mentions += group.mentions.length;
    const result = extractTextRelationships({
      unit,
      mentions: group.mentions,
      extractionRunId: input.runId,
      ontologyVersion: RELATIONSHIP_TAXONOMY_VERSION,
    });
    await writeRelationships(input, result.relationships, "text");
    for (const relationship of result.relationships) {
      if (relationship.support.kind === "text_support") {
        input.documents.add(relationship.support.artifactId);
      }
    }
    await writeDiagnostics(input, result.diagnostics);
    nextUnit = await unitIterator.next();
  }
}

async function* groupMentionsByUnit(
  path: string,
): AsyncGenerator<{ readonly textUnitId: string; readonly mentions: MentionCandidateRecord[] }> {
  let currentId: string | null = null;
  let currentMentions: MentionCandidateRecord[] = [];
  for await (const mention of readJsonlFile<MentionCandidateRecord>(path)) {
    const textUnitId = mention.evidence.textUnitId;
    if (textUnitId !== currentId) {
      if (currentId !== null) {
        yield { textUnitId: currentId, mentions: currentMentions };
      }
      currentId = textUnitId;
      currentMentions = [];
    }
    currentMentions.push(mention);
  }
  if (currentId !== null) yield { textUnitId: currentId, mentions: currentMentions };
}

async function writeRelationships(
  input: {
    readonly relationshipSink: JsonlSink;
    readonly counts: Counts;
    readonly seen: Set<string>;
  },
  relationships: readonly RelationshipCandidateRecord[],
  source: "text" | "structured",
): Promise<void> {
  for (const relationship of relationships) {
    if (input.seen.has(relationship.relationshipId)) continue;
    input.seen.add(relationship.relationshipId);
    await input.relationshipSink.write(relationship);
    input.counts.byKind[relationship.relationshipKind] =
      (input.counts.byKind[relationship.relationshipKind] ?? 0) + 1;
    input.counts.byMethod[relationship.method] =
      (input.counts.byMethod[relationship.method] ?? 0) + 1;
    if (source === "text") input.counts.textRelationships += 1;
    else input.counts.structuredRelationships += 1;
  }
}

async function writeDiagnostics(
  input: {
    readonly diagnosticSink: JsonlSink;
    readonly counts: Counts;
    readonly diagnosticsByCode: Record<string, number>;
  },
  diagnostics: readonly ExtractionDiagnostic[],
): Promise<void> {
  for (const diagnostic of diagnostics) {
    await input.diagnosticSink.write(diagnostic);
    input.counts.diagnostics += 1;
    input.diagnosticsByCode[diagnostic.code] = (input.diagnosticsByCode[diagnostic.code] ?? 0) + 1;
  }
}

function observationGroupKey(observation: StructuredObservationRecord): string {
  const evidence = observation.evidence;
  return evidence.kind === "structured_record"
    ? [
        "structured",
        evidence.sourceId,
        evidence.path,
        String(evidence.rowNumber),
        evidence.rowSha256,
      ].join(":")
    : [
        "metadata",
        evidence.sourceId,
        evidence.artifactId,
        evidence.field,
        evidence.contentSha256,
      ].join(":");
}

function emptyRelationshipKindCounts(): Record<string, number> {
  return Object.fromEntries(
    RELATIONSHIP_KIND_DEFINITIONS.map((definition) => [definition.relationshipKind, 0]),
  ) as Record<string, number>;
}

function relationshipRunId(entity: EntityArtifactInput, graph: GraphArtifactInput): string {
  return `rext_${sha256(
    [
      EXTRACTOR_VERSION,
      RELATIONSHIP_TAXONOMY_VERSION,
      entity.manifestSha256,
      entity.mentionsChecksum,
      entity.observationsChecksum,
      graph.manifestSha256,
    ].join("\u0000"),
  ).slice(0, 24)}`;
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
