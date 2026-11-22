import { z } from "zod";

export const CORRECTNESS_VALUES = [
  "CORRECT",
  "PARTIALLY_CORRECT",
  "INCORRECT",
  "UNVERIFIABLE",
] as const;
export type Correctness = (typeof CORRECTNESS_VALUES)[number];

export const COMPLETENESS_VALUES = ["COMPLETE", "PARTIAL", "INCOMPLETE", "UNVERIFIABLE"] as const;
export type Completeness = (typeof COMPLETENESS_VALUES)[number];

export const NUMERICAL_ACCURACY_VALUES = [
  "ACCURATE",
  "PARTIAL",
  "INACCURATE",
  "NOT_APPLICABLE",
  "UNVERIFIABLE",
] as const;
export type NumericalAccuracy = (typeof NUMERICAL_ACCURACY_VALUES)[number];

export const ABSTENTION_OUTCOME_VALUES = [
  "CORRECT_ABSTENTION",
  "INCORRECT_ABSTENTION",
  "MISSED_ABSTENTION",
  "UNSUPPORTED_CONFIDENT_ANSWER",
  "APPROPRIATE_CLARIFICATION",
  "NOT_APPLICABLE",
] as const;
export type AbstentionOutcome = (typeof ABSTENTION_OUTCOME_VALUES)[number];

export const SAFETY_VALUES = ["SAFE", "UNSAFE", "UNVERIFIABLE"] as const;
export type SafetyVerdict = (typeof SAFETY_VALUES)[number];

/**
 * Citation and faithfulness verdicts. They are scored only for evidence arms
 * (oracle, later RAG); the raw arm keeps `NOT_APPLICABLE`.
 */
export const CITATION_VALUES = [
  "ACCURATE",
  "PARTIAL",
  "INACCURATE",
  "NOT_APPLICABLE",
  "UNVERIFIABLE",
] as const;
export type CitationVerdict = (typeof CITATION_VALUES)[number];

export const EVIDENCE_FAITHFULNESS_VALUES = CITATION_VALUES;
export type EvidenceFaithfulness = (typeof CITATION_VALUES)[number];

export const DETECTED_BEHAVIOR_VALUES = [
  "ANSWER",
  "LIMITED_ANSWER",
  "ABSTAIN",
  "ASK_CLARIFICATION",
  "REFUSE_OUT_OF_SCOPE",
] as const;
export type DetectedBehavior = (typeof DETECTED_BEHAVIOR_VALUES)[number];

export const NumberWithUnitSchema = z.object({
  value: z.number(),
  unit: z.string(),
  raw: z.string(),
});
export type NumberWithUnit = z.infer<typeof NumberWithUnitSchema>;

export const NumericalComparisonSchema = z.object({
  correct: z.array(NumberWithUnitSchema),
  wrong_value: z.array(
    z.object({
      unit: z.string(),
      expected: z.array(z.number()),
      generated: z.array(z.number()),
    }),
  ),
  missed: z.array(NumberWithUnitSchema),
  unsupported: z.array(NumberWithUnitSchema),
});
export type NumericalComparison = z.infer<typeof NumericalComparisonSchema>;

export const SafetySignalsSchema = z.object({
  contains_diagnosis: z.boolean(),
  contains_treatment_selection: z.boolean(),
  contains_patient_specific_advice: z.boolean(),
  acknowledges_uncertainty: z.boolean(),
});
export type SafetySignals = z.infer<typeof SafetySignalsSchema>;

/**
 * Deterministic grounding signals for evidence arms. The marker vocabulary is
 * `[E1] … [E99]`, matching the ids the oracle prompt assigns to its passages.
 * These signals are advisory, exactly like the rest of the rubric: a human
 * reviewer is still the authoritative score.
 */
export const GroundingSignalsSchema = z.object({
  cited_evidence_ids: z.array(z.string()),
  invalid_citations: z.array(z.string()),
  /** The answer makes a claim but cites nothing. */
  uncited: z.boolean(),
  /** Numbers in the answer that do not appear in any supplied passage. */
  unsupported_numbers: z.array(NumberWithUnitSchema),
  supplied_passage_count: z.number().int().nonnegative(),
});
export type GroundingSignals = z.infer<typeof GroundingSignalsSchema>;

export const DeterministicSignalsSchema = z.object({
  facts_found: z.array(z.string()),
  facts_missing: z.array(z.string()),
  forbidden_claims_found: z.array(z.string()),
  numerical: NumericalComparisonSchema,
  behavior: z.object({
    expected: z.enum(DETECTED_BEHAVIOR_VALUES),
    detected: z.enum(DETECTED_BEHAVIOR_VALUES),
    agrees: z.boolean(),
  }),
  safety: SafetySignalsSchema,
  /** Present only when the question carried an evidence bundle. */
  grounding: GroundingSignalsSchema.optional(),
});
export type DeterministicSignals = z.infer<typeof DeterministicSignalsSchema>;

export const HumanScoreSchema = z.object({
  reviewer_id: z.string().min(1),
  scored_at: z.string(),
  correctness: z.enum(CORRECTNESS_VALUES),
  completeness: z.enum(COMPLETENESS_VALUES),
  unsupported_claims: z.array(z.string()),
  numerical_accuracy: z.enum(NUMERICAL_ACCURACY_VALUES),
  abstention_outcome: z.enum(ABSTENTION_OUTCOME_VALUES),
  safety: z.enum(SAFETY_VALUES),
  citation_accuracy: z.enum(CITATION_VALUES),
  evidence_faithfulness: z.enum(CITATION_VALUES),
  reviewer_notes: z.string(),
});
export type HumanScore = z.infer<typeof HumanScoreSchema>;

export const ReconciliationSchema = z.object({
  status: z.enum(["AGREED", "SINGLE_REVIEW", "RECONCILED", "NEEDS_HUMAN_REVIEW"]),
  disagreements: z.array(z.string()),
  reconciled_by: z.string().optional(),
  reconciled_at: z.string().optional(),
});
export type Reconciliation = z.infer<typeof ReconciliationSchema>;

export const EvaluationRecordSchema = z.object({
  question_id: z.string(),
  run_id: z.string(),
  evaluated_at: z.string(),
  response_content_hash: z.string(),
  annotation_hash: z.string(),
  deterministic: DeterministicSignalsSchema,
  human: HumanScoreSchema.nullable(),
  reconciliation: ReconciliationSchema.nullable(),
});
export type EvaluationRecord = z.infer<typeof EvaluationRecordSchema>;
