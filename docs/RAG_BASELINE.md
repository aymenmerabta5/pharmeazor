# RAG baseline and corpus report

Measured 2026-11-24/25. This report answers three questions with evidence from
this repository: what the corpus contains, how the current retrieval stack
performs before the planned enhancements, and which enhancements actually
exist.

The short version: the corpus has 414 verified documents from four sources,
including two official Algerian sources. The offline lexical baseline is
committed and reproducible. Contextual retrieval and a reranker are
implemented; graph retrieval is not. The dense arm is implemented but could not
be measured because the BGE-M3 artifact is absent from R2 and the local
checkout. No LLM-as-a-Judge was used anywhere in this measurement.

## Sources

Counts are verified documents (`relevance_status=verified`) from
`tooling/retrieval-lab/data/metadata/documents.csv`. The source policy,
authority levels and collection methods come from
`tooling/retrieval-lab/config.yaml`.

| Source      | Type                                 | Authority | Jurisdiction  | Language | Verified docs | Collection method                  | Collected  | Role                            |
| ----------- | ------------------------------------ | --------- | ------------- | -------- | ------------: | ---------------------------------- | ---------- | ------------------------------- |
| `ANPP_RCP`  | Official Algerian agency (ANPP)      | 1         | Algeria       | fr       |            36 | Automated HTTP requests, 3 s delay | 2026-11-20 | Algerian SmPC (RCP)             |
| `SANTE_MSP` | Official Algerian Ministry of Health | 2         | Algeria       | fr       |            39 | Manual download of the list page   | 2026-11-20 | Algerian nomenclature           |
| `BDPM_FR`   | Foreign institutional (French MoH)   | 3         | France        | fr       |           190 | Automated HTTP requests, 3 s delay | 2026-11-20 | French SmPC and nomenclature    |
| `DAILYMED`  | Foreign institutional (US NLM/FDA)   | 3         | United States | en       |           149 | Automated HTTP requests, 3 s delay | 2026-11-20 | US FDA approved labelling (SPL) |
| **Total**   |                                      |           |               |          |       **414** |                                    |            |                                 |

Coverage against the project rule "at least three sources, including one
official source" is **38 of 40 medicines**, not 40 of 40. The two exceptions
are:

- `MED012` (néfopam): two sources, one official (`SANTE_MSP`, `BDPM_FR`).
- `MED028` (nifédipine): two sources, no official source (`BDPM_FR`,
  `DAILYMED`).

Seven additional `BDPM_FR` rows were marked `needs_review` and two were
rejected; they are excluded from the verified count. The collection table also
contains `REVIEW_REQUIRED`, `MANUAL` and `no_results` rows that never became
verified documents. The corpus used for retrieval is the cleaner's
`manifest.jsonl`, which at measurement time held 488 clean documents; the
414 figure is the source-verification count, not the indexed-document count.

## Test set

The committed fixture is
`tooling/retrieval-lab/eval/fixtures/rag_baseline_questions.jsonl`:

- **20 questions**: 15 in-corpus and 5 genuinely out-of-corpus.
- **Languages**: French 8, English 6, Arabic 6.
- **In-corpus categories**: general medication knowledge 3, medication
  identification 3, dosage and numerical knowledge 3, contraindications and
  warnings 2, drug interactions 2, trap/out-of-scope 2.
- **Out-of-corpus ingredients**: semaglutide, pembrolizumab, insulin glargine,
  goserelin, rosuvastatin. The evaluator verifies that none of their tokens
  occur in the corpus, so these are not benchmark "trap" rows mislabelled as
  out-of-corpus.
- **Gold labels**: copied from the signed-off benchmark v1
  (`packages/benchmark/data/v1/gold_annotations.jsonl`). The evaluator refuses
  to run if a copied label drifts from the benchmark, if a gold chunk is absent
  from the corpus, or if an out-of-corpus ingredient appears in the corpus.

The frozen corpus identity is in
`tooling/retrieval-lab/eval/fixtures/manifest.json`: 7,245 chunks, 528
artifacts, SHA-256 `4d7f61dbaea651c28dd18f00045bbb2e41c55f3d1efd6d20346c169a957ebccf`.
That is the exported artifact the baseline was measured on. It is **not** the
current production chunker output; see "Artifact status" below.

## Baseline results

The measurement is BM25 with the production tokenizer and constants
(`k1=1.2`, `b=0.75`, depth 50) over the exported chunks. Two modes are
reported: `raw_chunk` strips the model-written context note and indexes the
chunk body only; `contextual_chunk` indexes note plus body, which is the text
the production ingest worker embeds and tokenizes.

| Mode               | Recall@5 | Recall@10 | Recall@20 | Recall@50 | MRR@10 | nDCG@10 | Hit@10 | Zero-hit |
| ------------------ | -------: | --------: | --------: | --------: | -----: | ------: | -----: | -------: |
| `raw_chunk`        |   0.1667 |    0.1667 |    0.3000 |    0.3000 | 0.0933 |  0.1083 | 0.2000 |    10/15 |
| `contextual_chunk` |   0.3333 |    0.3667 |    0.3667 |    0.4333 | 0.1944 |  0.2361 | 0.4000 |     8/15 |

Contextual indexing therefore improves lexical Recall@10 by **+0.20**
(0.1667 → 0.3667) and MRR@10 by **+0.1011** on this set. This is the
before/after evidence that the context note is doing work, not just consuming
tokens.

Out-of-corpus behaviour on the same five questions:

| Mode               | Empty results | Absence-term leaks in top 10 | Mean top-1 score | Max top-1 score |
| ------------------ | ------------: | ---------------------------: | ---------------: | --------------: |
| `raw_chunk`        |           1/5 |                            0 |          18.8298 |         28.6887 |
| `contextual_chunk` |           1/5 |                            0 |          15.7577 |         25.0449 |

BM25 returns a scored list even when the corpus cannot answer the question, so
empty results are not a reliable abstention signal. A production abstention
threshold must be calibrated on a larger set; the raw BM25 score is not a
probability.

Reproduce with:

```bash
bun run --cwd tooling/retrieval-lab eval
```

The script writes the JSON and Markdown reports and then runs `oxfmt` over them,
so the committed results always pass `format:check`.

Outputs are committed at
`tooling/retrieval-lab/eval/results/rag_baseline_baseline.{json,md}`.

## Enhancement status

| Enhancement          | Exists? | Evidence                                                                                                             | Measured here?        |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Contextual retrieval | Yes     | `packages/api/src/workers/retrieval/contextualize.ts`; notes consumed by `ingest.ts`; `docs/CONTEXTUAL_RETRIEVAL.md` | Yes, lexical arm only |
| Reranker             | Yes     | `packages/api/src/adapters/retrieval/reranker.ts`, `BAAI/bge-reranker-v2-m3` over TEI `/rerank`                      | No                    |
| Graph retrieval      | No      | Not implemented; `AGENTS.md` explicitly lists it as a non-goal                                                       | No                    |
| Dense/hybrid arm     | Yes     | `packages/api/src/adapters/retrieval/precomputed.ts` + pgvector schema                                               | No                    |

The baseline is therefore a **pre-reranker, pre-dense, pre-generation**
measurement. It is not evidence about the hybrid pipeline's quality. The
reranker needs a running TEI endpoint and the dense arm needs the BGE-M3
artifact; neither was available for this run.

## Artifact status

The dense arm and the end-to-end vector import are blocked by the artifact, not
by the code:

- R2 contains no object under `embedding-lab/`. Direct probes for
  `embeddings/manifest.json`, `embeddings/chunks.jsonl`, `embeddings/vectors.npy`
  and `embeddings/run-report.json` all return HTTP 404. A full bucket scan found
  1,692 objects, none of them a `.npy`.
- No `vectors.npy` exists locally (`tooling/embedding-lab/output/` is absent).
- The exported `embed-input.jsonl` is stale relative to the production chunker:
  7,245 chunks / 528 artifacts in the export versus **6,955 chunks / 488
  documents** from the current chunker. A sample chunk
  (`MED001__SRC_ANPP_RCP__DOC002__smpc#dosage-0#0`) has artifact text hash
  `9d1bc860…` but production content hash `f44ccba0…`, so the importer rejects
  it as changed text. Uploading the old export would not fix this.

The import path itself is implemented and tested against a synthetic
production-aligned artifact (random unit vectors, not BGE-M3 output): 488
documents, 6,955 chunks, one model revision, no missing vectors, no orphan
chunks, and a second run with `embeddedChunks=0` and `reusedChunks=6955`.
That proves the pipeline and the associations, not retrieval quality.

To unblock the real measurement:

```bash
# 1. Re-export the embedding input from the current corpus and notes.
bun run retrieval:contextualize -- export --require-context

# 2. Generate BGE-M3 vectors (GPU; see tooling/embedding-lab/README.md).
cd tooling/embedding-lab
python run.py embed

# 3. Upload the artifact under embedding-lab/.
python ../bucket_operations.py push --group embedding

# 4. Pull, validate, create the schema, import and postflight.
cd ../..
bun run retrieval:import:r2
```

Until step 3 completes, `bun run retrieval:import:r2` fails closed with
`dataset 'embedding-output' is not complete in R2`. That is the intended
behaviour: a missing marker must never import a partial tree.

## Limitations

- The in-corpus set has 15 questions. It is enough to detect a large
  contextual-retrieval effect and to catch regressions, not enough for
  fine-grained tuning or per-category conclusions.
- Only the lexical arm is measured. Dense retrieval, fusion, reranking and
  generation are unmeasured.
- The out-of-corpus set has five questions. It checks absence-term leakage and
  gives a score distribution, but it cannot calibrate an abstention threshold.
- The baseline uses the exported 7,245-chunk corpus. The current chunker
  produces 6,955 chunks, so absolute numbers will move when the artifact is
  regenerated; the before/after contextual delta is the durable result.
