import { z } from "zod";

export const LANGUAGE_VALUES = ["fr", "en", "ar"] as const;
export type Language = (typeof LANGUAGE_VALUES)[number];

export const CATEGORY_VALUES = [
  "GENERAL_MEDICATION_KNOWLEDGE",
  "MEDICATION_IDENTIFICATION",
  "DOSAGE_AND_NUMERICAL_KNOWLEDGE",
  "CONTRAINDICATIONS_AND_WARNINGS",
  "DRUG_INTERACTIONS",
  "TRAP_AND_OUT_OF_SCOPE",
] as const;
export type Category = (typeof CATEGORY_VALUES)[number];

export const EXPECTED_BEHAVIOR_VALUES = [
  "ANSWER",
  "LIMITED_ANSWER",
  "ABSTAIN",
  "ASK_CLARIFICATION",
  "REFUSE_OUT_OF_SCOPE",
] as const;
export type ExpectedBehavior = (typeof EXPECTED_BEHAVIOR_VALUES)[number];

export const REVIEW_STATUS_VALUES = ["DRAFT", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];

export const VERIFICATION_STATUS_VALUES = ["DRAFT", "VERIFIED", "DISPUTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS_VALUES)[number];

/**
 * Questions file schema. `.strict()` guarantees a `reference_answer`
 * or any other extra field is rejected at parse time, so gold material
 * cannot be smuggled into the model-facing file.
 */
export const QuestionSchema = z
  .object({
    question_id: z.string().min(1, "question_id must not be empty"),
    language: z.enum(["fr", "en", "ar"]),
    category: z.enum([
      "GENERAL_MEDICATION_KNOWLEDGE",
      "MEDICATION_IDENTIFICATION",
      "DOSAGE_AND_NUMERICAL_KNOWLEDGE",
      "CONTRAINDICATIONS_AND_WARNINGS",
      "DRUG_INTERACTIONS",
      "TRAP_AND_OUT_OF_SCOPE",
    ]),
    therapeutic_class: z.string().min(1, "therapeutic_class must not be empty"),
    question: z.string().min(1, "question must not be empty"),
    expected_raw_behavior: z.enum([
      "ANSWER",
      "LIMITED_ANSWER",
      "ABSTAIN",
      "ASK_CLARIFICATION",
      "REFUSE_OUT_OF_SCOPE",
    ]),
    review_status: z.enum(["DRAFT", "APPROVED", "REJECTED"]),
  })
  .strict();

export type Question = z.infer<typeof QuestionSchema>;

/**
 * Gold-annotation schema. Not re-exported from `src/index.ts` and not
 * imported by `src/dataset/loader.ts`.
 */
export const GoldAnnotationSchema = z
  .object({
    question_id: z.string().min(1, "question_id must not be empty"),
    reference_answer: z.string().nullable(),
    expected_facts: z.array(z.string()),
    forbidden_claims: z.array(z.string()),
    expected_behavior: z.enum([
      "ANSWER",
      "LIMITED_ANSWER",
      "ABSTAIN",
      "ASK_CLARIFICATION",
      "REFUSE_OUT_OF_SCOPE",
    ]),
    reviewer_notes: z.string(),
    verification_status: z.enum(["DRAFT", "VERIFIED", "DISPUTED"]),
  })
  .strict();

export type GoldAnnotation = z.infer<typeof GoldAnnotationSchema>;
