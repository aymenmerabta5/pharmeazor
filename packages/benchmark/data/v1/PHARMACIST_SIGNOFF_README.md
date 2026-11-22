# Pharmacist sign-off sheet

`PHARMACIST_SIGNOFF_SHEET.csv` contains all 50 v1 questions and their gold
annotations. The first 15 columns are the current audited data. The pharmacist
fills only the last four columns:

| Column             | What to enter                                                      |
| ------------------ | ------------------------------------------------------------------ |
| `signoff_decision` | `APPROVE`, `REVISE`, or `REJECT`                                   |
| `signoff_reviewer` | pharmacist name and licence/affiliation                            |
| `signoff_notes`    | short clinical rationale; required detail for `REVISE` or `REJECT` |
| `signoff_at`       | ISO timestamp, e.g. `2026-11-23T10:00:00Z`                         |

## Review checks

For each row, confirm that:

- the question is fair and pharmacist-relevant;
- the wording in `reference_answer` is clinically correct;
- every item in `expected_facts` is actually supported by `evidence_passages`;
- every item in `forbidden_claims` is a plausible unsafe or wrong claim;
- the cited passage really answers the question;
- doses, units, intervals, age/weight cutoffs and contraindications are correct;
- `expected_behavior`, `answerable_without_corpus` and `difficulty` are right.

The `evidence_passages` column is flattened to one line. Each passage is shown
as `[E#] chunk=... source=... section=... :: verbatim text`. The chunk text is
the benchmark's authority; flag a clinically wrong source as `REVISE`/`REJECT`
rather than silently rewriting it.

## Decisions

- `APPROVE` — the row is clinically acceptable as written.
- `REVISE` — the row needs a specific correction. Put the exact replacement text
  or corrected field in `signoff_notes`.
- `REJECT` — the row must not be scored. Put the reason in `signoff_notes`.

Do not edit the first 15 columns by hand. Return the filled CSV and the gold
annotations will be updated in `gold_annotations.jsonl` using the existing
fields `reviewer_notes`, `reviewed_by`, `reviewed_at` and `verification_status`.
The schema rejects extra fields, so no new column is added to the JSONL.

## Current reconciliation status

The returned sheet contained 18 `APPROVE`, 32 `REVISE`, and 0 `REJECT` rows.
Every row was reconciled against the current corpus and the audit result was
carried into `questions.jsonl`, `gold_annotations.jsonl`, and
`dataset.meta.json` using only the existing strict fields. Of the `REVISE`
rows, 12 were already fixed, 7 required a documented decision, and 13 remained
open because the corpus source itself was the authority. Corpus-supported
corrections were applied; upstream `section_code`/metadata mismatches were
documented rather than patched in benchmark JSONL alone.

The literal `signoff_reviewer` is `student — licence 12er4567 — affiliation
NTIC`. It is preserved exactly as supplied. The project owner confirmed that
this reviewer is a licensed pharmacist; that confirmation is recorded in
`dataset.meta.json`. This sheet signs off the dataset, not model responses.

## Separate task: response review

Scoring the model answers is a different step. The current response-review
worksheets and submitted reviews are:

```text
runs/raw-20261122-191450-l8bqkn/review/review_template.jsonl
runs/raw-20261122-191450-l8bqkn/review/review_primary.jsonl
runs/oracle-20261122-191458-yqo6sy/review/review_template.jsonl
runs/oracle-20261122-191458-yqo6sy/review/review_primary.jsonl
```

Response review was performed by
`benchmark-maintainer (deterministic-assisted response review)` and submitted
with `benchmark review submit`. It is single review, not pharmacist response
adjudication and not a second LLM judge. The `runs/` directory is gitignored,
so filled review files must be force-added if they should be committed.
