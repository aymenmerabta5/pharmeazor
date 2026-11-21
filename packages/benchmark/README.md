# @repo/benchmark

LLM benchmark package for PHARMEAZOR. Measures the raw professor-approved model
(`openai/gpt-oss-120b` via Groq) on a versioned, human-reviewed question set,
without any PHARMEAZOR corpus or retrieval.

The package is **independent** of the production app, `@repo/api`, and the
retrieval labs under `tooling/`. It is a workspace member that can be run
standalone.

## Status

See [`STATUS.md`](./STATUS.md). This package is currently at **Prompt 2** —
package foundation and dataset only. Groq integration, raw-model runs,
evaluation, reporting and comparison are later phases.

## Requirements

- Bun `1.4.4` (matches the root `packageManager` pin)
- Node `24.19.0` (matches `engines.node` in `apps/harness`)
- No API key is needed for Prompt 2. `GROQ_API_KEY` is required from Prompt 3.

## Layout

    data/v1/                     versioned benchmark dataset (DRAFT)
    docs/dataset.md              dataset format and reviewer workflow
    src/dataset/                 schemas, loaders, validators, hashing
    src/shared/                  small shared utilities
    src/cli/                     CLI entry (dataset validate/stats)
    tests/dataset/               unit tests, including the isolation tests

## Commands

    bun run test                 # unit tests (mocked, no API)
    bun run typecheck
    bun run lint
    bun run format:check
    bun run benchmark dataset validate
    bun run benchmark dataset stats
    bun run benchmark raw run   --allow-draft --limit 1
    bun run benchmark raw run   --category DOSAGE_AND_NUMERICAL_KNOWLEDGE
    bun run benchmark raw resume --run-id <ID>
    bun run benchmark raw status [--run-id <ID>]
    bun run benchmark evaluate run --run-id <ID>
    bun run benchmark review prepare --run-id <ID>
    bun run benchmark review submit --run-id <ID> --reviewer <name> --file <path>
    bun run benchmark summary --run-id <ID>
    bun run benchmark report --run-id <ID>
    bun run benchmark compare --run-a <ID> --run-b <ID>
    bun run benchmark reproduce --run-id <ID>

Live smoke test (consumes Groq quota, only when explicitly authorized):

    $env:BENCHMARK_LIVE="1"
    bun --env-file=.env.local run --cwd packages/benchmark test tests/smoke

## Raw model run

- Model: `openai/gpt-oss-120b` via Groq (`@ai-sdk/groq`)
- Reasoning effort: `medium`
- Concurrency: `1`
- Prompt: fixed system prompt v1, one user message per question
- Input: **questions.jsonl only**. No gold annotations, no PHARMEAZOR
  corpus, no retrieval.
- Output per question: `responses.jsonl` line with the visible answer,
  token usage, latency, finish reason.
- Failures: bounded retry (3 attempts, exponential backoff) on transient
  errors only. Permanent errors are recorded and the next question runs.
- Cache: global, keyed on model + prompt version + system prompt + question
  - generation config. Resume and re-runs reuse cached responses.

`raw run` refuses to start when no question is `APPROVED`, unless
`--allow-draft` is passed. `--allow-draft` runs are tagged in
`run_metadata.json` and must not be scored.

Live smoke test (consumes Groq quota):

    $env:BENCHMARK_LIVE="1"
    bun --env-file=.env.local run --cwd packages/benchmark test tests/smoke

## Dataset model

Two files, both versioned under `data/v1/`:

- `questions.jsonl` — the **only** file the raw benchmark runner will send to the model.
- `gold_annotations.jsonl` — reference answers and evaluation criteria. **Never** sent to the model.

The raw runner path structurally cannot load gold annotations: see
`src/dataset/loader.ts` (exports only `loadQuestions`) versus
`src/dataset/gold-loader.ts` (not re-exported from `src/index.ts` and
not imported by `loader.ts`). `tests/dataset/isolation.test.ts` enforces this.

## Current state

All 30 questions and all 30 gold annotations are `DRAFT`. No question is
scorable until a pharmacist sets `review_status: "APPROVED"` on the question
**and** `verification_status: "VERIFIED"` on its annotation, with a real
`reference_answer` and non-empty `expected_facts`.

## What is not implemented yet (by design)

- Groq integration, model selection, prompt versioning (Prompt 3)
- Raw-model runner, caching, resume (Prompt 3)
- LLM scoring, deterministic rubric, human review interface (Prompt 4)
- Reports, run comparison, reproducibility checks (Prompt 5)

## Environment

- `BENCHMARK_LOG_LEVEL` (optional, default `info`): `debug | info | warn | error`
- `GROQ_API_KEY` (Prompt 3 onwards, already declared in the root `.env.example`)

CLI usage from the repo root requires the root `.env.local` to be loaded for
Prompt 3 and later:

    bun --env-file=.env.local run --cwd packages/benchmark benchmark raw run

## Known limitations (Prompt 2)

- The 30 shipped questions are realistic pharmacist-relevant prompts but **every
  gold annotation is a template with `reference_answer: null`** and every
  question is `DRAFT`. A pharmacist must fill them in. No medical fact has been
  invented by this package.
- No Arabic question is included in v1 (language enum supports `ar`, but v1
  contains none). Adding `ar` questions is an additive change to `data/v2/`.
- The validator refuses to score DRAFT questions; this is intentional.

See [`docs/dataset.md`](./docs/dataset.md) for the full data model and reviewer workflow.

## Reporting and comparison

Each run produces `responses.jsonl`, `errors.jsonl`, `run_metadata.json`,
`evaluation.jsonl`, `summary.json`, and `report.md` inside
`packages/benchmark/runs/<run_id>/`. See [`docs/reporting.md`](./docs/reporting.md)
for structure, comparison rules, and reproducibility checks.

The report never contains the API key: the generator strips `gsk_...`
substrings and a test asserts the rendered output has none.

Comparing two runs is refused unless `model_id`, `provider`,
`prompt_version`, `reasoning_effort`, `dataset_version`, `dataset_hash`,
`total_questions`, `run_mode`, and the full `generation` block are
identical. When both runs recorded an `annotations_hash`, that must match
too; if one or both pre-Phase-5 runs lack the field, the tool warns but
still compares.
