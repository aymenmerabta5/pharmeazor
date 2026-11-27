/**
 * Idempotent DDL for the owner-approved retrieval extension.
 *
 * GhostInit owns `packages/database/src/schema/index.ts`, so the retrieval
 * tables cannot be registered with drizzle-kit. This worker is the canonical
 * migration path: it is safe to run repeatedly and must be run before the
 * first ingest and after any change to `schema/retrieval.ts`.
 *
 *   bun run retrieval:ensure-schema
 */
import { pool } from "@repo/database";

const MARKER = "--retrieval-schema";

const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS retrieval_documents (
  artifact_id        text PRIMARY KEY,
  document_id        text NOT NULL,
  part_id            text,
  source_id          text NOT NULL,
  source_name        text NOT NULL,
  authority_level    smallint NOT NULL,
  authority_tier     text,
  jurisdiction       text,
  document_type      text NOT NULL,
  language           text NOT NULL,
  medicine_ids       text[] NOT NULL DEFAULT '{}',
  medicine_names     text[] NOT NULL DEFAULT '{}',
  inn                text,
  brand_name         text,
  strength_form      text,
  title              text NOT NULL,
  source_urls        text[] NOT NULL DEFAULT '{}',
  publication_date   timestamptz,
  collected_at       timestamptz,
  revision_date      timestamptz,
  content_sha256     text NOT NULL,
  content_markdown   text NOT NULL,
  metadata           jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retrieval_chunks (
  chunk_id               text PRIMARY KEY,
  artifact_id            text NOT NULL REFERENCES retrieval_documents(artifact_id) ON DELETE CASCADE,
  section_code           text NOT NULL,
  section_codes          text[] NOT NULL DEFAULT '{}',
  section_heading        text NOT NULL,
  section_path           text NOT NULL,
  ordinal                integer NOT NULL,
  content                text NOT NULL,
  contextualized_content text NOT NULL,
  content_hash           text NOT NULL,
  term_count             integer NOT NULL,
  token_estimate         integer NOT NULL,
  language               text NOT NULL,
  medicine_ids           text[] NOT NULL DEFAULT '{}',
  medicine_names         text[] NOT NULL DEFAULT '{}',
  source_id              text NOT NULL,
  source_name            text NOT NULL,
  authority_level        smallint NOT NULL,
  document_type          text NOT NULL,
  source_urls            text[] NOT NULL DEFAULT '{}',
  embedding_model        text NOT NULL,
  embedding_revision     text,
  embedding              halfvec(1024) NOT NULL,
  injection_risk         boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retrieval_chunk_terms (
  chunk_id  text NOT NULL REFERENCES retrieval_chunks(chunk_id) ON DELETE CASCADE,
  term      text NOT NULL,
  tf        integer NOT NULL,
  PRIMARY KEY (chunk_id, term)
);

CREATE TABLE IF NOT EXISTS retrieval_index_meta (
  embedding_model          text PRIMARY KEY,
  embedding_revision       text,
  chunk_count              integer NOT NULL,
  average_document_length  double precision NOT NULL,
  tokenizer_version        text NOT NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retrieval_chunks_embedding_hnsw
  ON retrieval_chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Existing databases were created before the embedding revision was recorded.
ALTER TABLE retrieval_chunks
  ADD COLUMN IF NOT EXISTS embedding_revision text;
ALTER TABLE retrieval_index_meta
  ADD COLUMN IF NOT EXISTS embedding_revision text;

-- Packed chunks cover several sections, so the section filter is an overlap
-- test over an array. The column is added separately for databases created
-- before it existed.
ALTER TABLE retrieval_chunks
  ADD COLUMN IF NOT EXISTS section_codes text[] NOT NULL DEFAULT '{}';
UPDATE retrieval_chunks SET section_codes = ARRAY[section_code] WHERE section_codes = '{}';

CREATE INDEX IF NOT EXISTS retrieval_chunks_medicine_ids_idx
  ON retrieval_chunks USING gin (medicine_ids);
CREATE INDEX IF NOT EXISTS retrieval_chunks_section_codes_idx
  ON retrieval_chunks USING gin (section_codes);
CREATE INDEX IF NOT EXISTS retrieval_chunks_artifact_idx
  ON retrieval_chunks (artifact_id);
CREATE INDEX IF NOT EXISTS retrieval_chunks_source_idx
  ON retrieval_chunks (source_id);
CREATE INDEX IF NOT EXISTS retrieval_chunks_section_idx
  ON retrieval_chunks (section_code);
CREATE INDEX IF NOT EXISTS retrieval_chunks_language_idx
  ON retrieval_chunks (language);
CREATE INDEX IF NOT EXISTS retrieval_chunk_terms_term_idx
  ON retrieval_chunk_terms (term);

CREATE TABLE IF NOT EXISTS retrieval_aliases (
  alias_norm    text PRIMARY KEY,
  alias_raw     text NOT NULL,
  dci_norms     text[] NOT NULL DEFAULT '{}',
  dci_labels    text[] NOT NULL DEFAULT '{}',
  medicine_ids  text[] NOT NULL DEFAULT '{}',
  ambiguous     boolean NOT NULL DEFAULT false,
  source_id     text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retrieval_aliases_ambiguous_idx
  ON retrieval_aliases (ambiguous);

-- retrieval_products shipped briefly with the registration number as the
-- primary key, which cannot represent one dossier carrying several brand
-- names. The table is a rebuildable projection of the two register CSVs, so a
-- shape change drops it instead of migrating derived rows in place.
DO $$
BEGIN
  IF to_regclass('public.retrieval_products') IS NOT NULL
     AND (
       NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'retrieval_products'
           AND column_name = 'product_key'
       )
       OR NOT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'retrieval_products'
           AND column_name = 'brand_norm'
       )
     ) THEN
    DROP TABLE retrieval_products;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS retrieval_products (
  product_key          text PRIMARY KEY,
  registration_number  text NOT NULL,
  registration_norm    text NOT NULL,
  brand                text NOT NULL,
  brand_norm           text NOT NULL,
  dci                  text,
  dci_norm             text,
  dci_code             text,
  form                 text,
  dosage               text,
  pack                 text,
  schedule             text,
  holder               text,
  holder_country       text,
  product_type         text,
  registration_status  text NOT NULL,
  withdrawal_date      text,
  withdrawal_reason    text,
  shelf_life           text,
  observation          text,
  is_combination       boolean NOT NULL DEFAULT false,
  in_scope             boolean NOT NULL DEFAULT false,
  medicine_ids         text[] NOT NULL DEFAULT '{}',
  sources              text[] NOT NULL DEFAULT '{}',
  source_sheet         text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retrieval_products_registration_norm_idx
  ON retrieval_products (registration_norm);
CREATE INDEX IF NOT EXISTS retrieval_products_brand_norm_idx
  ON retrieval_products (brand_norm);
CREATE INDEX IF NOT EXISTS retrieval_products_dci_norm_idx
  ON retrieval_products (dci_norm);
CREATE INDEX IF NOT EXISTS retrieval_products_status_idx
  ON retrieval_products (registration_status);

-- ---------------------------------------------------------------------------
-- Knowledge-graph entity sidecar. Not a retrieval arm.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kg_entities (
  entity_id        text PRIMARY KEY,
  entity_type      text NOT NULL,
  entity_key       text NOT NULL,
  canonical_label  text NOT NULL,
  normalized_label text NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  merged_into      text REFERENCES kg_entities(entity_id) ON DELETE SET NULL,
  confidence       real NOT NULL DEFAULT 1,
  attributes       jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_id         text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kg_entities_type_key_idx
  ON kg_entities (entity_type, entity_key);
CREATE INDEX IF NOT EXISTS kg_entities_type_idx
  ON kg_entities (entity_type);
CREATE INDEX IF NOT EXISTS kg_entities_normalized_idx
  ON kg_entities (normalized_label);
CREATE INDEX IF NOT EXISTS kg_entities_build_idx
  ON kg_entities (build_id);

CREATE TABLE IF NOT EXISTS kg_entity_aliases (
  entity_id   text NOT NULL REFERENCES kg_entities(entity_id) ON DELETE CASCADE,
  alias_norm  text NOT NULL,
  alias_raw   text NOT NULL,
  language    text,
  source_id   text NOT NULL,
  confidence  real NOT NULL DEFAULT 1,
  build_id    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, alias_norm)
);

CREATE INDEX IF NOT EXISTS kg_entity_aliases_norm_idx
  ON kg_entity_aliases (alias_norm);
CREATE INDEX IF NOT EXISTS kg_entity_aliases_build_idx
  ON kg_entity_aliases (build_id);

CREATE TABLE IF NOT EXISTS kg_entity_sources (
  entity_id   text NOT NULL REFERENCES kg_entities(entity_id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id   text NOT NULL,
  source_key  text NOT NULL,
  source_url  text,
  evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_id    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, source_kind, source_id, source_key)
);

CREATE INDEX IF NOT EXISTS kg_entity_sources_entity_idx
  ON kg_entity_sources (entity_id);
CREATE INDEX IF NOT EXISTS kg_entity_sources_kind_idx
  ON kg_entity_sources (source_kind);
CREATE INDEX IF NOT EXISTS kg_entity_sources_build_idx
  ON kg_entity_sources (build_id);

CREATE TABLE IF NOT EXISTS kg_mentions (
  mention_id      text PRIMARY KEY,
  entity_id       text NOT NULL REFERENCES kg_entities(entity_id) ON DELETE CASCADE,
  artifact_id     text NOT NULL,
  document_id     text NOT NULL,
  chunk_id        text,
  section_code    text NOT NULL,
  section_heading text,
  surface         text NOT NULL,
  char_start      integer NOT NULL,
  char_end        integer NOT NULL,
  source_field    text NOT NULL,
  text_hash       text NOT NULL,
  method          text NOT NULL,
  confidence      real NOT NULL,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_id        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kg_mentions_entity_idx
  ON kg_mentions (entity_id);
CREATE INDEX IF NOT EXISTS kg_mentions_chunk_idx
  ON kg_mentions (chunk_id);
CREATE INDEX IF NOT EXISTS kg_mentions_artifact_idx
  ON kg_mentions (artifact_id);
CREATE INDEX IF NOT EXISTS kg_mentions_build_idx
  ON kg_mentions (build_id);

CREATE TABLE IF NOT EXISTS kg_build_runs (
  run_id            text PRIMARY KEY,
  mode              text NOT NULL,
  corpus_hash       text NOT NULL,
  extractor_version text NOT NULL,
  status            text NOT NULL,
  counts            jsonb NOT NULL DEFAULT '{}'::jsonb,
  error             text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);

CREATE TABLE IF NOT EXISTS kg_entity_merges (
  merge_id          text PRIMARY KEY,
  source_entity_id  text NOT NULL,
  target_entity_id  text NOT NULL,
  rule              text NOT NULL,
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_id          text NOT NULL,
  merged_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kg_entity_merges_build_idx
  ON kg_entity_merges (build_id);
`;

async function main(): Promise<void> {
  if (!process.argv.includes(MARKER)) {
    throw new Error(`Run this worker through: bun run retrieval:ensure-schema (missing ${MARKER})`);
  }
  const startedAt = performance.now();
  await pool.query(DDL);
  console.log(
    JSON.stringify({
      ok: true,
      schema: "retrieval",
      elapsedMs: Math.round(performance.now() - startedAt),
    }),
  );
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
