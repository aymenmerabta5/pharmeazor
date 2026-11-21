import { describe, expect, it } from "bun:test";
import { computeSummary } from "../../src/evaluation/metrics";
import type { EvaluationRecord, HumanScore } from "../../src/evaluation/schema";

function rec(
  qid: string,
  human: HumanScore | null,
  cat = "DOSAGE_AND_NUMERICAL_KNOWLEDGE",
): { record: EvaluationRecord; cat: string } {
  return {
    cat,
    record: {
      question_id: qid,
      run_id: "run-x",
      evaluated_at: "2026-01-01T00:00:00Z",
      response_content_hash: "h",
      annotation_hash: "a",
      deterministic: {
        facts_found: [],
        facts_missing: [],
        forbidden_claims_found: [],
        numerical: { correct: [], wrong_value: [], missed: [], unsupported: [] },
        behavior: { expected: "ANSWER", detected: "ANSWER", agrees: true },
        safety: {
          contains_diagnosis: false,
          contains_treatment_selection: false,
          contains_patient_specific_advice: false,
          acknowledges_uncertainty: false,
        },
      },
      human,
      reconciliation: human ? { status: "AGREED", disagreements: [] } : null,
    },
  };
}

function h(
  correctness: HumanScore["correctness"],
  numerical: HumanScore["numerical_accuracy"] = "NOT_APPLICABLE",
  abstention: HumanScore["abstention_outcome"] = "NOT_APPLICABLE",
): HumanScore {
  return {
    reviewer_id: "r1",
    scored_at: "2026-01-01T00:00:00Z",
    correctness,
    completeness: "COMPLETE",
    unsupported_claims: [],
    numerical_accuracy: numerical,
    abstention_outcome: abstention,
    safety: "SAFE",
    citation_accuracy: "NOT_APPLICABLE",
    evidence_faithfulness: "NOT_APPLICABLE",
    reviewer_notes: "",
  };
}

describe("computeSummary", () => {
  it("uses explicit denominators and returns null rate when denominator = 0", () => {
    const records = [rec("Q-1", h("CORRECT")), rec("Q-2", null)].map((x) => x.record);
    const s = computeSummary({
      run_id: "r",
      evaluation: records,
      categoriesByQuestion: new Map([
        ["Q-1", "DOSAGE_AND_NUMERICAL_KNOWLEDGE"],
        ["Q-2", "DOSAGE_AND_NUMERICAL_KNOWLEDGE"],
      ]),
      therapeuticClassByQuestion: new Map([
        ["Q-1", "Paracétamol"],
        ["Q-2", "Paracétamol"],
      ]),
    });
    expect(s.overall.total).toBe(2);
    expect(s.overall.human_reviewed).toBe(1);
    expect(s.overall.correctness.denominator).toBe(1);
    expect(s.overall.correctness.correct_rate).toBe(1);
    expect(s.overall.numerical.denominator).toBe(0);
    expect(s.overall.numerical.accurate_rate).toBeNull();
    expect(s.overall.abstention.denominator).toBe(0);
    expect(s.overall.abstention.correct_abstention_rate).toBeNull();
  });
  it("breaks down by category", () => {
    const a = rec("Q-1", h("CORRECT"), "DOSAGE_AND_NUMERICAL_KNOWLEDGE").record;
    const b = rec("Q-2", h("INCORRECT"), "DRUG_INTERACTIONS").record;
    const s = computeSummary({
      run_id: "r",
      evaluation: [a, b],
      categoriesByQuestion: new Map([
        ["Q-1", "DOSAGE_AND_NUMERICAL_KNOWLEDGE"],
        ["Q-2", "DRUG_INTERACTIONS"],
      ]),
      therapeuticClassByQuestion: new Map([
        ["Q-1", "Paracétamol"],
        ["Q-2", "AVK"],
      ]),
    });
    expect(s.by_category).toHaveLength(2);
    const dosage = s.by_category.find((c) => c.label === "DOSAGE_AND_NUMERICAL_KNOWLEDGE")!;
    const inter = s.by_category.find((c) => c.label === "DRUG_INTERACTIONS")!;
    expect(dosage.correctness.correct_rate).toBe(1);
    expect(inter.correctness.incorrect_rate).toBe(1);
  });
});
