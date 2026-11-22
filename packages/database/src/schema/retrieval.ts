import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  halfvec,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Retrieval tables.
 *
 * This file is exported as `@repo/database/retrieval` because
 * `src/schema/index.ts` is generator-owned by GhostInit and cannot be edited.
 * The matching DDL lives in `src/workers/database/ensure-retrieval.ts`; those
 * two files must change together.
 *
 * Vectors are BGE-M3 dense embeddings stored as `halfvec(1024)`; the lexical
 * arm is a real BM25 inverted index (`retrieval_chunk_terms`), not `ts_rank`.
 * The pinned model revision is stored beside the model name so vectors from
 * two revisions can never be mixed silently.
 */

export const retrievalDocuments = pgTable("retrieval_documents", {
  artifactId: text("artifact_id").primaryKey(),
  documentId: text("document_id").notNull(),
  partId: text("part_id"),
  sourceId: text("source_id").notNull(),
  sourceName: text("source_name").notNull(),
  authorityLevel: smallint("authority_level").notNull(),
  authorityTier: text("authority_tier"),
  jurisdiction: text("jurisdiction"),
  documentType: text("document_type").notNull(),
  language: text("language").notNull(),
  medicineIds: text("medicine_ids")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  medicineNames: text("medicine_names")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  inn: text("inn"),
  brandName: text("brand_name"),
  strengthForm: text("strength_form"),
  title: text("title").notNull(),
  sourceUrls: text("source_urls")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  publicationDate: timestamp("publication_date", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  revisionDate: timestamp("revision_date", { withTimezone: true }),
  contentSha256: text("content_sha256").notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  metadata: jsonb("metadata").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const retrievalChunks = pgTable(
  "retrieval_chunks",
  {
    chunkId: text("chunk_id").primaryKey(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => retrievalDocuments.artifactId, { onDelete: "cascade" }),
    sectionCode: text("section_code").notNull(),
    sectionCodes: text("section_codes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sectionHeading: text("section_heading").notNull(),
    sectionPath: text("section_path").notNull(),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    contextualizedContent: text("contextualized_content").notNull(),
    contentHash: text("content_hash").notNull(),
    termCount: integer("term_count").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    language: text("language").notNull(),
    medicineIds: text("medicine_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    medicineNames: text("medicine_names")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    authorityLevel: smallint("authority_level").notNull(),
    documentType: text("document_type").notNull(),
    sourceUrls: text("source_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    embeddingModel: text("embedding_model").notNull(),
    embeddingRevision: text("embedding_revision"),
    embedding: halfvec("embedding", { dimensions: 1024 }).notNull(),
    injectionRisk: boolean("injection_risk").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("retrieval_chunks_artifact_idx").on(table.artifactId),
    index("retrieval_chunks_source_idx").on(table.sourceId),
    index("retrieval_chunks_section_idx").on(table.sectionCode),
    index("retrieval_chunks_language_idx").on(table.language),
  ],
);

/**
 * BM25 postings. One row per distinct term in a chunk. `tf` is the raw term
 * frequency; document length lives on `retrieval_chunks.term_count`.
 */
export const retrievalChunkTerms = pgTable(
  "retrieval_chunk_terms",
  {
    chunkId: text("chunk_id")
      .notNull()
      .references(() => retrievalChunks.chunkId, { onDelete: "cascade" }),
    term: text("term").notNull(),
    tf: integer("tf").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chunkId, table.term] }),
    index("retrieval_chunk_terms_term_idx").on(table.term),
  ],
);

export const retrievalIndexMeta = pgTable("retrieval_index_meta", {
  embeddingModel: text("embedding_model").primaryKey(),
  embeddingRevision: text("embedding_revision"),
  chunkCount: integer("chunk_count").notNull(),
  averageDocumentLength: doublePrecision("average_document_length").notNull(),
  tokenizerVersion: text("tokenizer_version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Convenience re-export so adapter code can import one type. */
export type RetrievalDocumentRow = typeof retrievalDocuments.$inferSelect;
export type RetrievalChunkRow = typeof retrievalChunks.$inferSelect;
export type RetrievalChunkTermRow = typeof retrievalChunkTerms.$inferSelect;
