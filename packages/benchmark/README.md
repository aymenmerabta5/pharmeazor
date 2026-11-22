# @repo/benchmark

Three-arm LLM benchmark for PHARMEAZOR. It measures the same model on the same
human-reviewed questions under three evidence conditions:

| Arm      | Input to the model                       | Status                       |
| -------- | ---------------------------------------- | ---------------------------- |
| `raw`    | the question only                        | implemented                  |
| `oracle` | the question + a curated evidence bundle | implemented, awaiting review |
| `rag`    | the question + PHARMEAZOR retrieval      | deferred                     |

The deltas are the point, not any single score:

```text
evidenceGain = oracle − raw   how much perfect evidence is worth
retrievalGap = oracle − rag   how much retrieval loses versus perfect evidence
systemGain   = rag − raw      how much the full system adds over the model alone
```

`oracle` is the ceiling, not a product claim. If `rag` is close to `oracle`,
retrieval is doing its job; the gap is the headroom left on the table.

The package is **independent** of the production app, `@repo/api`, and the
retrieval code under `packages/modules`. It is a workspace member that can run
standalone. The future `rag` arm will call the retrieval adapter through a
recorded interface; it will not import app internals into the benchmark core.

## Status

See [`STATUS.md`](./STATUS.md). The package is at **benchmark v1, corpus-grounded
and scorable**: all 50 questions are `APPROVED` and all 50 annotations are
`VERIFIED`, so `dataset stats` reports `scorable_questions: 50`. Every answer,
fact, retrieval label, and oracle passage is derived from
`tooling/embedding-lab/output/embeddings/chunks.jsonl` using real chunk ids and
verbatim text. Each row carries the reviewer note `corpus-derived, pharmacist
sign-off pending`. Live `raw` and `oracle` baselines have been recorded and are
documented in [`runs/PROVISIONAL_BASELINES.md`](./runs/PROVISIONAL_BASELINES.md),
but no number should be quoted as a clinical result until a pharmacist signs
off.

## Requirements

- Bun `1.4.5` (matches the repository pin; local `1.4.4` also runs the tests)
- Node `24.19.0` (matches `engines.node` in `apps/harness`)
- `GROQ_API_KEY` for live runs; unit tests and dataset validation need none

## Layout

    data/v1/                     versioned dataset (questions + gold annotations)
    docs/dataset.md              dataset format and reviewer workflow
    docs/oracle.md               evidence-bundle authoring and the [E#] contract
    docs/evaluation.md           deterministic rubric, human review, metrics
    docs/reporting.md            run artifacts, comparison, reproducibility
    src/dataset/                 schemas, loaders, validators, hashing
    src/prompts/                 versioned system prompts (raw-v1, oracle-v1)
    src/providers/groq/          SDK adapter and error classification
    src/runner/                  shared runner, raw arm, oracle arm, cache, limits
    src/oracle/                  evidence-bundle loading and hashing
    src/evaluation/              deterministic signals, grounding, review, metrics
    src/reporting/               markdown report, comparison, reproducibility
    src/config/                  generation settings, env, provenance
    src/cli/                     command modules and dispatcher
    tests/                       unit tests, including isolation tests

## Commands

    bun run test                 # unit tests (mocked, no API)
    bun run typecheck
    bun run lint
    bun run format:check

    bun run benchmark dataset validate
    bun run benchmark dataset stats

    bun run benchmark raw run      [--category <CAT>] [--limit <N>] [--allow-draft]
    bun run benchmark raw resume   --run-id <ID>
    bun run benchmark raw status   [--run-id <ID>]

    bun run benchmark oracle run   [--category <CAT>] [--limit <N>] [--allow-draft]
    bun run benchmark oracle resume --run-id <ID>

    bun run benchmark evaluate run --run-id <ID> [--force]
    bun run benchmark review prepare --run-id <ID>
    bun run benchmark review submit --run-id <ID> --reviewer <name> --file <path>
    bun run benchmark summary --run-id <ID>
    bun run benchmark report --run-id <ID>
    bun run benchmark compare --run-a <ID> --run-b <ID>
    bun run benchmark reproduce --run-id <ID>

Live smoke test (consumes Groq quota, only when explicitly authorized):

    $env:BENCHMARK_LIVE="1"
    bun --env-file=../../.env.local run test tests/smoke

## Raw arm

- Model: `openai/gpt-oss-120b` via Groq (`@ai-sdk/groq`)
- Reasoning effort: `medium`; concurrency: `1`
- Prompt: fixed `raw-v1` system prompt, one user message per question
- Input: **`questions.jsonl` only**. No gold annotations, no evidence, no
  retrieval. The runner has no code path to the gold loader.
- Temperature and seed are deliberately unset; `run_metadata.json` records both
  as `null` to distinguish "unset" from "unknown".
- Failures: bounded retry (3 attempts, exponential backoff) on transient errors
  only. Permanent errors are recorded and the next question runs.
- Cache: keyed on model + prompt version + system prompt + user message +
  generation config. Resume and re-runs reuse cached responses but label them
  `source: "cache"`.

`raw run` refuses to start when no question is `APPROVED` unless `--allow-draft`
is passed. `--allow-draft` runs are tagged in `run_metadata.json` and must not
be scored.

## Oracle arm

The oracle arm gives the model a small, curated bundle of evidence passages and
asks it to answer from that evidence with `[E1]`-style citations. The bundles are
corpus-derived, not retrieved at run time, and are pending pharmacist sign-off.
See [`docs/oracle.md`](./docs/oracle.md).

- Only questions with a non-empty `evidence_bundle` are sent. Questions without
  evidence are recorded in `skipped_question_ids`, never answered with an empty
  bundle.
- `evidence_hash` covers the exact bundle text, so two oracle runs over
  different evidence cannot compare as the same experiment.
- The deterministic layer checks mechanical grounding only: cited markers exist
  in the bundle, and numbers in the answer appear in the bundle. A human still
  owns the citation and faithfulness verdict.

## Dataset model

Two files, both versioned under `data/v1/`:

- `questions.jsonl` — the **only** file the model-facing runners may load.
- `gold_annotations.jsonl` — reference answers, expected facts, retrieval labels,
  and oracle evidence. **Never** sent to the model.

`src/dataset/loader.ts` exports only `loadQuestions*`. The gold loader is a
separate module, not re-exported from `src/index.ts`, and not imported by the
loader or the raw runner. `tests/dataset/isolation.test.ts` enforces this
structurally (it inspects imports, not just runtime behaviour).

The gold schema carries both retrieval ground truth (`relevant_chunk_ids`) and
oracle input (`evidence_bundle`). Keeping them separate lets the retrieval gate
and the oracle arm disagree for the right reasons instead of silently sharing
one list. `answerable_without_corpus` and `difficulty` are now populated for all
50 rows from the corpus-grounding review; pharmacist sign-off is still pending.

## Identity and provenance

Every run records enough identity to make a comparison honest:

- `dataset_hash` — the whole questions file
- `selection_hash` + `selected_question_ids` — the exact slice a run saw, in
  order. Two different `--category`/`--limit` slices of equal size are not the
  same experiment.
- `system_prompt_hash` — the prompt text, not just its version label
- `evidence_hash` — the exact oracle bundle (oracle runs only)
- `annotations_hash` — written by `evaluate run` from the gold file actually used
- `sdk` + `runtime` + `model_revision` — the moving parts outside the prompt

`compare` refuses to show deltas when identity fields disagree and warns when a
field is missing. Run ids are also guarded: reusing a run id with a different
selection of the same size throws `SelectionMismatchError`.

## Current state

All 50 questions are `APPROVED`, all 50 gold annotations are `VERIFIED`, and
all 50 rows are scorable:

| Language | Questions |
| -------- | --------- |
| `fr`     | 30        |
| `en`     | 10        |
| `ar`     | 10        |

There are six parallel fr/en/ar triples for cross-language comparison; see
`data/v1/dataset.meta.json`. Every annotation has a corpus-derived
`reference_answer`, non-empty `expected_facts`, real `relevant_chunk_ids`, and a
verbatim `evidence_bundle`. The exact reviewer note is `corpus-derived,
pharmacist sign-off pending`: structural verification is complete, but clinical
sign-off is still required before any score is interpreted. The `raw` and
`oracle` arms have each completed 50/50 live responses with zero failures;
their human review count is still zero, so the scored deltas remain pending.

## Environment

- `BENCHMARK_LOG_LEVEL` (optional, default `info`): `debug | info | warn | error`
- `GROQ_API_KEY` — required for live runs, declared in the root `.env.example`

From the repository root:

    bun --env-file=.env.local run --cwd packages/benchmark benchmark raw run

## Known limitations

- **Pharmacist sign-off is pending.** The data is corpus-grounded and scorable,
  but the exact reviewer note is `corpus-derived, pharmacist sign-off pending`.
  `dataset validate` passes with zero errors; four intentional
  `TRAP_EXPECTS_ANSWER` warnings remain because the curated evidence directly
  answers those rows. That is a structural result, not a clinical endorsement,
  and both live runs are provisional.
- **No RAG arm yet.** `run_mode` already distinguishes `raw | oracle | rag`, and
  the retrieval contracts exist upstream, but no live retrieval run is wired.
  The RAG arm is deferred until the oracle arm and the annotation schema are
  stable.
- **No LLM judge.** Correctness is deterministic signals plus human review. The
  deterministic layer is advisory and conservative by design.
- **Provider outages are reported, never worked around.** No silent model or
  provider switching.
- **`dataset validate` is not a medical review.** It checks structure and
  cross-field consistency, not whether a dose is correct.

See [`docs/dataset.md`](./docs/dataset.md) for the data model and reviewer
workflow, and [`docs/evaluation.md`](./docs/evaluation.md) for the rubric.
