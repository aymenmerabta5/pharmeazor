import { sql, type SQL } from "drizzle-orm";
import { db } from "@repo/database";
import type { RankedCandidate, RetrievalFilter } from "@repo/services/retrieval";
import type { GraphEvidence } from "./graph-evidence";
import { textArray } from "./sql";

/**
 * Bridge graph evidence to hybrid chunks.
 *
 * The only join key is `artifactId` plus the exact evidence `quote` contained
 * in the raw `retrieval_chunks.content`. The graph profile's `legacyChunkId`
 * is diagnostic only: the same id can describe different text in the two
 * profiles, so using it as a lookup key would attach graph evidence to the
 * wrong passage. Exact substring matching over the raw content is slower than
 * an id join, but it is the only mapping that cannot silently drift.
 *
 * All retrieval filters, the active embedding model, and the injection flag
 * are applied inside the SQL query before ranking. The bridge never widens
 * what the hybrid arms could read.
 */

export interface GraphChunkRow {
  readonly chunkId: string;
  readonly artifactId: string;
  readonly content: string;
}

export interface GraphChunkQuery {
  readonly artifactIds: readonly string[];
  readonly quotes: readonly string[];
  readonly filter: RetrievalFilter;
  readonly model: string;
  readonly limit: number;
}

export interface GraphChunkSource {
  loadChunks(query: GraphChunkQuery): Promise<readonly GraphChunkRow[]>;
}

function filterConditions(filter: RetrievalFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.medicineIds.length > 0) {
    conditions.push(sql`c.medicine_ids && ${textArray(filter.medicineIds)}`);
  }
  if (filter.sectionCodes.length > 0) {
    conditions.push(sql`c.section_codes && ${textArray(filter.sectionCodes)}`);
  }
  if (filter.languages.length > 0) {
    conditions.push(sql`c.language = ANY(${textArray(filter.languages)})`);
  }
  if (filter.sourceIds.length > 0) {
    conditions.push(sql`c.source_id = ANY(${textArray(filter.sourceIds)})`);
  }
  return conditions;
}

function whereClause(conditions: readonly SQL[]): SQL {
  return sql.join([...conditions], sql` AND `);
}

export const postgresGraphChunkSource: GraphChunkSource = {
  async loadChunks(query: GraphChunkQuery): Promise<readonly GraphChunkRow[]> {
    if (query.artifactIds.length === 0 || query.quotes.length === 0 || query.limit < 1) return [];
    const conditions = [
      sql`c.artifact_id = ANY(${textArray(query.artifactIds)})`,
      sql`c.embedding_model = ${query.model}`,
      sql`c.injection_risk = false`,
      sql`EXISTS (
        SELECT 1
        FROM unnest(${textArray(query.quotes)}) AS q(quote_text)
        WHERE strpos(c.content, q.quote_text) > 0
      )`,
      ...filterConditions(query.filter),
    ];
    const result = await db.execute<{
      chunk_id: string;
      artifact_id: string;
      content: string;
    }>(sql`
      SELECT c.chunk_id, c.artifact_id, c.content
      FROM retrieval_chunks c
      WHERE ${whereClause(conditions)}
      LIMIT ${query.limit}
    `);
    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      artifactId: row.artifact_id,
      content: row.content,
    }));
  },
};

/**
 * Map exact-quote evidence to ranked chunk ids.
 *
 * A chunk that contains several distinct graph quotes accumulates their
 * scores; a quote that lands in several chunks contributes to each, which is
 * correct because the chunk is the citation unit. The returned list is
 * deduplicated and re-ranked by score before the service fuses it.
 */
export function bridgeGraphEvidence(
  evidence: readonly GraphEvidence[],
  chunks: readonly GraphChunkRow[],
  limit: number,
): RankedCandidate[] {
  if (evidence.length === 0 || chunks.length === 0 || limit < 1) return [];

  const byArtifact = new Map<string, GraphChunkRow[]>();
  for (const chunk of chunks) {
    const bucket = byArtifact.get(chunk.artifactId) ?? [];
    bucket.push(chunk);
    byArtifact.set(chunk.artifactId, bucket);
  }

  const scores = new Map<string, number>();
  for (const entry of evidence) {
    const candidates = byArtifact.get(entry.artifactId);
    if (!candidates) continue;
    for (const chunk of candidates) {
      if (!chunk.content.includes(entry.quote)) continue;
      scores.set(chunk.chunkId, (scores.get(chunk.chunkId) ?? 0) + entry.score);
    }
  }

  return [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
