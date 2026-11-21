# Implementation Status — @repo/benchmark

## Design decisions

- Groq integration uses **`@ai-sdk/groq@4.0.84`** (matching `apps/harness`),
  not `groq-sdk`. Confirmed by project owner.
- Model: `openai/gpt-oss-120b` via Groq.
- Reasoning effort: `medium`. Concurrency: `1`.
- One runtime dependency added (`@ai-sdk/groq`), plus `ai@7.0.173` (matches
  `apps/harness`).

---

## Phase 1 (Prompt 2) — Package Foundation and Benchmark Dataset — COMPLETE

- Package skeleton, Zod schemas with `.strict()`, JSONL loaders, validator,
  dataset hashing.
- Isolation guarantee: `loader.ts` exports only `loadQuestions*`; the gold
  loader is a separate module, not re-exported from the barrel, not imported
  by the loader. Covered by `tests/dataset/isolation.test.ts`.
- `data/v1/` with 30 DRAFT questions and 30 DRAFT gold-annotation stubs.
  No reference answers fabricated.
- 35 tests, all green. Typecheck, lint and format clean.

---

## Phase 2 (Prompt 3) — Groq Integration and Raw Model Runner — COMPLETE

**Delivered:**

- `src/config/env.ts` — reads `GROQ_API_KEY`, throws `MissingEnvError` if absent.
- `src/config/generation.ts` — `RAW_GENERATION_V1` (frozen): model
  `openai/gpt-oss-120b`, reasoning effort `medium`, concurrency `1`,
  `max_output_tokens: 2048`. Temperature deliberately **not** set until
  compatibility is verified.
- `src/prompts/raw/v1.ts` — fixed, versioned system prompt. No JSON forcing,
  no tools, no retrieval. Same prompt for every question.
- `src/providers/groq/client.ts` — `GroqClient` interface + implementation on
  `@ai-sdk/groq`. Injectable so tests use fakes. Captures `text`,
  `usage.{input,output,total}Tokens`, `finishReason`, `request_id`, latency.
- `src/providers/groq/errors.ts` — transient vs permanent classification
  based on `APICallError` status codes and `isRetryable`.
- `src/runner/cache.ts` — deterministic SHA-256 request hash over model ID,
  prompt version, system prompt, question and full generation config. Global
  cache at `.cache/<prefix>/<hash>.json`.
- `src/runner/raw.ts` — orchestrator. Loads approved questions only (or all
  when `--allow-draft`). Skips questions already answered. Retries transient
  errors up to 3 times with exponential backoff (500 ms, 1500 ms, 4500 ms).
  Writes `responses.jsonl` / `errors.jsonl` per question and `run_metadata.json`
  at start and end. Cache hit path writes `source: "cache"`.
- `src/storage/fs.ts` — atomic writes for `run_metadata.json`, append-only
  JSONL for responses and errors, resume-safe reader.
- CLI: `benchmark raw run` (with `--category`, `--limit`, `--allow-draft`),
  `benchmark raw resume --run-id`, `benchmark raw status [--run-id]`.
- Tests:
  - `errors.test.ts` — every class boundary
  - `cache.test.ts` — determinism and every axis that should change the key
  - `raw.test.ts` — no-approved-questions refusal, `--allow-draft`, one-call
    per question, response persistence, cache reuse, transient retry to
    exhaustion, error recording
  - `smoke/live.test.ts` — gated by `BENCHMARK_LIVE=1`

**Verified locally:** `bun run test`, `bun run typecheck`, `bun run lint`,
`bun run format:check` all green. `dataset validate` unchanged.

**Not implemented yet (intentional):**

- Evaluation metrics (Prompt 4)
- Human review workflow (Prompt 4)
- Reporting, run comparison, reproducibility checks (Prompt 5)
- PHARMEAZOR corpus, retrieval, evidence-grounded or RAG experiments

**Known constraints:**

- `providerOptions.groq.reasoningEffort` is set based on current SDK
  expectations. If the installed `@ai-sdk/groq` rejects or ignores it,
  remove it in `src/providers/groq/client.ts` (single location). The
  experiment still records `reasoning_effort` in `run_metadata.json`.
- `raw run` with no `--allow-draft` refuses when zero questions are
  `APPROVED`. This is the designed gate, not a defect.

---

---

## Phase 3 (Prompt 4) — Evaluation and Human Review — COMPLETE

**Delivered:**

- `src/evaluation/schema.ts` — Zod schemas for deterministic signals, human
  scores, reconciliation status, and evaluation records.
- `src/evaluation/text-normalize.ts` — accent/case/whitespace normalization
  shared by fact matching and safety detection.
- `src/evaluation/numerical.ts` — `(number, unit)` extraction (French
  thousand separator, comma decimals) and unit-grouped comparison producing
  correct / wrong_value / missed / unsupported.
- `src/evaluation/behavior.ts` — phrase-list detection of ANSWER,
  LIMITED_ANSWER, ABSTAIN, ASK_CLARIFICATION, REFUSE_OUT_OF_SCOPE.
- `src/evaluation/safety.ts` — flags for diagnosis, treatment selection,
  patient-specific advice, and uncertainty acknowledgment.
- `src/evaluation/rubric.ts` — `computeDeterministicSignals` combining all
  the above into one record.
- `src/evaluation/metrics.ts` — `computeSummary` with explicit denominators
  on every percentage; `null` when denominator is 0; `NOT_APPLICABLE` is
  excluded from denominators, never counted as zero.
- `src/evaluation/storage.ts` — `evaluation.jsonl` reader/writer;
  `mergeHumanScore`.
- `src/evaluation/review.ts` — review template builder, submit and reconcile
  logic (flags disagreements as `NEEDS_HUMAN_REVIEW`).
- CLI: `benchmark evaluate run`, `benchmark review prepare`,
  `benchmark review submit`, `benchmark summary`.
- Tests: `numerical.test.ts`, `behavior.test.ts`, `rubric.test.ts`,
  `metrics.test.ts`, `review.test.ts`.
- `docs/evaluation.md` — full rubric, review workflow, and metric definitions.

**Constraints from the professor, enforced:**

- No second LLM judge. Correctness is deterministic signals + human review.
- Raw responses are never modified by the evaluator.
- `citation_accuracy` and `evidence_faithfulness` are `NOT_APPLICABLE` in
  this stage and never folded into any rate.
- Gold annotations are loaded **only** by `evaluate run`, `review prepare`,
  and tests. The raw runner path still has no path to gold.

**Not implemented (intentional):** reports, run comparison, reproducibility
checks. Those are Prompt 5.

---

## Phase 4 (Prompt 5) — Reporting, Reproducibility and Final Validation — COMPLETE

**Delivered:**

- `src/reporting/markdown.ts` — `report.md` generator with the exact
  sections Prompt 5 requires. Every percentage is written as `n/d (pct)`,
  never as a bare rate. Zero-denominator cells are `N/A (0)`.
- `src/reporting/compare.ts` — `compareRuns` with hard compatibility guards
  (model, provider, prompt version, reasoning effort, dataset version, dataset
  hash, total questions, run mode, full generation config) plus a soft
  `annotations_hash` check with a warning path for older runs.
- `src/reporting/checks.ts` — reproducibility checklist including a secret
  scan (`gsk_...` and `GROQ_API_KEY=`) over every text file in the run
  directory.
- CLI: `benchmark report --run-id`, `benchmark compare --run-a --run-b`,
  `benchmark reproduce --run-id`. `benchmark summary` now also writes
  `report.md` automatically.
- `raw run` / `raw resume` now record `annotations_hash` in
  `run_metadata.json` (computed by the CLI, passed as a string to the
  runner; `raw.ts` never imports the gold loader).
- `run_mode` field added to `RunMetadata` (default `"raw"`) so evidence-
  grounded and RAG stages can reuse the tooling later without breaking
  comparisons.
- Tests: `tests/reporting/markdown.test.ts` (report structure, no secrets,
  N/A for unreviewed), `tests/reporting/compare.test.ts` (compatible,
  every hard guard, warnings path), `tests/reporting/checks.test.ts`
  (complete run, missing usage, count mismatch, secret leak).
- Extended `tests/dataset/isolation.test.ts` with one more assertion that
  `src/runner/raw.ts` does not import the gold loader.

**Professor's usage rules — now fully enforced:**

- **Secrets never in reports**: the markdown generator strips `gsk_...`
  and a test asserts no `GROQ_API_KEY=` in the rendered body. The
  reproducibility check fails the run if any file under the run directory
  contains either pattern.
- **API call count and token totals in the report**: present in the
  Experiment table, sourced from `cumulative_usage`.
- **Cache replay**: documented, tested, and reported (`API calls` /
  `Cache hits` rows).
- **No provider or model switching on outage**: not implemented because
  it must not be — the tool reports failures, never works around them.
- **Arabic legal-term verification**: noted in `docs/reporting.md` for the
  future evidence phase. No Arabic question ships in v1.

**Not implemented (final state):** evidence-grounded benchmarking and
end-to-end RAG benchmarking. `run_mode` and `annotations_hash` are the only
hooks added; no empty folders or speculative modules exist.

**Final known limitations:**

- The shipped dataset is all `DRAFT`. A pharmacist must approve questions
  and verify annotations before the runner will score anything in a
  non-`--allow-draft` run.
- The deterministic rubric is intentionally conservative; the human review
  is the authoritative score. No LLM judge.
- Live smoke tests require `BENCHMARK_LIVE=1` and consume real quota.

---

## Final status: Prompt 5 complete

All five phases of the professor-approved benchmark plan are delivered:
package foundation (P2), Groq raw runner (P3), deterministic evaluation
plus human review (P4), and reporting, comparison and reproducibility (P5).
The package is independent of PHARMEAZOR's corpus and retrieval, and is
ready for later evidence-grounded and RAG stages.
