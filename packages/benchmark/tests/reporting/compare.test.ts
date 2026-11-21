import { describe, expect, it } from "bun:test";
import { compareRuns, type ComparableRun } from "../../src/reporting/compare";
import type { RunMetadata } from "../../src/storage/fs";
import type { SummaryMetrics } from "../../src/evaluation/metrics";

function meta(overrides: Partial<RunMetadata> = {}): RunMetadata {
  return {
    run_id: "run-x",
    started_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    status: "COMPLETED",
    model_id: "openai/gpt-oss-120b",
    provider: "groq",
    reasoning_effort: "medium",
    prompt_version: "raw-v1",
    dataset_version: "v1",
    dataset_hash: "h1",
    git_sha: null,
    generation: {
      model_id: "openai/gpt-oss-120b",
      provider: "groq",
      reasoning_effort: "medium",
      concurrency: 1,
      max_output_tokens: 2048,
    },
    total_questions: 1,
    allow_draft: false,
    ...overrides,
  };
}

const emptySummary: SummaryMetrics = {
  run_id: "run-x",
  generated_at: "2026-01-01T00:00:00Z",
  overall: {
    label: "ALL",
    total: 0,
    human_reviewed: 0,
    correctness: { correct: 0, partially_correct: 0, incorrect: 0, unverifiable: 0, denominator: 0, correct_rate: null, partially_correct_rate: null, incorrect_rate: null, unverifiable_rate: null },
    completeness: { complete: 0, partial: 0, incomplete: 0, unverifiable: 0, denominator: 0, complete_rate: null, partial_rate: null, incomplete_rate: null },
    numerical: { accurate: 0, partial: 0, inaccurate: 0, unverifiable: 0, not_applicable: 0, denominator: 0, accurate_rate: null, inaccurate_rate: null },
    abstention: { correct_abstention: 0, incorrect_abstention: 0, missed_abstention: 0, unsupported_confident_answer: 0, appropriate_clarification: 0, not_applicable: 0, denominator: 0, correct_abstention_rate: null, missed_abstention_rate: null, unsupported_confident_answer_rate: null },
    safety: { safe: 0, unsafe: 0, unverifiable: 0, denominator: 0, safe_rate: null, unsafe_rate: null },
    unsupported: { responses_with_any_unsupported_claim: 0, total_unsupported_claims: 0, denominator: 0, rate: null },
    unverifiable_rate: null,
  },
  by_category: [],
  by_therapeutic_class: [],
  by_review_status: { agreed: 0, needs_review: 0, unreviewed: 0 },
  notes: [],
};

function run(overrides: Partial<RunMetadata> = {}): ComparableRun {
  return { metadata: meta(overrides), evaluation: [], summary: emptySummary };
}

describe("compareRuns", () => {
  it("marks identical configs as compatible", () => {
    expect(compareRuns(run(), run()).compatible).toBe(true);
  });
  it("rejects a different model", () => {
    expect(compareRuns(run(), run({ model_id: "other" })).compatible).toBe(false);
  });
  it("rejects a different prompt version", () => {
    expect(compareRuns(run(), run({ prompt_version: "raw-v2" })).compatible).toBe(false);
  });
  it("rejects a different dataset hash", () => {
    expect(compareRuns(run(), run({ dataset_hash: "other" })).compatible).toBe(false);
  });
  it("rejects different generation settings", () => {
    const gen = {
      model_id: "openai/gpt-oss-120b",
      provider: "groq",
      reasoning_effort: "high",
      concurrency: 1,
      max_output_tokens: 2048,
    };
    expect(compareRuns(run(), run({ generation: gen })).compatible).toBe(false);
  });
  it("warns but still compares when annotations_hash is missing", () => {
    const r = compareRuns(run(), run());
    expect(r.warnings.some((w) => w.includes("annotations_hash"))).toBe(true);
    expect(r.compatible).toBe(true);
  });
  it("rejects when both have different annotations_hash", () => {
    const a = run({ annotations_hash: "aaa" });
    const b = run({ annotations_hash: "bbb" });
    expect(compareRuns(a, b).compatible).toBe(false);
  });
});
