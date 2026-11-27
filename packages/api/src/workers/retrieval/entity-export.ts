/**
 * Offline, candidate-only entity-mention extraction.
 *
 * Inputs are the graph-evidence artifact, the cleaning manifest, source
 * registry, and structured registers. Outputs are versioned JSONL artifacts.
 * No canonical entity, entity link, relationship, database row, embedding, or
 * retrieval index is produced here.
 */
import { createHash, type Hash } from "node:crypto";
import { mkdir, open, readFile, writeFile, type FileHandle } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  ENTITY_MENTION_TAXONOMY_VERSION,
  MENTION_KIND_DEFINITIONS,
  POPULATION_DEFINITIONS,
  REGULATORY_STATUS_DEFINITIONS,
  ROUTE_DEFINITIONS,
  buildMentionLexicon,
  clinicalMentionLexiconSeeds,
  extractTextUnitMentions,
  foldKgText,
  normalizeDosageForm,
  normalizeOrganizationKey,
  normalizePackaging,
  normalizeProductType,
  normalizeRegistrationStatus,
  normalizeSchedule,
  normalizeStrength,
  splitSubstances,
  type DocumentProvenance,
  type ExtractionDiagnostic,
  type GraphTextUnit,
  type MentionCandidateRecord,
  type MentionKind,
  type MentionLexiconSeed,
  type MetadataRecordRef,
  type StructuredObservationRecord,
  type StructuredRecordRef,
} from "@repo/modules/retrieval";

const DEFAULT_GRAPH_DIR = "tooling/cleaning-lab/output/graph-evidence";
const DEFAULT_SOURCE_ROOT = "tooling/cleaning-lab/output";
const DEFAULT_SOURCE_MANIFEST = "tooling/cleaning-lab/output/manifest.jsonl";
const DEFAULT_METADATA_DIR = "tooling/retrieval-lab/data/metadata";
const DEFAULT_STRUCTURED_DIR = "tooling/cleaning-lab/output/structured";
const DEFAULT_OUTPUT_DIR = "tooling/cleaning-lab/output/entity-mentions";
const EXTRACTOR_VERSION = "entity-extraction-v1" as const;

export interface EntityExportOptions {
  readonly graphDir?: string;
  readonly sourceRoot?: string;
  readonly sourceManifestPath?: string;
  readonly metadataDir?: string;
  readonly structuredDir?: string;
  readonly outputDir?: string;
  readonly dryRun?: boolean;
  readonly limit?: number | null;
}

interface GraphArtifactManifest {
  readonly schemaVersion?: unknown;
  readonly profile?: unknown;
  readonly algorithmVersion?: unknown;
  readonly sectionTaxonomyVersion?: unknown;
  readonly textHelperVersion?: unknown;
  readonly config?: {
    readonly configHash?: unknown;
    readonly offsetSurface?: unknown;
    readonly offsetEncoding?: unknown;
    readonly maxChars?: unknown;
    readonly overlapChars?: unknown;
  };
  readonly sourceManifestSha256?: unknown;
  readonly corpusSnapshotHash?: unknown;
  readonly files?: Readonly<Record<string, unknown>>;
  readonly checksums?: Readonly<Record<string, unknown>>;
  readonly counts?: Readonly<Record<string, unknown>>;
}

interface SourceManifestRow {
  readonly artifact_id?: unknown;
  readonly artifact_type?: unknown;
  readonly status?: unknown;
  readonly document_id?: unknown;
  readonly source_id?: unknown;
  readonly source_name?: unknown;
  readonly authority_level?: unknown;
  readonly jurisdiction?: unknown;
  readonly document_type?: unknown;
  readonly language?: unknown;
  readonly medicine_ids?: unknown;
  readonly medicine_names?: unknown;
  readonly inn?: unknown;
  readonly brand_name?: unknown;
  readonly strength_form?: unknown;
  readonly title?: unknown;
  readonly source_urls?: unknown;
  readonly publication_date?: unknown;
  readonly collected_at?: unknown;
  readonly content_sha256?: unknown;
  readonly sections?: unknown;
}

interface GraphUnitRow extends GraphTextUnit {
  readonly document_content_sha256: string;
}

type CsvRow = Readonly<Record<string, string>>;

interface SourceMetadata {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly jurisdiction: string | null;
  readonly language: string | null;
  readonly sourceType: string | null;
}

export interface EntityExportReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly status: "candidate_only";
  readonly extractorVersion: string;
  readonly ontologyVersion: string;
  readonly graphArtifact: {
    readonly directory: string;
    readonly manifestSha256: string;
    readonly profile: string;
    readonly configHash: string;
    readonly corpusSnapshotHash: string;
    readonly sourceManifestSha256: string;
  };
  readonly sourceInputs: {
    readonly sourceManifest: string;
    readonly sourceManifestSha256: string;
    readonly nameMap: string;
    readonly nameMapSha256: string;
    readonly nomenclature: string;
    readonly nomenclatureSha256: string;
    readonly bdpmCis: string;
    readonly bdpmCisSha256: string;
    readonly sources: string;
    readonly sourcesSha256: string;
  };
  readonly outputDir: string;
  readonly files: {
    readonly entityMentions: string;
    readonly structuredObservations: string;
    readonly diagnostics: string;
    readonly taxonomy: string;
    readonly manifest: string;
  };
  readonly filesWritten: boolean;
  readonly checksums: {
    readonly entityMentions: string;
    readonly structuredObservations: string;
    readonly diagnostics: string;
    readonly taxonomy: string;
  };
  readonly counts: {
    readonly documents: number;
    readonly textUnits: number;
    readonly mentions: number;
    readonly structuredObservations: number;
    readonly diagnostics: number;
    readonly mentionsByKind: Readonly<Record<string, number>>;
    readonly observationsByKind: Readonly<Record<string, number>>;
    readonly unobservedKinds: readonly string[];
    readonly graphDiagnostics: number;
  };
  readonly graphDiagnosticsByCode: Readonly<Record<string, number>>;
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
}

interface EntityArtifacts {
  readonly documents: number;
  readonly textUnits: number;
  readonly mentionsByKind: Readonly<Record<string, number>>;
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
}

interface JsonlSink {
  readonly checksum: string;
  readonly count: number;
  write(value: object): Promise<void>;
  close(): Promise<void>;
}

class HashingJsonlSink implements JsonlSink {
  private readonly hash: Hash = createHash("sha256");
  private readonly handle: FileHandle | null;
  private records = 0;
  private finished = false;
  private digestValue: string | null = null;

  constructor(handle: FileHandle | null) {
    this.handle = handle;
  }

  get checksum(): string {
    if (!this.finished || !this.digestValue) {
      throw new Error("JSONL sink checksum requested before close");
    }
    return this.digestValue;
  }

  get count(): number {
    return this.records;
  }

  async write(value: object): Promise<void> {
    if (this.finished) throw new Error("Cannot write to a closed JSONL sink");
    const line = `${JSON.stringify(value)}\n`;
    this.hash.update(line, "utf8");
    await this.handle?.write(line, null, "utf8");
    this.records += 1;
  }

  async close(): Promise<void> {
    if (this.finished) return;
    this.digestValue = this.hash.digest("hex");
    this.finished = true;
    await this.handle?.close();
  }
}

interface EntityInputs {
  readonly graphDir: string;
  readonly sourceRoot: string;
  readonly sourceManifestPath: string;
  readonly metadataDir: string;
  readonly structuredDir: string;
}

export async function runEntityExtraction(
  options: EntityExportOptions = {},
): Promise<EntityExportReport> {
  const inputs: EntityInputs = {
    graphDir: resolve(options.graphDir ?? DEFAULT_GRAPH_DIR),
    sourceRoot: resolve(options.sourceRoot ?? DEFAULT_SOURCE_ROOT),
    sourceManifestPath: resolve(options.sourceManifestPath ?? DEFAULT_SOURCE_MANIFEST),
    metadataDir: resolve(options.metadataDir ?? DEFAULT_METADATA_DIR),
    structuredDir: resolve(options.structuredDir ?? DEFAULT_STRUCTURED_DIR),
  };
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const dryRun = options.dryRun === true;
  const graph = await readGraphArtifact(inputs.graphDir);
  const sourceManifestText = await readFile(inputs.sourceManifestPath, "utf8");
  const sourceManifestSha256 = sha256(sourceManifestText);
  if (sourceManifestSha256 !== graph.manifest.sourceManifestSha256) {
    throw new Error(
      `Source manifest hash mismatch: graph artifact declares ${String(
        graph.manifest.sourceManifestSha256,
      )}, current file is ${sourceManifestSha256}`,
    );
  }
  const sourceRows = parseJsonl<SourceManifestRow>(sourceManifestText).filter(
    (row) => row.artifact_type === "document" && row.status === "clean",
  );
  const sourceRowsByArtifact = new Map<string, SourceManifestRow>();
  for (const row of sourceRows) {
    const artifactId = stringValue(row.artifact_id);
    if (artifactId) sourceRowsByArtifact.set(artifactId, row);
  }
  if (sourceRowsByArtifact.size === 0)
    throw new Error("The source manifest has no clean documents");

  const nameMapPath = join(inputs.metadataDir, "name_map.csv");
  const nomenclaturePath = join(inputs.structuredDir, "nomenclature_products.csv");
  const bdpmCisPath = join(inputs.structuredDir, "bdpm_cis.csv");
  const sourcesPath = join(inputs.metadataDir, "sources.csv");
  const nameMap = await readCsv(nameMapPath);
  const nomenclature = await readCsv(nomenclaturePath);
  const bdpmCis = await readCsv(bdpmCisPath);
  const sources = await readCsv(sourcesPath);
  const sourceMetadata = buildSourceMetadata(sources);
  const countries = buildCountrySet(nomenclature, sources);
  const lexiconSeeds = buildLexiconSeeds({
    nameMap,
    nomenclature,
    bdpmCis,
    sources,
    countries,
  });
  const lexicon = buildMentionLexicon(lexiconSeeds);
  const runId = runIdFor(graph, sourceManifestSha256);
  const files = {
    entityMentions: "entity-mentions.jsonl",
    structuredObservations: "structured-observations.jsonl",
    diagnostics: "diagnostics.jsonl",
    taxonomy: "taxonomy.json",
    manifest: "manifest.json",
  };
  if (!dryRun) await mkdir(outputDir, { recursive: true });
  const mentionSink = await createJsonlSink(dryRun ? null : join(outputDir, files.entityMentions));
  const observationSink = await createJsonlSink(
    dryRun ? null : join(outputDir, files.structuredObservations),
  );
  const diagnosticSink = await createJsonlSink(dryRun ? null : join(outputDir, files.diagnostics));
  let artifacts: EntityArtifacts;
  const observationsByKind = emptyKindCounts();
  try {
    artifacts = await extractArtifacts({
      graph,
      sourceRowsByArtifact,
      sourceMetadata,
      lexicon,
      runId,
      limit: options.limit ?? null,
      mentionSink,
      diagnosticSink,
    });
    const observationGroups = [
      buildNameMapObservations(nameMap, runId),
      buildNomenclatureObservations(nomenclature, runId),
      buildBdpmObservations(bdpmCis, runId),
      buildSourceObservations(sources, runId),
      buildManifestObservations(sourceRows, runId),
    ];
    for (const group of observationGroups) {
      for (const observation of group) {
        await observationSink.write(observation);
        incrementKind(observationsByKind, observation.candidateKind);
      }
    }
  } finally {
    await Promise.all([mentionSink.close(), observationSink.close(), diagnosticSink.close()]);
  }
  const taxonomyText = `${JSON.stringify(
    {
      version: ENTITY_MENTION_TAXONOMY_VERSION,
      status: "temporary_review_required",
      definitions: MENTION_KIND_DEFINITIONS,
    },
    null,
    2,
  )}\n`;
  const unobservedKinds = MENTION_KIND_DEFINITIONS.map(
    (definition) => definition.candidateKind,
  ).filter((kind) => artifacts.mentionsByKind[kind] === 0 && observationsByKind[kind] === 0);
  const report: EntityExportReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun,
    status: "candidate_only",
    extractorVersion: EXTRACTOR_VERSION,
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    graphArtifact: {
      directory: relative(process.cwd(), inputs.graphDir).replaceAll("\\", "/"),
      manifestSha256: graph.manifestSha256,
      profile: String(graph.manifest.profile),
      configHash: String(graph.manifest.config?.configHash),
      corpusSnapshotHash: String(graph.manifest.corpusSnapshotHash),
      sourceManifestSha256: String(graph.manifest.sourceManifestSha256),
    },
    sourceInputs: {
      sourceManifest: relative(process.cwd(), inputs.sourceManifestPath).replaceAll("\\", "/"),
      sourceManifestSha256,
      nameMap: relative(process.cwd(), nameMapPath).replaceAll("\\", "/"),
      nameMapSha256: sha256(await readFile(nameMapPath, "utf8")),
      nomenclature: relative(process.cwd(), nomenclaturePath).replaceAll("\\", "/"),
      nomenclatureSha256: sha256(await readFile(nomenclaturePath, "utf8")),
      bdpmCis: relative(process.cwd(), bdpmCisPath).replaceAll("\\", "/"),
      bdpmCisSha256: sha256(await readFile(bdpmCisPath, "utf8")),
      sources: relative(process.cwd(), sourcesPath).replaceAll("\\", "/"),
      sourcesSha256: sha256(await readFile(sourcesPath, "utf8")),
    },
    outputDir: relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    files,
    filesWritten: false,
    checksums: {
      entityMentions: mentionSink.checksum,
      structuredObservations: observationSink.checksum,
      diagnostics: diagnosticSink.checksum,
      taxonomy: sha256(taxonomyText),
    },
    counts: {
      documents: artifacts.documents,
      textUnits: artifacts.textUnits,
      mentions: mentionSink.count,
      structuredObservations: observationSink.count,
      diagnostics: diagnosticSink.count,
      mentionsByKind: artifacts.mentionsByKind,
      observationsByKind,
      unobservedKinds,
      graphDiagnostics: graph.graphDiagnostics.length,
    },
    graphDiagnosticsByCode: countBy(graph.graphDiagnostics, (entry) => String(entry.code)),
    diagnosticsByCode: artifacts.diagnosticsByCode,
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

async function readGraphArtifact(directory: string): Promise<{
  readonly manifest: GraphArtifactManifest;
  readonly manifestSha256: string;
  readonly units: readonly GraphUnitRow[];
  readonly graphDiagnostics: readonly ExtractionDiagnostic[];
}> {
  const manifestText = await readFile(join(directory, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText) as GraphArtifactManifest;
  if (manifest.schemaVersion !== 1 || manifest.profile !== "graph-evidence-v1") {
    throw new Error("Unsupported graph-evidence artifact manifest");
  }
  const checksums = manifest.checksums ?? {};
  const files = manifest.files ?? {};
  const sectionFile = requiredString(files.sections, "graph files.sections");
  const unitFile = requiredString(files.textUnits, "graph files.textUnits");
  const diagnosticFile = requiredString(files.diagnostics, "graph files.diagnostics");
  const sectionsText = await readFile(join(directory, sectionFile), "utf8");
  const unitsText = await readFile(join(directory, unitFile), "utf8");
  const diagnosticsText = await readFile(join(directory, diagnosticFile), "utf8");
  if (sha256(sectionsText) !== requiredString(checksums.sections, "graph checksums.sections")) {
    throw new Error("Graph sections checksum mismatch");
  }
  if (sha256(unitsText) !== requiredString(checksums.textUnits, "graph checksums.textUnits")) {
    throw new Error("Graph text-units checksum mismatch");
  }
  if (
    sha256(diagnosticsText) !== requiredString(checksums.diagnostics, "graph checksums.diagnostics")
  ) {
    throw new Error("Graph diagnostics checksum mismatch");
  }
  return {
    manifest,
    manifestSha256: sha256(manifestText),
    units: parseJsonl<GraphUnitRow>(unitsText),
    graphDiagnostics: parseJsonl<ExtractionDiagnostic>(diagnosticsText),
  };
}

async function extractArtifacts(input: {
  readonly graph: Awaited<ReturnType<typeof readGraphArtifact>>;
  readonly sourceRowsByArtifact: ReadonlyMap<string, SourceManifestRow>;
  readonly sourceMetadata: ReadonlyMap<string, SourceMetadata>;
  readonly lexicon: ReturnType<typeof buildMentionLexicon>;
  readonly runId: string;
  readonly limit: number | null;
  readonly mentionSink: JsonlSink;
  readonly diagnosticSink: JsonlSink;
}): Promise<EntityArtifacts> {
  const mentionsByKind = emptyKindCounts();
  const diagnosticsByCode: Record<string, number> = {};
  const seenMentions = new Set<string>();
  const documentIds = new Set<string>();
  let textUnits = 0;
  const selected =
    input.limit === null ? input.graph.units : input.graph.units.slice(0, input.limit);
  for (const unit of selected) {
    documentIds.add(unit.artifactId);
    const row = input.sourceRowsByArtifact.get(unit.artifactId);
    if (!row) throw new Error(`No source manifest row for graph unit ${unit.textUnitId}`);
    const expectedDocumentHash = stringValue(row.content_sha256);
    if (!expectedDocumentHash || expectedDocumentHash !== unit.document_content_sha256) {
      throw new Error(`Graph/source document hash mismatch for ${unit.artifactId}`);
    }
    const source = input.sourceMetadata.get(stringValue(row.source_id) ?? "");
    const document = documentProvenance(row, source, unit);
    const result = extractTextUnitMentions({
      unit,
      lexicon: input.lexicon,
      extractionRunId: input.runId,
      document,
      ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    });
    for (const mention of result.candidates) {
      const key = `${mention.evidence.documentSnapshotId}:${mention.evidence.documentStart}:${mention.evidence.documentEnd}:${mention.candidateKind}:${mention.normalizedSurface}`;
      if (seenMentions.has(key)) continue;
      seenMentions.add(key);
      await input.mentionSink.write(mention);
      incrementKind(mentionsByKind, mention.candidateKind);
    }
    for (const diagnostic of result.diagnostics) {
      await input.diagnosticSink.write(diagnostic);
      diagnosticsByCode[diagnostic.code] = (diagnosticsByCode[diagnostic.code] ?? 0) + 1;
    }
    textUnits += 1;
  }
  return {
    documents: documentIds.size,
    textUnits,
    mentionsByKind,
    diagnosticsByCode: Object.fromEntries(
      Object.entries(diagnosticsByCode).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

async function createJsonlSink(path: string | null): Promise<JsonlSink> {
  if (path === null) return new HashingJsonlSink(null);
  return new HashingJsonlSink(await open(path, "w"));
}

function emptyKindCounts(): Record<string, number> {
  return Object.fromEntries(
    MENTION_KIND_DEFINITIONS.map((definition) => [definition.candidateKind, 0]),
  ) as Record<string, number>;
}

function incrementKind(counts: Record<string, number>, kind: string): void {
  counts[kind] = (counts[kind] ?? 0) + 1;
}

function buildLexiconSeeds(input: {
  readonly nameMap: readonly CsvRow[];
  readonly nomenclature: readonly CsvRow[];
  readonly bdpmCis: readonly CsvRow[];
  readonly sources: readonly CsvRow[];
  readonly countries: ReadonlySet<string>;
}): MentionLexiconSeed[] {
  const seeds: MentionLexiconSeed[] = [...clinicalMentionLexiconSeeds()];
  for (const definition of ROUTE_DEFINITIONS) {
    for (const alias of definition.aliases) {
      seeds.push({
        surface: alias,
        candidateKind: "route_of_administration",
        sourceKind: "lexicon",
        sourceId: "route-lexicon-v1",
        sourceKey: `route:${definition.key}`,
        attributes: { normalizedKey: definition.key, label: definition.label },
      });
    }
  }
  for (const definition of POPULATION_DEFINITIONS) {
    for (const alias of definition.aliases) {
      seeds.push({
        surface: alias,
        candidateKind: "population_group",
        sourceKind: "lexicon",
        sourceId: "population-lexicon-v1",
        sourceKey: `population:${definition.key}`,
        attributes: { normalizedKey: definition.key, label: definition.label },
      });
    }
  }
  for (const definition of REGULATORY_STATUS_DEFINITIONS) {
    for (const alias of definition.aliases) {
      seeds.push({
        surface: alias,
        candidateKind: "regulatory_status",
        sourceKind: "lexicon",
        sourceId: "regulatory-status-lexicon-v1",
        sourceKey: `status:${definition.key}`,
        attributes: { normalizedKey: definition.key, label: definition.label },
      });
    }
  }
  for (const row of input.sources) {
    const sourceId = stringValue(row.source_id);
    if (!sourceId) continue;
    addSeed(seeds, "source", row.source_name, "source_registry", sourceId, "sources.csv", {
      sourceType: row.source_type,
    });
    addSeed(seeds, "source", sourceId, "source_registry", sourceId, "sources.csv", {
      sourceType: row.source_type,
    });
    addSeed(seeds, "jurisdiction", row.jurisdiction, "source_registry", sourceId, "sources.csv");
    addSeed(seeds, "language", row.language, "source_registry", sourceId, "sources.csv");
    addSeed(seeds, "source_type", row.source_type, "source_registry", sourceId, "sources.csv");
  }
  for (const row of input.nameMap) {
    const sourceId = stringValue(row.source_id) ?? "name_map";
    const sourceKey = `name_map:${row.medicine_id ?? ""}:${row.brand_name ?? ""}`;
    addSeed(seeds, "brand_term", row.brand_name, "name_map", sourceId, sourceKey, {
      brandType: row.brand_type,
      medicineId: row.medicine_id,
    });
    addSeed(seeds, "atc_class", row.atc, "name_map", sourceId, sourceKey);
    addSeed(seeds, "therapeutic_class", row.class, "name_map", sourceId, sourceKey);
    addSeed(seeds, "dose_form", row.form, "name_map", sourceId, sourceKey);
    addSeed(seeds, "strength", row.strength, "name_map", sourceId, sourceKey);
    addSeed(
      seeds,
      "identifier_registration",
      row.num_enregistrement,
      "name_map",
      sourceId,
      sourceKey,
    );
    addSeed(seeds, "identifier_dci", row.dci_code, "name_map", sourceId, sourceKey);
    for (const substance of splitSubstances(row.dci ?? "")) {
      addSeed(seeds, "substance", substance, "name_map", sourceId, sourceKey);
    }
    for (const substance of splitSubstances(row.dci_as_registered ?? "")) {
      addSeed(seeds, "substance", substance, "name_map", sourceId, sourceKey);
    }
    addHolderSeed(seeds, row.holder, sourceId, sourceKey, input.countries);
  }
  for (const row of input.nomenclature) {
    if (row.in_scope !== "True") continue;
    const sourceId = stringValue(row.source_id) ?? "SANTE_MSP";
    const sourceKey = `nomenclature:${row.product_uid ?? ""}`;
    addSeed(seeds, "brand_term", row.brand, "nomenclature", sourceId, sourceKey, {
      medicineIds: row.medicine_ids,
      isCombination: row.is_combination,
    });
    addSeed(seeds, "dose_form", row.form, "nomenclature", sourceId, sourceKey);
    addSeed(seeds, "strength", row.dosage, "nomenclature", sourceId, sourceKey);
    addSeed(seeds, "package_presentation", row.pack, "nomenclature", sourceId, sourceKey);
    addSeed(
      seeds,
      "schedule",
      normalizeSchedule(row.schedule ?? ""),
      "nomenclature",
      sourceId,
      sourceKey,
    );
    addSeed(
      seeds,
      "product_type",
      normalizeProductType(row.product_type ?? ""),
      "nomenclature",
      sourceId,
      sourceKey,
    );
    addSeed(
      seeds,
      "identifier_registration",
      row.registration_number,
      "nomenclature",
      sourceId,
      sourceKey,
    );
    addSeed(seeds, "shelf_life", row.shelf_life, "nomenclature", sourceId, sourceKey);
    addHolderSeed(seeds, row.holder, sourceId, sourceKey, input.countries);
    addSeed(seeds, "jurisdiction", row.holder_country, "nomenclature", sourceId, sourceKey);
    for (const substance of splitSubstances(row.dci ?? "")) {
      addSeed(seeds, "substance", substance, "nomenclature", sourceId, sourceKey);
    }
  }
  for (const row of input.bdpmCis) {
    const sourceId = "BDPM_FR";
    const sourceKey = `bdpm_cis:${row.cis ?? ""}`;
    addSeed(seeds, "medicinal_product", row.name, "bdpm_cis", sourceId, sourceKey, {
      cis: row.cis,
      medicineIds: row.medicine_ids,
    });
    addSeed(seeds, "dose_form", row.form, "bdpm_cis", sourceId, sourceKey);
    for (const route of (row.route ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)) {
      addSeed(seeds, "route_of_administration", route, "bdpm_cis", sourceId, sourceKey);
    }
    addSeed(seeds, "regulatory_status", row.status, "bdpm_cis", sourceId, sourceKey);
    addSeed(seeds, "regulatory_procedure", row.procedure, "bdpm_cis", sourceId, sourceKey);
    addSeed(seeds, "marketing_status", row.marketing_status, "bdpm_cis", sourceId, sourceKey);
    addSeed(seeds, "identifier_cis", row.cis, "bdpm_cis", sourceId, sourceKey);
    addHolderSeed(seeds, row.holder, sourceId, sourceKey, input.countries);
  }
  return seeds;
}

function addHolderSeed(
  seeds: MentionLexiconSeed[],
  raw: string | undefined,
  sourceId: string,
  sourceKey: string,
  countries: ReadonlySet<string>,
): void {
  const value = stringValue(raw);
  if (!value) return;
  if (countries.has(foldKgText(value))) {
    addSeed(seeds, "jurisdiction", value, "holder_country", sourceId, sourceKey);
    return;
  }
  addSeed(seeds, "organization", value, "holder", sourceId, sourceKey);
}

function addSeed(
  seeds: MentionLexiconSeed[],
  candidateKind: MentionKind,
  raw: string | null | undefined,
  sourceKind: string,
  sourceId: string,
  sourceKey: string,
  attributes?: Readonly<Record<string, unknown>>,
): void {
  const surface = stringValue(raw);
  if (!surface) return;
  if (surface.length < 3) return;
  seeds.push({
    surface,
    candidateKind,
    sourceKind,
    sourceId,
    sourceKey,
    attributes,
  });
}

function buildCountrySet(
  nomenclature: readonly CsvRow[],
  sources: readonly CsvRow[],
): ReadonlySet<string> {
  return new Set(
    [
      ...nomenclature.map((row) => row.holder_country),
      ...sources.map((row) => row.jurisdiction),
      ...sources.map((row) => row.country),
    ]
      .map((value) => stringValue(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => foldKgText(value)),
  );
}

function buildSourceMetadata(sources: readonly CsvRow[]): ReadonlyMap<string, SourceMetadata> {
  const result = new Map<string, SourceMetadata>();
  for (const row of sources) {
    const sourceId = stringValue(row.source_id);
    if (!sourceId) continue;
    result.set(sourceId, {
      sourceId,
      sourceName: stringValue(row.source_name) ?? sourceId,
      jurisdiction: stringValue(row.jurisdiction),
      language: stringValue(row.language),
      sourceType: stringValue(row.source_type),
    });
  }
  return result;
}

function documentProvenance(
  row: SourceManifestRow,
  source: SourceMetadata | undefined,
  unit: GraphUnitRow,
): DocumentProvenance {
  const urls = stringArray(row.source_urls);
  return {
    artifactId: unit.artifactId,
    documentId: unit.documentId,
    documentSnapshotId: unit.documentSnapshotId,
    documentContentSha256: unit.document_content_sha256,
    sourceId: stringValue(row.source_id) ?? source?.sourceId ?? "unknown",
    sourceName: source?.sourceName ?? stringValue(row.source_name) ?? "unknown",
    sourceUrl: urls[0] ?? null,
    title: stringValue(row.title) ?? unit.documentId,
    documentType: stringValue(row.document_type) ?? source?.sourceType ?? "unknown",
    language: stringValue(row.language) ?? source?.language ?? "unknown",
    jurisdiction: stringValue(row.jurisdiction) ?? source?.jurisdiction ?? null,
    authorityLevel: numberValue(row.authority_level),
    publicationDate: stringValue(row.publication_date),
    collectedAt: stringValue(row.collected_at),
  };
}

function buildNameMapObservations(
  rows: readonly CsvRow[],
  runId: string,
): StructuredObservationRecord[] {
  const observations: StructuredObservationRecord[] = [];
  for (const [index, row] of rows.entries()) {
    const sourceId = stringValue(row.source_id) ?? "name_map";
    const evidence = structuredEvidence("name_map.csv", sourceId, index + 2, row);
    pushObservation(
      observations,
      runId,
      "brand_term",
      row.brand_name,
      row.brand_name,
      evidence,
      "name_map.csv",
      {
        brandType: row.brand_type,
      },
    );
    for (const value of splitSubstances(row.dci ?? "")) {
      pushObservation(observations, runId, "substance", value, value, evidence, "name_map.csv");
    }
    pushObservation(observations, runId, "atc_class", row.atc, row.atc, evidence, "name_map.csv");
    pushObservation(
      observations,
      runId,
      "therapeutic_class",
      row.class,
      row.class,
      evidence,
      "name_map.csv",
    );
    pushObservation(
      observations,
      runId,
      "dose_form",
      row.form,
      normalizeDosageForm(row.form ?? "").key,
      evidence,
      "name_map.csv",
    );
    pushObservation(
      observations,
      runId,
      "strength",
      row.strength,
      normalizeStrength(row.strength ?? ""),
      evidence,
      "name_map.csv",
    );
    pushObservation(
      observations,
      runId,
      "organization",
      row.holder,
      normalizeOrganizationKey(row.holder ?? ""),
      evidence,
      "name_map.csv",
    );
    pushObservation(
      observations,
      runId,
      "identifier_registration",
      row.num_enregistrement,
      foldKgText(row.num_enregistrement ?? ""),
      evidence,
      "name_map.csv",
    );
    pushObservation(
      observations,
      runId,
      "identifier_dci",
      row.dci_code,
      foldKgText(row.dci_code ?? ""),
      evidence,
      "name_map.csv",
    );
    pushObservation(
      observations,
      runId,
      "regulatory_authorization",
      row.num_enregistrement,
      foldKgText(row.num_enregistrement ?? ""),
      evidence,
      "name_map.csv",
    );
    if (row.brand_name) {
      pushObservation(
        observations,
        runId,
        "pharmaceutical_product",
        row.brand_name,
        foldKgText(row.brand_name),
        evidence,
        "name_map.csv",
        { form: row.form, strength: row.strength, dci: row.dci },
      );
    }
  }
  return observations;
}

function buildNomenclatureObservations(
  rows: readonly CsvRow[],
  runId: string,
): StructuredObservationRecord[] {
  const observations: StructuredObservationRecord[] = [];
  for (const [index, row] of rows.entries()) {
    if (row.in_scope !== "True") continue;
    const sourceId = stringValue(row.source_id) ?? "SANTE_MSP";
    const evidence = structuredEvidence("nomenclature_products.csv", sourceId, index + 2, row);
    pushObservation(
      observations,
      runId,
      "brand_term",
      row.brand,
      row.brand,
      evidence,
      "nomenclature_products.csv",
    );
    for (const value of splitSubstances(row.dci ?? "")) {
      pushObservation(
        observations,
        runId,
        "substance",
        value,
        value,
        evidence,
        "nomenclature_products.csv",
      );
    }
    pushObservation(
      observations,
      runId,
      "dose_form",
      row.form,
      row.form,
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "strength",
      row.dosage,
      row.dosage,
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "package_presentation",
      row.pack,
      normalizePackaging(row.pack ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "product_package",
      row.pack,
      normalizePackaging(row.pack ?? ""),
      evidence,
      "nomenclature_products.csv",
      { brand: row.brand, registrationNumber: row.registration_number },
    );
    pushObservation(
      observations,
      runId,
      "schedule",
      row.schedule,
      normalizeSchedule(row.schedule ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "product_type",
      row.product_type,
      normalizeProductType(row.product_type ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "regulatory_status",
      row.status,
      normalizeRegistrationStatus(row.status ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "identifier_registration",
      row.registration_number,
      foldKgText(row.registration_number ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "regulatory_authorization",
      row.registration_number,
      foldKgText(row.registration_number ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    if (row.brand) {
      pushObservation(
        observations,
        runId,
        "pharmaceutical_product",
        row.brand,
        foldKgText(row.brand),
        evidence,
        "nomenclature_products.csv",
        { form: row.form, dosage: row.dosage, dci: row.dci },
      );
    }
    pushObservation(
      observations,
      runId,
      "organization",
      row.holder,
      normalizeOrganizationKey(row.holder ?? ""),
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "jurisdiction",
      row.holder_country,
      row.holder_country,
      evidence,
      "nomenclature_products.csv",
    );
    pushObservation(
      observations,
      runId,
      "shelf_life",
      row.shelf_life,
      row.shelf_life,
      evidence,
      "nomenclature_products.csv",
    );
  }
  return observations;
}

function buildBdpmObservations(
  rows: readonly CsvRow[],
  runId: string,
): StructuredObservationRecord[] {
  const observations: StructuredObservationRecord[] = [];
  for (const [index, row] of rows.entries()) {
    const evidence = structuredEvidence("bdpm_cis.csv", "BDPM_FR", index + 2, row);
    pushObservation(
      observations,
      runId,
      "medicinal_product",
      row.name,
      row.name,
      evidence,
      "bdpm_cis.csv",
    );
    pushObservation(observations, runId, "dose_form", row.form, row.form, evidence, "bdpm_cis.csv");
    pushObservation(
      observations,
      runId,
      "regulatory_status",
      row.status,
      foldKgText(row.status ?? ""),
      evidence,
      "bdpm_cis.csv",
    );
    pushObservation(
      observations,
      runId,
      "regulatory_procedure",
      row.procedure,
      foldKgText(row.procedure ?? ""),
      evidence,
      "bdpm_cis.csv",
    );
    pushObservation(
      observations,
      runId,
      "marketing_status",
      row.marketing_status,
      foldKgText(row.marketing_status ?? ""),
      evidence,
      "bdpm_cis.csv",
    );
    pushObservation(
      observations,
      runId,
      "organization",
      row.holder,
      normalizeOrganizationKey(row.holder ?? ""),
      evidence,
      "bdpm_cis.csv",
    );
    pushObservation(
      observations,
      runId,
      "identifier_cis",
      row.cis,
      row.cis,
      evidence,
      "bdpm_cis.csv",
    );
    pushObservation(
      observations,
      runId,
      "regulatory_authorization",
      row.cis,
      row.cis,
      evidence,
      "bdpm_cis.csv",
    );
    for (const route of (row.route ?? "")
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean)) {
      pushObservation(
        observations,
        runId,
        "route_of_administration",
        route,
        route,
        evidence,
        "bdpm_cis.csv",
      );
    }
  }
  return observations;
}

function buildSourceObservations(
  rows: readonly CsvRow[],
  runId: string,
): StructuredObservationRecord[] {
  const observations: StructuredObservationRecord[] = [];
  for (const [index, row] of rows.entries()) {
    const sourceId = stringValue(row.source_id) ?? "source";
    const evidence = structuredEvidence("sources.csv", sourceId, index + 2, row);
    pushObservation(
      observations,
      runId,
      "source",
      row.source_id,
      row.source_id,
      evidence,
      "sources.csv",
    );
    pushObservation(
      observations,
      runId,
      "source",
      row.source_name,
      row.source_name,
      evidence,
      "sources.csv",
    );
    pushObservation(
      observations,
      runId,
      "source_type",
      row.source_type,
      row.source_type,
      evidence,
      "sources.csv",
    );
    pushObservation(
      observations,
      runId,
      "jurisdiction",
      row.jurisdiction,
      row.jurisdiction,
      evidence,
      "sources.csv",
    );
    pushObservation(
      observations,
      runId,
      "language",
      row.language,
      row.language,
      evidence,
      "sources.csv",
    );
    if (
      row.source_type === "official_agency" ||
      row.source_type === "official_ministry" ||
      row.source_type === "foreign_institutional"
    ) {
      pushObservation(
        observations,
        runId,
        "regulatory_authority",
        row.source_name,
        row.source_name,
        evidence,
        "sources.csv",
      );
    }
  }
  return observations;
}

function buildManifestObservations(
  rows: readonly SourceManifestRow[],
  runId: string,
): StructuredObservationRecord[] {
  const observations: StructuredObservationRecord[] = [];
  for (const row of rows) {
    const artifactId = stringValue(row.artifact_id);
    if (!artifactId) continue;
    const evidence: MetadataRecordRef = {
      kind: "metadata",
      sourceId: stringValue(row.source_id) ?? "source",
      artifactId,
      field: "manifest",
      contentSha256: stringValue(row.content_sha256) ?? "",
    };
    for (const [field, kind] of [
      ["document_type", "document_type"],
      ["language", "language"],
      ["jurisdiction", "jurisdiction"],
      ["source_id", "source"],
      ["source_name", "source"],
      ["title", "medicinal_product"],
      ["brand_name", "brand_term"],
      ["inn", "substance"],
      ["holder", "organization"],
      ["strength_form", "strength"],
    ] as const) {
      const value = stringValue(row[field as keyof SourceManifestRow]);
      pushObservation(
        observations,
        runId,
        kind,
        value,
        value,
        { ...evidence, field },
        "manifest.jsonl",
      );
    }
    for (const name of stringArray(row.medicine_names)) {
      pushObservation(
        observations,
        runId,
        "substance",
        name,
        name,
        { ...evidence, field: "medicine_names" },
        "manifest.jsonl",
      );
    }
  }
  return observations;
}

function pushObservation(
  target: StructuredObservationRecord[],
  runId: string,
  candidateKind: MentionKind,
  rawValue: string | null | undefined,
  normalizedValue: string | null | undefined,
  evidence: StructuredRecordRef | MetadataRecordRef,
  sourceFile: string,
  attributes: Readonly<Record<string, unknown>> = {},
): void {
  const raw = stringValue(rawValue);
  if (!raw) return;
  const normalized = stringValue(normalizedValue) ?? foldKgText(raw);
  const observationId = `obs_${sha256(
    [evidence.kind, sourceFile, evidenceIdentity(evidence), candidateKind, raw].join("\u0000"),
  ).slice(0, 32)}`;
  target.push({
    observationId,
    extractionRunId: runId,
    candidateKind,
    family: mentionFamily(candidateKind),
    language: null,
    rawValue: raw,
    normalizedValue: normalized,
    evidence,
    ontologyVersion: ENTITY_MENTION_TAXONOMY_VERSION,
    attributes: {
      ...attributes,
      sourceFile,
      reviewRequired: true,
    },
    observationState: "quarantined",
  });
}

function structuredEvidence(
  path: string,
  sourceId: string,
  rowNumber: number,
  row: CsvRow,
): StructuredRecordRef {
  return {
    kind: "structured_record",
    sourceId,
    sourceKind: "structured_row",
    path,
    rowNumber,
    rowSha256: sha256(
      JSON.stringify(Object.entries(row).sort(([left], [right]) => left.localeCompare(right))),
    ),
    schemaVersion: `${path}-v1`,
  };
}

function evidenceIdentity(evidence: StructuredRecordRef | MetadataRecordRef): string {
  return evidence.kind === "structured_record"
    ? [evidence.sourceId, evidence.path, String(evidence.rowNumber), evidence.rowSha256].join(":")
    : [evidence.sourceId, evidence.artifactId, evidence.field, evidence.contentSha256].join(":");
}

function mentionFamily(kind: MentionKind): MentionCandidateRecord["family"] {
  return (
    MENTION_KIND_DEFINITIONS.find((definition) => definition.candidateKind === kind)?.family ??
    "value"
  );
}

function runIdFor(
  graph: { readonly manifestSha256: string; readonly manifest: GraphArtifactManifest },
  sourceManifestSha256: string,
): string {
  return `ext_${sha256(
    [
      EXTRACTOR_VERSION,
      ENTITY_MENTION_TAXONOMY_VERSION,
      graph.manifestSha256,
      sourceManifestSha256,
      String(graph.manifest.config?.configHash),
    ].join("\u0000"),
  ).slice(0, 24)}`;
}

function countBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const name = key(value);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function readCsv(path: string): Promise<CsvRow[]> {
  const text = await readFile(path, "utf8");
  return parseCsv(text).map((row) => {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) result[key.trim()] = value.trim();
    return result;
  });
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/u, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((values) => {
    const result: Record<string, string> = {};
    for (let index = 0; index < header.length; index += 1)
      result[header[index]!] = values[index] ?? "";
    return result;
  });
}

function parseJsonl<T>(text: string): T[] {
  const rows: T[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch (cause) {
      throw new Error(`Invalid JSONL at line ${index + 1}`, { cause });
    }
  }
  return rows;
}

function requiredString(value: unknown, name: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
