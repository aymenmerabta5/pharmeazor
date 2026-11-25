# Reporting, comparison and reproducibility

## Per-run outputs

Every run directory (`packages/benchmark/runs/<run_id>/`) contains:

| File                            | Producer                        | Purpose                                                        |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| `run_metadata.json`             | `raw`/`oracle` run and resume   | experiment config, identity, provenance, cumulative usage      |
| `responses.jsonl`               | `raw`/`oracle` run              | one line per answered question, with cache_key, usage, latency |
| `errors.jsonl`                  | `raw`/`oracle` run              | one line per failed question (bounded retry) with error class  |
| `evaluation.jsonl`              | `evaluate run`, `review submit` | deterministic signals + human score                            |
| `summary.json`                  | `summary`, `report`             | aggregated metrics with explicit denominators                  |
| `report.md`                     | `summary`, `report`             | human-readable experiment report                               |
| `review/review_template.jsonl`  | `review prepare`                | review worksheet to fill in                                    |
| `review/review_primary.jsonl`   | reviewer                        | filled primary review (authored externally)                    |
| `review/review_secondary.jsonl` | reviewer                        | optional second review for reconciliation                      |

The oracle arm writes the same artifacts in the same layout, with
`run_mode: "oracle"` and `evidence_hash` in the metadata. Only questions with a
non-empty bundle are sent; the rest are listed in `skipped_question_ids`.

The RAG arm writes the same layout with `run_mode: "rag"`,
`retrieval_config_hash`, and `evidence_hash` set to the retrieval trace hash. The
trace itself is a dataset artifact at `data/v1/retrieval-trace.jsonl`; the
deterministic gate writes `runs/retrieval-metrics.json` and compares against
`runs/retrieval-baseline.json`.

## Report structure (`report.md`)

1. **Experiment** — run id, dates, status, run mode, model, model revision,
   provider, provider SDK versions, prompt version, system prompt hash, dataset
   version + hash, selection hash, selected/skipped counts, annotations hash,
   evidence hash (oracle only), reasoning effort, temperature, seed, git sha,
   question and request counts, API calls, failed attempts, cache hits, live and
   replayed token totals, average latency.
2. **Generation settings** — the exact `generation` block used.
3. **Performance** — overall, by category, by therapeutic class. Every
   percentage is written as `n/d (pct)`. When the denominator is zero the
   cell shows `N/A (0)`, never `0%`. When `human_reviewed = 0` a prominent
   banner appears stating that no review has been submitted.
4. **Grounding** — evidence arms only: responses with a bundle, responses
   citing at least one passage, uncited answers, parsed citations, invalid
   citations, citation validity rate, and unsupported numbers. Deterministic
   only; the human verdict still governs.
5. **Error analysis** — failed requests (bounded to 5) and representative
   answer-quality failures (bounded to 5), each listing the question, the
   model response, expected vs detected behavior, and the human score if
   available.
6. **Notes** — denominators, NOT_APPLICABLE handling, and arm-specific
   limitations.

**Secrets are never written to the report.** `reporting/markdown.ts`
strips any string matching `gsk_[A-Za-z0-9_-]{10,}` from the rendered body
before writing, and a unit test asserts the rendered report contains no
`gsk_` and no `GROQ_API_KEY=`.

## Comparison (`benchmark compare`)

Before any delta is shown, every one of these must match between the two
runs:

- `model_id`
- `provider`
- `prompt_version`
- `reasoning_effort`
- `dataset_version`
- `dataset_hash`
- `total_questions`
- `run_mode` (`raw | oracle | rag`)
- `generation` (whole object)
- `selection_hash` when both runs recorded one
- `system_prompt_hash` when both runs recorded one
- `evidence_hash` when either run is an oracle run
- `annotations_hash` when both runs recorded one

If any check fails, the comparison is **refused**: the tool exits non-zero
and prints the failed checks. Only when every check passes does the tool
show the summary delta table and the per-question delta table.

Missing fields degrade to warnings rather than hard failures, because older
runs predate them:

| Missing field                    | Behaviour                                |
| -------------------------------- | ---------------------------------------- |
| `selection_hash`                 | warn; the exact slice is unverified      |
| `provenance.system_prompt_hash`  | warn; only the version label is compared |
| `evidence_hash` on an oracle run | warn; evidence compatibility unverified  |
| `annotations_hash`               | warn; annotation set unverified          |

An SDK version mismatch is a warning, not a refusal: the run is still
comparable, but the upgrade is an uncontrolled variable. The report records the
SDK versions so the difference is visible.

**The model or provider is never switched on the user's behalf.** A 429 or
outage is reported, not worked around by swapping to another provider.

## Reproducibility (`benchmark reproduce`)

Runs this checklist against the run directory:

| Check                                                   | What fails it                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| required metadata fields present                        | any required `RunMetadata` field is undefined                      |
| run identity recorded (selection + prompt provenance)   | `selection_hash`, `selected_question_ids`, or `provenance` missing |
| selected question count matches metadata                | `selected_question_ids.length !== total_questions`                 |
| cumulative_usage recorded                               | `cumulative_usage` is missing                                      |
| every selected question accounted for                   | `responses + errors + skipped !== total_questions`                 |
| every response has a cache_key                          | a response is missing `cache_key`                                  |
| every evaluation record has content + annotation hashes | an evaluation record is missing either hash                        |
| summary.json present                                    | the file is absent                                                 |
| no API key or secret in run directory files             | `gsk_...` or `GROQ_API_KEY=` appears in any text file              |

A passing run prints `reproducibility: PASS` and exits 0. Any failure
prints the failing checks and exits 1.

## Cache replay guarantee

Two identical invocations (same question, same generation config, same prompt
version, same mode, same rendered user message) make **one live API call** and
then **zero** on the second run: the second run reads from `.cache/` and reports
`api_calls: 0, cache_hits: 1`. This is enforced in code and covered by tests in
`tests/runner/raw.test.ts`.

A corrupt cache file is not silently replayed. `readCache` raises
`CacheCorruptionError` and the run fails loudly, because a corrupted response is
worse than a repeated call.

## API usage auditability

`run_metadata.json` records cumulative usage, split so a replay is not
mistaken for live spend:

```json
"cumulative_usage": {
  "api_calls": 1,
  "failed_attempts": 0,
  "cache_hits": 0,
  "prompt_tokens": 100,
  "completion_tokens": 200,
  "total_tokens": 300,
  "live_prompt_tokens": 100,
  "live_completion_tokens": 200,
  "live_total_tokens": 300,
  "replay_total_tokens": 0
}
```

`failed_attempts` counts HTTP attempts that consumed a request slot but did not
produce an answer (429 or 5xx). Daily request and token caps are enforced before
each call; when a cap is reached the run stops with status `RATE_LIMITED` and
the unanswered questions remain resumable.

## Identity and provenance

`run_metadata.json` also stores exactly what made the experiment:

| Field                             | Meaning                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `selection_hash`                  | SHA-256 over the selected question ids, in run order       |
| `selected_question_ids`           | the exact ids, so a resume can rebuild the slice           |
| `skipped_question_ids`            | questions excluded because no oracle evidence was supplied |
| `evidence_hash`                   | SHA-256 over the oracle bundle (oracle runs only)          |
| `provenance.system_prompt_hash`   | SHA-256 of the exact system prompt text                    |
| `provenance.temperature` / `seed` | `null` means deliberately unset, not unknown               |
| `provenance.model_revision`       | provider-reported revision, when the provider reports one  |
| `provenance.sdk`                  | `ai` and `@ai-sdk/groq` versions                           |
| `provenance.runtime`              | Bun, Node, and platform versions                           |

A run id is also guarded at resume time: reusing a run id with a different
selection of the same size throws `SelectionMismatchError` instead of merging
two experiments.
