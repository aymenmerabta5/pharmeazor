import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Knowledge-graph entity sidecar.
 *
 * This is not a retrieval arm. The tables hold entities extracted offline from
 * the product register, corpus metadata, and cleaned documents. Mentions point
 * at the chunk (or document title) the surface form came from, so every entity
 * can be traced back to its source without asking a model to explain itself.
 *
 * `build_id` marks every row written by one build run. A later `--prune` run
 * removes rows the current corpus no longer produces. The graph is rebuildable;
 * no row here is an input to retrieval.
 *
 * The matching DDL lives in
 * `src/workers/database/ensure-retrieval.ts`; the two files change together.
 */

export const kgEntities = pgTable(
  "kg_entities",
  {
    entityId: text("entity_id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityKey: text("entity_key").notNull(),
    canonicalLabel: text("canonical_label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    /** active | review | merged */
    status: text("status").notNull().default("active"),
    mergedInto: text("merged_into"),
    confidence: real("confidence").notNull().default(1),
    attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
    buildId: text("build_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("kg_entities_type_key_idx").on(table.entityType, table.entityKey),
    index("kg_entities_type_idx").on(table.entityType),
    index("kg_entities_normalized_idx").on(table.normalizedLabel),
    index("kg_entities_build_idx").on(table.buildId),
  ],
);

export const kgEntityAliases = pgTable(
  "kg_entity_aliases",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => kgEntities.entityId, { onDelete: "cascade" }),
    aliasNorm: text("alias_norm").notNull(),
    aliasRaw: text("alias_raw").notNull(),
    language: text("language"),
    sourceId: text("source_id").notNull(),
    confidence: real("confidence").notNull().default(1),
    buildId: text("build_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityId, table.aliasNorm] }),
    index("kg_entity_aliases_norm_idx").on(table.aliasNorm),
    index("kg_entity_aliases_build_idx").on(table.buildId),
  ],
);

/**
 * Entity provenance that is not a text mention: a register row, a metadata CSV
 * row, or a manifest field. `source_key` identifies the row or artifact.
 */
export const kgEntitySources = pgTable(
  "kg_entity_sources",
  {
    entityId: text("entity_id")
      .notNull()
      .references(() => kgEntities.entityId, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceUrl: text("source_url"),
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
    buildId: text("build_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.entityId, table.sourceKind, table.sourceId, table.sourceKey],
    }),
    index("kg_entity_sources_entity_idx").on(table.entityId),
    index("kg_entity_sources_kind_idx").on(table.sourceKind),
    index("kg_entity_sources_build_idx").on(table.buildId),
  ],
);

/**
 * One resolved surface form in a cleaned chunk or title.
 *
 * Offsets are UTF-16 code units, the unit JavaScript produces. `text_hash` is
 * the SHA-256 of the exact text the offsets refer to (`chunk.content` or the
 * title), so a span can be validated after the build.
 */
export const kgMentions = pgTable(
  "kg_mentions",
  {
    mentionId: text("mention_id").primaryKey(),
    entityId: text("entity_id")
      .notNull()
      .references(() => kgEntities.entityId, { onDelete: "cascade" }),
    artifactId: text("artifact_id").notNull(),
    documentId: text("document_id").notNull(),
    chunkId: text("chunk_id"),
    sectionCode: text("section_code").notNull(),
    sectionHeading: text("section_heading"),
    surface: text("surface").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    /** chunk | title */
    sourceField: text("source_field").notNull(),
    textHash: text("text_hash").notNull(),
    /** gazetteer | regex | cue | bullet | lexicon */
    method: text("method").notNull(),
    confidence: real("confidence").notNull(),
    attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
    buildId: text("build_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("kg_mentions_entity_idx").on(table.entityId),
    index("kg_mentions_chunk_idx").on(table.chunkId),
    index("kg_mentions_artifact_idx").on(table.artifactId),
    index("kg_mentions_build_idx").on(table.buildId),
  ],
);

export const kgBuildRuns = pgTable("kg_build_runs", {
  runId: text("run_id").primaryKey(),
  /** corpus | database */
  mode: text("mode").notNull(),
  corpusHash: text("corpus_hash").notNull(),
  extractorVersion: text("extractor_version").notNull(),
  /** running | completed | failed */
  status: text("status").notNull(),
  counts: jsonb("counts").notNull().default(sql`'{}'::jsonb`),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const kgEntityMerges = pgTable(
  "kg_entity_merges",
  {
    mergeId: text("merge_id").primaryKey(),
    sourceEntityId: text("source_entity_id").notNull(),
    targetEntityId: text("target_entity_id").notNull(),
    rule: text("rule").notNull(),
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
    buildId: text("build_id").notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kg_entity_merges_build_idx").on(table.buildId)],
);

export type KgEntityRow = typeof kgEntities.$inferSelect;
export type KgEntityAliasRow = typeof kgEntityAliases.$inferSelect;
export type KgEntitySourceRow = typeof kgEntitySources.$inferSelect;
export type KgMentionRow = typeof kgMentions.$inferSelect;
export type KgBuildRunRow = typeof kgBuildRuns.$inferSelect;
