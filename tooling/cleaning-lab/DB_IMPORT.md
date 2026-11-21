# Database import contract

The pipeline does **not** write to PostgreSQL. It produces import-ready artifacts; this document defines the shape the loader should use. It follows the retrieval layout in
`AGENTS.md` and keeps prices/stock out of the corpus.

## 1. Documents

Source of truth: `output/manifest.jsonl` plus the Markdown file at `output/<output_path>`. Parse the YAML front matter for metadata and store the Markdown body without the front matter as `content_markdown`.

```sql
CREATE TABLE retrieval_documents (
  artifact_id        text PRIMARY KEY,
  document_id        text NOT NULL,
  part_id            text NOT NULL,
  source_id          text NOT NULL,
  source_name        text NOT NULL,
  authority_level    smallint NOT NULL CHECK (authority_level BETWEEN 1 AND 4),
  authority_tier     text NOT NULL,
  jurisdiction       text,
  medicine_ids       text[] NOT NULL,
  medicine_names     text[] NOT NULL,
  inn                text,
  brand_name         text,
  strength_form      text,
  strengths          text[] NOT NULL DEFAULT '{}',
  title              text NOT NULL,
  document_type      text NOT NULL,
  language           text NOT NULL,
  country            text,
  holder             text,
  source_urls        text[] NOT NULL DEFAULT '{}',
  publication_date   date,
  collected_at       timestamptz,
  revision_date      date,
  sha256_raw         char(64),
  content_sha256     char(64) NOT NULL,
  char_count         integer NOT NULL,
  word_count         integer NOT NULL,
  sections           jsonb NOT NULL,
  key_sections_present text[] NOT NULL DEFAULT '{}',
  key_sections_missing text[] NOT NULL DEFAULT '{}',
  content_markdown   text NOT NULL,
  metadata           jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX retrieval_documents_medicine_ids_idx
  ON retrieval_documents USING gin (medicine_ids);
CREATE INDEX retrieval_documents_sections_idx
  ON retrieval_documents USING gin (sections jsonb_path_ops);
```

Upsert key: `artifact_id`. Re-embed only when `content_sha256` changes.

`medicine_ids` is an array because one combination-product label can serve
several medicine records. `sections` is the list of
`{code, heading, level, start_char, end_char, chars}` objects from the front
matter.

## 2. Structured references

### Official nomenclature

`output/structured/nomenclature_products.csv` (also `.jsonl`):

```sql
CREATE TABLE nomenclature_products (
  product_uid        text PRIMARY KEY,
  source_id          text NOT NULL DEFAULT 'SANTE_MSP',
  source_file        text NOT NULL,
  collected_at       timestamptz,
  authority_level    smallint NOT NULL DEFAULT 2,
  source_sheet       text NOT NULL,
  sheet_status       text NOT NULL,          -- registered | non_renewed | withdrawn
  medicine_ids       text[] NOT NULL DEFAULT '{}',
  in_scope           boolean NOT NULL,
  is_combination     boolean NOT NULL,
  registration_number text,
  dci_code           text,
  dci                text,
  brand              text,
  form               text,
  dosage             text,
  pack               text,
  schedule           text,
  holder             text,
  holder_country     text,
  registered_initial date,
  registered_final   date,
  product_type       text,
  status             text,
  shelf_life         text,
  withdrawal_date    date,
  withdrawal_reason  text
);
```

Use `in_scope` to filter the 40 project medicines; keep the other rows if you
want the full register. `is_combination` prevents a fixed-dose combination from
being presented as a monotherapy equivalent.

### BDPM registers

`output/structured/bdpm_cis.csv`:

```sql
CREATE TABLE bdpm_cis (
  cis                text NOT NULL,
  name               text NOT NULL,
  form               text,
  route              text,
  status             text,
  procedure          text,
  marketing_status   text,
  marketing_date     date,
  holder             text,
  generic            text,
  medicine_ids       text[] NOT NULL DEFAULT '{}',
  authority_level    smallint NOT NULL DEFAULT 3,
  source_file        text NOT NULL,
  row_number         integer NOT NULL
);
```

`output/structured/bdpm_composition.csv` has one row per substance:

```sql
CREATE TABLE bdpm_composition (
  cis                text NOT NULL,
  form               text,
  substance_code     text,
  designation        text NOT NULL,
  dosage             text,
  reference          text,
  nature             text,
  number             text,
  medicine_ids       text[] NOT NULL DEFAULT '{}',
  authority_level    smallint NOT NULL DEFAULT 3,
  source_file        text NOT NULL,
  row_number         integer NOT NULL
);
```

These tables are **reference data**. Do not embed them as prose; they are for
name resolution, equivalent-product lookup and cross-source reconciliation.

## 3. Chunks (built later)

`output/preview/chunks_sample.jsonl` is a review sample only. The final chunk
table should be built by the retrieval pipeline, not imported from here:

```sql
CREATE TABLE retrieval_chunks (
  chunk_id           text PRIMARY KEY,       -- artifact_id + section path + ordinal + content hash
  artifact_id        text NOT NULL REFERENCES retrieval_documents(artifact_id),
  medicine_ids       text[] NOT NULL,
  source_id          text NOT NULL,
  authority_level    smallint NOT NULL,
  section_code       text NOT NULL,
  section_heading    text,
  ordinal            integer NOT NULL,
  content            text NOT NULL,
  contextualized_content text NOT NULL,      -- 50-100 token context note + content
  content_hash       char(64) NOT NULL,
  token_count        integer NOT NULL,
  embedding_model    text NOT NULL,          -- e.g. BAAI/bge-m3
  embedding          vector(1024),           -- BGE-M3 dense output
  tsv                tsvector,               -- lexical arm
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX retrieval_chunks_embedding_idx
  ON retrieval_chunks USING hnsw (embedding halfvec_cosine_ops);
CREATE INDEX retrieval_chunks_tsv_idx
  ON retrieval_chunks USING gin (tsv);
```

The current database already has pgvector; enable the HNSW/`halfvec` indexes
when the chunk table is created, not before.

## 4. Import rules

1. **Never import a duplicate.** `manifest.jsonl` contains duplicate rows with
   `status: "duplicate"` and `output_path: null`; skip them. Their canonical
   `duplicate_of` is in `reports/duplicates.csv`.
2. **Never import the front matter into `content_markdown`.** Split on the
   second `---` line. The YAML is metadata.
3. **Use `artifact_id` as the idempotency key.** `content_sha256` tells the
   embedding worker whether the document changed.
4. **Resolve the retrieval principal server-side.** `medicine_ids` and
   `authority_level` are metadata; never accept them from a request or from
   model output.
5. **Keep the raw trail.** `original_files`, `source_urls`, `sha256_raw` and
   `source_document_ids` are the provenance the project brief requires.
6. **Do not copy prices or stock.** They were removed from the clean body; do
   not re-introduce them from the raw HTML.
7. **Do not treat nomenclature as clinical advice.** The nomenclature document
   lists registered products; it does not contain indications or posology.
