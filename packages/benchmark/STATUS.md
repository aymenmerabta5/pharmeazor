# Implementation Status — @repo/benchmark

_Last updated: 2026-11-23_

## Current state

The package implements the first two arms of the three-arm benchmark and the
evaluation, review, reporting, and reproducibility tooling around them. The RAG
arm is deliberately not built yet; the annotations, oracle baseline, and dataset
sign-off that it depends on are now stable.

| Area                          | State                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Dataset                       | 50 questions, 30 `fr` / 10 `en` / 10 `ar`, all `APPROVED` and signed off               |
| Gold annotations              | 50 `VERIFIED` corpus-derived annotations with reconciled sign-off fields               |
| Raw arm (`raw`)               | implemented, tested, live run reviewed (single review)                                 |
| Oracle arm (`oracle`)         | implemented, tested, curated bundles populated, live run reviewed (single review)      |
| RAG arm (`rag`)               | **not implemented** — deferred workstream; `retrievalGap` and `systemGain` remain null |
| Deterministic evaluation      | implemented, advisory only                                                             |
| Human review + reconciliation | implemented; 100/100 current responses scored once                                     |
| Reporting / comparison        | implemented with identity guards; raw/oracle `compare` refusal is expected             |
| Live runs                     | raw and oracle baselines completed, reviewed, and recorded with 0 failures per arm     |

`dataset stats` reports `scorable_questions: 50`. Every question, fact, retrieval
label, and oracle passage is derived from
`tooling/embedding-lab/output/embeddings/chunks.jsonl` using real chunk ids and
verbatim text. The returned pharmacist sheet was reconciled into the existing
strict fields `reviewer_notes`, `reviewed_by`, `reviewed_at`, and
`verification_status`; no schema field was added.

The literal sheet reviewer is `student — licence 12er4567 — affiliation NTIC`.
It is preserved exactly as supplied. The project owner confirmed that reviewer
is a licensed pharmacist; that confirmation is recorded in `dataset.meta.json`.
The sheet signs off the dataset, not model responses.

The current raw and oracle runs each have 50/50 submitted response reviews.
Response scoring is single review by
`benchmark-maintainer (deterministic-assisted response review)`, not a second
LLM judge and not pharmacist response adjudication. The reviewed result is:

```text
raw correct_rate    = 8/50  = 0.16
oracle correct_rate = 34/50 = 0.68
evidenceGain        = 0.68 − 0.16 = +0.52
```

`dataset validate` still emits six intentional `TRAP_EXPECTS_ANSWER` warnings:
`Q-TOS-002`, `Q-TOS-003`, `Q-TOS-004`, `Q-TOS-005`, `Q-TOS-007`, and
`Q-TOS-009`. They are documented and were not suppressed. Upstream
`section_code`/metadata mismatches were likewise documented rather than patched
in benchmark JSONL alone.

## Design decisions

- Groq integration uses **`@ai-sdk/groq@4.0.84`** and **`ai@7.0.173`**, matching
  `apps/harness`, not `groq-sdk`.
- Model: `openai/gpt-oss-120b` via Groq. Reasoning effort `medium`, concurrency
  `1`.
- No second LLM judge. Correctness is deterministic signals plus human review.
- Gold annotations never reach the model. The raw runner has no import path to
  the gold loader; an isolation test enforces it structurally.
- The oracle arm uses a manually curated `evidence_bundle`, not retrieval. The
  retrieval arm will be measured separately against the same questions.
- `answerable_without_corpus` and `difficulty` are populated from corpus
  grounding; dataset sign-off is recorded in the existing strict reviewer
  fields.
- `compare` keeps hard identity guards. `raw` and `oracle` intentionally differ
  in `prompt_version`, `run_mode`, and `system_prompt_hash`, so a direct
  `benchmark compare` returns `INCOMPATIBLE — comparison refused.` The reviewed
  aggregate lives in
  [`runs/PROVISIONAL_BASELINES.md`](./runs/PROVISIONAL_BASELINES.md) and
  [`runs/PROVISIONAL_BASELINES.json`](./runs/PROVISIONAL_BASELINES.json).

## Delivered milestones

### 1–2 — Package foundation and raw arm

Strict Zod schemas, JSONL loaders, validator and hashing; structural isolation
between the question loader and gold loader; versioned `raw-v1` prompt, Groq
client with transient/permanent error classification, deterministic cache,
bounded retry, resume, and CLI commands.

### 3–4 — Evaluation, review, reporting, reproducibility

Deterministic advisory signals with explicit denominators; `SINGLE_REVIEW`
reconciliation and `NEEDS_HUMAN_REVIEW` for disagreements; `summary`, `report`,
`compare`, and `reproduce`. Reproducibility includes a secret scan over every
file in a run directory.

### 5–6 — Dataset v1 expansion and oracle arm

Dataset expanded to 50 questions with six parallel fr/en/ar triples. Gold schema
carries `relevant_chunk_ids`, `evidence_bundle`, `answerable_without_corpus`,
`difficulty`, and reviewer fields. Validator cross-field rules reject
unverified approved rows, missing facts, missing answerability, missing
retrieval labels, and duplicate evidence/chunk ids. The `oracle-v1` prompt uses a
fenced data-only evidence block and stable `[E#]` ordering. Shared runner adds
selection-hash guards, exact attempt/token accounting, daily caps, and corrupt
cache detection. CLI is split into focused modules; `evaluate run` owns the
`annotations_hash` so the raw CLI never parses gold annotations.

### 7 — Corpus-grounded gold data

All 50 questions and annotations were rebuilt from
`tooling/embedding-lab/output/embeddings/chunks.jsonl`. Every evidence passage
is a verbatim substring of its cited chunk with provenance from that chunk.
Ungroundable topics were replaced while preserving the 30/10/10 language and
six-category distribution. An independent chunk verifier checked all cited
chunks, evidence substrings, provenance fields, `[E#]` markers, numeric claims,
and distribution counts.

### 8 — Credibility audit and provisional live baselines

All 50 rows were audited before any live call for evidence support,
answerability, language agreement, expected behavior, clinical plausibility, and
numeric/dose claims. Live runs were recorded and evaluated, but at that point
response review and dataset sign-off were still outstanding. Those runs were
superseded by the current reviewed runs below and must not be quoted:

- `raw-20261122-161936-esgy4s`
- `oracle-20261122-162607-ergtb5`

### 9 — Sign-off reconciliation and reviewed baselines

All 32 `REVISE` rows from the pharmacist sheet were re-reviewed against the
current corpus. Every row now has an explicit disposition: the requested
correction was applied where the cited chunk supports it, and the remaining
upstream-metadata or intentional-trap conflicts are documented in
`reviewer_notes`. Only corpus-supported corrections were applied. Notable
outcomes:

- `Q-GMK-004`, `Q-GMK-006`, and `Q-GMK-007` state the ACE-inhibitor class
  mechanism first and present perindopril as the corpus example.
- `Q-GMK-005` names the DailyMed olmesartan/amlodipine/hydrochlorothiazide
  combination and maps olmesartan medoxomil to the ARB component.
- `Q-DNK-001` attributes the 4 g/day maximum to the ANPP PANADOL 1 g label;
  `Q-DNK-005` marks the 3,200 mg/day ceiling as label-specific and not
  self-medication advice.
- `Q-DNK-002` retains `250 mg toutes les 12 heures pendant 7 à 14 jours`; the
  cited DailyMed table does not support the sheet's proposed 10-day value, and
  the answer now names the label source.
- `Q-CAW-005` uses the amoxicillin-alone DailyMed warning and distinguishes a
  documented serious beta-lactam reaction from an uncertain or mild history.
- `Q-TOS-003` asks for weight and product before giving the label's age-band
  fallback.
- Corrected ibuprofen contraindication lists, pediatric paracetamol qualifiers,
  the overdose warning, registry source-boundary wording, translations, and
  unrelated-detail removals are retained.
- The six `TRAP_EXPECTS_ANSWER` rows remain intentional. Notes asking for
  refusal or abstention were not applied literally because the supplied
  evidence directly answers those rows.

The annotation-only revision postdates the reviewed runs. Questions,
`expected_facts`, `forbidden_claims`, `relevant_chunk_ids`, and evidence bundles
are unchanged, so the reviewed raw/oracle responses and human scores remain
valid. The reviewed runs retain the annotation hash they were scored under
(`b822439d...`); the current annotation file hashes to `cbc89482...`.
Re-evaluating those runs against the revised annotation file would require
`--force` and was not performed.

Current live runs:

| Arm      | Run ID                          | Responses | API calls | Cache hits | Failed | Live tokens |
| -------- | ------------------------------- | --------- | --------- | ---------- | ------ | ----------- |
| `raw`    | `raw-20261122-191450-l8bqkn`    | 50/50     | 1         | 49         | 0      | 1,025       |
| `oracle` | `oracle-20261122-191458-yqo6sy` | 50/50     | 50        | 0          | 0      | 50,652      |

Shared identity:

- `dataset_hash` = `df9415f80bf72d60eeb329aeb65f29ece4e8001383fa1ea97add3435ba998b56`
  (unchanged by the annotation-only revision)
- `selection_hash` = `fa192fda2a9fd240e4e79fd5ffc294d7dc32408dd12e5cf685971ff9ecafc804`
- Reviewed-run `annotations_hash` =
  `b822439d9a0e8f680bba3b90259920e30492712bee0a76d795e06bccaba4af71`
- Current `annotations_hash` after the annotation-only REVISE revision =
  `cbc89482bee03ac1fb58f9ca4504f56d7098f19e539b0ee360c5cb0d4f91a12a`
- Oracle `evidence_hash` = `57bbe87f2d8b900135a661d94c520fa6ba652668dc3c024fceb84ea7f33595a6`

The per-run artifacts, including submitted `review_primary.jsonl`, were
force-added because `packages/benchmark/runs/` is gitignored. No API key or
secret appears in either run directory.

## Reviewed results

| Arm      | Correct     | Partially correct | Incorrect  | Safety (safe) | Responses with any unsupported claim |
| -------- | ----------- | ----------------- | ---------- | ------------- | ------------------------------------ |
| `raw`    | 8/50 (16%)  | 33/50 (66%)       | 9/50 (18%) | 44/50 (88%)   | 42/50 (84%)                          |
| `oracle` | 34/50 (68%) | 15/50 (30%)       | 1/50 (2%)  | 49/50 (98%)   | 27/50 (54%)                          |

`correct_rate` counts only `CORRECT`; `PARTIALLY_CORRECT` is reported separately
and is not folded into the headline rate. `NOT_APPLICABLE` is excluded from
numerical and abstention denominators. Advisory deterministic signals and their
deltas are tabulated in
[`runs/PROVISIONAL_BASELINES.md`](./runs/PROVISIONAL_BASELINES.md).

Still unmeasured:

- `retrievalGap = oracle − rag` — no RAG arm is wired.
- `systemGain = rag − raw` — no RAG arm is wired.

## Final gates

| Gate                                                            | Result                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `python packages/benchmark/scripts/verify_grounded_data.py`     | pass — 50 questions, 50 annotations, 39 chunks, 0 errors                                                                                       |
| `bun run --cwd packages/benchmark benchmark dataset validate`   | pass — 50 approved, 50 annotated, 50 verified, 50 scorable, 0 errors, 6 intentional warnings                                                   |
| `bun run --cwd packages/benchmark benchmark dataset stats`      | pass — `fr 30 / en 10 / ar 10`; GMK 7 / MID 9 / DNK 7 / CAW 9 / DRI 9 / TOS 9                                                                  |
| `bun run --cwd packages/benchmark typecheck`                    | pass — 66 files, no type errors                                                                                                                |
| `bun run --cwd packages/benchmark test`                         | pass — 152 pass, 1 skip, 0 fail, 315 expect() calls                                                                                            |
| `bun run --cwd packages/benchmark lint`                         | pass                                                                                                                                           |
| `bun run --cwd packages/benchmark format:check`                 | pass                                                                                                                                           |
| `bun run typecheck` (root)                                      | pass — 23/23 tasks                                                                                                                             |
| `bun run test` (root)                                           | pass — 11/11 tasks                                                                                                                             |
| `bun run format:check` (root)                                   | pass — 25/25 tasks                                                                                                                             |
| `bun run lint:all` (root)                                       | **fail** — pre-existing repository-wide findings outside this change (`apps/eve/package.json` manifest coverage, `apps/mobile` form ownership) |
| `bunx --bun ghostinit@0.1.0 check --json`                       | **fail** — pre-existing repository-wide architecture/dependency-declaration findings; no detector, exception, or safeguard was changed         |
| `bun run --cwd packages/benchmark benchmark reproduce` (both)   | pass — identity, accounting, and secret scan                                                                                                   |
| `bun run --cwd packages/benchmark benchmark compare raw oracle` | expected refusal — arms differ by design in `prompt_version`, `run_mode`, and `system_prompt_hash`                                             |

Repository-wide `lint:all` and `ghostinit check` failures predate this change and
are outside `packages/benchmark`. No detector, exception, or safeguard was
suppressed or weakened to obtain the passing results.

## Remaining work

1. Build `rag-fixed` with recorded retrieval traces, then wire the live `rag`
   arm against the same frozen questions.
2. Compute `retrievalGap` and `systemGain` once the RAG arm has reviewed scores.
3. Add the retrieval PR gate (recall@k, precision@k, MRR, nDCG@10) using the
   chunk labels already in the gold annotations.
4. Restore the generator-owned seven-day dependency release-age delay when a
   GhostInit release supports Bun 1.4.5 (repository follow-up, not benchmark
   scope).
