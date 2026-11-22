# Benchmark dataset — format and reviewer workflow

## Files

    data/v1/dataset.meta.json          version metadata and parallel-item map
    data/v1/questions.jsonl            model-facing file
    data/v1/gold_annotations.jsonl     evaluation file (never sent to the model)

Each file is UTF-8 JSONL: one JSON object per line. Blank lines and lines
starting with `#` are ignored by the loader. Every other line must parse and
must satisfy its Zod schema (`.strict()` — extra fields are rejected).

`data/v1` ships **50 questions**: 30 `fr`, 10 `en`, 10 `ar`. Six fr/en/ar
triples ask the same clinical question in three languages; `dataset.meta.json`
records the mapping. That makes cross-language behaviour comparable without
pretending the three versions are independent samples.

The shipped dataset is corpus-grounded. `questions.jsonl` and
`gold_annotations.jsonl` are derived from
`tooling/embedding-lab/output/embeddings/chunks.jsonl`: chunk ids are real,
evidence text is verbatim, and answers and facts come only from those passages.
Every row carries the exact reviewer note
`corpus-derived, pharmacist sign-off pending`. This is structural verification,
not clinical sign-off.

## Question fields

| field                 | type                                                                                      | meaning                             |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------- |
| question_id           | string                                                                                    | stable ID, e.g. `Q-DNK-001`         |
| language              | `fr` \| `en` \| `ar`                                                                      | question language                   |
| category              | one of the six category values                                                            | scoring bucket                      |
| therapeutic_class     | string                                                                                    | pharmacology class for breakdowns   |
| question              | string                                                                                    | the exact text sent to the model    |
| expected_raw_behavior | `ANSWER` \| `LIMITED_ANSWER` \| `ABSTAIN` \| `ASK_CLARIFICATION` \| `REFUSE_OUT_OF_SCOPE` | what the raw model should do        |
| review_status         | `DRAFT` \| `APPROVED` \| `REJECTED`                                                       | human review of the question itself |

## Gold-annotation fields

| field                     | type                                      | meaning                                                           |
| ------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| question_id               | string                                    | must match a question                                             |
| reference_answer          | string \| null                            | verified answer text; `null` while unverified                     |
| expected_facts            | string[]                                  | factual elements a correct answer must contain                    |
| forbidden_claims          | string[]                                  | claims that must **not** appear                                   |
| relevant_chunk_ids        | string[]                                  | retrieval ground truth: every chunk that answers the question     |
| evidence_bundle           | EvidencePassage[] (max 8)                 | curated passages for the oracle arm                               |
| answerable_without_corpus | boolean \| null                           | reviewer decision: can a closed-book model answer this correctly? |
| difficulty                | `UNKNOWN` \| `EASY` \| `MEDIUM` \| `HARD` | reviewer judgement, not inferred from length                      |
| expected_behavior         | same enum as `expected_raw_behavior`      | must match the question's value                                   |
| reviewer_notes            | string                                    | free-form notes from the reviewer                                 |
| verification_status       | `DRAFT` \| `VERIFIED` \| `DISPUTED`       | human verification of the annotation                              |
| reviewed_by               | string \| null                            | reviewer identity                                                 |
| reviewed_at               | string \| null                            | ISO timestamp of verification                                     |

### Evidence passage fields

| field        | type              | meaning                                                  |
| ------------ | ----------------- | -------------------------------------------------------- |
| evidence_id  | `E1` … `E99`      | marker the model must cite; unique within one annotation |
| text         | string (≤ 4000)   | verbatim passage, not a paraphrase                       |
| source_id    | `[A-Z][A-Z0-9_]*` | stable source identifier, e.g. `MED001`                  |
| source_name  | string            | human-readable source title                              |
| section_code | `[a-z][a-z0-9_]*` | section within the source, e.g. `posologie`              |
| chunk_id     | chunk id or null  | the chunk this passage came from, when it maps to one    |

The chunk id format is
`${artifactId}#${sectionCode}-${occurrence}#${ordinal}`, for example
`MED001#posologie-1#0`. Gold labels use the same identifier the retriever
returns, so recall@k needs no translation table.

`relevant_chunk_ids` and `evidence_bundle` are intentionally separate.
`relevant_chunk_ids` is the complete retrieval ground truth; `evidence_bundle`
is the smaller oracle input a pharmacist would actually hand to the model. The
oracle may use a subset, but every chunk-backed passage should also appear in
`relevant_chunk_ids` (the validator warns when it does not).

## Reviewer workflow

1. **Question review.** A pharmacist reads the question text and sets
   `review_status: "APPROVED"` if it is a fair, pharmacist-relevant prompt, or
   `"REJECTED"` if it is not.
2. **Annotation verification.** Fill in `reference_answer`, `expected_facts`,
   and `forbidden_claims` from a named pharmacopoeia / official reference, and
   set `verification_status: "VERIFIED"` with `reviewed_by` and `reviewed_at`.
3. **Answerability.** Set `answerable_without_corpus` and `difficulty`. This is a
   reviewer decision; the validator rejects an `APPROVED` question that leaves
   answerability `null`, because the abstention analysis cannot classify it.
4. **Retrieval labels.** For a question that is **not** answerable without the
   corpus, add at least one `relevant_chunk_id`. The validator rejects an
   approved corpus question with no labels.
5. **Oracle bundle.** For a question that should have an oracle run, add
   passages to `evidence_bundle`. Passages are verbatim, carry provenance, and
   are ordered: `[E1]` refers to the first passage. See
   [`oracle.md`](./oracle.md).
6. **Validation.** `bun run benchmark dataset validate` must pass with zero
   errors. The current corpus-grounded dataset has zero errors and four
   intentional `TRAP_EXPECTS_ANSWER` warnings; each warning is a row where the
   curated evidence directly and correctly answers the trap, so `ANSWER` is
   the credible expected behavior. These warnings are documented in
   [`../runs/PROVISIONAL_BASELINES.md`](../runs/PROVISIONAL_BASELINES.md).
7. **Sign-off.** The current rows are `APPROVED`/`VERIFIED` with the exact note
   `corpus-derived, pharmacist sign-off pending`. A pharmacist must still review
   the questions, evidence spans, and reference answers before any score is
   interpreted.
8. **Two-reviewer disputes.** If two reviewers disagree, set
   `verification_status: "DISPUTED"` and record both opinions in
   `reviewer_notes`. `DISPUTED` annotations are excluded from scored runs
   exactly like `DRAFT`.

No question is eligible for a scored benchmark run until **both** the question
is `APPROVED` **and** its annotation is `VERIFIED`.

## Validator rules

Errors (block scoring):

- `EMPTY_QUESTION`, `DUPLICATE_QUESTION_ID`
- `BEHAVIOR_MISMATCH` — question and annotation disagree on expected behavior
- `APPROVED_BUT_NOT_VERIFIED`
- `APPROVED_WITHOUT_REFERENCE_ANSWER`
- `APPROVED_WITHOUT_EXPECTED_FACTS`
- `APPROVED_WITHOUT_ANSWERABILITY`
- `CORPUS_QUESTION_WITHOUT_RELEVANT_CHUNKS`
- `DUPLICATE_RELEVANT_CHUNK_ID`, `DUPLICATE_EVIDENCE_ID`

Warnings (review or confirm, do not block):

- `ORPHAN_ANNOTATION`, `MISSING_ANNOTATION`
- `ANSWERABLE_WITHOUT_CORPUS_HAS_CHUNKS`
- `EVIDENCE_CHUNK_NOT_LABELLED_RELEVANT`
- `VERIFIED_WITHOUT_ORACLE_EVIDENCE` — the oracle arm will skip the question
- `TRAP_EXPECTS_ANSWER`
- `NOT_APPROVED_EXCLUDED_FROM_SCORING` — expected for every `DRAFT` row

`TRAP_EXPECTS_ANSWER` is a prompt for review, not a hard rule: when the curated
passage states a direct prohibition or an age-based dose, the credible gold
behavior is `ANSWER` even though the question sits in the trap category.

`dataset stats` reports `retrieval_ready_count` (annotations with at least one
relevant chunk) and `oracle_ready_count` (annotations with at least one passage)
so the two workstreams can be tracked independently.

## Adding a new question

1. Append one JSON line to `data/v1/questions.jsonl` with `review_status: "DRAFT"`.
2. Append one matching JSON line to `data/v1/gold_annotations.jsonl` with
   `reference_answer: null`, empty arrays for facts/claims/chunks/evidence,
   `answerable_without_corpus: null`, `difficulty: "UNKNOWN"`, and
   `verification_status: "DRAFT"`.
3. Add it to the language/category counts and any parallel group in
   `dataset.meta.json`.
4. Run `bun run benchmark dataset validate`. Any schema violation fails with
   the file path and line number.
5. Submit for pharmacist review.

## Versioning

A change that alters the **model-facing** content of a question — its text,
category, language, expected behavior, or review status — changes the dataset
hash (`hashQuestions()`). That hash is recorded in every run's metadata and is
what `reporting/compare.ts` uses to reject incompatible comparisons.

A run's exact slice is additionally covered by `selection_hash`, computed over
the selected question ids in order. Two different `--category`/`--limit` slices
of equal size are therefore never treated as the same experiment.

To evolve the dataset in place, bump the version directory (`data/v2/`) so
previous runs remain reproducible against their exact dataset.

## Example verified annotation (format template — not a real benchmark entry)

```json
{
  "question_id": "Q-EXAMPLE-000",
  "reference_answer": "[REVIEWER TO FILL from a named reference, with page/section]",
  "expected_facts": [
    "[REVIEWER TO FILL] fact 1 that a correct answer must contain",
    "[REVIEWER TO FILL] fact 2"
  ],
  "forbidden_claims": ["[REVIEWER TO FILL] a wrong claim to flag"],
  "relevant_chunk_ids": ["MED001#posologie-1#0"],
  "evidence_bundle": [
    {
      "evidence_id": "E1",
      "text": "[REVIEWER TO FILL] verbatim passage",
      "source_id": "MED001",
      "source_name": "Example source",
      "section_code": "posologie",
      "chunk_id": "MED001#posologie-1#0"
    }
  ],
  "answerable_without_corpus": false,
  "difficulty": "MEDIUM",
  "expected_behavior": "ANSWER",
  "reviewer_notes": "Example only. Not a real benchmark entry.",
  "verification_status": "VERIFIED",
  "reviewed_by": "example-reviewer",
  "reviewed_at": "2026-01-01T00:00:00Z"
}
```
