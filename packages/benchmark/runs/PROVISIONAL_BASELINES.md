# Reviewed v1 baselines — raw and oracle

_Recorded 2026-11-22; re-run 2026-11-23. The filename is retained from the
earlier provisional record; this document now reports the current human-reviewed
runs._

## Scope and review status

Both arms have 50/50 completed responses, deterministic evaluation, submitted
response review, summaries, reports, and passing reproducibility checks. The
2026-11-23 re-run was fully served from the response cache with byte-identical
content to the 2026-11-22 reviewed baseline, so the single-review scores were
carried forward by question id and only `scored_at` was refreshed. Response
scoring is **single review** by
`benchmark-maintainer (deterministic-assisted response review)`; it is not a
two-reviewer agreement, not a second LLM judge, and not pharmacist response
adjudication. The pharmacist sheet signs off the **dataset**, not the model
responses.

The dataset sign-off was returned with the literal identity
`student — licence 12er4567 — affiliation NTIC`. The project owner confirmed
that reviewer is a licensed pharmacist. The literal identity is preserved in
`PHARMACIST_SIGNOFF_SHEET.csv` and in the strict JSONL fields;
`dataset.meta.json` records the owner confirmation. All 32 `REVISE` rows were
re-reviewed against the current corpus. Every row now has an explicit
disposition: the requested correction was applied where the cited chunk supports
it, and upstream-metadata or intentional-trap conflicts are documented in
`reviewer_notes`. Only corpus-supported corrections were applied. The six
remaining `TRAP_EXPECTS_ANSWER` warnings are intentional and were not suppressed.
A later annotation-only revision strengthened the reference answers and
dispositions; questions, expected facts, forbidden claims, chunk labels, and
evidence bundles are unchanged. Both arms were re-run after that revision and
evaluated against the current annotation file.

The oracle arm is an upper bound with curator-selected evidence. It is not a
product claim about the retrieval system.

## Pre-run credibility audit

All 50 questions and gold annotations were audited against
`tooling/embedding-lab/output/embeddings/chunks.jsonl` before any live call.
The audit checked evidence support, answerability, answer/query language
agreement, expected behavior, clinical plausibility, and numeric/dose claims.
Ungroundable topics were replaced while preserving the 30 `fr` / 10 `en` /
10 `ar` and six-category distribution. After reconciliation,
`packages/benchmark/scripts/verify_grounded_data.py` reported 50 questions,
50 annotations, 39 referenced chunks, and 0 errors.

## Runs

| Arm      | Run ID                                | Status    | Responses | API calls | Cache hits | Failed | Live tokens | Replayed tokens |
| -------- | ------------------------------------- | --------- | --------- | --------- | ---------- | ------ | ----------- | --------------- |
| `raw`    | `raw-20261123-174647-amkm5t`          | COMPLETED | 50/50     | 0         | 50         | 0      | 0           | 40,584          |
| `oracle` | `oracle-20261123-174652-b455gt`       | COMPLETED | 50/50     | 0         | 50         | 0      | 0           | 50,652          |

Shared identity:

- `dataset_hash` = `df9415f80bf72d60eeb329aeb65f29ece4e8001383fa1ea97add3435ba998b56`
  (unchanged by the annotation-only revision)
- `selection_hash` = `fa192fda2a9fd240e4e79fd5ffc294d7dc32408dd12e5cf685971ff9ecafc804`
- `annotations_hash` = `cbc89482bee03ac1fb58f9ca4504f56d7098f19e539b0ee360c5cb0d4f91a12a`
  (the 2026-11-22 reviewed baseline runs were scored under
  `b822439d9a0e8f680bba3b90259920e30492712bee0a76d795e06bccaba4af71`)
- Oracle `evidence_hash` = `57bbe87f2d8b900135a661d94c520fa6ba652668dc3c024fceb84ea7f33595a6`

The 2026-11-22 runs `raw-20261122-191450-l8bqkn` and
`oracle-20261122-191458-yqo6sy` are the historical reviewed baseline whose
scores were carried forward into the current runs. The older 2026-11-16 runs
`raw-20261122-161936-esgy4s` and `oracle-20261122-162607-ergtb5` are superseded
and must not be quoted. `benchmark reproduce` passes for both current runs, and
no API key or secret appears in either run directory.

## Human-reviewed scores

| Arm      | Correct      | Partially correct | Incorrect | Safety (safe) | Responses with any unsupported claim |
| -------- | ------------ | ----------------- | --------- | ------------- | ------------------------------------ |
| `raw`    | 8/50 (16%)   | 33/50 (66%)       | 9/50 (18%)| 44/50 (88%)   | 42/50 (84%)                          |
| `oracle` | 34/50 (68%)  | 15/50 (30%)       | 1/50 (2%) | 49/50 (98%)   | 27/50 (54%)                          |

`correct_rate` counts only `CORRECT`; `PARTIALLY_CORRECT` is reported
separately and is not folded into the headline rate. All 100 responses were
reviewed exactly once. `NOT_APPLICABLE` is excluded from numerical and
abstention denominators.

## evidenceGain

```text
evidenceGain = oracle correct_rate − raw correct_rate
             = 0.68 − 0.16
             = +0.52  (26 additional correct answers; +52 percentage points)
```

This is the first real measured value for the defined metric. It means curated,
verbatim evidence moved this model from 8 to 34 fully correct answers on this
50-question set. It does not measure retrieval, and it is not a clinical efficacy
claim.

## Deterministic advisory signals

These rule-based signals are not the benchmark score. They are retained because
they help explain where the human score moved.

| Signal                              | raw            | oracle         | Delta    |
| ----------------------------------- | -------------- | -------------- | -------- |
| Expected facts found                | 45/191 (23.6%) | 77/191 (40.3%) | +16.7 pp |
| Rows with all expected facts        | 2/50 (4%)      | 8/50 (16%)     | +12 pp   |
| Behavior agreement                  | 43/50 (86%)    | 46/50 (92%)    | +6 pp    |
| Rows with a forbidden claim         | 1/50 (2%)      | 1/50 (2%)      | 0 pp     |
| Rows with wrong/unsupported numbers | 15/50 (30%)    | 8/50 (16%)     | −14 pp   |
| Oracle answers citing a passage     | N/A            | 19/50 (38%)    | N/A      |
| Invalid citations among parsed       | N/A            | 0/50           | N/A      |
| Responses with unsupported numbers  | 12/50 (24%)    | 5/50 (10%)     | −14 pp   |

The citation counts are mechanical `[E#]` parsing, not the human citation
verdict. Human review noted frequent nonstandard citation formatting and one
critical pediatric dose error in the oracle arm despite the supplied evidence.

## Still unmeasured

- `retrievalGap = oracle − rag` — no RAG arm is wired.
- `systemGain = rag − raw` — no RAG arm is wired.

The RAG arm remains deliberately deferred until the annotations, oracle
baseline, and sign-off are stable. Machine-readable aggregates are in
[`PROVISIONAL_BASELINES.json`](./PROVISIONAL_BASELINES.json). Per-run artifacts
are in `raw-20261122-191450-l8bqkn/` and `oracle-20261122-191458-yqo6sy/`.
