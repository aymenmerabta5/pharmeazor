import { describe, it, expect } from "bun:test";
import { validateDataset } from "../../src/dataset/validate";
import type { GoldAnnotation, Question } from "../../src/dataset/schema";

function q(overrides: Partial<Question> = {}): Question {
  return {
    question_id: "Q-X-001",
    language: "fr",
    category: "GENERAL_MEDICATION_KNOWLEDGE",
    therapeutic_class: "Test",
    question: "Question ?",
    expected_raw_behavior: "ANSWER",
    review_status: "DRAFT",
    ...overrides,
  };
}

function a(overrides: Partial<GoldAnnotation> = {}): GoldAnnotation {
  return {
    question_id: "Q-X-001",
    reference_answer: null,
    expected_facts: [],
    forbidden_claims: [],
    expected_behavior: "ANSWER",
    reviewer_notes: "",
    verification_status: "DRAFT",
    ...overrides,
  };
}

describe("validateDataset", () => {
  it("flags duplicate question_ids", () => {
    const r = validateDataset(
      [q({ question_id: "A" }), q({ question_id: "A" })],
      [a({ question_id: "A" })],
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "DUPLICATE_QUESTION_ID")).toBe(true);
  });

  it("warns on missing gold annotation", () => {
    const r = validateDataset([q({ question_id: "A" })], []);
    expect(r.warnings.some((w) => w.code === "MISSING_ANNOTATION")).toBe(true);
  });

  it("warns on orphan annotation", () => {
    const r = validateDataset([], [a({ question_id: "A" })]);
    expect(r.warnings.some((w) => w.code === "ORPHAN_ANNOTATION")).toBe(true);
  });

  it("errors when APPROVED question is not VERIFIED", () => {
    const r = validateDataset(
      [q({ question_id: "A", review_status: "APPROVED" })],
      [a({ question_id: "A", verification_status: "DRAFT" })],
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "APPROVED_BUT_NOT_VERIFIED")).toBe(true);
  });

  it("errors when APPROVED question has no reference_answer", () => {
    const r = validateDataset(
      [q({ question_id: "A", review_status: "APPROVED" })],
      [a({ question_id: "A", verification_status: "VERIFIED", reference_answer: null })],
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "APPROVED_WITHOUT_REFERENCE_ANSWER")).toBe(true);
  });

  it("errors when expected_behavior mismatches between question and annotation", () => {
    const r = validateDataset(
      [q({ question_id: "A", expected_raw_behavior: "ANSWER" })],
      [a({ question_id: "A", expected_behavior: "ABSTAIN" })],
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "BEHAVIOR_MISMATCH")).toBe(true);
  });

  it("passes on a fully approved and verified question", () => {
    const r = validateDataset(
      [q({ question_id: "A", review_status: "APPROVED" })],
      [
        a({
          question_id: "A",
          verification_status: "VERIFIED",
          reference_answer: "the verified answer",
          expected_facts: ["fact one"],
        }),
      ],
    );
    expect(r.ok).toBe(true);
  });

  it("stats reflect status and language counts", () => {
    const r = validateDataset(
      [q({ question_id: "A" }), q({ question_id: "B", review_status: "REJECTED" })],
      [a({ question_id: "A" }), a({ question_id: "B" })],
    );
    expect(r.stats.total).toBe(2);
    expect(r.stats.by_review_status.DRAFT).toBe(1);
    expect(r.stats.by_review_status.REJECTED).toBe(1);
    expect(r.stats.by_language.fr).toBe(2);
  });
});
