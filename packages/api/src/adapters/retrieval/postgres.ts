import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@repo/database";
import { retrievalChunks, retrievalIndexMeta } from "@repo/database/retrieval";
import {
  RetrievalError,
  RETRIEVAL_LIMITS,
  type DenseSearchInput,
  type LexicalSearchInput,
  type RankedCandidate,
  type RetrievalCandidate,
  type RetrievalFilter,
  type RetrievalIndexPort,
} from "@repo/services/retrieval";
import { LEXICAL_TOKENIZER_VERSION } from "@repo/services/retrieval/tokenize";
import { textArray } from "./sql";

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

/**
 * PostgreSQL hybrid retrieval adapter.
 *
 * Both arms apply their filters inside the query, before ranking: a chunk the
 * caller may not read must never reach the candidate set. Dense uses pgvector
 * `halfvec` cosine distance; lexical is a real BM25 score computed over the
 * `retrieval_chunk_terms` postings, using global corpus statistics.
 */
export const postgresRetrievalIndex: RetrievalIndexPort = {
  async denseSearch(input: DenseSearchInput): Promise<RankedCandidate[]> {
    const vector = JSON.stringify(input.embedding);
    const conditions = [
      sql`c.embedding_model = ${input.model}`,
      sql`c.injection_risk = false`,
      ...filterConditions(input.filter),
    ];
    const result = await db.execute<{ chunk_id: string; score: number }>(sql`
      SELECT c.chunk_id, (1 - (c.embedding <=> ${vector}::halfvec))::float8 AS score
      FROM retrieval_chunks c
      WHERE ${whereClause(conditions)}
      ORDER BY c.embedding <=> ${vector}::halfvec
      LIMIT ${input.limit}
    `);
    return result.rows.map((row, index) => ({
      chunkId: row.chunk_id,
      score: Number(row.score),
      rank: index + 1,
    }));
  },

  async lexicalSearch(input: LexicalSearchInput): Promise<RankedCandidate[]> {
    if (input.terms.length === 0) return [];

    const meta = await db
      .select({
        chunkCount: retrievalIndexMeta.chunkCount,
        averageDocumentLength: retrievalIndexMeta.averageDocumentLength,
        tokenizerVersion: retrievalIndexMeta.tokenizerVersion,
      })
      .from(retrievalIndexMeta)
      .where(eq(retrievalIndexMeta.embeddingModel, input.model))
      .limit(1);
    const stats = meta[0];
    if (!stats || stats.chunkCount < 1 || stats.averageDocumentLength <= 0) return [];
    if (stats.tokenizerVersion !== LEXICAL_TOKENIZER_VERSION) {
      throw new RetrievalError(
        "RETRIEVAL_INDEX_FAILED",
        "The lexical index was built with a different tokenizer; re-run bun run retrieval:ingest",
      );
    }

    const conditions = [
      sql`c.embedding_model = ${input.model}`,
      sql`c.injection_risk = false`,
      ...filterConditions(input.filter),
    ];
    const { bm25K1: k1, bm25B: b } = RETRIEVAL_LIMITS;
    const result = await db.execute<{ chunk_id: string; score: number }>(sql`
      WITH df AS (
        SELECT t.term, count(*)::float8 AS df
        FROM retrieval_chunk_terms t
        WHERE t.term = ANY(${textArray(input.terms)})
        GROUP BY t.term
      ),
      scored AS (
        SELECT
          t.chunk_id,
          sum(
            ln(1 + ((${stats.chunkCount}::float8 - df.df + 0.5) / (df.df + 0.5))) *
            (t.tf::float8 * (${k1}::float8 + 1)) /
            (
              t.tf::float8 +
              ${k1}::float8 * (
                1 - ${b}::float8 +
                ${b}::float8 * (c.term_count::float8 / ${stats.averageDocumentLength}::float8)
              )
            )
          )::float8 AS score
        FROM retrieval_chunk_terms t
        JOIN df ON df.term = t.term
        JOIN retrieval_chunks c ON c.chunk_id = t.chunk_id
        WHERE ${whereClause(conditions)}
        GROUP BY t.chunk_id
        ORDER BY score DESC
        LIMIT ${input.limit}
      )
      SELECT chunk_id, score FROM scored
    `);
    return result.rows.map((row, index) => ({
      chunkId: row.chunk_id,
      score: Number(row.score),
      rank: index + 1,
    }));
  },

  async loadCandidates(chunkIds: readonly string[]): Promise<RetrievalCandidate[]> {
    if (chunkIds.length === 0) return [];
    const result = await db.execute<{
      chunk_id: string;
      artifact_id: string;
      document_id: string;
      title: string;
      section_code: string;
      section_codes: string[];
      section_heading: string;
      section_path: string;
      content: string;
      contextualized_content: string;
      source_id: string;
      source_name: string;
      authority_level: number;
      authority_tier: string | null;
      document_type: string;
      language: string;
      medicine_ids: string[];
      medicine_names: string[];
      source_urls: string[];
      injection_risk: boolean;
    }>(sql`
      SELECT
        c.chunk_id,
        c.artifact_id,
        d.document_id,
        d.title,
        c.section_code,
        c.section_codes,
        c.section_heading,
        c.section_path,
        c.content,
        c.contextualized_content,
        c.source_id,
        c.source_name,
        d.authority_level,
        d.authority_tier,
        c.document_type,
        c.language,
        c.medicine_ids,
        c.medicine_names,
        c.source_urls,
        c.injection_risk
      FROM retrieval_chunks c
      JOIN retrieval_documents d ON d.artifact_id = c.artifact_id
      WHERE c.chunk_id = ANY(${textArray(chunkIds)})
    `);
    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      artifactId: row.artifact_id,
      documentId: row.document_id,
      title: row.title,
      sectionCode: row.section_code,
      sectionCodes: row.section_codes ?? [],
      sectionHeading: row.section_heading,
      sectionPath: row.section_path,
      content: row.content,
      contextualizedContent: row.contextualized_content,
      sourceId: row.source_id,
      sourceName: row.source_name,
      authorityLevel: Number(row.authority_level),
      authorityTier: row.authority_tier ?? null,
      documentType: row.document_type,
      language: row.language,
      medicineIds: row.medicine_ids ?? [],
      medicineNames: row.medicine_names ?? [],
      sourceUrls: row.source_urls ?? [],
      injectionRisk: row.injection_risk === true,
    }));
  },
};

/** Used by tests and health checks to confirm the table is reachable. */
export async function retrievalChunkCount(): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(retrievalChunks);
  return Number(rows[0]?.count ?? 0);
}
