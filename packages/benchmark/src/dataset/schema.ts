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
 * Difficulty is a reviewer judgement, not an inference from question length.
 * `UNKNOWN` is the only honest value for an unreviewed row.
 */
export const DIFFICULTY_VALUES = ["UNKNOWN", "EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTY_VALUES)[number];

/**
 * Stable chunk identifier produced by the retrieval chunker:
 * `${artifactId}#${sectionCode}-${occurrence}#${ordinal}`, for example
 * `MED001#posologie-1#0`. Gold labels use the same identifier the retriever
 * returns, so recall@k can be computed without a translation table.
 */
export const CHUNK_ID_PATTERN = /^[A-Za-z0-9_.-]+#[a-z][a-z0-9_]{1,47}-[0-9]+#[0-9]+$/;

/** Source identifiers follow the retrieval SOURCE_ID contract. */
export const SOURCE_ID_PATTERN = /^[A-Z][A-Z0-9_]{1,47}$/;

/** Section codes follow the retrieval SECTION_CODE contract. */
export const SECTION_CODE_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** Evidence markers rendered into the oracle prompt: E1 … E99. */
export const EVIDENCE_ID_PATTERN = /^E[0-9]{1,2}$/;

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
 * One curated passage supplied verbatim to the oracle arm. The oracle arm
 * exists to measure the model with perfect evidence, so the passage is the
 * source of truth for citation and faithfulness checks: a claim that cannot
 * be traced to one of these passages is unfaithful by construction.
 */
export const EvidencePassageSchema = z
  .object({
    evidence_id: z.string().regex(EVIDENCE_ID_PATTERN, "evidence_id must look like E1"),
    text: z
      .string()
      .min(1, "evidence text must not be empty")
      .max(4000, "one evidence passage must stay under 4000 characters"),
    source_id: z.string().regex(SOURCE_ID_PATTERN, "source_id must match SOURCE_ID_PATTERN"),
    source_name: z.string().min(1, "source_name must not be empty"),
    section_code: z
      .string()
      .regex(SECTION_CODE_PATTERN, "section_code must match SECTION_CODE_PATTERN"),
    chunk_id: z.string().regex(CHUNK_ID_PATTERN, "chunk_id must match CHUNK_ID_PATTERN").nullable(),
  })
  .strict();

export type EvidencePassage = z.infer<typeof EvidencePassageSchema>;

/**
 * Gold-annotation schema. Not re-exported from `src/index.ts` and not
 * imported by `src/dataset/loader.ts`.
 *
 * `relevant_chunk_ids` is the retrieval ground truth used by recall@k, MRR and
 * nDCG@10. `evidence_bundle` is the oracle arm input and may reference only a
 * subset of the relevant chunks. Keeping both lets the retrieval gate and the
 * oracle arm disagree for the right reasons instead of silently sharing one
 * list.
 */
export const GoldAnnotationSchema = z
  .object({
    question_id: z.string().min(1, "question_id must not be empty"),
    reference_answer: z.string().nullable(),
    expected_facts: z.array(z.string()),
    forbidden_claims: z.array(z.string()),
    relevant_chunk_ids: z.array(z.string().regex(CHUNK_ID_PATTERN)),
    evidence_bundle: z
      .array(EvidencePassageSchema)
      .max(8, "an oracle bundle holds at most 8 passages"),
    answerable_without_corpus: z.boolean().nullable(),
    difficulty: z.enum(["UNKNOWN", "EASY", "MEDIUM", "HARD"]),
    expected_behavior: z.enum([
      "ANSWER",
      "LIMITED_ANSWER",
      "ABSTAIN",
      "ASK_CLARIFICATION",
      "REFUSE_OUT_OF_SCOPE",
    ]),
    reviewer_notes: z.string(),
    verification_status: z.enum(["DRAFT", "VERIFIED", "DISPUTED"]),
    reviewed_by: z.string().nullable(),
    reviewed_at: z.string().nullable(),
  })
  .strict();

export type GoldAnnotation = z.infer<typeof GoldAnnotationSchema>;
