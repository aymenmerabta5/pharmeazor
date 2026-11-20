/**
 * Offline retrieval indexer.
 *
 * Reads the cleaning lab's manifest and Markdown corpus, chunks it, embeds
 * changed chunks with BGE-M3, and writes the dense + BM25 index. It runs
 * outside the request path; the agent only ever reads the index.
 *
 *   bun run retrieval:ingest --dry-run
 *   bun run retrieval:ingest --medicine MED031
 *   bun run retrieval:ingest
 *
 * Required environment:
 *   RETRIEVAL_EMBEDDING_URL   BGE-M3 HTTP endpoint (TEI /embed by default)
 *   RETRIEVAL_EMBEDDING_MODEL defaults to BAAI/bge-m3
 *   RETRIEVAL_RERANKER_URL    optional BGE reranker endpoint (TEI /rerank)
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@repo/database";
import {
  retrievalChunkTerms,
  retrievalChunks,
  retrievalDocuments,
  retrievalIndexMeta,
} from "@repo/database/retrieval";
import {
  chunkMarkdownDocument,
  stripFrontMatter,
  type ChunkDraft,
  type ChunkSourceDocument,
} from "@repo/modules/retrieval";
import {
  LEXICAL_TOKENIZER_VERSION,
  lexicalDocumentLength,
  termFrequencies,
  tokenizeForLexical,
} from "@repo/services/retrieval/tokenize";
import { readRetrievalRuntimeConfig } from "../../adapters/retrieval/config";
import { createHttpEmbeddingAdapter } from "../../adapters/retrieval/embedding";
import { textArray } from "../../adapters/retrieval/sql";

interface ManifestRow {
  readonly artifact_id?: unknown;
  readonly artifact_type?: unknown;
  readonly output_path?: unknown;
  readonly status?: unknown;
  readonly document_id?: unknown;
  readonly part_id?: unknown;
  readonly source_id?: unknown;
  readonly source_name?: unknown;
  readonly authority_level?: unknown;
  readonly authority_tier?: unknown;
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
  readonly revision_date?: unknown;
  readonly content_sha256?: unknown;
}

interface IngestOptions {
  readonly root: string;
  readonly manifest: string;
  readonly limit: number | null;
  readonly medicineIds: readonly string[];
  readonly artifactId: string | null;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly prune: boolean;
  readonly maxChars: number;
}

interface IngestSummary {
  readonly documents: number;
  readonly chunks: number;
  readonly embeddedChunks: number;
  readonly retokenizedChunks: number;
  readonly reusedChunks: number;
  readonly injectionChunks: number;
  readonly deletedDocuments: number;
  readonly elapsedMs: number;
  readonly embeddingModel: string;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = performance.now();
  const rows = await readManifest(options);
  const selected = selectRows(rows, options);
  const documents = await Promise.all(selected.map((row) => loadDocument(row, options)));

  if (options.dryRun) {
    const summary = summarizeDryRun(documents, startedAt);
    console.log(JSON.stringify({ ok: true, dryRun: true, ...summary }, null, 2));
    return;
  }

  const config = readRetrievalRuntimeConfig();
  const embedding = createHttpEmbeddingAdapter(config.embedding);
  const meta = await db
    .select({ tokenizerVersion: retrievalIndexMeta.tokenizerVersion })
    .from(retrievalIndexMeta)
    .where(eq(retrievalIndexMeta.embeddingModel, embedding.model))
    .limit(1);
  const tokenizerChanged =
    Boolean(meta[0]?.tokenizerVersion) && meta[0]!.tokenizerVersion !== LEXICAL_TOKENIZER_VERSION;

  let embeddedChunks = 0;
  let retokenizedChunks = 0;
  let reusedChunks = 0;
  let chunkCount = 0;
  let injectionChunks = 0;

  for (const document of documents) {
    if (document.chunks.length === 0) {
      console.warn(`[retrieval] no chunks for ${document.source.artifactId}; skipping`);
      continue;
    }
    chunkCount += document.chunks.length;
    injectionChunks += document.chunks.filter((chunk) => chunk.injectionRisk).length;

    const existing = await db
      .select({
        chunkId: retrievalChunks.chunkId,
        contentHash: retrievalChunks.contentHash,
        embeddingModel: retrievalChunks.embeddingModel,
      })
      .from(retrievalChunks)
      .where(eq(retrievalChunks.artifactId, document.source.artifactId));
    const existingById = new Map(existing.map((chunk) => [chunk.chunkId, chunk]));

    const changed = document.chunks.filter((chunk) => {
      const current = existingById.get(chunk.chunkId);
      return (
        options.force ||
        !current ||
        current.contentHash !== chunk.contentHash ||
        current.embeddingModel !== embedding.model
      );
    });
    const needsRetokenizing = options.force || tokenizerChanged ? document.chunks : changed;
    const vectors = new Map<string, number[]>();
    if (changed.length > 0) {
      const embedded = await embedding.embedDocuments(
        changed.map((chunk) => chunk.contextualizedContent),
      );
      if (embedded.length !== changed.length) {
        throw new Error(
          `Embedding server returned ${embedded.length} vectors for ${changed.length} chunks of ${document.source.artifactId}`,
        );
      }
      changed.forEach((chunk, index) => vectors.set(chunk.chunkId, embedded[index]!));
      embeddedChunks += changed.length;
    }
    reusedChunks += document.chunks.length - changed.length;

    await db.transaction(async (transaction) => {
      const documentRow = {
        artifactId: document.source.artifactId,
        documentId: document.source.documentId,
        partId: document.partId,
        sourceId: document.source.sourceId,
        sourceName: document.source.sourceName,
        authorityLevel: document.source.authorityLevel,
        authorityTier: document.authorityTier,
        jurisdiction: document.source.jurisdiction,
        documentType: document.source.documentType,
        language: document.source.language,
        medicineIds: [...document.source.medicineIds],
        medicineNames: [...document.source.medicineNames],
        inn: document.source.inn,
        brandName: document.source.brandName,
        strengthForm: document.source.strengthForm,
        title: document.source.title,
        sourceUrls: [...document.source.sourceUrls],
        publicationDate: document.publicationDate,
        collectedAt: document.collectedAt,
        revisionDate: document.revisionDate,
        contentSha256: document.contentSha256,
        contentMarkdown: document.markdown,
        metadata: document.row,
        updatedAt: new Date(),
      };
      await transaction.insert(retrievalDocuments).values(documentRow).onConflictDoUpdate({
        target: retrievalDocuments.artifactId,
        set: documentRow,
      });

      const keepIds = document.chunks.map((chunk) => chunk.chunkId);
      await transaction.execute(sql`
        DELETE FROM retrieval_chunks
        WHERE artifact_id = ${document.source.artifactId}
          AND NOT (chunk_id = ANY(${textArray(keepIds)}))
      `);

      for (const batch of batchOf(changed, 40)) {
        await transaction
          .insert(retrievalChunks)
          .values(
            batch.map((chunk) => ({
              ...chunkRow(chunk, document.source, embedding.model),
              embedding: vectors.get(chunk.chunkId)!,
            })),
          )
          .onConflictDoUpdate({
            target: retrievalChunks.chunkId,
            set: buildChunkUpdateSet(),
          });
      }

      const retokenizedIds = needsRetokenizing.map((chunk) => chunk.chunkId);
      if (retokenizedIds.length > 0) {
        await transaction.execute(sql`
          DELETE FROM retrieval_chunk_terms
          WHERE chunk_id = ANY(${textArray(retokenizedIds)})
        `);
        const postings = needsRetokenizing.flatMap((chunk) =>
          [...termFrequencies(tokenizeForLexical(chunk.content))].map(([term, tf]) => ({
            chunkId: chunk.chunkId,
            term,
            tf,
          })),
        );
        for (const batch of batchOf(postings, 1_000)) {
          await transaction.insert(retrievalChunkTerms).values(batch).onConflictDoNothing();
        }
        retokenizedChunks += needsRetokenizing.length;
      }
    });

    console.log(
      JSON.stringify({
        artifactId: document.source.artifactId,
        chunks: document.chunks.length,
        embedded: changed.length,
        retokenized: needsRetokenizing.length,
      }),
    );
  }

  let deletedDocuments = 0;
  if (options.prune) {
    deletedDocuments = await pruneDocuments(rows);
  }

  await db.execute(sql`
    DELETE FROM retrieval_index_meta
    WHERE embedding_model NOT IN (SELECT DISTINCT embedding_model FROM retrieval_chunks)
  `);
  await db.execute(sql`
    INSERT INTO retrieval_index_meta (
      embedding_model, chunk_count, average_document_length, tokenizer_version, updated_at
    )
    SELECT embedding_model, count(*)::int, coalesce(avg(term_count), 0)::float8,
      ${LEXICAL_TOKENIZER_VERSION}, now()
    FROM retrieval_chunks
    GROUP BY embedding_model
    ON CONFLICT (embedding_model) DO UPDATE SET
      chunk_count = EXCLUDED.chunk_count,
      average_document_length = EXCLUDED.average_document_length,
      tokenizer_version = EXCLUDED.tokenizer_version,
      updated_at = EXCLUDED.updated_at
  `);
  await db.execute(sql`ANALYZE retrieval_chunks`);
  await db.execute(sql`ANALYZE retrieval_chunk_terms`);

  const summary: IngestSummary = {
    documents: documents.length,
    chunks: chunkCount,
    embeddedChunks,
    retokenizedChunks,
    reusedChunks,
    injectionChunks,
    deletedDocuments,
    elapsedMs: Math.round(performance.now() - startedAt),
    embeddingModel: embedding.model,
  };
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

function parseOptions(argv: readonly string[]): IngestOptions {
  let root = process.env.RETRIEVAL_CORPUS_ROOT?.trim() || "tooling/cleaning-lab/output";
  let manifest: string | null = null;
  let limit: number | null = null;
  let artifactId: string | null = null;
  let dryRun = false;
  let force = false;
  let prune = false;
  let maxChars = 3_200;
  const medicineIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const next = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    switch (argument) {
      case "--root":
        root = next();
        break;
      case "--manifest":
        manifest = next();
        break;
      case "--limit":
        limit = positiveInteger(next(), "--limit");
        break;
      case "--artifact":
        artifactId = next().trim();
        break;
      case "--medicine":
        for (const value of next().split(",")) {
          const id = value.trim();
          if (!/^MED\d{3}$/.test(id)) throw new Error(`Invalid medicine id: ${id}`);
          medicineIds.push(id);
        }
        break;
      case "--max-chars":
        maxChars = positiveInteger(next(), "--max-chars");
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--force":
        force = true;
        break;
      case "--prune":
        prune = true;
        break;
      case "--help":
        console.log(
          [
            "bun run retrieval:ingest [options]",
            "  --root <path>       corpus root (default tooling/cleaning-lab/output)",
            "  --manifest <path>   manifest path (default <root>/manifest.jsonl)",
            "  --limit <n>         index at most n documents",
            "  --medicine <id>     index one or more MEDxxx documents",
            "  --artifact <id>     index one artifact",
            "  --max-chars <n>     chunk size ceiling (default 3200)",
            "  --dry-run           chunk and report without a database or embedding server",
            "  --force             re-embed every selected chunk",
            "  --prune             delete documents absent from the manifest (full run only)",
          ].join("\n"),
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (prune && (limit !== null || medicineIds.length > 0 || artifactId)) {
    throw new Error("--prune is only allowed on a full, unfiltered ingest");
  }

  const resolvedRoot = resolve(root);
  return {
    root: resolvedRoot,
    manifest: resolve(manifest ?? join(resolvedRoot, "manifest.jsonl")),
    limit,
    medicineIds: [...new Set(medicineIds)],
    artifactId,
    dryRun,
    force,
    prune,
    maxChars,
  };
}

async function readManifest(options: IngestOptions): Promise<ManifestRow[]> {
  const text = await readFile(options.manifest, "utf8");
  const rows: ManifestRow[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new Error(`Manifest line ${index + 1} is not valid JSON`, { cause });
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`Manifest line ${index + 1} is not an object`);
    }
    rows.push(parsed as ManifestRow);
  }
  return rows;
}

function selectRows(rows: readonly ManifestRow[], options: IngestOptions): ManifestRow[] {
  const seen = new Set<string>();
  const selected: ManifestRow[] = [];
  for (const row of rows) {
    if (row.artifact_type !== "document" || row.status !== "clean") continue;
    if (typeof row.output_path !== "string" || !row.output_path) continue;
    const artifactId = stringValue(row.artifact_id);
    if (!artifactId || seen.has(artifactId)) continue;
    if (options.artifactId && artifactId !== options.artifactId) continue;
    if (options.medicineIds.length > 0) {
      const medicineIds = stringArray(row.medicine_ids);
      if (!options.medicineIds.some((id) => medicineIds.includes(id))) continue;
    }
    seen.add(artifactId);
    selected.push(row);
    if (options.limit !== null && selected.length >= options.limit) break;
  }
  return selected;
}

interface LoadedDocument {
  readonly row: ManifestRow;
  readonly source: ChunkSourceDocument;
  readonly partId: string | null;
  readonly authorityTier: string | null;
  readonly publicationDate: Date | null;
  readonly collectedAt: Date | null;
  readonly revisionDate: Date | null;
  readonly contentSha256: string;
  readonly markdown: string;
  readonly chunks: ChunkDraft[];
}

async function loadDocument(row: ManifestRow, options: IngestOptions): Promise<LoadedDocument> {
  const artifactId = stringValue(row.artifact_id);
  const outputPath = stringValue(row.output_path);
  const title = stringValue(row.title);
  const sourceId = stringValue(row.source_id);
  if (!artifactId || !outputPath || !title || !sourceId) {
    throw new Error(
      `Manifest row ${artifactId ?? "(unknown)"} is missing required identity fields`,
    );
  }
  const authorityLevel = Number(row.authority_level);
  if (!Number.isInteger(authorityLevel) || authorityLevel < 1 || authorityLevel > 4) {
    throw new Error(`Manifest row ${artifactId} has an invalid authority level`);
  }
  const filePath = resolveCorpusPath(options.root, outputPath);
  const markdown = await readFile(filePath, "utf8");
  const source: ChunkSourceDocument = {
    artifactId,
    documentId: stringValue(row.document_id) ?? artifactId,
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
  };
  return {
    row,
    source,
    partId: stringValue(row.part_id),
    authorityTier: stringValue(row.authority_tier),
    publicationDate: dateValue(row.publication_date),
    collectedAt: dateValue(row.collected_at),
    revisionDate: dateValue(row.revision_date),
    contentSha256: stringValue(row.content_sha256) ?? sha256(stripFrontMatter(markdown)),
    markdown: stripFrontMatter(markdown),
    chunks: chunkMarkdownDocument(source, markdown, { maxChars: options.maxChars }),
  };
}

function resolveCorpusPath(root: string, outputPath: string): string {
  const target = resolve(root, outputPath.replaceAll("\\", "/"));
  const relation = relative(root, target);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`Manifest path escapes the corpus root: ${outputPath}`);
  }
  return target;
}

function chunkRow(chunk: ChunkDraft, source: ChunkSourceDocument, embeddingModel: string) {
  return {
    chunkId: chunk.chunkId,
    artifactId: chunk.artifactId,
    sectionCode: chunk.sectionCode,
    sectionHeading: chunk.sectionHeading,
    sectionPath: chunk.sectionPath,
    ordinal: chunk.ordinal,
    content: chunk.content,
    contextualizedContent: chunk.contextualizedContent,
    contentHash: chunk.contentHash,
    termCount: lexicalDocumentLength(tokenizeForLexical(chunk.content)),
    tokenEstimate: chunk.tokenEstimate,
    language: source.language,
    medicineIds: [...source.medicineIds],
    medicineNames: [...source.medicineNames],
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    authorityLevel: source.authorityLevel,
    documentType: source.documentType,
    sourceUrls: [...source.sourceUrls],
    embeddingModel,
    injectionRisk: chunk.injectionRisk,
    updatedAt: new Date(),
  };
}

function buildChunkUpdateSet() {
  return {
    sectionCode: sql`excluded.section_code`,
    sectionHeading: sql`excluded.section_heading`,
    sectionPath: sql`excluded.section_path`,
    ordinal: sql`excluded.ordinal`,
    content: sql`excluded.content`,
    contextualizedContent: sql`excluded.contextualized_content`,
    contentHash: sql`excluded.content_hash`,
    termCount: sql`excluded.term_count`,
    tokenEstimate: sql`excluded.token_estimate`,
    language: sql`excluded.language`,
    medicineIds: sql`excluded.medicine_ids`,
    medicineNames: sql`excluded.medicine_names`,
    sourceId: sql`excluded.source_id`,
    sourceName: sql`excluded.source_name`,
    authorityLevel: sql`excluded.authority_level`,
    documentType: sql`excluded.document_type`,
    sourceUrls: sql`excluded.source_urls`,
    embeddingModel: sql`excluded.embedding_model`,
    embedding: sql`excluded.embedding`,
    injectionRisk: sql`excluded.injection_risk`,
    updatedAt: sql`excluded.updated_at`,
  };
}

async function pruneDocuments(rows: readonly ManifestRow[]): Promise<number> {
  const keep = [
    ...new Set(
      rows
        .filter((row) => row.artifact_type === "document" && row.status === "clean")
        .map((row) => stringValue(row.artifact_id))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (keep.length === 0) {
    console.warn("[retrieval] refusing to prune against an empty manifest");
    return 0;
  }
  const result = await db.execute<{ artifact_id: string }>(sql`
    DELETE FROM retrieval_documents
    WHERE NOT (artifact_id = ANY(${textArray(keep)}))
    RETURNING artifact_id
  `);
  return result.rows.length;
}

function summarizeDryRun(documents: readonly LoadedDocument[], startedAt: number) {
  const chunks = documents.flatMap((document) => document.chunks);
  return {
    documents: documents.length,
    chunks: chunks.length,
    injectionChunks: chunks.filter((chunk) => chunk.injectionRisk).length,
    terms: chunks.reduce(
      (total, chunk) => total + lexicalDocumentLength(tokenizeForLexical(chunk.content)),
      0,
    ),
    maximumChunkCharacters: chunks.reduce(
      (maximum, chunk) => Math.max(maximum, chunk.content.length),
      0,
    ),
    sections: [...new Set(chunks.map((chunk) => chunk.sectionCode))].sort(),
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function batchOf<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
