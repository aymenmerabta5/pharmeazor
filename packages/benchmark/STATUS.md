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

## Phase 3 (Prompt 4) — Evaluation and Human Review — NOT STARTED

## Phase 4 (Prompt 5) — Reporting and Reproducibility — NOT STARTED
