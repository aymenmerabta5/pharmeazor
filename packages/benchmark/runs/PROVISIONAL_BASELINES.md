# Provisional v1 baselines — raw and oracle

_Recorded 2026-11-22. This document is a run record, not a clinical result._

## Important limitation

Both runs are **provisional**. `evaluate run` produced deterministic advisory
signals only; `human_reviewed = 0` for both runs, so `correct_rate` and the true
`evidenceGain = oracle − raw` are still `null`. No score in this document may be
quoted as a clinical benchmark result until (a) a human reviewer has completed
the review worksheets and (b) a pharmacist has signed off on the corpus-derived
dataset. All 50 rows still carry the exact note
`corpus-derived, pharmacist sign-off pending`.

## Pre-run credibility audit

All 50 questions and gold annotations were audited against
`tooling/embedding-lab/output/embeddings/chunks.jsonl` before any live call.
The audit checked that each question was answerable from its cited passages,
that every reference answer and expected fact was supported, that answer
language matched question language, that expected behavior was appropriate, and
that numeric/dose claims were correct.

Eight confirmed issues were corrected:

- `Q-GMK-004`: removed the class-wide claim that all ACE inhibitors are
  prodrugs of perindoprilat; the evidence supports that statement only for
  perindopril.
- `Q-MID-006`: removed the unsupported brand name "Augmentin" and translated
  the French reference answer and facts into English.
- `Q-MID-008`: translated the French reference answer and facts into Arabic.
- `Q-TOS-001`: added the missing overdose warning: 2 g every 4 hours exceeds
  the 4 g/day ceiling.
- `Q-TOS-002`–`Q-TOS-005`: changed expected behavior from abstain/clarify/refuse
  to `ANSWER`, because the curated evidence directly and correctly answers each
  question. The previous labels penalized the evidence-backed answer.

After correction, the independent chunk verifier reported 50 questions,
50 annotations, 38 referenced chunks and 0 errors. `dataset validate` reported
50 approved, 50 verified, 50 retrieval-ready and 50 oracle-ready. It emits four
`TRAP_EXPECTS_ANSWER` warnings for `Q-TOS-002`–`Q-TOS-005`; these are
intentional and are not suppressed.

## Runs

| Arm    | Run ID                                | Status    | Responses | API calls | Failed | Live tokens |
| ------ | ------------------------------------- | --------- | --------- | --------- | ------ | ----------- |
| `raw`  | `raw-20261122-161936-esgy4s`          | COMPLETED | 50/50     | 50        | 0      | 40,695      |
| oracle | `oracle-20261122-162607-ergtb5`       | COMPLETED | 50/50     | 50        | 0      | 47,632      |

Shared identity:

- `dataset_hash` = `98378ab43714f181fcf9a19e9e5cab90167a12c02f7f8cedd41789713972c03f`
- `selection_hash` = `fa192fda2a9fd240e4e79fd5ffc294d7dc32408dd12e5cf685971ff9ecafc804`
- `annotations_hash` = `0056a0736827b4ddaf86f11869edbc81ed685f1b087bcda67531cfe2683e4ef6`
- Oracle `evidence_hash` = `505fa82676564d3ad7284a671c2976767d138f8a6fe95e52c5bec1534caf1f04`

`benchmark reproduce` passes for both runs; no API key or secret appears in
either run directory.

## Provisional deterministic signals

These are advisory rule-based signals, not the human benchmark score.

| Signal                              | raw             | oracle          | Delta     |
| ----------------------------------- | --------------- | --------------- | --------- |
| Expected facts found                | 46/174 (26.4%)  | 92/174 (52.9%)  | +26.5 pp  |
| Rows with all expected facts        | 1/50 (2%)       | 8/50 (16%)      | +14 pp    |
| Behavior agreement                  | 41/50 (82%)     | 45/50 (90%)     | +8 pp     |
| Rows with a forbidden claim         | 1/50 (2%)       | 1/50 (2%)       | 0 pp      |
| Rows with wrong/unsupported numbers | 15/50 (30%)     | 8/50 (16%)      | −14 pp    |
| Oracle answers citing a passage     | N/A             | 24/50 (48%)     | N/A       |
| Invalid citations                   | N/A             | 0/50            | N/A       |

## Provisional evidence gain

The deterministic proxy moves in the expected direction: fact coverage +26.5
percentage points, full-fact rows +14 points, behavior agreement +8 points, and
numeric problem rows −14 points. This is **not** the defined `evidenceGain`;
it is a rule-based proxy computed before any human scoring. The real
`evidenceGain`, `retrievalGap` and `systemGain` remain unmeasured until human
review and pharmacist sign-off are complete, and the RAG arm is still deferred.

Machine-readable aggregates are in
[`PROVISIONAL_BASELINES.json`](./PROVISIONAL_BASELINES.json). Per-run artifacts
are in `raw-20261122-161936-esgy4s/` and `oracle-20261122-162607-ergtb5/`.
