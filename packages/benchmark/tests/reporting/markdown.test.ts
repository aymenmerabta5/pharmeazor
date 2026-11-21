import { describe, expect, it } from "bun:test";
import { generateMarkdownReport } from "../../src/reporting/markdown";
import type { RunMetadata, ResponseLine } from "../../src/storage/fs";
import type { EvaluationRecord } from "../../src/evaluation/schema";
import type { SummaryMetrics } from "../../src/evaluation/metrics";

function meta(): RunMetadata {
  return {
    run_id: "run-test-1",
    started_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:01:00Z",
    status: "COMPLETED",
    model_id: "openai/gpt-oss-120b",
    provider: "groq",
    reasoning_effort: "medium",
    prompt_version: "raw-v1",
    dataset_version: "v1",
    dataset_hash: "abcdef",
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
    cumulative_usage: {
      api_calls: 1,
      cache_hits: 0,
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    },
  };
}

function response(): ResponseLine {
  return {
    question_id: "Q-1",
    cache_key: "hash",
    source: "api",
    content: "The answer to the question.",
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    finish_reason: "stop",
    request_id: "req-1",
    latency_ms: 500,
    answered_at: "2026-01-01T00:01:00Z",
  };
}

function evaluation(human: boolean): EvaluationRecord {
  return {
    question_id: "Q-1",
    run_id: "run-test-1",
    evaluated_at: "2026-01-01T00:01:00Z",
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
    human: human
      ? {
          reviewer_id: "r1",
          scored_at: "2026-01-01T00:01:00Z",
          correctness: "CORRECT",
          completeness: "COMPLETE",
          unsupported_claims: [],
          numerical_accuracy: "NOT_APPLICABLE",
          abstention_outcome: "NOT_APPLICABLE",
          safety: "SAFE",
          citation_accuracy: "NOT_APPLICABLE",
          evidence_faithfulness: "NOT_APPLICABLE",
          reviewer_notes: "",
        }
      : null,
    reconciliation: human ? { status: "AGREED", disagreements: [] } : null,
  };
}

function emptySummary(): SummaryMetrics {
  return {
    run_id: "run-test-1",
    generated_at: "2026-01-01T00:01:00Z",
    overall: {
      label: "ALL",
      total: 1,
      human_reviewed: 0,
      correctness: {
        correct: 0,
        partially_correct: 0,
        incorrect: 0,
        unverifiable: 0,
        denominator: 0,
        correct_rate: null,
        partially_correct_rate: null,
        incorrect_rate: null,
        unverifiable_rate: null,
      },
      completeness: {
        complete: 0,
        partial: 0,
        incomplete: 0,
        unverifiable: 0,
        denominator: 0,
        complete_rate: null,
        partial_rate: null,
        incomplete_rate: null,
      },
      numerical: {
        accurate: 0,
        partial: 0,
        inaccurate: 0,
        unverifiable: 0,
        not_applicable: 0,
        denominator: 0,
        accurate_rate: null,
        inaccurate_rate: null,
      },
      abstention: {
        correct_abstention: 0,
        incorrect_abstention: 0,
        missed_abstention: 0,
        unsupported_confident_answer: 0,
        appropriate_clarification: 0,
        not_applicable: 0,
        denominator: 0,
        correct_abstention_rate: null,
        missed_abstention_rate: null,
        unsupported_confident_answer_rate: null,
      },
      safety: {
        safe: 0,
        unsafe: 0,
        unverifiable: 0,
        denominator: 0,
        safe_rate: null,
        unsafe_rate: null,
      },
      unsupported: {
        responses_with_any_unsupported_claim: 0,
        total_unsupported_claims: 0,
        denominator: 0,
        rate: null,
      },
      unverifiable_rate: null,
    },
    by_category: [],
    by_therapeutic_class: [],
    by_review_status: { agreed: 0, needs_review: 0, unreviewed: 1 },
    notes: ["note one"],
  };
}

describe("generateMarkdownReport", () => {
  it("produces a report with the run id, model and prompt version", () => {
    const report = generateMarkdownReport({
      metadata: meta(),
      responses: [response()],
      errors: [],
      evaluation: [evaluation(false)],
      summary: emptySummary(),
      questionsById: new Map([
        [
          "Q-1",
          {
            category: "DOSAGE_AND_NUMERICAL_KNOWLEDGE",
            therapeutic_class: "Paracétamol",
            question: "Q?",
          },
        ],
      ]),
    });
    expect(report.markdown).toContain("run-test-1");
    expect(report.markdown).toContain("openai/gpt-oss-120b");
    expect(report.markdown).toContain("raw-v1");
  });

  it("shows N/A rather than 0 for unreviewed slices", () => {
    const report = generateMarkdownReport({
      metadata: meta(),
      responses: [response()],
      errors: [],
      evaluation: [evaluation(false)],
      summary: emptySummary(),
      questionsById: new Map([
        [
          "Q-1",
          {
            category: "DOSAGE_AND_NUMERICAL_KNOWLEDGE",
            therapeutic_class: "Paracétamol",
            question: "Q?",
          },
        ],
      ]),
    });
    expect(report.markdown).toContain("No human review submitted yet");
    expect(report.markdown).toContain("N/A");
  });

  it("does not contain any API key or GROQ_API_KEY marker", () => {
    const report = generateMarkdownReport({
      metadata: meta(),
      responses: [response()],
      errors: [],
      evaluation: [evaluation(false)],
      summary: emptySummary(),
      questionsById: new Map([
        [
          "Q-1",
          {
            category: "DOSAGE_AND_NUMERICAL_KNOWLEDGE",
            therapeutic_class: "Paracétamol",
            question: "Q?",
          },
        ],
      ]),
    });
    expect(report.markdown).not.toMatch(/gsk_[A-Za-z0-9_-]{10,}/);
    expect(report.markdown).not.toMatch(/GROQ_API_KEY=/);
  });
});
