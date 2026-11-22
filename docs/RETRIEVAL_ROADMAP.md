# Retrieval roadmap

Status: proposed. Owner approval required before implementation.
Companion to `docs/RETRIEVAL.md`, which holds the architecture and the measured
evidence. This file holds the work order, the acceptance criteria, and the
reasoning behind each step.

## What is actually broken

Measured against the indexed corpus (528 artifacts, 7,245 chunks, 19.0 MB of
text) and the source CSVs. Numbers are reproducible from
`tooling/retrieval-lab/data` and `packages/database`.

| #   | Problem                                                                     | Evidence                                                                                             |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Answers carry no date, so a 2013 label is indistinguishable from a 2026 one | `retrieval_chunks` has no date column; `RetrievalCandidate` has no date field                        |
| 2   | 36.1% of known Algerian brand names cannot reach either retrieval arm       | 775 of 2,144 brands in `name_map.csv` never occur in the 19 MB corpus                                |
| 3   | Registry questions get prose answers                                        | 2,101 in-scope products with `schedule`, `status`, `product_type`, `is_combination`; none filterable |
| 4   | Extraction quality is invisible to the agent                                | 35 `PARTIAL` + 25 `review_required` documents indexed identically to complete ones                   |
| 5   | No retrieval metric exists, so no change can be called an improvement       | no golden set; `docs/RETRIEVAL.md` already flags abstention as unfounded without one                 |

Problem 1 is the one the owner asked for and the cheapest to fix. Problem 2 is
the largest measured quality gap. Problem 5 gates problems 2 and 3: the repo's
own rule is _ship a golden set before the first tuning change_, and query
expansion is a tuning change.

## What outside practice changed

Two design decisions moved after reading the literature.

**Expansion appends, never replaces, and is safe here because a reranker
exists.** Synonym expansion reliably raises recall and unreliably lowers
precision; the cause is ambiguous terms generating "polluting" synonyms
(Sheffield, TREC 2004 Genomics). The fix that generalises is to append terms so
the original keeps its full IDF weight and to keep the expanded query short
(CE-QE, 2026: at most ~10 tokens, appended, never substituted). We already run
`bge-reranker-v2-m3` over the fused window, which is the component that recovers
the precision an expansion costs. Without the reranker this change would be
irresponsible; with it, it is measurable.

**A citation that supports a claim can still be obsolete.** The distinction is
named "lifecycle faithfulness": semantic support, target-time validity,
non-supersession, provenance (VERA-LIFE, 2026). This is why the date work cannot
be "add one date field". A document published in 2013 and extracted yesterday is
_old evidence_, not _fresh evidence_, and a single "extracted" date would tell
the user the opposite of the truth. The system must expose publication and
ingestion separately and never let the model merge them.

One more finding worth encoding as a hard rule: models backfill a plausible
access date when none is supplied ("stale access date anchoring"). Dates must be
passed as data and cited verbatim, never inferred.

## Date semantics

Four distinct timestamps exist in the source data. They are not
interchangeable and the schema will keep them apart.

| Field             | Origin                                                   | Populated | Means                                                     | Cited by the agent as                  |
| ----------------- | -------------------------------------------------------- | --------- | --------------------------------------------------------- | -------------------------------------- |
| `publicationDate` | `documents.csv` → `retrieval_documents.publication_date` | 498/528   | When the regulator published or last revised the document | **the currency of the clinical claim** |
| `collectedAt`     | `documents.csv`                                          | 528/528   | When we fetched it                                        | "retrieved"                            |
| `extractedAt`     | `cleaning_report.csv` → `metadata.cleaned_at`            | 528/528   | When we parsed and normalised it                          | "extracted"                            |
| `indexedAt`       | `retrieval_chunks.created_at`                            | 528/528   | When it entered the vector index                          | internal only                          |

`revisionDate` (150/528, BDPM only) stays available but is not part of the
default citation.

The 30 documents with no `publicationDate` are the trap. The agent must render
them as `publication date unknown` and must not substitute the extraction date
to fill the gap. A date the source did not state is a fact the system does not
have.

Citation format the tool will instruct:

```
[chunkId] <sourceName> · published <YYYY-MM-DD | unknown> · extracted <YYYY-MM-DD>
```

with `· partial extraction` appended when `extractionStatus = PARTIAL`.

## Plan

Each phase is independently shippable and independently reversible.

### Phase 1 — Temporal provenance and extraction quality

No retrieval behaviour changes, so this ships without a golden set.

- `packages/services/src/retrieval/contracts.ts`: add to `RetrievalCandidate`
  `publicationDate`, `collectedAt`, `extractedAt`, `indexedAt`,
  `extractionStatus`, `reviewRequired`. All nullable except `indexedAt`.
- `packages/api/src/adapters/retrieval/postgres.ts`: select the four date
  columns in `loadCandidates`. `extractedAt` and `extractionStatus` come from
  `retrieval_documents.metadata`.
- `packages/api/src/workers/retrieval/ingest.ts`: propagate
  `extraction_status` and `review_required` from `extractions.csv` into
  `retrieval_documents.metadata`.
- Metadata-only backfill for the existing 528 rows. Content does not change, so
  this must **not** re-embed and must **not** rebuild the HNSW index. A targeted
  `UPDATE ... SET metadata = metadata || ...` from a generated mapping, or a
  `--metadata-only` mode on the ingest worker.
- `apps/harness/agent/lib/retrieval-client.ts`: extend the wire schema. This is
  the hand-duplicated shape that caused the earlier duplication; adding six
  fields by hand is the moment to move the wire schema into
  `packages/contracts` and validate both sides against one definition.
- `apps/harness/agent/tools/search_medical_corpus.ts`: return the dates and add
  the citation format to `guidance`.
- `apps/harness/agent/instructions.md`: add the date rule to "Clinical corpus
  answers", including the unknown-date rule and the no-inference rule.

Acceptance:

- A live query returns every chunk with four dates and an extraction status.
- A document with no `publicationDate` renders `unknown`, and a test asserts the
  extraction date is not substituted.
- The backfill changes zero `content_hash` values and the HNSW index is not
  rebuilt.
- `bun run test`, `typecheck`, `lint:all`, `format:check` green.

Risk: low. The only real hazard is an accidental re-embed, which the
`content_hash` assertion above catches.

### Phase 2 — Evaluation baseline

Required before Phase 3 by the repo's own rule. 60-80 questions, committed as a
fixture, labelled with the chunk ids that answer each one.

Must include the shapes that break this system, not only the easy ones:

- **brand-only queries** — the 775 unreachable names, e.g. `COZAAR`,
  `BISOCE`, `DOLKO`; label the correct medicine's chunk
- **identifier lookups** — registration numbers, DCI codes, lot-style strings
- **cross-language** — English question, French source, which we already know
  drops the entity from the dense arm
- **abstention** — questions the corpus genuinely cannot answer
- **registry aggregates** — "how many paracetamol products are registered",
  which retrieval structurally cannot answer and must be routed to Phase 4
- **cross-tenant / unauthorized filter attempts** — must fail closed

Ship with a committed baseline of recall@k, precision@k, MRR, nDCG@10 and the
run-to-run spread, so Phase 3 is judged on a delta rather than a target picked
in advance.

Acceptance: baseline numbers committed next to the fixture; a PR gate that runs
the subset deterministically with no judge.

### Phase 3 — Alias expansion

- New table `retrieval_aliases` in `packages/database/src/schema/retrieval.ts`:
  `alias_norm`, `alias_raw`, `dci_norm`, `medicine_ids`, `confidence`,
  `ambiguous`, `source_id`.
- Built from `name_map.csv` (2,144 brands), the nomenclature and Pharm'Net brand
  columns (9,595 + 9,560 rows), and BDPM composition (4,483 substances) — all
  already on disk, no new source.
- Normalisation reuses `lexical-fold-v1` from
  `packages/services/src/retrieval/tokenize.ts`; a second normaliser would put
  aliases and postings in different spaces.
- Pure expansion function in `packages/modules/src/retrieval/expand.ts`.
- Applied at the service layer to the lexical arm only, **appended** to the
  original terms, capped at 4 added tokens.
- The 307 ambiguous brands (combination products: `COPARAMOL` is both
  paracetamol and paracetamol+codéine) are **not** expanded. They are returned
  in the result as a disambiguation prompt so the agent can ask which product
  the user means. Silently picking one sense is how a combination product gets
  dosed as a single agent.

Acceptance: recall@k on the brand-query subset improves against the Phase 2
baseline with no regression on the general subset. If it does not, the phase is
reverted rather than tuned.

### Phase 4 — Registry lookup

Deterministic answers for exact-match questions that similarity search answers
badly.

- New table `retrieval_products` merged from nomenclature (9,595) and Pharm'Net
  (9,560). 9,448 registration numbers are shared; the sources are complementary
  rather than redundant — nomenclature carries `withdrawal_date`,
  `withdrawal_reason`, `shelf_life`, Pharm'Net carries `observation` and
  `shelf_life_months`. Merge policy: nomenclature wins for status and
  withdrawal, Pharm'Net for observation; the 13 brand disagreements and 1,546
  DCI disagreements are logged, not silently resolved.
- New read-only tool `lookup_algerian_registry`. Per AGENTS.md, retrieval tools
  are read-only; anything that writes, sends, or spends needs human approval.
- Answers: registered or withdrawn (and why — 824 import bans, 17
  pharmacovigilance withdrawals, 8 laboratory bans), dispensing schedule
  (1,404 Liste I, 347 Liste II, 21 Stupéfiant in scope), generic vs reference
  (1,897 GE / 201 RE), combination flag, brand count per DCI.

Acceptance: the registry aggregate questions in the Phase 2 fixture are answered
correctly and completely, and the tool refuses to return a clinical claim
(indication, dose, contraindication) from register data.

### Phase 5 — Abstention and CI gate

- Abstention threshold derived from the Phase 2 score distribution, not chosen.
- Retrieval metrics gate on pull requests; judge-based generation metrics
  nightly, tracked as trends.

This is deliberately last: a threshold set before the baseline exists is the
unfounded tuning that `docs/RETRIEVAL.md` already warns against.

## Ordering constraint

Phase 2 blocks Phase 3. That is the repo rule, and it is also the only way to
tell whether expansion helped or merely moved the ranking around. Phase 1 and
Phase 4 have no such dependency and can proceed in parallel.

## Non-goals

- Ingesting the 15,845 BDPM products as prose. It would add roughly 5,000
  near-duplicate chunks, dilute retrieval, and teach the reranker nothing. BDPM
  enters as a substance graph only.
- A knowledge graph or a graph-retrieval system. Measured elsewhere at
  approximately 14x per-query cost for parity.
- Multi-agent retrieval loops. They multiply cost and latency and hide which
  stage failed.
- Expanding beyond the 40 assigned medicines. The registry holds 9,665 products;
  scope growth is a product decision, not a retrieval one.
