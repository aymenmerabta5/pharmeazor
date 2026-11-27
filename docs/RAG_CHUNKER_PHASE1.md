# Phase 1 — Chunker characterization and production-aligned baseline

Status: complete for characterization. No production chunking, retrieval,
database, benchmark-label, or index behavior was changed.

Measured 2026-11-26 from commit `b594d81a3ee7fccabea3d26ba87d2f053eafadca`.

## A. Scope

Investigated:

- The production Markdown chunker and the source-to-chunk ingest path.
- Section grouping, cross-section packing, character-window overlap, table/list
  handling, metadata, and chunk identity.
- Contextualization and embedding-input export.
- Retrieval artifact reconstruction.
- Current consumers of chunk IDs in the benchmark, embedding lab, and API.
- The committed benchmark dataset, retrieval trace, and retrieval gate.

Deliberately not changed:

- Production chunker behavior, defaults, overlap, packing, metadata, or IDs.
- Database schema or migrations.
- Contextualization notes or exports.
- Embeddings, ingest, the retrieval index, or the retrieval service.
- Benchmark questions, gold annotations, evidence, or expected results.
- The production retrieval baseline.

No ingestion, embedding, or indexing command was run, and no live retrieval,
embedding, or model service was called. `AGENTS.md` still prohibits adding graph
retrieval; this phase does not do so.

## B. Verified production pipeline

### Source to text unit

1. `tooling/cleaning-lab/` produces clean Markdown and the manifest. Its own
   `pipeline/chunking.py` is explicitly a preview and is not the production
   chunker (`pipeline/chunking.py:1-7`; `AGENTS.md:98,162`).
2. `packages/api/src/workers/retrieval/ingest.ts:574-626` loads each clean
   Markdown artifact and calls `chunkMarkdownDocument` from
   `packages/modules/src/retrieval/chunk.ts`.
3. `chunkMarkdownDocument` performs the real work:
   - sanitize and strip front matter: `chunk.ts:155,203-208`
   - split Markdown headings into segments: `chunk.ts:210-250`
   - choose the grouping heading level: `chunk.ts:257-271`
   - group by heading frame: `chunk.ts:273-295`
   - pack undersized groups into predecessors: `chunk.ts:337-353`
   - build group text and path: `chunk.ts:307-335`
   - split oversized groups by paragraph, sentence, then word:
     `chunk.ts:378-459`
   - apply character-window overlap: `chunk.ts:461-473`
   - assign identity and metadata: `chunk.ts:165-197`
4. The production default is `maxChars=4096` and
   `overlapChars=floor(maxChars*0.15)`. `minGroupChars` defaults to 800
   (`chunk.ts:63-78,145-147`).

### Contextualization and persistence

- `packages/api/src/workers/retrieval/contextualize.ts:411-451` re-chunks clean
  Markdown with the production function and attaches notes keyed by
  `contextKey`.
- The embedding-input export contains only:
  `chunk_id`, `artifact_id`, `context_key`, `section_code`, `language`, `text`,
  and `text_sha256` (`contextualize.ts:182-220`).
- The ingest worker stores both raw `content` and `contextualizedContent`, plus
  the primary code, code array, heading, path, ordinal, and derived hashes
  (`ingest.ts:247-326,637-696`; `packages/database/src/schema/retrieval.ts:67-117`).
- `contextKey` hashes artifact plus raw content (`chunk.ts:135-138,176`).
  `contentHash` hashes the contextualized note plus content
  (`chunk.ts:180-193`). They are not interchangeable.

### Alternate precomputed-artifact path

`packages/api/src/workers/retrieval/artifact-documents.ts:74-156` rebuilds
documents from precomputed artifact rows instead of re-chunking Markdown. This
path uses the artifact's final contextualized text as both `content` and
`contextualizedContent`, recreates only a primary section code, clears the path,
and derives `ordinal` from the trailing chunk-ID segment.

### Evaluation path

- `packages/api/src/workers/retrieval/benchmark-trace.ts` records live retrieval
  results into `packages/benchmark/data/v1/retrieval-trace.jsonl`.
- `packages/benchmark/src/cli/retrieval.ts:13-25` evaluates the committed trace;
  it does not run the retriever.
- `packages/benchmark/src/retrieval/metrics.ts:67-128` computes recall,
  precision, MRR, nDCG, and candidate recall.
- `packages/benchmark/src/runner/rag.ts` replays the trace for the RAG arm.

## C. Characterization findings

### 1. Overlap can be silently lost

Status: **verified**.

Production function: `applyOverlap`, `chunk.ts:461-473`, fed by
`splitBody`, `chunk.ts:378-415`.

Test:
`packages/modules/tests/retrieval-chunk-characterization.test.ts` —
“drops the requested overlap when each part already consumes the character
budget”.

Fixture condition:

- `maxChars=400`
- `overlapChars=100`
- no cross-section packing
- 14 distinct sentences long enough to produce multiple parts

Observed result: the first part ends with `Phrase 04`; the next part starts with
`Phrase 05`. No overlap is present.

Cause confirmed in source: the internal budget is
`Math.max(400, maxChars - overlapChars)`. At the minimum 400-character ceiling,
this is 400. Each part can therefore fill the whole ceiling. Adding the
two-character separator to an overlap candidate exceeds `maxChars`, and
`applyOverlap` returns the non-overlapped part (`chunk.ts:383,469-470`).

This does not show that every overlap is lost. It reproduces the minimum-window
condition where the requested overlap is dropped completely.

### 2. Preserved overlap can begin mid-sentence

Status: **verified**.

Test:
“creates character-window overlap that can begin in the middle of a sentence”.

Fixture condition:

- `maxChars=600`
- `overlapChars=60`
- 14 distinct sentences

Observed result: the second part begins `clinique distincte...`, a suffix from
the middle of the previous sentence, rather than at a sentence start. The overlap
is preserved as characters, but it has no sentence or token alignment.

### 3. Small clinical sections are packed across section boundaries

Status: **verified**.

Production function: `packGroups`, `chunk.ts:337-353`.

Test: “packs small adjacent clinical sections into one chunk by default”.

Using four short, supported headings:

- `Denomination`
- `Indications`
- `Posologie`
- `Contre-indications`

Observed result: one chunk contains all four section bodies. Its
`sectionCodes` value is
`["denomination","indications","dosage","contraindications"]`.

`packGroups` checks only whether the second group is below `minGroupChars` and
whether the combined character count fits. It does not require equal parent,
section, document purpose, table, or list type.

### 4. Packed metadata is aggregate, with a primary-only label

Status: **verified partial representation; no direct false code observed**.

Production functions: `uniqueCodes` and primary selection, `chunk.ts:165-171`;
heading fields, `chunk.ts:170-171,355-376`.

Test:
“uses the first mapped code as primary while sectionCodes retains packed
membership”.

Observed result for the four-section fixture:

- `sectionCode` = `denomination`
- `sectionHeading` = `Denomination`
- `sectionPath` =
  `Denomination | Indications | Posologie | Contre-indications`
- `sectionCodes` contains all four codes
- the content contains `500 mg par prise.` from the dosage section

Thus `sectionCodes` contains the packed membership, but `sectionCode`,
`sectionHeading`, and the section portion of the chunk ID describe only the
first non-`other` group. There are no character offsets mapping text spans back
to individual codes.

A previous suspicion that every emitted window inherits unrelated packed codes
after a packed group splits was **not reproduced** in this phase. Packing rejects
a candidate whose combined character count exceeds `maxChars`, so the tested
packed group remained one window. No characterization test claims a per-window
mismatch.

### 5. Tables are split without row or header protection

Status: **verified**.

Production functions: generic paragraph and word splitting,
`chunk.ts:378-459`. There is no table detector.

Test:
“splits Markdown table rows and repeats no header on later parts”.

Observed result with a 4-column, 8-row Markdown table and `maxChars=400`:

- the table becomes multiple chunks
- at least one complete source row is split across chunks
- the header/separator appears only in the first table chunk
- single newlines are replaced with spaces by the word splitter, so later
  chunks are no longer valid Markdown table rows

This verifies the production chunker has no row-safe table behavior. It does not
claim that cleaning loses the original table; cleaning preserves the source
Markdown. The loss occurs in the production chunk output.

### 6. Lists have no explicit item protection

Status: **verified for one long item**.

Test:
“splits one long list item and does not repeat its bullet”.

Observed result: a single list item longer than 400 characters becomes multiple
chunks. The bullet appears only on the first chunk; the continuation starts
without it. Splitting happened at sentence-like boundaries because the generic
sentence splitter recognized the repeated sentence endings, not because the
splitter understood a list.

Short list items may remain intact only because they fit the generic sentence
window. No explicit list-item invariant exists in production code.

### 7. Structural provenance is limited and is lost in artifact reconstruction

Status: **verified**.

Retained by `ChunkDraft` and the production database:

- primary section code
- aggregate section-code array
- section heading
- concatenated section path
- part ordinal
- raw content and contextualized content
- context key and contextualized content hash
- token estimate and injection flag

Not retained:

- parent section or parent ID
- child membership
- heading/group IDs
- character or token source offsets
- exact text spans per section code
- explicit table row or list item identity
- hierarchical structural membership

The contextualization export omits all section paths, code arrays, parents, and
spans (`contextualize.ts:182-220`).

The precomputed artifact path reduces `sectionCodes` to the primary code and
sets `sectionPath=""` (`artifact-documents.ts:120-135`). Its new characterization
test shows:

- `sectionPath=""`
- `sectionCodes=["dosage"]`
- `sectionHeading="dosage"`
- `ordinal` recovered from the chunk ID
- `contextNote=""`
- artifact text used as both `content` and `contextualizedContent`

Therefore artifact reconstruction cannot recover the metadata that was not
stored in the artifact.

### 8. Chunk IDs are stable for appends but not for an earlier same-code insert

Status: **verified**.

Production identity code: `chunk.ts:162-182`.

Current format:

```text
artifact_id#primary-section-code-occurrence#part-ordinal
```

Example:

```text
ART_CHARACTERIZATION#dosage-0#0
```

Test:
“renumbers later same-code chunks when an earlier section is inserted”.

Observed result:

Before insertion:

```text
Premiere posologie. -> dosage-0#0
Deuxieme posologie. -> dosage-1#0
```

After inserting a new `Posologie` section before both:

```text
Nouvelle posologie.  -> dosage-0#0
Premiere posologie.  -> dosage-1#0
Deuxieme posologie.  -> dosage-2#0
```

An append at the end preserves earlier IDs; an insert at the beginning of the
same primary code renumbers later occurrences. This is the current behavior and
was not changed.

Downstream compatibility is coupled to the format:

- The benchmark gold schema accepts the current grammar and rejects an extra
  `#parent` segment (`packages/benchmark/src/dataset/schema.ts:38-50`; focused
  test added).
- The embedding-lab parser derives artifact and section code from the first two
  `#` components (`tooling/embedding-lab/pipeline/chunks.py:181-189`).
- The RAG evidence adapter reads the section component after the first `#`
  (`packages/benchmark/src/runner/rag.ts:48-68`).
- Artifact reconstruction reads the final numeric ordinal
  (`artifact-documents.ts:69-72`).
- The grounded-data verifier rejects unknown chunk IDs and requires evidence to
  remain verbatim in the cited chunk
  (`packages/benchmark/scripts/verify_grounded_data.py:88-95,142-156`).

Read-only validation of the committed trace:

- 600 traced chunk IDs: 0 invalid
- 2,442 candidate chunk IDs: 0 invalid
- 122 gold/evidence chunk IDs: 0 invalid

No ID or grammar change was made.

## D. Test results

Tests added:

- 7 production-chunker characterization tests in
  `packages/modules/tests/retrieval-chunk-characterization.test.ts`.
- 1 artifact-reconstruction characterization test in
  `packages/api/tests/retrieval-artifact-documents.test.ts`.
- 1 current chunk-ID compatibility test in
  `packages/benchmark/tests/dataset/schema.test.ts`.

Commands and results:

| Command                                                                                                                   | Result                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun test packages/modules/tests/retrieval-chunk-characterization.test.ts packages/modules/tests/retrieval-chunk.test.ts` | 22 pass, 0 fail                                             |
| `bun test` in `packages/modules`                                                                                          | 31 pass, 0 fail, 4 files                                    |
| `bun run test` in `packages/api`                                                                                          | 25 pass, 0 fail, 4 files                                    |
| `bun run test` in `packages/benchmark`                                                                                    | 156 pass, 1 skip, 0 fail                                    |
| `bun run typecheck` in modules                                                                                            | pass, 96 files                                              |
| `bun run typecheck` in API                                                                                                | pass, 229 files                                             |
| `bun run typecheck` in benchmark                                                                                          | pass, 74 files                                              |
| `bun run lint` in modules/API/benchmark                                                                                   | pass                                                        |
| `bun run format:check` in modules/API/benchmark                                                                           | pass                                                        |
| `bun run --cwd packages/benchmark benchmark dataset validate`                                                             | pass; 50/50 approved, annotated, verified; 6 known warnings |
| `bun run --cwd packages/benchmark benchmark dataset stats`                                                                | pass; 50 scorable; fr 30/en 10/ar 10                        |
| `bun run --cwd packages/benchmark benchmark retrieval evaluate`                                                           | pass; 50 questions                                          |
| `bun run test` (root)                                                                                                     | pass; 11/11 Turbo tasks                                     |
| `bun run format:check` (root)                                                                                             | pass; 25/25 Turbo tasks                                     |
| `bun run lint:all` (root)                                                                                                 | pass; 23/23 Turbo tasks                                     |
| `bunx --bun ghostinit@0.1.0 check --json`                                                                                 | pass; 0 blockers, 0 highs                                   |

No pre-existing test failures were found. The one skipped benchmark test is the
existing live smoke path.

`bun run build` and `bun run start:production` were not run: this phase changed
only tests and documentation, and the build is not needed to validate those
files. They remain unverified for this diff rather than reported as passing.

The Python grounded-data verifier was not run because its required
`tooling/embedding-lab/output/embeddings/chunks.jsonl` artifact is absent from
this checkout. No artifact was downloaded or fabricated.

## E. Baseline

### Dataset and labels

- Dataset: `packages/benchmark/data/v1/`
- Meta version: `v1`, status `APPROVED`, updated `2026-11-23`
- Questions: 50, all `APPROVED`
- Gold annotations: 50, all `VERIFIED`
- Canonical question hash: `df9415f80bf72d60eeb329aeb65f29ece4e8001383fa1ea97add3435ba998b56`
- Canonical annotations hash:
  `cbc89482bee03ac1fb58f9ca4504f56d7098f19e539b0ee360c5cb0d4f91a12a`
- Languages: `fr 30 / en 10 / ar 10`
- Annotation shape: 40 single-chunk, 9 two-chunk, 1 three-chunk; 10 are
  multi-chunk, 6 span artifacts
- Explicit multi-hop/hop-path/required-edge labels: **none**

Multi-chunk is not treated as multi-hop.

### Retrieval trace and configuration

- Trace: `packages/benchmark/data/v1/retrieval-trace.jsonl`
- Trace hash (SHA-256): `c1d2c5d3ac7adb849773eab99d2f380bdd081be8e817738c13cf890d942d033a`
- Rows: 50
- Retrieval configuration hash:
  `53e217f47b7f26460b5bc72282b65ceee797a0133d4c7e325c156e6b10038ef7`
- Recorded configuration descriptor:
  `BAAI/bge-m3|5617a9f61b028005a4858fdac845db406aefb181|reranker=none|requireRerank=false|limit=12|fusion=k60`
- Embedding: `BAAI/bge-m3`, revision
  `5617a9f61b028005a4858fdac845db406aefb181`
- Reranker: disabled
- Fused candidates: 50; dense candidates 40; lexical candidates 50;
  configured return limit 12. The first recorded diagnostic, inspected as a
  format example, reported 12 returned chunks.
- Evaluation type: **re-evaluated committed trace**, not a new live retrieval
  run
- Corpus snapshot: **not encoded in the trace**. The trace and baseline contain
  no corpus-manifest hash, so the exact chunk corpus cannot be independently
  pinned from these artifacts.
- Chunker version: **not recorded in the trace**. The current production file
  `packages/modules/src/retrieval/chunk.ts` has SHA-256
  `cd422f3753df37e6ae934d395a2762ba919477a30dda38058c11e7a549671730`
  at the measurement commit.

### Metrics

Pre-existing committed baseline, re-evaluated unchanged:

| Metric              |     Value |
| ------------------- | --------: |
| Recall@1            |      0.17 |
| Recall@5            |      0.35 |
| Recall@10           |      0.45 |
| Recall@20           |      0.49 |
| Precision@5         | 0.0800000 |
| Precision@10        | 0.0500000 |
| MRR                 | 0.2891111 |
| nDCG@10             | 0.4613147 |
| Candidate Recall@20 | 0.6866667 |
| Candidate Recall@50 | 0.7633333 |

The baseline file is
`packages/benchmark/runs/retrieval-baseline.json` (Git blob
`b64a9079dd0e2a16727ce46cde87b51fd72f65fd174656b312f58bed36f7bc4a`).
It was not rewritten.

`packages/benchmark/runs/retrieval-metrics.json` was regenerated by the gate and
had the same Git object hash before and after:
`c94dcc0e90249e2e96923e15a4d58606111710e7`.

### Fresh baseline status

A fresh production-aligned trace was **not generated** and cannot be generated
in this checkout without changing the approach. The trace writer directly reads
`tooling/embedding-lab/output/embeddings/manifest.json`, and the broader
production-aligned artifact set is also absent:

- `tooling/embedding-lab/output/embeddings/manifest.json`
- `tooling/embedding-lab/output/embeddings/chunks.jsonl`
- `tooling/embedding-lab/output/embeddings/vectors.npy`

The absent manifest alone blocks the trace writer before it can record a fresh
trace. Generating or fabricating the artifact and requiring a verified live
index would be embedding/index work that this phase forbids. Therefore:

- The reported metrics are a re-evaluation of the existing committed trace.
- They are not evidence of the current production chunker's retrieval quality.
- The older BM25 report in `docs/RAG_BASELINE.md` uses a different 20-question
  fixture and a different 7,245-chunk snapshot. It was not mixed into these
  metrics.

## F. Limitations

- Tests characterize character-window behavior, not token behavior.
- Synthetic fixtures are ASCII and do not exercise French/Arabic tokenization,
  PDF extraction artifacts, or real tables from cleaning-lab.
- The table test demonstrates generic splitting; it does not measure how often
  this occurs across the corpus.
- The list test covers one deliberately oversized item, not all real list
  shapes.
- Per-window section-code mismatch after a packed group splits was not
  reproduced.
- Parent relationships, source spans, and structural membership cannot be
  characterized beyond their current absence because they do not exist in the
  production contract.
- The baseline has no corpus-manifest identity or chunker-version identity.
- No fresh trace, live dense/lexical retrieval, reranker, or generation run was
  performed.
- The exact IDs in the trace are valid under the current grammar, but the
  traced chunks were not regenerated from the current chunker in this phase.
- Gold relabelling after a future ID or chunk-boundary change still requires
  reviewed evidence-span migration. String substitution alone cannot satisfy
  the grounded-data verifier.

## G. Files changed

| File                                                              | Change         | Reason                                                                              |
| ----------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `packages/modules/tests/retrieval-chunk-characterization.test.ts` | Created        | Freeze overlap, packing, section metadata, table/list, and early-insert ID behavior |
| `packages/api/tests/retrieval-artifact-documents.test.ts`         | Added one test | Record structural metadata loss in artifact reconstruction                          |
| `packages/benchmark/tests/dataset/schema.test.ts`                 | Added one test | Record current chunk-ID compatibility and rejection of extra segments               |
| `docs/RAG_CHUNKER_PHASE1.md`                                      | Created        | This evidence and baseline report                                                   |

No production source, schema, contract, benchmark fixture, or gold data changed.

## H. Next-phase readiness

Phase 1 establishes a regression net around the current chunker without
pretending its behavior is correct. Future work can now make deliberate changes
to:

- overlap preservation and boundary policy
- section purity and packing rules
- table row/header handling
- list item handling
- structural provenance and parent/child representation
- ID identity and downstream migration
- a production-aligned trace with explicit corpus and chunker identity

Those changes should update these characterization tests in the same reviewed
diff and state which existing behavior is intentionally changing. This phase
does not authorize or implement graph extraction, GraphRAG, re-embedding, or a
new index.

A later additive profile, `graph-evidence-v1`, now implements section-pure
boundaries, source mappings, table/list protection, and overlap provenance in
`packages/modules/src/retrieval/graph-chunk.ts`. It leaves this phase's legacy
behavior and characterization tests unchanged; see
[GRAPH_CHUNKING_PROFILE.md](./GRAPH_CHUNKING_PROFILE.md). It still does not
authorize graph extraction, GraphRAG, re-embedding, or a new index.
