# Benchmark dataset — format and reviewer workflow

## Files

    data/v1/dataset.meta.json          version metadata
    data/v1/questions.jsonl            model-facing file
    data/v1/gold_annotations.jsonl     evaluation file (never sent to the model)

Each file is UTF-8 JSONL: one JSON object per line. Blank lines and lines
starting with `#` are ignored by the loader. Every other line must parse and
must satisfy its Zod schema (`.strict()` — extra fields are rejected).

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

| field               | type                                 | meaning                                                |
| ------------------- | ------------------------------------ | ------------------------------------------------------ |
| question_id         | string                               | must match a question                                  |
| reference_answer    | string \| null                       | verified answer text; `null` while unverified          |
| expected_facts      | string[]                             | factual elements the model's answer must contain       |
| forbidden_claims    | string[]                             | claims that must **not** appear (invented doses, etc.) |
| expected_behavior   | same enum as `expected_raw_behavior` | must match the question's value                        |
| reviewer_notes      | string                               | free-form notes from the reviewer                      |
| verification_status | `DRAFT` \| `VERIFIED` \| `DISPUTED`  | human verification of the annotation                   |

## Reviewer workflow

1. **Question review.** A pharmacist reads the question text and sets
   `review_status: "APPROVED"` if it is a fair, pharmacist-relevant prompt, or
   `"REJECTED"` if it is not.
2. **Annotation verification.** The same or a second pharmacist fills in
   `reference_answer`, `expected_facts` and `forbidden_claims` from a
   pharmacopoeia / official reference, and sets `verification_status: "VERIFIED"`.
3. **Validation.** `bun run benchmark dataset validate` must pass with zero
   errors. The validator refuses to accept a question that is `APPROVED` while
   its annotation is not `VERIFIED`, has a null `reference_answer`, or has
   empty `expected_facts`.
4. **Two-reviewer disputes.** If two reviewers disagree, set
   `verification_status: "DISPUTED"` and record both opinions in
   `reviewer_notes`. `DISPUTED` annotations are excluded from scored runs
   exactly like `DRAFT`.

No question is eligible for a scored benchmark run until **both** the question
is `APPROVED` **and** its annotation is `VERIFIED`.

## Adding a new question

1. Append one JSON line to `data/v1/questions.jsonl` with `review_status: "DRAFT"`.
2. Append one matching JSON line to `data/v1/gold_annotations.jsonl` with
   `reference_answer: null`, empty `expected_facts`, empty `forbidden_claims`,
   and `verification_status: "DRAFT"`.
3. Run `bun run benchmark dataset validate`. Any schema violation fails with
   the file path and line number.
4. Submit for pharmacist review.

## Versioning

A dataset change that alters the **content** of a question — its text, category,
language, expected behavior, or review status — changes the dataset hash
(`hashQuestions()`). This is recorded in every run's metadata (Prompt 3) and is
what `reporting/compare.ts` (Prompt 5) uses to reject incompatible comparisons.

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
  "forbidden_claims": [
    "[REVIEWER TO FILL] a wrong claim to flag, e.g. a specific incorrect number"
  ],
  "expected_behavior": "ANSWER",
  "reviewer_notes": "Example only. Not a real benchmark entry.",
  "verification_status": "VERIFIED"
}
```
