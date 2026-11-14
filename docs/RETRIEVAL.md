# Retrieval (RAG) strategy

Status: **not implemented**. This document is the design contract for retrieval in
pharmeazor. It exists so that the first implementation follows a measured,
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
2. **Retrieve hybrid.** Dense vectors (pgvector) and lexical terms (Postgres
   `tsvector`) in parallel, fused with Reciprocal Rank Fusion.
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
- `tsvector` with a GIN index for the lexical arm.
- One query with two subqueries and a RRF fusion expression. Roughly thirty
  lines we own and can test.
- Postgres full-text search is not BM25 — there is no document-length
  normalization and no corpus-level IDF in `ts_rank`. If lexical quality
  becomes the bottleneck, the escalation path is the `pg_search` extension
  inside Postgres first, a dedicated engine second.

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

`docker-compose.yml` and `start-database.sh` are generator-owned, so
`docker-compose.override.yml` repeats the pgvector service fields and keeps
them in place across a `ghostinit sync`. Never run
`docker compose -f docker-compose.yml` without the override file.

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

1. **Index.** `pgvector` + `tsvector` schema, structure-aware chunking, stable
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

| Concern                                          | Location                                          |
| ------------------------------------------------ | ------------------------------------------------- |
| Chunking, contextualization, retrieval use-cases | `packages/modules/src/retrieval/`                 |
| Retrieval ports, authorization filters, policies | `packages/services/src/retrieval/`                |
| Retrieval tables, vector and lexical columns     | `packages/database/src/schema/retrieval.ts`       |
| oRPC contract and procedures                     | `packages/api/src/retrieval/`                     |
| Postgres hybrid retrieval adapter                | `packages/api/src/adapters/retrieval/postgres.ts` |
| Embedding and reranking provider adapters        | `packages/api/src/adapters/retrieval/`            |
| Composition root                                 | `packages/api/src/composition/retrieval.ts`       |
| Agent retrieval tool                             | `apps/eve/agent/tools/`                           |

Provider SDKs stay in the adapters. Domain code depends on ports, never on an
SDK, a vector client, or an embedding API.
