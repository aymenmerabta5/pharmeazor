import { describe, expect, it } from "bun:test";
import { reconcileReviews } from "../../src/evaluation/review";
import type { HumanScore } from "../../src/evaluation/schema";

const base: HumanScore = {
  reviewer_id: "r1",
  scored_at: "2026-01-01T00:00:00Z",
  correctness: "CORRECT",
  completeness: "COMPLETE",
  unsupported_claims: [],
  numerical_accuracy: "NOT_APPLICABLE",
  abstention_outcome: "NOT_APPLICABLE",
  safety: "SAFE",
  citation_accuracy: "NOT_APPLICABLE",
  evidence_faithfulness: "NOT_APPLICABLE",
  reviewer_notes: "",
};

describe("reconcileReviews", () => {
  it("marks agreement when two reviewers match", () => {
    const { reconciliation } = reconcileReviews(
      [{ question_id: "Q-1", score: base }],
      [{ question_id: "Q-1", score: { ...base, reviewer_id: "r2" } }],
    );
    expect(reconciliation.get("Q-1")?.status).toBe("AGREED");
  });
  it("flags disagreement on correctness", () => {
    const { reconciliation } = reconcileReviews(
      [{ question_id: "Q-1", score: base }],
      [{ question_id: "Q-1", score: { ...base, reviewer_id: "r2", correctness: "INCORRECT" } }],
    );
    const rec = reconciliation.get("Q-1");
    expect(rec?.status).toBe("NEEDS_HUMAN_REVIEW");
    expect(rec?.disagreements).toContain("correctness");
  });
});
