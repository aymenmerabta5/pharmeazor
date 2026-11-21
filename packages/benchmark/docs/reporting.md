# Reporting, comparison and reproducibility

## Per-run outputs

Every run directory (`packages/benchmark/runs/<run_id>/`) contains:

| File                            | Producer                        | Purpose                                                        |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| `run_metadata.json`             | `raw run`, `raw resume`         | experiment config + cumulative usage                           |
| `responses.jsonl`               | `raw run`                       | one line per answered question, with cache_key, usage, latency |
| `errors.jsonl`                  | `raw run`                       | one line per failed question (bounded retry)                   |
| `evaluation.jsonl`              | `evaluate run`, `review submit` | deterministic signals + human score                            |
| `summary.json`                  | `summary`, `report`             | aggregated metrics with explicit denominators                  |
| `report.md`                     | `summary`, `report`             | human-readable experiment report                               |
| `review/review_template.jsonl`  | `review prepare`                | review worksheet to fill in                                    |
| `review/review_primary.jsonl`   | reviewer                        | filled primary review (must be authored externally)            |
| `review/review_secondary.jsonl` | reviewer                        | optional second review for reconciliation                      |

## Report structure (`report.md`)

1. **Experiment** — run id, dates, model, provider, prompt version, dataset
   version + hash, annotations hash, reasoning effort, git sha, question
   counts, request counts, API calls, cache hits, token totals, average
   latency.
2. **Generation settings** — the exact `generation` block used.
3. **Performance** — overall, by category, by therapeutic class. Every
   percentage is written as `n/d (pct)`. When the denominator is zero the
   cell shows `N/A (0)`, never `0%`. When `human_reviewed = 0` a prominent
   banner appears stating that no review has been submitted.
4. **Error analysis** — failed requests (bounded to 5) and representative
   answer-quality failures (bounded to 5), each listing the question, the
   model response, expected vs detected behavior, and the human score if
   available.
5. **Notes** — denominators, NOT_APPLICABLE handling, raw-stage limitations.

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
- `run_mode`
- `generation` (whole object)

Additional check when both runs have `annotations_hash`:

- `annotations_hash`

If any check fails, the comparison is **refused**: the tool exits non-zero
and prints the failed checks. Only when every check passes does the tool
show the summary delta table and the per-question delta table.

If one or both runs lack `annotations_hash` (pre-Phase-5 runs), the tool
warns but still compares. This is a deliberate escape hatch for existing
runs; new runs always record the field.

**The model or provider is never switched on the user's behalf.** A 429 or
outage is reported, not worked around by swapping to another provider.

## Reproducibility (`benchmark reproduce`)

Runs this checklist against the run directory:

| Check                                                   | What fails it                                          |
| ------------------------------------------------------- | ------------------------------------------------------ |
| required metadata fields present                        | any of the required `RunMetadata` fields is undefined  |
| cumulative_usage recorded                               | `cumulative_usage` is missing                          |
| every selected question accounted for                   | `responses.length + errors.length !== total_questions` |
| every response has a cache_key                          | a response is missing `cache_key`                      |
| every evaluation record has content + annotation hashes | an evaluation record is missing either hash            |
| summary.json present                                    | the file is absent                                     |
| no API key or secret in run directory files             | `gsk_...` or `GROQ_API_KEY=` appears in any text file  |

A passing run prints `reproducibility: PASS` and exits 0. Any failure
prints the failing checks and exits 1.

## Cache replay guarantee

Two identical `raw run` invocations (same question, same generation config,
same prompt version) make **one live API call** and then **zero** on the
second run: the second run reads from `.cache/` and reports
`api_calls: 0, cache_hits: 1`. This is enforced in code and covered by a
test in `tests/runner/raw.test.ts`. Prompt 5's report surfaces this in the
`API calls` / `Cache hits` rows so a reviewer can see it in the artifact.

## API usage auditability

`run_metadata.json` records the cumulative usage of every run:

```json
"cumulative_usage": {
  "api_calls": 1,
  "cache_hits": 0,
  "prompt_tokens": <n>,
  "completion_tokens": <n>,
  "total_tokens": <n>
}
```
