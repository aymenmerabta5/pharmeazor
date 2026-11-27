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

/**
 * Brand-to-substance aliases for query expansion.
 *
 * The corpus is written with substance names (`paracétamol`) while a user
 * asks with the Algerian brand (`DOLKO`). Measured: 36.1% of the 2,144 known
 * brands never occur anywhere in the indexed text, so neither retrieval arm
 * can reach them. This table lets the lexical arm append the substance terms
 * the brand stands for.
 *
 * `alias_norm` is folded with the same `lexical-fold-v1` analyser as the
 * postings, so an alias and a chunk term cannot live in different token
 * spaces. `ambiguous` is true when one brand covers more than one substance
 * (combination products); those are surfaced to the agent instead of expanded,
 * because silently picking one sense is how a combination product gets dosed
 * as a single agent.
 */
export const retrievalAliases = pgTable(
  "retrieval_aliases",
  {
    aliasNorm: text("alias_norm").primaryKey(),
    aliasRaw: text("alias_raw").notNull(),
    /** Folded substance labels this alias expands to; empty when ambiguous. */
    dciNorms: text("dci_norms")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Display labels, kept so the agent can name the substance it searched. */
    dciLabels: text("dci_labels")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    medicineIds: text("medicine_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ambiguous: boolean("ambiguous").notNull().default(false),
    sourceId: text("source_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("retrieval_aliases_ambiguous_idx").on(table.ambiguous)],
);

/**
 * The Algerian product register, merged from the Ministry nomenclature and
 * Pharm'Net.
 *
 * These are facts similarity search answers badly: whether a product is still
 * registered, which dispensing schedule it sits on, whether it is a generic or
 * a reference product, and how many brands share a substance. The agent reads
 * them through a deterministic lookup, not by retrieving a prose chunk.
 *
 * The two sources overlap on 9,448 registration numbers and are complementary
 * rather than redundant: the nomenclature carries withdrawal dates and
 * reasons, Pharm'Net carries observations. Nomenclature wins where they
 * disagree; the importer reports disagreements instead of hiding them.
 */
export const retrievalProducts = pgTable(
  "retrieval_products",
  {
    /**
     * Registration number plus brand and dosage. The registration number alone
     * is not unique in the source register: one dossier can carry several brand
     * names (`LYANA` and `YASMINE` share `285/11 H 078/21`), so keying on it
     * silently dropped a brand. Pack variants stay one row; the register answer
     * is about the product, not each box size.
     */
    productKey: text("product_key").primaryKey(),
    registrationNumber: text("registration_number").notNull(),
    /** Folded registration number without spaces; lookup matches this. */
    registrationNorm: text("registration_norm").notNull(),
    brand: text("brand").notNull(),
    /** Accent- and case-folded brand; lookup matches this. */
    brandNorm: text("brand_norm").notNull(),
    dci: text("dci"),
    /** Accent- and case-folded substance; lookup matches this. */
    dciNorm: text("dci_norm"),
    dciCode: text("dci_code"),
    form: text("form"),
    dosage: text("dosage"),
    pack: text("pack"),
    /** `LISTE I`, `LISTE II`, `STUPEFIANT`, or null. */
    schedule: text("schedule"),
    holder: text("holder"),
    holderCountry: text("holder_country"),
    /** `GE` (generic), `RE` (reference), `BIO`, or null. */
    productType: text("product_type"),
    /** `registered`, `withdrawn`, `non_renewed`, or `unknown`. */
    registrationStatus: text("registration_status").notNull(),
    withdrawalDate: text("withdrawal_date"),
    withdrawalReason: text("withdrawal_reason"),
    shelfLife: text("shelf_life"),
    observation: text("observation"),
    isCombination: boolean("is_combination").notNull().default(false),
    inScope: boolean("in_scope").notNull().default(false),
    medicineIds: text("medicine_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sources: text("sources")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sourceSheet: text("source_sheet"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("retrieval_products_registration_norm_idx").on(table.registrationNorm),
    index("retrieval_products_brand_norm_idx").on(table.brandNorm),
    index("retrieval_products_dci_norm_idx").on(table.dciNorm),
    index("retrieval_products_status_idx").on(table.registrationStatus),
  ],
);

/**
 * Knowledge-graph entities are a sidecar of retrieval, not a retrieval arm.
 * They live in a separate module so the retrieval contract stays small, but
 * are re-exported here because `schema/index.ts` is generated.
 */
export * from "./kg";

/** Convenience re-export so adapter code can import one type. */
export type RetrievalDocumentRow = typeof retrievalDocuments.$inferSelect;
export type RetrievalChunkRow = typeof retrievalChunks.$inferSelect;
export type RetrievalChunkTermRow = typeof retrievalChunkTerms.$inferSelect;
