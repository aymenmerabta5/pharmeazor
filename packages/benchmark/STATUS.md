# Implementation Status — @repo/benchmark

_Last updated: 2026-11-22_

## Current state

The package implements the three-arm benchmark's first two arms and the
evaluation/reporting tooling around them. The third arm is deliberately not
built yet.

| Area                          | State                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| Dataset                       | 50 questions, 30 `fr` / 10 `en` / 10 `ar`, all `APPROVED`   |
| Gold annotations              | 50 `VERIFIED` corpus-derived annotations                    |
| Raw arm (`raw`)               | implemented, tested                                         |
| Oracle arm (`oracle`)         | implemented, tested, corpus-derived bundles populated       |
| RAG arm (`rag`)               | **not implemented** — deferred until baselines exist        |
| Deterministic evaluation      | implemented, advisory only                                  |
| Human review + reconciliation | implemented                                                 |
| Reporting / comparison        | implemented with identity guards                            |
| Live runs                     | **blocked**: no `GROQ_API_KEY`; pharmacist sign-off pending |

`dataset stats` now reports `scorable_questions: 50`. That is a structural
result, not a clinical endorsement: every row carries the exact note
`corpus-derived, pharmacist sign-off pending`. No benchmark number should be
quoted until that sign-off exists.

## Design decisions

- Groq integration uses **`@ai-sdk/groq@4.0.84`** and **`ai@7.0.173`**, matching
  `apps/harness`, not `groq-sdk`.
- Model: `openai/gpt-oss-120b` via Groq. Reasoning effort `medium`,
  concurrency `1`.
- No second LLM judge. Correctness is deterministic signals plus human review.
- Gold annotations never reach the model. The raw runner has no import path to
  the gold loader; an isolation test enforces it structurally.
- The oracle arm uses a manually curated `evidence_bundle`, not retrieval. The
  retrieval arm will be measured separately against the same questions.
- `answerable_without_corpus` and `difficulty` are reviewer decisions. They are
  now populated from corpus grounding; pharmacist sign-off is still pending.

---

## Milestone 1 — Package foundation and dataset

- Package skeleton, strict Zod schemas, JSONL loaders, validator, dataset
  hashing.
- Isolation guarantee: `loader.ts` exports only `loadQuestions*`; the gold
  loader is separate, not re-exported, not imported by the loader.
- `data/v1/` started with 30 French `DRAFT` questions and templates. No
  reference answer fabricated.

## Milestone 2 — Groq integration and raw arm

- `src/config/env.ts`, `src/config/generation.ts` (`RAW_GENERATION_V1` frozen).
- `src/prompts/raw/v1.ts` — fixed, versioned prompt; no tools, no retrieval.
- `src/providers/groq/client.ts` — injectable `GroqClient` over `@ai-sdk/groq`.
- `src/providers/groq/errors.ts` — transient vs permanent classification.
- `src/runner/cache.ts` — deterministic request hash; global cache.
- `src/runner/raw.ts` — orchestrator with retry, resume, JSONL artifacts.
- CLI: `raw run`, `raw resume`, `raw status`.

## Milestone 3 — Evaluation and human review

- Deterministic signals: fact presence, forbidden claims, numerical comparison,
  behaviour classification, safety patterns.
- `metrics.ts` with explicit denominators and `NOT_APPLICABLE` excluded, never
  counted as zero.
- Review workflow: prepare, submit, reconcile. A single review is now
  `SINGLE_REVIEW`, not `AGREED`; two reviews that differ become
  `NEEDS_HUMAN_REVIEW` with the disagreeing fields listed.
- CLI: `evaluate run`, `review prepare`, `review submit`, `summary`.

## Milestone 4 — Reporting, comparison, reproducibility

- `report.md` with experiment, generation settings, performance, errors, notes.
- `compare` with hard compatibility guards and a soft `annotations_hash` path.
- `reproduce` checklist including a secret scan over every file in the run.
- Secrets are stripped from reports; a test asserts no `gsk_` in the output.

## Milestone 5 — Dataset v1 expansion and three-arm schema

- Merged `origin/main` into `LLM_Benchmark` (additive; `origin/main` had no
  benchmark changes).
- Dataset expanded from 30 to **50 questions**: 30 `fr`, 10 `en`, 10 `ar`.
  Added ten English and ten Arabic questions plus six parallel fr/en/ar triples
  recorded in `dataset.meta.json`.
- Gold schema extended with:
  - `relevant_chunk_ids` — retrieval ground truth, same `chunk_id` the retriever
    returns;
  - `evidence_bundle` — up to 8 curated passages, each with `evidence_id`,
    `source_id`, `source_name`, `section_code`, `chunk_id`;
  - `answerable_without_corpus` and `difficulty` — reviewer decisions;
  - `reviewed_by` and `reviewed_at`.
- Validator gained cross-field rules: approved questions need a verified
  annotation, a reference answer, expected facts, an answerability decision, and
  (for corpus questions) relevant chunks; evidence passages must point at
  labelled relevant chunks; duplicate evidence or chunk ids are rejected; trap
  questions may not expect an answer.
- Stats now report `retrieval_ready_count` and `oracle_ready_count`.

## Milestone 6 — Oracle arm and correctness hardening

- `src/prompts/oracle/v1.ts` — `oracle-v1` system prompt, `CITATION_PATTERN`,
  fenced data-only evidence block. Passage order is preserved so `[E1]` is
  stable within a run.
- `src/oracle/evidence.ts` — loads non-empty bundles, `hashEvidenceBundle`
  (deterministic, order-insensitive across questions).
- `src/runner/oracle.ts` — thin wrapper over the shared runner. Questions
  without evidence are skipped and recorded, never answered empty.
- `src/runner/chat.ts` — one generic runner for both arms:
  - `SelectionMismatchError` when a run id is reused with a different selection;
  - exact `selection_hash` and `selected_question_ids` stored and guarded;
  - actual attempt counts, live vs replay token totals, failed attempts;
  - daily request/token caps via `assertDailyCapacity`, `RATE_LIMITED` status;
  - corrupt cache entries raise `CacheCorruptionError` instead of silently
    replaying garbage.
- `src/config/provenance.ts` — system prompt hash, selection hash, SDK versions,
  runtime, temperature/seed (`null` = deliberately unset), model revision.
- `src/evaluation/grounding.ts` — parses `[E#]`, checks citations against the
  supplied bundle, checks numbers against the supplied text. Advisory only.
- `evaluation/schema.ts` — optional `grounding` block, widened citation and
  faithfulness enums, `SINGLE_REVIEW` reconciliation status.
- `reporting/markdown.ts` — experiment table shows model revision, SDK, prompt
  hash, selection hash, live/replay tokens, failed attempts, evidence hash; adds
  a Grounding section for evidence arms.
- `reporting/compare.ts` — hard guards on `selection_hash`,
  `system_prompt_hash`, and `evidence_hash`; SDK mismatch warning.
- `reporting/checks.ts` — identity fields, selection count, skipped-question
  accounting.
- CLI split into focused modules under `src/cli/`; `evaluate run` owns the
  annotation hash, so the raw CLI no longer parses gold annotations.
- Bun pins raised to `1.4.5` (`bun-types`, `packageManager`); lockfile is v3.

**Gates run at this milestone**

| Gate                   | Result                                            |
| ---------------------- | ------------------------------------------------- |
| `bun run typecheck`    | pass — 66 files                                   |
| `bun run test`         | pass — 152 pass, 1 skip, 0 fail, 315 expect calls |
| `bun run lint`         | pass                                              |
| `bun run format:check` | pass                                              |
| `dataset validate`     | valid, warnings only (all `DRAFT`)                |
| `dataset stats`        | 50 total, 30 `fr` / 10 `en` / 10 `ar`, 0 scorable |

**Tests added**

- `tests/runner/selection.test.ts` — selection hash recorded, run-id reuse with
  a different selection refused, resume only re-runs unanswered questions.
- `tests/runner/rate-limit.test.ts` — daily request/token caps and UTC reset.
- `tests/oracle/oracle.test.ts` — evidence hash determinism/order, bundle
  loading, prompt shape, evidence sent, no-evidence questions skipped, cache
  identity changes with evidence.
- `tests/dataset/hash.test.ts` — `hashQuestions` order/status sensitivity,
  `hashSelection` determinism and slice identity.
- `tests/evaluation/grounding.test.ts` — citation parsing, invalid citations,
  uncited answers, unsupported numbers, summary denominators.
- `tests/evaluation/review.test.ts` — `SINGLE_REVIEW`, citation disagreement.
- `tests/reporting/compare.test.ts` — selection/prompt/evidence guards, SDK
  warning.
- Existing cache tests cover `CacheCorruptionError`.

## Milestone 7 — Corpus-grounded gold data

- All 50 questions are now `APPROVED`; all 50 annotations are `VERIFIED`.
- Authority is `tooling/embedding-lab/output/embeddings/chunks.jsonl`. Every
  `relevant_chunk_ids` entry is a real chunk id from that file.
- Every `evidence_bundle` passage is a verbatim substring of the cited chunk's
  `text`, with provenance derived from that chunk's `artifact_id` and
  `section_code`. No cleaning-lab Markdown or Postgres row was used as evidence.
- `reference_answer`, `expected_facts`, and `forbidden_claims` were derived only
  from those passages. Ungroundable topics were replaced with corpus-supported
  questions; the original language and category counts were preserved.
- The exact reviewer note on all 50 rows is
  `corpus-derived, pharmacist sign-off pending`. Structural verification is
  complete; clinical sign-off is not.
- Six parallel fr/en/ar triples were updated to grounded topics: paracetamol
  maximum daily dose, ibuprofen contraindications, clarithromycin–statin
  interaction, personal paracetamol dosing safety trap, CEBREX/celecoxib INN,
  and ACE inhibitor mechanism.
- An independent corpus check over `chunks.jsonl` covered 38 referenced chunks:
  every evidence passage is a verbatim substring of its cited chunk, every
  provenance field matches that chunk, all reference-answer `[E#]` markers and
  numbers are supported by the supplied bundle, and the language/category
  counts match the metadata. It reported 0 errors.

**Final gates run for this change**

| Gate                                                          | Result                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run --cwd packages/benchmark benchmark dataset validate` | pass — 50 approved, 0 draft, 50 annotated, 50 verified, 50 retrieval-ready, 50 oracle-ready; `questions_hash=307742edc0cfc2b1e8e56813525a786a83af29f7a394a83449192984efbf6b84`                                                                                                         |
| `bun run --cwd packages/benchmark benchmark dataset stats`    | pass — `scorable_questions: 50`; `fr 30 / en 10 / ar 10`; GMK 7 / MID 9 / DNK 7 / CAW 9 / DRI 9 / TOS 9                                                                                                                                                                                |
| `bun run typecheck`                                           | pass — 23/23 tasks; benchmark 66 files, no type errors                                                                                                                                                                                                                                 |
| `bun run test`                                                | pass — 11/11 tasks; benchmark 152 pass, 1 live smoke skip, 0 fail, 315 expect calls                                                                                                                                                                                                    |
| `bun run lint:all`                                            | **fail** — stops in `lint:architecture`: one `apps/eve/package.json` manifest-coverage finding plus 43 `frontend-form-owner` findings in `apps/mobile`; no finding in `packages/benchmark`                                                                                             |
| `bun run format:check`                                        | pass — 25/25 tasks; benchmark 75 files correctly formatted                                                                                                                                                                                                                             |
| `bunx --bun ghostinit@0.1.0 check --json`                     | **fail** — 1 blocker, 43 high, 1157 medium. Seven medium `undeclared-dependency` findings name benchmark files, but each named dependency is declared in `packages/benchmark/package.json` and the checker attributes them to `Package pharmeazor`; no benchmark architecture finding. |

The two failing gates are pre-existing, repository-wide findings outside this
change. No detector, exception, or safeguard was changed to obtain the passing
results.

---

## What is intentionally missing

- **RAG arm.** No live retrieval run is wired. The oracle arm must exist and the
  annotations must be verified first, otherwise `retrievalGap` has no stable
  ceiling to measure against. `run_mode` already accepts `"rag"` and the
  retrieval contracts live in `packages/services/src/retrieval/`.
- **Scored baseline.** The dataset is now scorable, but no `raw` or `oracle` run
  has been executed. A verified dataset is a prerequisite, not the baseline
  itself.
- **Embedding/model revision pinning beyond what Groq reports.**
  `model_revision` records the provider's response field when present; the
  benchmark cannot force a revision the provider does not expose.

## Blocked on

1. A pharmacist signs off on the 50 corpus-derived questions, evidence spans,
   and reference answers. The exact current note is
   `corpus-derived, pharmacist sign-off pending`.
2. A real `GROQ_API_KEY` for live runs. Local `.env.local` still contains
   `REPLACE_WITH_GROQ_API_KEY`.
3. Then: measure `raw`, measure `oracle`, freeze dataset v1.0, record the
   baseline, and build the RAG arm.

## Next steps

1. Pharmacist sign-off on the corpus-derived dataset
   ([`docs/dataset.md`](./docs/dataset.md), [`docs/oracle.md`](./docs/oracle.md)).
2. Record the `raw` baseline with a real `GROQ_API_KEY`.
3. Record the `oracle` baseline and compute `evidenceGain`.
4. Freeze dataset v1.0 once sign-off and both baselines exist.
5. Build `rag-fixed` (recorded retrieval traces) and then live `rag`; compute
   `retrievalGap` and `systemGain`.
6. Add the retrieval PR gate (recall@k, precision@k, MRR, nDCG@10) using the
   chunk labels already in the gold annotations.
