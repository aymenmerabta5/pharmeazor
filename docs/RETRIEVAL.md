# Retrieval (RAG) strategy

Status: **implemented** — dense + BM25 + RRF + optional cross-encoder reranker,
with the evaluation baseline still to be established. This document is the design
contract for retrieval in pharmeazor. It exists so that the first implementation follows a measured,
maintained strategy instead of a re-invented one.

Retrieval is not a GhostInit capability in this configuration. It is an
owner-approved extension assembled from the packages already in this
repository.

## Summary

The strategy is a four-stage retrieval pipeline with an adaptive agent on top:

```text
extract → chunk → contextualize → embed + index → hybrid retrieve → rerank → compose → cite
```

1. **Contextualize at ingest.** Prepend a short model-written note that situates
   each chunk inside its source document, and index the contextualized text in
   both the dense and the lexical arm.
2. **Retrieve hybrid.** Dense vectors (pgvector) and lexical terms (a BM25
   postings index) in parallel, fused with Reciprocal Rank Fusion.
3. **Rerank.** A cross-encoder reorders the fused candidates down to the
   handful that actually reach the model.
4. **Answer adaptively.** The agent decides whether to retrieve at all, cites
   chunk identifiers, and abstains when the evidence is insufficient.

Storage stays in the PostgreSQL the application already runs. There is no
second datastore.

## Why this shape

The evidence below is from public 2026 benchmarks and vendor research. None of
it is a measurement of this repository; the numbers are priors, and our golden
set (§ Evaluation) is what decides.

### Reranking is the single largest quality lift

`OpenRouter` reranking benchmark, 274 questions, run 2026-10-08, with
`voyageai/voyage-4-lite` as the first stage:

| Stage                              | Precision@1 |
| ---------------------------------- | ----------- |
| Embeddings only                    | 81.0%       |
| + `voyageai/rerank-3-lite`, top 30 | 97.1%       |
| + `voyageai/rerank-3`, top 30      | 97.8%       |

Candidate depth mattered more than the choice of reranker: raising the first
stage from 10 to 30 candidates moved precision@1 from 94.5% to 96.7%; 30 to 50
reached 97.1%; 50 to 100 added nothing. The same run found that omitting
`input_type` on the embedding call cost 7 to 12 precision@1 points.

`From BM25 to Corrective RAG` (arXiv 2604.01733, April 2026) reports the same
ordering on T2-RAGBench, 23,088 queries over 7,318 financial documents:

| Method                       | Recall@5 | MRR@3 |
| ---------------------------- | -------- | ----- |
| Dense only                   | 0.587    | 0.351 |
| BM25 only                    | 0.644    | 0.411 |
| Hybrid (RRF)                 | 0.695    | 0.433 |
| Hybrid (RRF) + cross-encoder | 0.816    | 0.605 |

Fusion added 5.1 points over BM25 alone; reranking added 12.1 points on top of
fusion. Both matter, and reranking matters more.

### Contextual retrieval is the largest ingest-time win

Anthropic's Contextual Retrieval prepends a 50-100 token, model-written note
that situates a chunk inside its document, before both the embedding and the
BM25 index. Their reported top-20 retrieval failure rate:

| Setup                                   | Failure rate |
| --------------------------------------- | ------------ |
| Embeddings + BM25                       | 5.7%         |
| Contextual embeddings                   | 3.7%         |
| Contextual embeddings + contextual BM25 | 2.9%         |
| … plus reranking                        | 1.9%         |

The cost is paid once at ingest, not per query. Because every chunk of a
document is contextualized against the same document, prompt caching makes it
affordable.

### Hybrid beats dense on identifier-heavy corpora

Dense retrieval finds "clear blue skies" for "sunny weather". Lexical
retrieval finds the exact string. A pharmacy corpus is dense with identifiers:
drug codes, SKU, lot and batch numbers, dosage strings, molecule names. The
lexical arm is not a fallback for a weak embedder; it is the only arm that
resolves those queries.

Reciprocal Rank Fusion combines rank positions rather than raw scores, so the
two arms do not need comparable score scales:

```text
RRF(d) = Σ 1 / (k + rank_i(d))        k = 60
```

### The generator's reasoning was the biggest lever overall

On 200 multi-hop questions (`Agentic RAG, Graph-R1, MetaRAG and Friends`),
enabling medium reasoning effort moved naive RAG from 56% to 78% and agentic
loops from about 65% to 85%. The same benchmark put hybrid search plus a
cross-encoder at 71.2% for $1.26 per 1,000 questions — the cheapest strong
system — while LightRAG matched it at roughly 14x the per-query cost plus a
~$20 graph build. Graph RAG bought nothing here for 14x the money.

### Retrieval is not always the answer

Between 20% and 40% of typical product-support queries are answerable from the
model's own knowledge. Running retrieval on them adds latency, cost, and noise.
The agent should be able to skip retrieval, and it should be able to refuse
rather than guess.

If the whole corpus fits under roughly 200,000 tokens, compare against simply
putting it in the prompt with caching before building an index at all.

### What the evidence does not support

- Graph RAG / LightRAG: same accuracy as a plain hybrid pipeline, ~14x cost.
- Multi-agent retrieval loops: cost and latency multiply faster than accuracy.
  A single agent with a retrieval tool and a search budget is enough.
- A dedicated vector database. For a team already on PostgreSQL, `pgvector` is
  the default answer; a second system must earn its place against a measured
  limit (index build time, filtered recall, memory pressure), not an assumed one.

## Storage

PostgreSQL holds vectors, lexical terms, provenance, and the business rows in
one transactional store.

- `pgvector` for dense vectors. HNSW index, `halfvec` to halve storage,
  iterative scans (pgvector 0.8+) when a filter is applied after the index scan.
- A real BM25 postings index for the lexical arm: one row per `(chunk, term)`
  in `retrieval_chunk_terms`, document length on the chunk, corpus statistics in
  `retrieval_index_meta`, and the BM25 score computed in SQL. A `tsvector` GIN
  index is a fine candidate filter, but `ts_rank` is not BM25: it discards
  term frequency saturation and document-length normalization, which is exactly
  what makes drug codes and dosage strings rank correctly.
- One query with two subqueries and a RRF fusion expression. Roughly thirty
  lines we own and can test.
- If lexical quality becomes the bottleneck, the escalation path is the
  `pg_search` extension inside Postgres first, a dedicated engine second.

Practical ceiling: comfortable through a few million chunks at normal SaaS
query rates. Watch for HNSW build times measured in hours, filtered recall
collapsing at high tenant cardinality, and a lexical arm that matches tens of
thousands of rows per query (a query-parsing problem, not a corpus-size
problem).

### Database image

The development and self-hosted database is PostgreSQL 18.7 with pgvector
0.8.7, built from `docker/postgres/Dockerfile`. Both versions are pinned: the
base is the official `postgres:18.7-trixie` image, and the extension comes
from the signed PGDG apt repository that image already trusts.

```bash
docker compose --env-file .env.local up -d      # builds the image on first run
```

Two paths register the extension in a database:

- **Fresh database.** The entrypoint runs `docker/postgres/init/*.sql` on
  first initialization of an empty PGDATA, which creates the extension.
- **Existing database.** Run `bun run db:ensure-extensions`. It is idempotent
  and safe to run before `db:push` or `db:migrate`.

Going from PostgreSQL 18.6 to 18.7 is a patch bump inside major 18. It needs
no `pg_upgrade`, and an existing data directory opens on the new image
unchanged.

`docker-compose.yml` and `start-database.sh` are generator-owned, so a
`ghostinit sync` may rewrite the compose file. It is the only compose file in
the repository: the pgvector service, Redis, and the Upstash-compatible REST
proxy all live in it, with the two third-party images pinned by digest. Restore
it from version control after a regeneration rather than splitting it again.

## Model choices

Chosen for a multilingual EN/FR/AR clinical corpus. Benchmark rankings move
monthly; the golden set decides, not the leaderboard.

| Role                        | Default                                             | Why                                                                                                       |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Embedding                   | `BAAI/bge-m3` (MIT, 1024 dims, 8,192-token context) | Dense and sparse from one encoder, 100+ languages, fits on one GPU. Matryoshka-trimmable.                 |
| Embedding (quality ceiling) | `Qwen3-Embedding-4B`/`8B`                           | ~11 points better multilingual MTEB than bge-m3; needs GPU headroom.                                      |
| Reranking (self-hosted)     | `BAAI/bge-reranker-v2-m3` (MIT, 0.6B)               | The 2026 default: best quality/latency/licence balance, CPU-viable, multilingual.                         |
| Reranking (quality ceiling) | `Qwen3-Reranker-4B`                                 | Leads on multilingual and professional-domain retrieval.                                                  |
| Reranking (hosted)          | Cohere Rerank 5 / Voyage `rerank-3`                 | No ops. Voyage `rerank-3-lite` was the cheapest accurate option at ~$0.10 per 1,000 queries.              |
| Generation                  | Groq `openai/gpt-oss-120b` (current)                | Already the Eve model. Enable reasoning effort; that was the single biggest lever in the 2026 benchmarks. |

Serving notes: use Text Embeddings Inference or vLLM for self-hosted models.
Set the embedding `input_type` (query vs document) — omitting it cost 7 to 12
precision@1 points in the OpenRouter run. Keep the dimension stable; changing
it invalidates every vector.

## Authority precedence

`authority_level` is source metadata, not chunk content. It is stored in
`retrieval_documents` / `retrieval_chunks`, copied into every retrieval
response, and **never** prepended to the embedded text: a constant header per
source would bias every vector toward that source and would force a full
re-embed whenever the policy changes.

Lower wins:

| Level | Source                         | Meaning                                         |
| ----- | ------------------------------ | ----------------------------------------------- |
| 1     | ANPP, Ministry of Health       | Official Algerian SmPC/leaflet and nomenclature |
| 2     | Pharm'Net catalogue            | Algerian nomenclature register (names, status)  |
| 3     | BDPM, DailyMed, EMA            | Foreign institutional reference                 |
| 4     | Other professional / secondary | Never overrides an official source              |

Every returned chunk carries `authority: { level, tier, label, official,
description }`, and the citation label includes `(autorité N/4)`. When two
returned chunks cover the same medicine and section at different levels, the
service also returns an `authorityOverlaps` entry naming the `preferredChunkId`.
The model must follow the lower number, cite the source it followed, and state
the discrepancy. Ranking still follows relevance; authority resolves conflicts,
it does not replace retrieval scores.

An overlap also carries a `claimScope`. Clinical sources (`ANPP`, `BDPM`,
`DailyMed`, `EMA`) make clinical claims; register sources (`SANTE_MSP`,
`PHARMNET_CATALOG`) state names, strengths and registration status. The two are
never compared: a register row cannot contradict a leaflet on an indication or a
dose, and treating them as rivals produced false conflicts. Register-vs-register
overlaps are reported so the model can reconcile names and statuses, but they
skip the numeric heuristic entirely, because a register chunk is a list of
products and its numbers are not one claim.

For clinical overlaps the service extracts canonical `value unit` tokens
(`500 mg`, `2 fois`) from both passages and reports `numericDivergence` — the
values that appear on one side and not the other, restricted to units both sides
use. `numbersCompared: false` means no comparison was possible. This is
deterministic evidence, not a verdict: the model still reads both passages and
applies the precedence rule.

The per-source assignment is owned by
`tooling/retrieval-lab/data/metadata/sources.csv`. Changing a level updates the
manifest and the next ingest; it does not require re-embedding.

## Security

This is a clinical-adjacent domain and retrieval is the largest new injection
surface. Controls, in the order they must be implemented:

1. **Authorization at query time.** The principal is resolved server-side from
   the authenticated session, never from request parameters and never from
   model output. Filters apply inside both retrieval arms, before ranking.
   Retrieving unauthorized content and asking the model to ignore it is not
   access control.
2. **Sanitize and attest at ingest.** Strip hidden text, invisible Unicode, and
   zero-width characters. Attach provenance to every chunk: source URI, content
   hash, ingesting principal, timestamp, classification, and the source ACL.
   Generate embeddings server-side; never accept client-supplied vectors.
3. **Scan at retrieval time.** A second injection scan covers documents indexed
   before a classifier update. Scan in code, on the chunk, before it enters the
   prompt.
4. **Mark retrieved text as data.** Delimit retrieved content explicitly and
   instruct the model to treat it as untrusted data, not instructions.
5. **Validate citations.** The answer must cite chunk identifiers present in the
   candidate set, checked in code. A cited chunk that was never retrieved is a
   hard failure.
6. **Least privilege on tools.** Retrieval tools are read-only. Anything that
   writes, sends, or spends needs a human approval gate.
7. **Audit trail.** Log every retrieved chunk, its score, its provenance, and
   whether the quoted line came from the original text or the contextual note.

OWASP's RAG Security Cheat Sheet and the ClinicalShield work on indirect
prompt injection in clinical decision support are the relevant references.

## Evaluation

Retrieval quality is not observable from answers alone. Measure the stages
separately or a failure cannot be diagnosed.

### Golden set

- 50 to 200 real questions, each labelled with the chunk identifiers that
  answer it. Version it in the repository; label changes show up in the pull
  request diff.
- Harvest from real traffic where possible. Synthetic questions written
  backwards from a chunk are trivially retrievable and inherit the retriever's
  blind spots.
- Include the failure shapes: identifier lookups, multi-hop questions,
  near-duplicate sources where the wrong one is plausible, and questions the
  corpus cannot answer, where the correct behaviour is abstention.
- Include cross-tenant and unauthorized-access questions.

### Metrics

Retrieval (no LLM in the loop, fast and deterministic):

- `recall@k` — of the labelled chunks, the fraction present in the top k. The
  gate metric: evidence that never arrives is unusable by any prompt.
- `precision@k` — of the top k, the fraction that are relevant.
- `MRR` — reciprocal rank of the first correct result.
- `nDCG@k` — rank-aware, supports graded relevance.

Generation (judge-based, scheduled):

- Faithfulness — is the answer supported by the retrieved context?
- Answer correctness — does it match the reference?
- Citation correctness — do the cited sources support the claim?
- Citation completeness — does every factual claim carry a citation?

### Gates

- **Pull request:** retrieval metrics only, on a 50-question subset, no
  generation. Fails the build on a credible regression.
- **Nightly:** full golden set with the judge, tracked as trends.
- **Release:** the full set including the unanswerable and adversarial strata.

Thresholds come from a measured baseline committed next to the golden set, and
the gate is on the delta. Run the unchanged pipeline three times to learn the
run-to-run spread before setting a tolerance. Absolute targets picked in
advance either always pass or always fail.

### Production signals

No labels required, and they catch drift that a static golden set cannot:

- Distribution of top-1 and top-k similarity scores. A falling mean or a
  rising share of queries below a similarity floor means the query mix is
  drifting away from the index.
- Empty and low-confidence retrieval rate, and the generator's refusal rate.
- Query-embedding drift against a reference window.
- Every user-reported wrong answer becomes a new golden case.

## Rollout order

Each step is measurable on its own. Do not combine steps.

1. **Index.** `pgvector` + BM25 postings schema, structure-aware chunking, stable
   chunk IDs and content hashes, incremental re-embedding.
2. **Baseline retrieval.** Dense + lexical + RRF, no reranker. Build the golden
   set and record the baseline metrics. This is the reference for everything
   that follows.
3. **Reranker.** Largest single lift. Re-run the golden set; expect recall@5
   to move by double digits.
4. **Contextual retrieval.** Regenerate the index with contextualized text.
   Requires a full re-embed; measure before and after.
5. **Agentic retrieval.** Add the retrieval tool to the Eve agent with a search
   budget, one reformulation round, and a stop condition.
6. **Citations and abstention.** Enforce in code, not in the prompt.
7. **Judge-based generation metrics and production monitoring.**

Stop when the golden set stops moving. If recall@20 is below 90%, no model
upgrade will fix the system: the context is simply not coming back.

## Layout

Mirror the `storage` capability rather than inventing a new shape.

| Concern                                             | Location                                          |
| --------------------------------------------------- | ------------------------------------------------- |
| Offline raw-source cleaning (maintainer batch tool) | `tooling/cleaning-lab/`                           |
| Chunking and retrieval text models                  | `packages/modules/src/retrieval/`                 |
| Retrieval ports, authorization filters, policies    | `packages/services/src/retrieval/`                |
| Retrieval tables, vector and lexical columns        | `packages/database/src/schema/retrieval.ts`       |
| oRPC contract and procedures                        | `packages/api/src/retrieval/`                     |
| Postgres hybrid retrieval adapter                   | `packages/api/src/adapters/retrieval/postgres.ts` |
| Embedding and reranking provider adapters           | `packages/api/src/adapters/retrieval/`            |
| Composition root                                    | `packages/api/src/composition/retrieval.ts`       |
| Agent retrieval tool                                | `apps/harness/agent/tools/`                       |

`tooling/cleaning-lab/` prepares the corpus offline: it turns the raw collection into
clean Markdown plus an import manifest and stops there. It is not a runtime
path, so it never parses a document in a request. The chunk table, the chunk
identifiers and the contextualization notes are owned by
`packages/modules/src/retrieval/`; the Python splitter inside the corpus tool is
a preview that proves the documents split cleanly, not the production chunker.

Provider SDKs stay in the adapters. Domain code depends on ports, never on an
SDK, a vector client, or an embedding API.

## Implemented pipeline

The current slice owns stages 1 to 3 and exposes them to the agent. The
50-question golden set and its deterministic retrieval gate live in
`packages/benchmark`; model-written contextualization is still generated outside
this repository.

A separate, additive `graph-evidence-v1` profile lives in
`packages/modules/src/retrieval/graph-chunk.ts` and is documented in
[GRAPH_CHUNKING_PROFILE.md](./GRAPH_CHUNKING_PROFILE.md). It prepares exact
source-mapped evidence units for the proposed graph schema. The offline
`retrieval:graph:export` worker writes versioned evidence files with source and
output checksums. The additive `retrieval:entities:export` worker then writes
candidate-only entity mentions and structured observations with exact spans and
provenance. The downstream `retrieval:relationships:export` worker writes
candidate-only relationships whose endpoints reference those mentions or
observations and whose support is either an exact text span or an explicit
structured row. The parallel `retrieval:links:export` worker groups candidate
mentions and observations into confident, ambiguous, and unresolved candidate
clusters without creating canonical entities. The approval-gated
`retrieval:graph:import` worker validates those artifacts and can build or apply
an ontology-mapped Neo4j plan. Its default validation mode is read-only; `--plan`
and `--apply` require a recorded approval artifact matching exact checksums.
None of these commands feeds the hybrid index, alters chunk IDs, resolves
entities, publishes unapproved relationships, or implements graph retrieval. The
temporary mention, relationship, and link taxonomies require Person 1 review
before canonical use.

```text
offline:  manifest.jsonl -> structure-aware chunker -> contextual note
          -> BGE-M3 embed -> pgvector halfvec(1024) + BM25 postings
online:   query -> BGE-M3 embed ─┬─> dense search (cosine, HNSW)
                                 └─> BM25 search (postings, k1=1.2, b=0.75)
          -> reciprocal rank fusion (k=60) -> cross-encoder rerank -> top-k
          -> injection scan -> citation-labelled passages
```

| Concern                       | Implementation                                                            |
| ----------------------------- | ------------------------------------------------------------------------- |
| Chunking, section codes       | `packages/modules/src/retrieval/chunk.ts`                                 |
| BM25 tokenizer and fusion     | `packages/services/src/retrieval/{tokenize,fusion}.ts`                    |
| Retrieval policy and use case | `packages/services/src/retrieval/{policy,retrieval.service}.ts`           |
| Tables                        | `packages/database/src/schema/retrieval.ts`                               |
| Idempotent DDL                | `packages/database/src/workers/database/ensure-retrieval.ts`              |
| Postgres hybrid adapter       | `packages/api/src/adapters/retrieval/postgres.ts`                         |
| Embedding and reranker HTTP   | `packages/api/src/adapters/retrieval/{embedding,reranker}.ts`             |
| Composition root              | `packages/api/src/composition/retrieval.ts`                               |
| Signed internal transport     | `packages/api/src/retrieval/http.ts` + `/api/retrieval/search`            |
| Offline indexer               | `packages/api/src/workers/retrieval/ingest.ts`                            |
| Provenance backfill           | `packages/api/src/workers/retrieval/backfill-provenance.ts`               |
| Brand expansion               | `packages/services/src/retrieval/expand.ts`                               |
| Alias import                  | `packages/api/src/workers/retrieval/import-aliases.ts`                    |
| Registry import               | `packages/api/src/workers/retrieval/import-registry.ts`                   |
| Registry adapter              | `packages/api/src/adapters/retrieval/registry.ts`                         |
| Registry transport            | `packages/api/src/retrieval/registry-http.ts` + `/api/retrieval/registry` |
| Registry agent tool           | `apps/harness/agent/tools/lookup_algerian_registry.ts`                    |
| Wire contract                 | `packages/contracts/src/retrieval.ts`                                     |
| Agent tool                    | `apps/harness/agent/tools/search_medical_corpus.ts`                       |

`ghostinit sync` owns `packages/database/src/schema/index.ts` and
`packages/modules/src/index.ts`, so the retrieval module and schema are
registered by the generator, not by hand.

The generated oRPC router cannot take a new procedure without drift. The agent
therefore reaches retrieval through a signed server-to-server route. The harness
resolves the principal from its own session, signs the envelope with
`EVE_INTERNAL_AUTH_SECRET`, and the route trusts only that signature. The
principal is never read from model output or a public request body.

### Commands

```bash
bun run retrieval:ensure-schema   # create tables, GIN/HNSW indexes, extension
bun run retrieval:ingest:dry      # chunk and report; no database, no embedding server
bun run retrieval:ingest:vectors:dry # validate the precomputed BGE-M3 artifact against the chunker
bun run retrieval:ingest:vectors  # load vectors.npy + chunks.jsonl; no embedding server
bun run retrieval:ingest:artifact:dry # dry-run using the artifact as the corpus snapshot
bun run retrieval:ingest:artifact # index the artifact snapshot, including chunks absent from the local manifest
bun run retrieval:fetch:vectors   # pull embedding-output from R2 and validate it
bun run retrieval:fetch:vectors:check # validate the local artifact only
bun run retrieval:import:r2       # pull, validate, schema, import, postflight
bun run retrieval:import:r2:dry   # pull, validate, chunk dry run; no database write
bun run retrieval:ingest          # embed changed chunks through RETRIEVAL_EMBEDDING_URL
bun run retrieval:ingest --force  # re-embed every selected chunk
bun run retrieval:ingest --prune  # delete documents absent from the manifest
bun run retrieval:backfill-provenance          # metadata-only: dates, status, review flag
bun run retrieval:backfill-provenance -- --dry-run
bun run retrieval:import-aliases               # brand -> substance expansion table
bun run retrieval:import-aliases -- --dry-run
bun run retrieval:import-registry              # merge the two register catalogues
bun run retrieval:import-registry -- --dry-run
bun run retrieval:graph:export -- --dry-run     # validate graph evidence chunks; write nothing
bun run retrieval:graph:export                  # write versioned graph evidence files
bun run retrieval:entities:export -- --dry-run        # validate candidate entity extraction; write nothing
bun run retrieval:entities:export                     # write candidate-only mention artifacts
bun run retrieval:relationships:export -- --dry-run   # validate candidate relationships; write nothing
bun run retrieval:relationships:export                # write candidate-only relationship artifacts
bun run retrieval:links:export -- --dry-run           # validate candidate entity links; write nothing
bun run retrieval:links:export                        # write candidate-only link artifacts
bun run retrieval:graph:import -- --validate-only     # validate graph inputs; no Neo4j connection
bun run retrieval:graph:import -- --plan --approval <approval.json>
bun run retrieval:graph:import -- --apply --approval <approval.json>
```

`retrieval:ingest:vectors` reads the embedding lab's `manifest.json`,
`chunks.jsonl` and `vectors.npy`. It re-chunks the corpus with the production
chunker, joins every chunk by `chunk_id`, and requires the artifact's
`text_sha256` to equal the chunker's `contentHash`. A changed chunk, a missing
vector or a checksum mismatch stops the import instead of indexing stale text.
The artifact manifest pins the BGE-M3 revision and the SHA-256 of both files;
the revision is stored on every chunk so two revisions cannot be mixed
silently. This path needs no embedding server. The HTTP path is still required
for query embedding at runtime.

`retrieval:ingest:artifact` uses the artifact as the corpus snapshot instead of
re-chunking the local cleaning output. It is for the benchmark index when the
cleaning corpus has drifted from the artifact: chunk ids, section codes and
content hashes come from `chunks.jsonl`, and manifest metadata is joined where
the artifact id still exists. Documents without a manifest row are indexed with
`partial_provenance: true` in their metadata; the dry run reports their count.
This mode is not for rebuilding the production index from current sources.

`retrieval:import:r2` is the end-to-end path. It pulls the `embedding-output`
dataset from R2 through the shared storage module, validates the artifact with
the lab's own `pipeline/validate.py` (manifest checksums, row alignment, chunk
ids, text hashes, model revision and dimensions), runs the production chunker
as a dry run, applies `retrieval:ensure-schema`, delegates the write to
`ingest.ts --vectors`, and reads the database back. It fails before writing if
the remote tree has no `embeddings/manifest.json` marker, if the artifact
predates the current corpus, or if the database would mix models or revisions.
The write itself is idempotent: an unchanged artifact reports
`embeddedChunks=0` and `reusedChunks` equal to the chunk count on the second
run.

Use `--artifact <dir>` or `--no-pull` to import an offline directory without
touching R2; both still validate. `--dry-run` stops after the chunker dry run
and never creates the schema. `--force` re-embeds and retokenizes every
selected chunk, and `--prune` deletes documents absent from the manifest.
Set `POSTGRES_DB` to import into a scratch database without changing the
default one.

The indexer is incremental: a chunk is re-embedded only when its content hash,
embedding model or embedding revision changed, and its postings are rebuilt
only when the chunk or the tokenizer version changed. Documents that disappear
from the manifest are deleted only under `--prune`, on an unfiltered run.

### Dates and extraction quality

Every returned passage carries four timestamps. They answer different
questions and are never merged:

| Field             | Source                                                    | Populated | Meaning                                              |
| ----------------- | --------------------------------------------------------- | --------- | ---------------------------------------------------- |
| `publicationDate` | manifest `publication_date`                               | 498/528   | when the regulator issued or last revised the source |
| `collectedAt`     | manifest `collected_at`                                   | 528/528   | when this system fetched it                          |
| `extractedAt`     | extraction report `extracted_at`, else cleaning timestamp | 528/528   | when this system parsed and normalised it            |
| `indexedAt`       | `retrieval_chunks.created_at`                             | 528/528   | when the chunk entered the vector index              |

`publicationDate` is the currency of the clinical claim. A label published in
2013 and extracted in 2026 is old evidence; reporting the extraction date in
its place would tell the reader the opposite of the truth. The wire contract
therefore renders a single `citationStamp` server-side:

```text
ANPP SmPC · published 2021-11-29 · extracted 2026-11-21
```

The agent copies that stamp verbatim and never formats a date itself. When the
source never stated a publication date the stamp says `published unknown`, and
the extraction date is not substituted. A stamp gains `· partial extraction`
when the extraction report recorded `PARTIAL`, and `· review required` when the
document was flagged for human review.

Extraction status and the review flag live in
`retrieval_documents.metadata` (`extraction_status`, `review_required`,
`extracted_at`). The ingest worker writes them from the extraction report on
every run; the corpus data is not committed, so a checkout without that report
indexes documents with no status rather than inventing one. For an index built
before this metadata existed, `retrieval:backfill-provenance` updates the rows
in place: it touches only `metadata`, never `content_hash`, `embedding`, or the
HNSW index, and it is idempotent.

### Brand expansion

The corpus is written with substance names while Algerian users ask with
brands. Measured: 775 of the 2,144 known brands (36.1%) never occur in the
indexed text, so neither arm can reach them. `retrieval_aliases` maps a folded
brand to the substance labels its products use, imported from the lab's
`name_map.csv` with `retrieval:import-aliases`.

Expansion appends at most four substance tokens to the lexical query; it never
replaces the brand, because the brand is the term that identifies the product.
The same expanded string is used for reranking, which matters: a cross-encoder
has never seen `COZAAR` either, and measured against the local index the
unexpanded query put an unrelated paracetamol/codeine chunk above losartan.
With the substance in the rerank query, `COZAAR indications` returns three
losartan chunks at 0.88-0.95.

Brands that cover more than one substance are **not** expanded. 304 of 2,113
folded brands are ambiguous (`COPARAMOL` is paracetamol alone and paracetamol
with codeine); they are returned in `diagnostics.ambiguousAliases` so the agent
asks which product the user means instead of silently dosing a combination
product as a single agent.

### Registry lookup

Registration status, dispensing schedule, holder, pack, generic/reference and
withdrawal are rows, not passages. `retrieval_products` merges the Ministry
nomenclature (9,595 rows) with Pharm'Net (9,560); 9,448 registration numbers
appear in both. Nomenclature wins every field it carries, Pharm'Net fills
`observation` and `shelf_life_months`, and the importer reports every
disagreement instead of resolving it silently.

A registration number alone is not a product identity: one dossier can carry
several brand names (`LYANA` and `YASMINE` share `285/11 H 078/21`). The table
therefore keys on registration number + folded brand + folded dosage and
collapses pack variants. Keying on the registration number dropped five brands
and fifty rows. Lookups fold accents on both sides: the register mixes
`PARACÉTAMOL` and `PARACETAMOL`, and a pharmacist may type either.

The agent reaches it through `lookup_algerian_registry`, which signs the same
envelope as retrieval and calls `/api/retrieval/registry`. The route needs no
embedding server, so a register question still answers while the models are
down. Every response carries a server-rendered disclaimer: a register row is
never an indication, a dose, or a recommendation. A `withdrawn` or
`non_renewed` status is a safety fact, not noise, and is returned by default.
`total` reports how many rows match before the page limit, so "how many
paracetamol products are registered" is answerable without paging.

### Serving the models

Query embedding and reranking need an HTTP endpoint, not a particular server.
The adapters speak TEI's `/embed` and `/rerank` shapes, so the reference server
is Text Embeddings Inference, pinned by digest in `docker-compose.yml`:

```bash
docker compose --env-file .env.local --profile retrieval up -d
```

Both services sit behind the `retrieval` profile, so a checkout without a GPU
still runs `docker compose up` unchanged. The image is pinned by digest because
a TEI minor release can change tokenization or kernels; the weights are mounted
read-only from a local snapshot because the corpus records the revision that
produced its vectors, and serving a different one would put queries and
documents in different embedding spaces.

| Service                | Model                     | Port |
| ---------------------- | ------------------------- | ---- |
| `retrieval-embeddings` | `BAAI/bge-m3`             | 8081 |
| `retrieval-reranker`   | `BAAI/bge-reranker-v2-m3` | 8082 |

Measured on an RTX 3060: TEI's vectors match the ones already indexed at cosine
0.9996 minimum / 0.9998 mean (TEI approximates GeLU with tanh), and the
reranker separates a matching indication from an unrelated one at 0.99 vs 0.09.

The reranker adapter splits requests into `RETRIEVAL_RERANKER_BATCH_SIZE`
documents because TEI rejects a `texts` array larger than its
`max_client_batch_size` (32 by default). Scores are comparable across batches,
so the adapter merges them by score and re-indexes against the caller's
original order.

The rerank window covers the whole fusion window. A chunk found by only one arm
sits low in the fused order by construction; a narrower window discards exactly
the identifier and paraphrase hits the two arms exist to catch. Measured: an
English question put the correct French chunk at fused position 33 of 50, and
the reranker scored it 0.99 — but a 30-candidate window never showed it to the
reranker.

### Configuration

Server-only variables, read by `packages/api/src/adapters/retrieval/config.ts`:

| Variable                         | Default                                             | Meaning                                                                  |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `RETRIEVAL_EMBEDDING_URL`        | required                                            | BGE-M3 endpoint, TEI `/embed` or OpenAI `/v1/embeddings`                 |
| `RETRIEVAL_EMBEDDING_MODE`       | `tei`                                               | `tei` or `openai`                                                        |
| `RETRIEVAL_EMBEDDING_MODEL`      | `BAAI/bge-m3`                                       | Stored on every chunk; changing it forces re-embedding                   |
| `RETRIEVAL_EMBEDDING_DIMENSIONS` | `1024`                                              | Must stay 1024 to match the `halfvec` column                             |
| `RETRIEVAL_EMBEDDING_API_KEY`    | unset                                               | Sent as `Authorization: Bearer` when set                                 |
| `RETRIEVAL_EMBEDDING_TIMEOUT_MS` | `20000`                                             | Per-request timeout                                                      |
| `RETRIEVAL_EMBEDDING_BATCH_SIZE` | `16`                                                | Texts per request, capped at 64                                          |
| `RETRIEVAL_RERANKER_URL`         | unset                                               | TEI `/rerank`; unset returns fusion order                                |
| `RETRIEVAL_RERANKER_MODEL`       | `BAAI/bge-reranker-v2-m3`                           | Model name reported in diagnostics                                       |
| `RETRIEVAL_RERANKER_API_KEY`     | unset                                               | Sent as `Authorization: Bearer` when set                                 |
| `RETRIEVAL_RERANKER_TIMEOUT_MS`  | `10000`                                             | Per-request timeout, applied to each batch                               |
| `RETRIEVAL_RERANKER_BATCH_SIZE`  | `32`                                                | Documents per request, capped at 64; match TEI's `max_client_batch_size` |
| `RETRIEVAL_REQUIRE_RERANK`       | `false`                                             | Fail the request instead of degrading                                    |
| `RETRIEVAL_EMBEDDING_MODEL_DIR`  | `./tooling/embedding-lab/models/bge-m3`             | Compose-only host path mounted at `/data`                                |
| `RETRIEVAL_RERANKER_MODEL_DIR`   | `./tooling/embedding-lab/models/bge-reranker-v2-m3` | Compose-only host path mounted at `/data`                                |

`RETRIEVAL_EMBEDDING_URL` is required for query embedding at runtime and for
the HTTP ingest path. `retrieval:ingest:vectors` does not read it: the model
name and revision come from the artifact manifest.

### What is deliberately deferred

- The golden set and the recall/precision/MRR/nDCG@10 gate are implemented in
  `packages/benchmark` (`benchmark retrieval evaluate`). The first measured
  baseline has recall@20 well below the 90% target, so retrieval quality is the
  next tuning workstream, not a model upgrade.
- Query reformulation. The agent gets one tool call budget, not a retrieval
  loop; add a second round only when the golden set shows multi-hop misses.
