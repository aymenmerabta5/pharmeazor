import { describe, it, expect } from "bun:test";
import { GoldAnnotationSchema, QuestionSchema } from "../../src/dataset/schema";

const validQuestion = {
  question_id: "Q-TEST-001",
  language: "fr" as const,
  category: "GENERAL_MEDICATION_KNOWLEDGE" as const,
  therapeutic_class: "Test class",
  question: "Ceci est une question de test ?",
  expected_raw_behavior: "ANSWER" as const,
  review_status: "DRAFT" as const,
};

describe("QuestionSchema", () => {
  it("accepts a valid DRAFT question", () => {
    expect(QuestionSchema.safeParse(validQuestion).success).toBe(true);
  });

  it("rejects an empty question_id", () => {
    expect(QuestionSchema.safeParse({ ...validQuestion, question_id: "" }).success).toBe(false);
  });

  it("rejects an empty question", () => {
    expect(QuestionSchema.safeParse({ ...validQuestion, question: "" }).success).toBe(false);
  });

  it("rejects an unsupported language", () => {
    expect(QuestionSchema.safeParse({ ...validQuestion, language: "de" }).success).toBe(false);
  });

  it("rejects an invalid category", () => {
    expect(QuestionSchema.safeParse({ ...validQuestion, category: "NOT_A_CATEGORY" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid expected_raw_behavior", () => {
    expect(
      QuestionSchema.safeParse({ ...validQuestion, expected_raw_behavior: "EXPLODE" }).success,
    ).toBe(false);
  });

  it("rejects an invalid review_status", () => {
    expect(QuestionSchema.safeParse({ ...validQuestion, review_status: "PENDING" }).success).toBe(
      false,
    );
  });

  it("rejects a reference_answer field on a question", () => {
    const withLeak = { ...validQuestion, reference_answer: "fake answer" };
    expect(QuestionSchema.safeParse(withLeak).success).toBe(false);
  });

  it("rejects any unknown field on a question", () => {
    const withExtra = { ...validQuestion, sneaky: true };
    expect(QuestionSchema.safeParse(withExtra).success).toBe(false);
  });
});

const validAnnotation = {
  question_id: "Q-TEST-001",
  reference_answer: null as string | null,
  expected_facts: [] as string[],
  forbidden_claims: [] as string[],
  relevant_chunk_ids: [] as string[],
  evidence_bundle: [],
  answerable_without_corpus: true as boolean | null,
  difficulty: "UNKNOWN" as const,
  expected_behavior: "ANSWER" as const,
  reviewer_notes: "pending",
  verification_status: "DRAFT" as const,
  reviewed_by: null as string | null,
  reviewed_at: null as string | null,
};

describe("GoldAnnotationSchema", () => {
  it("accepts a DRAFT annotation with null reference_answer", () => {
    expect(GoldAnnotationSchema.safeParse(validAnnotation).success).toBe(true);
  });

  it("accepts a VERIFIED annotation with a reference answer", () => {
    const verified = {
      ...validAnnotation,
      reference_answer: "the verified answer",
      expected_facts: ["fact one"],
      verification_status: "VERIFIED" as const,
    };
    expect(GoldAnnotationSchema.safeParse(verified).success).toBe(true);
  });

  it("rejects a missing reviewer_notes field", () => {
    const { reviewer_notes: _omit, ...rest } = validAnnotation;
    expect(GoldAnnotationSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an invalid verification_status", () => {
    expect(
      GoldAnnotationSchema.safeParse({ ...validAnnotation, verification_status: "DONE" }).success,
    ).toBe(false);
  });
});
