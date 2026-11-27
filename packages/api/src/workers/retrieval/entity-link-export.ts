/**
 * Offline, candidate-only entity linking and deduplication.
 *
 * Reads the candidate entity artifact, builds deterministic identity keys, and
 * emits confident, ambiguous, and unresolved candidate groups. No canonical
 * entity, entity resolution, database row, or graph projection is produced.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  ENTITY_LINK_TAXONOMY_VERSION,
  ENTITY_MENTION_TAXONOMY_VERSION,
  LINK_GROUP_DEFINITIONS,
  clusterEntityLinks,
  linkRecordFromMention,
  linkRecordsForStructuredRow,
  type CandidateEntityCluster,
  type LinkRecord,
  type MentionCandidateRecord,
  type StructuredObservationRecord,
  type UnresolvedLinkCandidate,
} from "@repo/modules/retrieval";
import { createJsonlSink, readJsonlFile, type JsonlSink } from "./artifact-jsonl";
import { readEntityArtifactInput } from "./entity-artifact-input";

const DEFAULT_ENTITY_DIR = "tooling/cleaning-lab/output/entity-mentions";
const DEFAULT_OUTPUT_DIR = "tooling/cleaning-lab/output/entity-links";
const DEFAULT_MAX_MEMBERS = 5000;
const EXTRACTOR_VERSION = "entity-link-extraction-v1" as const;

export interface EntityLinkExportOptions {
  readonly entityDir?: string;
  readonly outputDir?: string;
  readonly dryRun?: boolean;
  readonly maxMembers?: number;
}

interface Counts {
  mentions: number;
  observations: number;
  structuredRows: number;
  linkableRecords: number;
  diagnostics: number;
}

export interface EntityLinkExportReport {
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
  readonly outputDir: string;
  readonly files: {
    readonly confidentMatches: string;
    readonly ambiguousMatches: string;
    readonly unresolvedCandidates: string;
    readonly diagnostics: string;
    readonly taxonomy: string;
    readonly manifest: string;
  };
  readonly filesWritten: boolean;
  readonly checksums: {
    readonly confidentMatches: string;
    readonly ambiguousMatches: string;
    readonly unresolvedCandidates: string;
    readonly diagnostics: string;
    readonly taxonomy: string;
  };
  readonly counts: {
    readonly mentionsScanned: number;
    readonly observationsScanned: number;
    readonly structuredRowsScanned: number;
    readonly linkableRecords: number;
    readonly confidentClusters: number;
    readonly ambiguousClusters: number;
    readonly unresolvedCandidates: number;
    readonly confidentMembers: number;
    readonly ambiguousMembers: number;
    readonly clustersByGroup: Readonly<Record<string, number>>;
    readonly confidentByGroup: Readonly<Record<string, number>>;
    readonly ambiguousByGroup: Readonly<Record<string, number>>;
    readonly unresolvedByGroup: Readonly<Record<string, number>>;
    readonly diagnostics: number;
    readonly unobservedGroups: readonly string[];
    readonly maxMembers: number;
    readonly truncatedClusters: number;
  };
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
}

export async function runEntityLinkExtraction(
  options: EntityLinkExportOptions = {},
): Promise<EntityLinkExportReport> {
  const entityDir = resolve(options.entityDir ?? DEFAULT_ENTITY_DIR);
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const dryRun = options.dryRun === true;
  const maxMembers = Math.max(1, options.maxMembers ?? DEFAULT_MAX_MEMBERS);
  const entity = await readEntityArtifactInput(entityDir);
  const runId = linkRunId(entity);
  const records: LinkRecord[] = [];
  const counts: Counts = {
    mentions: 0,
    observations: 0,
    structuredRows: 0,
    linkableRecords: 0,
    diagnostics: 0,
  };

  for await (const group of groupStructuredObservations(entity.observationsPath)) {
    counts.structuredRows += 1;
    counts.observations += group.length;
    const groupRecords = linkRecordsForStructuredRow(group);
    records.push(...groupRecords);
  }
  for await (const mention of readJsonlFile<MentionCandidateRecord>(entity.mentionsPath)) {
    counts.mentions += 1;
    const record = linkRecordFromMention(mention);
    if (record) records.push(record);
  }
  counts.linkableRecords = records.length;

  const result = clusterEntityLinks(records, {
    extractionRunId: runId,
    ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
    maxMembers,
  });
  const diagnostics = [...result.diagnostics];
  const diagnosticsByCode: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    diagnosticsByCode[diagnostic.code] = (diagnosticsByCode[diagnostic.code] ?? 0) + 1;
  }
  counts.diagnostics = diagnostics.length;

  const files = {
    confidentMatches: "confident-matches.jsonl",
    ambiguousMatches: "ambiguous-matches.jsonl",
    unresolvedCandidates: "unresolved-candidates.jsonl",
    diagnostics: "diagnostics.jsonl",
    taxonomy: "taxonomy.json",
    manifest: "manifest.json",
  };
  if (!dryRun) await mkdir(outputDir, { recursive: true });
  const confidentSink = await createJsonlSink(
    dryRun ? null : join(outputDir, files.confidentMatches),
  );
  const ambiguousSink = await createJsonlSink(
    dryRun ? null : join(outputDir, files.ambiguousMatches),
  );
  const unresolvedSink = await createJsonlSink(
    dryRun ? null : join(outputDir, files.unresolvedCandidates),
  );
  const diagnosticSink = await createJsonlSink(dryRun ? null : join(outputDir, files.diagnostics));
  try {
    await writeClusters(confidentSink, result.confident);
    await writeClusters(ambiguousSink, result.ambiguous);
    await writeUnresolved(unresolvedSink, result.unresolved);
    for (const diagnostic of diagnostics) await diagnosticSink.write(diagnostic);
  } finally {
    await Promise.all([
      confidentSink.close(),
      ambiguousSink.close(),
      unresolvedSink.close(),
      diagnosticSink.close(),
    ]);
  }

  const taxonomyText = `${JSON.stringify(
    {
      version: ENTITY_LINK_TAXONOMY_VERSION,
      status: "temporary_review_required",
      sourceEntityTaxonomy: ENTITY_MENTION_TAXONOMY_VERSION,
      statuses: ["confident", "ambiguous", "unresolved"],
      groups: LINK_GROUP_DEFINITIONS,
    },
    null,
    2,
  )}\n`;
  const clustersByGroup = emptyGroupCounts();
  const confidentByGroup = emptyGroupCounts();
  const ambiguousByGroup = emptyGroupCounts();
  const unresolvedByGroup = emptyGroupCounts();
  for (const cluster of result.confident) {
    increment(clustersByGroup, cluster.group);
    increment(confidentByGroup, cluster.group);
  }
  for (const cluster of result.ambiguous) {
    increment(clustersByGroup, cluster.group);
    increment(ambiguousByGroup, cluster.group);
  }
  for (const candidate of result.unresolved) increment(unresolvedByGroup, candidate.group);
  const unobservedGroups = LINK_GROUP_DEFINITIONS.map((definition) => definition.group).filter(
    (group) => (clustersByGroup[group] ?? 0) === 0 && (unresolvedByGroup[group] ?? 0) === 0,
  );
  const allClusters = [...result.confident, ...result.ambiguous];
  const report: EntityLinkExportReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun,
    status: "candidate_only",
    extractorVersion: EXTRACTOR_VERSION,
    ontologyVersion: ENTITY_LINK_TAXONOMY_VERSION,
    entityArtifact: {
      directory: relative(process.cwd(), entity.directory).replaceAll("\\", "/"),
      manifestSha256: entity.manifestSha256,
      extractorVersion: String(entity.manifest.extractorVersion),
      ontologyVersion: String(entity.manifest.ontologyVersion),
      entityMentionsChecksum: entity.mentionsChecksum,
      structuredObservationsChecksum: entity.observationsChecksum,
    },
    outputDir: relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    files,
    filesWritten: false,
    checksums: {
      confidentMatches: confidentSink.checksum,
      ambiguousMatches: ambiguousSink.checksum,
      unresolvedCandidates: unresolvedSink.checksum,
      diagnostics: diagnosticSink.checksum,
      taxonomy: sha256(taxonomyText),
    },
    counts: {
      mentionsScanned: counts.mentions,
      observationsScanned: counts.observations,
      structuredRowsScanned: counts.structuredRows,
      linkableRecords: counts.linkableRecords,
      confidentClusters: result.confident.length,
      ambiguousClusters: result.ambiguous.length,
      unresolvedCandidates: result.unresolved.length,
      confidentMembers: result.confident.reduce((total, cluster) => total + cluster.memberCount, 0),
      ambiguousMembers: result.ambiguous.reduce((total, cluster) => total + cluster.memberCount, 0),
      clustersByGroup,
      confidentByGroup,
      ambiguousByGroup,
      unresolvedByGroup,
      diagnostics: counts.diagnostics,
      unobservedGroups,
      maxMembers,
      truncatedClusters: allClusters.filter((cluster) => cluster.membersTruncated).length,
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

async function* groupStructuredObservations(
  path: string,
): AsyncGenerator<StructuredObservationRecord[]> {
  let currentKey: string | null = null;
  let group: StructuredObservationRecord[] = [];
  for await (const observation of readJsonlFile<StructuredObservationRecord>(path)) {
    const key = observationGroupKey(observation);
    if (key !== currentKey) {
      if (currentKey !== null) yield group;
      currentKey = key;
      group = [];
    }
    group.push(observation);
  }
  if (currentKey !== null) yield group;
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

async function writeClusters(
  sink: JsonlSink,
  clusters: readonly CandidateEntityCluster[],
): Promise<void> {
  for (const cluster of clusters) await sink.write(cluster);
}

async function writeUnresolved(
  sink: JsonlSink,
  candidates: readonly UnresolvedLinkCandidate[],
): Promise<void> {
  for (const candidate of candidates) await sink.write(candidate);
}

function emptyGroupCounts(): Record<string, number> {
  return Object.fromEntries(
    LINK_GROUP_DEFINITIONS.map((definition) => [definition.group, 0]),
  ) as Record<string, number>;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function linkRunId(entity: Awaited<ReturnType<typeof readEntityArtifactInput>>): string {
  return `lnk_${sha256(
    [
      EXTRACTOR_VERSION,
      ENTITY_LINK_TAXONOMY_VERSION,
      entity.manifestSha256,
      entity.mentionsChecksum,
      entity.observationsChecksum,
    ].join("\u0000"),
  ).slice(0, 24)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
