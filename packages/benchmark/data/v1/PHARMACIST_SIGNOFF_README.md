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

## Separate task: response review

This sheet approves the dataset. Scoring the model answers is a different step.
The two response-review worksheets are generated at:

```text
runs/raw-20261122-161936-esgy4s/review/review_template.jsonl
runs/oracle-20261122-162607-ergtb5/review/review_template.jsonl
```

Fill each `score` object, save as `review_primary.jsonl` beside the template,
and submit with `benchmark review submit`. The `runs/` directory is gitignored,
so filled review files must be force-added if they should be committed.
