import { sql } from "drizzle-orm";
import { db } from "@repo/database";

import {
  DEFAULT_EXTRACTIONS_PATH,
  applyProvenance,
  provenanceForArtifact,
  readExtractions,
} from "./provenance";

/**
 * Backfill provenance metadata onto already-ingested documents.
 *
 * The extraction report records, per document, whether the pipeline read the
 * whole document (`EXTRACTED`) or only part of it (`PARTIAL`), whether a human
 * was asked to review it, and when it was sectioned. None of that reached the
 * index on the first ingest, so a partial extraction was indistinguishable from
 * a complete one when the agent cited it.
 *
 * This worker writes metadata only. It never re-chunks, re-embeds, or touches
 * `content_hash` or `embedding`, so the HNSW index is not rebuilt and the
 * vectors stay exactly as they were. It is idempotent: running it twice
 * produces the same rows.
 *
 *   bun run retrieval:backfill-provenance
 *   bun run retrieval:backfill-provenance -- --dry-run
 */

interface Options {
  readonly extractions: string;
  readonly dryRun: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  let extractions = DEFAULT_EXTRACTIONS_PATH;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--extractions") {
      const value = argv[index + 1];
      if (!value) throw new Error("--extractions requires a path");
      extractions = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: backfill-provenance [--extractions <csv>] [--dry-run]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { extractions, dryRun };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const extractions = await readExtractions(options.extractions);
  const startedAt = performance.now();

  const documents = await db.execute<{
    artifact_id: string;
    metadata: Record<string, unknown>;
  }>(sql`
    SELECT artifact_id, metadata
    FROM retrieval_documents
  `);

  let matched = 0;
  let fallbackOnly = 0;
  const unmatched = new Set(extractions.keys());
  const updates: Array<{
    artifactId: string;
    metadata: Record<string, unknown>;
    status: string | null;
    reviewRequired: boolean;
  }> = [];

  for (const row of documents.rows) {
    const provenance = provenanceForArtifact(extractions, row.artifact_id);
    if (provenance) {
      matched += 1;
      unmatched.delete(provenance.documentId);
    } else {
      fallbackOnly += 1;
    }
    const metadata = applyProvenance(row.metadata ?? {}, provenance);
    updates.push({
      artifactId: row.artifact_id,
      metadata,
      status: provenance?.extractionStatus ?? null,
      reviewRequired: provenance?.reviewRequired === true,
    });
  }

  const summary = {
    ok: true,
    dryRun: options.dryRun,
    documents: documents.rows.length,
    matchedExtractionRows: matched,
    fallbackToCleaningTimestamp: fallbackOnly,
    withExtractionStatus: updates.filter((entry) => entry.status !== null).length,
    partialExtractions: updates.filter((entry) => entry.status === "PARTIAL").length,
    reviewRequired: updates.filter((entry) => entry.reviewRequired).length,
    extractionRowsUnmatched: unmatched.size,
    elapsedMs: Math.round(performance.now() - startedAt),
  };

  if (options.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (updates.length > 0) {
    // `jsonb_to_recordset` matches on the JSON key names, so the payload uses
    // the column names rather than the camelCase used inside the worker.
    const payload = JSON.stringify(
      updates.map((entry) => ({
        artifact_id: entry.artifactId,
        metadata: entry.metadata,
      })),
    );
    await db.execute(sql`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset(${payload}::jsonb)
          AS x(artifact_id text, metadata jsonb)
      )
      UPDATE retrieval_documents d
      SET metadata = d.metadata || i.metadata,
          updated_at = now()
      FROM incoming i
      WHERE d.artifact_id = i.artifact_id
    `);
  }

  console.log(JSON.stringify(summary, null, 2));
}

await main();
