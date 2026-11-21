# Contextual Retrieval — chunking and context notes

Status: **chunking and contextualization complete; index and golden set pending.**

This document is the working contract for the ingest-time half of the retrieval
pipeline:

```text
clean Markdown → structure-aware chunk → model-written context note
              → contextual embedding + contextual BM25 → index
```

The retrieval half (hybrid search, RRF, reranking) is described in
`docs/RETRIEVAL.md`.

## 1. Why a model writes the note

A chunk that says “The dose is 500 mg three times a day” is retrievable only if
the index also knows _which medicine, which strength, which population, and
which section_ it came from. A template can name the document, but it cannot say
what the chunk is actually about. Anthropic's Contextual Retrieval reports a
**35% reduction in top-20 retrieval failures** from contextual embeddings alone,
and **49%** when the contextual note is indexed in the lexical arm too
([Introducing Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)).

The note is written by a language model with the whole document in view. In this
repository the model is the agent itself, driven through the workbench in
`packages/api/src/workers/retrieval/contextualize.ts`. Nothing calls a hosted
model from the build; the pass is resumable and auditable.

## 2. Chunking contract

Implemented in `packages/modules/src/retrieval/chunk.ts`.

| Property       | Value                                                                            |
| -------------- | -------------------------------------------------------------------------------- |
| Split order    | Markdown headings first, then paragraphs, sentences, words                       |
| Grouping level | shallowest heading level with ≥ 2 distinct headings (a lone H1 title is skipped) |
| Target size    | 512–1024 tokens (4,096-character ceiling, 15% overlap)                           |
| Small sections | packed into the previous section while the ceiling allows                        |
| Chunk id       | `<artifact>#<primary-section>-<occurrence>#<ordinal>`                            |
| Context key    | `sha256(artifact_id + "\0" + raw chunk text)`                                    |
| Content hash   | `sha256(context note + "\n\n" + raw chunk text)` — decides re-embedding          |
| Section filter | `section_codes text[]` stores every section a packed chunk covers                |

Measured on the current corpus (528 clean documents, 17.84 M characters):

| Metric                   | Previous split-at-heading chunker |    This chunker |
| ------------------------ | --------------------------------: | --------------: |
| Chunks                   |                            19,625 |       **7,245** |
| Median chunk             |                       131 tokens* | **791 tokens*** |
| Chunks under 100 tokens  |                             8,277 |             111 |
| Chunks over 1,024 tokens |                               634 |               0 |

\* Estimated as characters ÷ 4, the same proxy the chunker uses for its
ceiling; a real BGE-M3 tokenizer is slightly more compact on French text. The
previous column is the historical baseline on the earlier 488-document
snapshot.

The old chunker split at every heading, so 42% of chunks were too small to
carry a retrievable idea. Packing subsections keeps 70.3% of chunks inside the
512–1024 band and none above the 1,024-token ceiling. The remaining 29.7% are
complete sections of 100–512 tokens: adding the next sibling would have pushed
the chunk over the ceiling, and merging unrelated sections to hit a size target
would dilute the section filter. The 111 chunks under 100 tokens are
single-section documents (98 of them short DailyMed labels) that have no
sibling section to pack with; they are kept rather than padded or dropped.

### Why the chunker keeps both hashes

- `contextKey` keys the model note. It changes only when the chunk text
  changes, so editing one section does not throw away the notes of the rest of
  the document.
- `contentHash` covers the note as well. A corrected note must trigger a new
  embedding, because the embedded text changed.

## 3. Note contract

Every note has two lines and a hard ceiling of 3,000 characters (about 750
tokens, so a 1,024-token chunk plus its note still fits BGE-M3's 8,192-token
window with room to spare):

```text
[FR] <note in the document's language>
[EN] <the same situation in English>
```

Rules:

1. **Name the medicine** (INN and brand) and the strength when the chunk does
   not. A chunk that says “the dose” must not lose which drug it belongs to.
2. **Name the source** (`ANPP`, `BDPM`, `DailyMed`, `Ministère de la Santé`,
   `Pharm'Net`) and the jurisdiction when it changes the meaning. Never write
   the authority rank into the note: the rank is structured metadata on the
   chunk row, not part of the embedded text. A constant rank token in every
   note of a source biases the vector space toward that source and would force
   a full re-embed whenever the policy changes.
3. **Name the section and the clinical topic** (indications, dosage,
   contraindications, interactions, warnings, pregnancy, adverse effects,
   overdose, pharmacology, storage, packaging, register entry).
4. **Mention the population or indication** when the chunk is specific to one
   (paediatric, elderly, renal impairment, pregnancy, OTC self-medication).
5. **Never invent** a dose, a date, an indication, or a comparison that is not
   in the chunk or the document.
6. The English line is a retrieval bridge: a French query for _posologie_ must
   be able to match a French chunk through the lexical arm, and an English query
   must be able to match it too.

The prompt is Anthropic's, specialised for this corpus:

```text
<document>
{{WHOLE_DOCUMENT}}
</document>
<chunk>
{{CHUNK_CONTENT}}
</chunk>
This is a {{document_type}} for {{medicine}} from {{source}} ({{jurisdiction}},
{{date}}). Give a succinct context (aim for 50-100 tokens, never more than
3,000 characters) that situates this chunk within the overall document for
search retrieval. Name the medicine, brand and strength when the chunk does
not; state which section and clinical topic it covers; mention the population
or indication when relevant, and keep clinically material numbers and
identifiers. Answer only with the context, in the document's language, followed
by one English line.
```

The packet also carries the document outline and the chunk's section path, so
the model sees where the chunk sits without re-reading the whole body.

## 4. Workflow

```bash
# 1. Chunk the corpus and report coverage of model notes
bun run retrieval:contextualize -- status

# 2. Emit one work packet per document with the chunks that still need a note
bun run retrieval:contextualize -- prepare --medicine MED001
# or a whole source
bun run retrieval:contextualize -- prepare --source ANPP_RCP

# 3. The model reads a packet and writes notes.jsonl rows:
#    {"context_key":"…","chunk_id":"…","note":"[FR] …\n[EN] …"}
bun run retrieval:contextualize -- apply notes/MED001.jsonl

# 4. Ingest. Missing notes fall back to the deterministic document note; use
#    --require-context to make a gap a hard failure.
bun run retrieval:ensure-schema
bun run retrieval:ingest --require-context

# 5. Write the exact BGE-M3 input to one JSONL file, one row per chunk:
#    {chunk_id, artifact_id, context_key, section_code, language, text, text_sha256}
#    `text` is verbatim `contextNote + "\n\n" + content`, so an external embedder
#    consumes it without re-deriving anything.
bun run retrieval:contextualize -- export --out tooling/cleaning-lab/output/context/embed-input.jsonl
```

`export` is also the cheapest way to audit the pass: it reports `chunks`,
`contextualized`, `missingContext`, `characters` and the output path, so a wave
that silently wrote nothing is visible immediately. `--require-context` turns a
gap into a non-zero exit.

The chunk export is part of the `cleaning-output` dataset, so
`python tooling/run_pipeline.py` pushes `context/embed-input.jsonl`,
`context/notes.jsonl`, `context/packets/` and `preview/` to R2 together with the
clean documents. On a fresh checkout the same script pulls them back before it
considers running the pipeline.

The note store is append-only JSONL; the last row for a `context_key` wins, so a
note can be corrected without rewriting the file.

### Coverage is explicit, never silent

`retrieval:ingest` reports `contextualizedChunks` and `fallbackChunks`. A chunk
without a model note is still indexed with the deterministic fallback (title,
INN, brand, source, authority, section), so a partial pass is usable — but the
count is printed, and `--require-context` turns any gap into an error.

## 5. Embedding model

`BAAI/bge-m3`:

- 1024-dimensional dense vectors, stored as `halfvec(1024)`.
- 8,192-token sequence length; our 1,024-token chunks are never truncated.
- Multilingual (100+ languages, including FR/EN/AR), which is why it was chosen
  over a monolingual embedder.
- **No instruction prefix for queries.** BGE-M3 dropped the `Represent this
  sentence…` prefix used by BGE v1.5; adding one would move the query out of
  the space the passages were embedded in.

The contextual note is part of the embedded text, exactly as Anthropic
prescribes. `AGENTS.md` requires both arms to index the contextualized text, so
the BM25 `termCount` and the postings are built from
`contextNote + "\n\n" + content`, not from the raw chunk alone. That is what
makes the bilingual `[FR] … [EN] …` note pay for itself: a French query and an
English query reach the same French chunk through the lexical arm. The trade-off
is deliberate — a note adds vocabulary to the term statistics of its own chunk
only, never to another chunk's, so a note cannot make an unrelated chunk look
relevant.

> Note: BGE-M3 also exposes sparse lexical weights and ColBERT vectors. This
> repository keeps a real BM25 postings index (`retrieval_chunk_terms`) because
> it is already implemented and measurable. Moving the lexical arm to BGE-M3
> sparse weights is a separate, measured change, not part of contextualization.

> Authority rank is deliberately **not** part of the embedded text. It is
> source metadata stored in the database and returned with each passage, so a
> policy change never requires re-embedding. See `docs/RETRIEVAL.md`.

## 6. What is done, what remains

- [x] Structure-aware chunking at 512–1024 tokens with stable ids.
- [x] Separate context key and content hash.
- [x] `section_codes[]` so a packed chunk can be filtered by every section it
      covers.
- [x] Workbench: `status`, `prepare`, `apply`, `export`.
- [x] Ingest reads model notes, reports coverage, and can require them.
- [x] `export` writes the exact BGE-M3 input, one row per chunk.
- [x] Model-written notes for all 7,245 chunks (7,245/7,245, pending 0). The
      pass runs in waves; the store and the packets are resumable.
- [ ] Golden set and the retrieval metrics from `AGENTS.md`.
