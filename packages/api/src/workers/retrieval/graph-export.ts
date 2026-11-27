/**
 * Offline graph-evidence chunk exporter.
 *
 * This worker prepares a versioned evidence artifact from clean Markdown. It
 * never writes PostgreSQL, embeddings, BM25 postings, or the hybrid index.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  GRAPH_CHUNKING_PROFILE,
  chunkGraphMarkdownDocument,
  graphChunkingConfig,
  type GraphChunkDiagnostic,
  type GraphChunkingConfig,
  type GraphDocumentSection,
  type GraphTextUnit,
  type ChunkSourceDocument,
} from "@repo/modules/retrieval";

export interface GraphExportOptions {
  readonly root: string;
  readonly manifestPath: string;
  readonly outputDir: string;
  readonly maxChars?: number;
  readonly overlapChars?: number;
  readonly limit?: number | null;
  readonly sourceIds?: readonly string[];
  readonly medicineIds?: readonly string[];
  readonly artifactIds?: readonly string[];
  readonly dryRun?: boolean;
}

interface ManifestRow {
  readonly artifact_id?: unknown;
  readonly artifact_type?: unknown;
  readonly output_path?: unknown;
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
  readonly content_sha256?: unknown;
}

export interface GraphExportDocument {
  readonly artifactId: string;
  readonly documentId: string;
  readonly documentContentSha256: string;
  readonly documentSnapshotId: string;
  readonly sections: number;
  readonly textUnits: number;
  readonly diagnostics: number;
}

export interface GraphExportFiles {
  readonly sections: string;
  readonly textUnits: string;
  readonly diagnostics: string;
  readonly manifest: string;
}

export interface GraphExportReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly profile: typeof GRAPH_CHUNKING_PROFILE;
  readonly algorithmVersion: string;
  readonly sectionTaxonomyVersion: string;
  readonly textHelperVersion: string;
  readonly config: GraphChunkingConfig;
  readonly sourceManifest: string;
  readonly sourceManifestSha256: string;
  readonly corpusSnapshotHash: string;
  readonly outputDir: string;
  readonly files: GraphExportFiles;
  readonly filesWritten: boolean;
  readonly checksums: {
    readonly sections: string;
    readonly textUnits: string;
    readonly diagnostics: string;
  };
  readonly counts: {
    readonly documents: number;
    readonly sections: number;
    readonly textUnits: number;
    readonly narrativeUnits: number;
    readonly tableUnits: number;
    readonly listUnits: number;
    readonly diagnostics: number;
    readonly warnings: number;
    readonly errors: number;
    readonly overlapOmissions: number;
    readonly oversizedUnits: number;
    readonly maxUnitChars: number;
    readonly totalUnitChars: number;
  };
  readonly diagnosticsByCode: Readonly<Record<string, number>>;
  readonly documents: readonly GraphExportDocument[];
}

interface ExportedSection extends GraphDocumentSection {
  readonly artifact_id: string;
  readonly document_id: string;
  readonly document_content_sha256: string;
  readonly document_snapshot_id: string;
}

interface ExportedTextUnit extends GraphTextUnit {
  readonly document_content_sha256: string;
}

interface ExportedDiagnostic extends GraphChunkDiagnostic {
  readonly artifact_id: string;
  readonly document_id: string;
  readonly document_snapshot_id: string;
}

export async function runGraphChunkExport(options: GraphExportOptions): Promise<GraphExportReport> {
  const root = resolve(options.root);
  const manifestPath = resolve(options.manifestPath);
  const outputDir = resolve(options.outputDir);
  const manifestText = await readFile(manifestPath, "utf8");
  const rows = parseManifest(manifestText, manifestPath);
  const selected = selectRows(rows, options);
  if (selected.length === 0) throw new Error("No clean document matched the graph export filters");

  const config = graphChunkingConfig({
    maxChars: options.maxChars,
    overlapChars: options.overlapChars,
  });
  const sections: ExportedSection[] = [];
  const textUnits: ExportedTextUnit[] = [];
  const diagnostics: ExportedDiagnostic[] = [];
  const documents: GraphExportDocument[] = [];

  for (const row of selected) {
    const { source, outputPath, contentSha256 } = loadRowIdentity(row);
    const markdown = await readFile(safePath(root, outputPath), "utf8");
    const result = chunkGraphMarkdownDocument(source, markdown, {
      maxChars: config.maxChars,
      overlapChars: config.overlapChars,
      expectedDocumentContentSha256: contentSha256,
    });
    for (const section of result.sections) {
      sections.push({
        artifact_id: source.artifactId,
        document_id: source.documentId,
        document_content_sha256: result.documentContentSha256,
        document_snapshot_id: result.documentSnapshotId,
        ...section,
      });
    }
    for (const unit of result.textUnits) {
      textUnits.push({
        ...unit,
        document_content_sha256: result.documentContentSha256,
      });
    }
    for (const diagnostic of result.diagnostics) {
      diagnostics.push({
        artifact_id: source.artifactId,
        document_id: source.documentId,
        document_snapshot_id: result.documentSnapshotId,
        ...diagnostic,
      });
    }
    documents.push({
      artifactId: source.artifactId,
      documentId: source.documentId,
      documentContentSha256: result.documentContentSha256,
      documentSnapshotId: result.documentSnapshotId,
      sections: result.sections.length,
      textUnits: result.textUnits.length,
      diagnostics: result.diagnostics.length,
    });
  }

  const sectionsJsonl = toJsonl(sections);
  const textUnitsJsonl = toJsonl(textUnits);
  const diagnosticsJsonl = toJsonl(diagnostics);
  const files: GraphExportFiles = {
    sections: "sections.jsonl",
    textUnits: "text-units.jsonl",
    diagnostics: "diagnostics.jsonl",
    manifest: "manifest.json",
  };
  const diagnosticsByCode = countDiagnostics(diagnostics);
  const report: GraphExportReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun === true,
    profile: GRAPH_CHUNKING_PROFILE,
    algorithmVersion: config.algorithmVersion,
    sectionTaxonomyVersion: config.sectionTaxonomyVersion,
    textHelperVersion: config.textHelperVersion,
    config,
    sourceManifest: relative(process.cwd(), manifestPath).replaceAll("\\", "/"),
    sourceManifestSha256: sha256(manifestText),
    corpusSnapshotHash: corpusSnapshotHash(documents),
    outputDir: relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    files,
    filesWritten: false,
    checksums: {
      sections: sha256(sectionsJsonl),
      textUnits: sha256(textUnitsJsonl),
      diagnostics: sha256(diagnosticsJsonl),
    },
    counts: {
      documents: documents.length,
      sections: sections.length,
      textUnits: textUnits.length,
      narrativeUnits: textUnits.filter((unit) => unit.blockKind === "narrative").length,
      tableUnits: textUnits.filter((unit) => unit.blockKind === "table").length,
      listUnits: textUnits.filter((unit) => unit.blockKind === "list").length,
      diagnostics: diagnostics.length,
      warnings: diagnostics.filter((entry) => entry.severity === "warning").length,
      errors: diagnostics.filter((entry) => entry.severity === "error").length,
      overlapOmissions: diagnostics.filter((entry) => entry.code === "overlap_omitted").length,
      oversizedUnits: textUnits.filter((unit) => unit.content.length > config.maxChars).length,
      maxUnitChars: textUnits.reduce((maximum, unit) => Math.max(maximum, unit.content.length), 0),
      totalUnitChars: textUnits.reduce((total, unit) => total + unit.content.length, 0),
    },
    diagnosticsByCode,
    documents,
  };

  if (options.dryRun === true) return report;
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, files.sections), sectionsJsonl, "utf8");
  await writeFile(join(outputDir, files.textUnits), textUnitsJsonl, "utf8");
  await writeFile(join(outputDir, files.diagnostics), diagnosticsJsonl, "utf8");
  await writeFile(
    join(outputDir, files.manifest),
    `${JSON.stringify({ ...report, filesWritten: true }, null, 2)}\n`,
    "utf8",
  );
  return { ...report, filesWritten: true };
}

function parseManifest(text: string, path: string): ManifestRow[] {
  const rows: ManifestRow[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (cause) {
      throw new Error(`${path}:${index + 1} is not valid JSON`, { cause });
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${path}:${index + 1} is not a manifest object`);
    }
    rows.push(value as ManifestRow);
  }
  return rows;
}

function selectRows(rows: readonly ManifestRow[], options: GraphExportOptions): ManifestRow[] {
  const selected: ManifestRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.artifact_type !== "document" || row.status !== "clean") continue;
    const artifactId = stringValue(row.artifact_id);
    if (!artifactId || seen.has(artifactId)) continue;
    const sourceId = stringValue(row.source_id);
    if (!sourceId) continue;
    if (options.artifactIds?.length && !options.artifactIds.includes(artifactId)) continue;
    if (options.sourceIds?.length && !options.sourceIds.includes(sourceId)) continue;
    if (options.medicineIds?.length) {
      const medicineIds = stringArray(row.medicine_ids);
      if (!options.medicineIds.some((id) => medicineIds.includes(id))) continue;
    }
    seen.add(artifactId);
    selected.push(row);
    if (options.limit && selected.length >= options.limit) break;
  }
  return selected;
}

function loadRowIdentity(row: ManifestRow): {
  readonly source: ChunkSourceDocument;
  readonly outputPath: string;
  readonly contentSha256: string;
} {
  const artifactId = requiredString(row.artifact_id, "artifact_id");
  const documentId = stringValue(row.document_id) ?? artifactId;
  const outputPath = requiredString(row.output_path, "output_path");
  const title = requiredString(row.title, "title");
  const sourceId = requiredString(row.source_id, "source_id");
  const authorityLevel = Number(row.authority_level);
  if (!Number.isInteger(authorityLevel) || authorityLevel < 1 || authorityLevel > 4) {
    throw new Error(`Manifest row ${artifactId} has an invalid authority level`);
  }
  const contentSha256 = requiredString(row.content_sha256, "content_sha256");
  if (!/^[a-f0-9]{64}$/u.test(contentSha256)) {
    throw new Error(`Manifest row ${artifactId} has an invalid content_sha256`);
  }
  return {
    source: {
      artifactId,
      documentId,
      title,
      sourceId,
      sourceName: stringValue(row.source_name) ?? sourceId,
      authorityLevel,
      jurisdiction: stringValue(row.jurisdiction),
      documentType: stringValue(row.document_type) ?? "document",
      language: stringValue(row.language) ?? "unknown",
      medicineIds: stringArray(row.medicine_ids),
      medicineNames: stringArray(row.medicine_names),
      inn: stringValue(row.inn),
      brandName: stringValue(row.brand_name),
      strengthForm: stringValue(row.strength_form),
      sourceUrls: stringArray(row.source_urls),
    },
    outputPath,
    contentSha256,
  };
}

function safePath(root: string, outputPath: string): string {
  const target = resolve(root, outputPath.replaceAll("\\", "/"));
  const relation = relative(root, target);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`Manifest path escapes the corpus root: ${outputPath}`);
  }
  return target;
}

function countDiagnostics(
  diagnostics: readonly ExportedDiagnostic[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const diagnostic of diagnostics) {
    counts[diagnostic.code] = (counts[diagnostic.code] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function corpusSnapshotHash(documents: readonly GraphExportDocument[]): string {
  return sha256(
    [...documents]
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
      .map((document) => `${document.artifactId}\u0000${document.documentSnapshotId}`)
      .join("\n"),
  );
}

function toJsonl(rows: readonly object[]): string {
  return rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
}

function requiredString(value: unknown, field: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(`Manifest row is missing required ${field}`);
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
