import { describe, expect, it } from "bun:test";
import { hashQuestions, hashSelection } from "../../src/dataset/hash";
import type { Question } from "../../src/dataset/schema";

const question: Question = {
  question_id: "Q-TEST-001",
  language: "fr",
  category: "GENERAL_MEDICATION_KNOWLEDGE",
  therapeutic_class: "Test",
  question: "Ceci est une question de test ?",
  expected_raw_behavior: "ANSWER",
  review_status: "DRAFT",
};

describe("hashQuestions", () => {
  it("is insensitive to input order", () => {
    const a = hashQuestions([question, { ...question, question_id: "Q-TEST-002" }]);
    const b = hashQuestions([{ ...question, question_id: "Q-TEST-002" }, question]);
    expect(a).toBe(b);
  });

  it("changes when a question moves review status", () => {
    expect(hashQuestions([question])).not.toBe(
      hashQuestions([{ ...question, review_status: "APPROVED" }]),
    );
  });
});

describe("hashSelection", () => {
  it("is deterministic for the same ids", () => {
    expect(hashSelection(["Q-A", "Q-B"])).toBe(hashSelection(["Q-A", "Q-B"]));
  });

  it("distinguishes two selections of equal size", () => {
    expect(hashSelection(["Q-A", "Q-B"])).not.toBe(hashSelection(["Q-A", "Q-C"]));
  });

  it("is order-sensitive, because selection order is part of the run", () => {
    expect(hashSelection(["Q-A", "Q-B"])).not.toBe(hashSelection(["Q-B", "Q-A"]));
  });

  it("distinguishes a subset from the full set", () => {
    expect(hashSelection(["Q-A"])).not.toBe(hashSelection(["Q-A", "Q-B"]));
  });
});
