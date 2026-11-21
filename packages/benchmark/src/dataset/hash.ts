import { sha256, FIELD_SEP, RECORD_SEP } from "../shared/hash";
import type { Question } from "./schema";

/**
 * Deterministic hash over the model-facing question fields.
 * `review_status` is included so moving a question between statuses
 * is a detectable dataset change.
 */
export function hashQuestions(questions: readonly Question[]): string {
  const sorted = [...questions].sort((a, b) => a.question_id.localeCompare(b.question_id));
  const canonical = sorted
    .map((q) =>
      [
        q.question_id,
        q.language,
        q.category,
        q.therapeutic_class,
        q.question,
        q.expected_raw_behavior,
        q.review_status,
      ].join(FIELD_SEP),
    )
    .join(RECORD_SEP);
  return sha256(canonical);
}
