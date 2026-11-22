import { describe, expect, it } from "bun:test";
import { checkReproducibility } from "../../src/reporting/checks";
import type { RunMetadata, ResponseLine } from "../../src/storage/fs";
import type { SummaryMetrics } from "../../src/evaluation/metrics";

function meta(): RunMetadata {
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
    generation: {},
    total_questions: 1,
    allow_draft: false,
    selection_hash: "sel-1",
    selected_question_ids: ["Q-1"],
    provenance: {
      system_prompt_hash: "prompt-1",
      selection_hash: "sel-1",
      selected_question_ids: ["Q-1"],
      temperature: null,
      seed: null,
      model_revision: null,
      sdk: { ai: "7.0.173", groq: "4.0.84" },
      runtime: { bun: "1.4.5", node: "v24.19.0", platform: "win32" },
    },
    cumulative_usage: {
      api_calls: 1,
      cache_hits: 0,
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };
}

function response(): ResponseLine {
  return {
    question_id: "Q-1",
    cache_key: "ck",
    source: "api",
    content: "x",
    usage: {},
    finish_reason: "stop",
    request_id: "req",
    latency_ms: 100,
    answered_at: "2026-01-01T00:00:00Z",
  };
}

const summary = { generated_at: "2026-01-01T00:00:00Z" } as unknown as SummaryMetrics;

describe("checkReproducibility", () => {
  it("passes a complete run", () => {
    const r = checkReproducibility({
      metadata: meta(),
      responses: [response()],
      errors: [],
      evaluation: [],
      summary,
      fileContents: new Map([["run_metadata.json", "{}"]]),
    });
    expect(r.passed).toBe(true);
  });
  it("fails when cumulative_usage is missing", () => {
    const r = checkReproducibility({
      metadata: { ...meta(), cumulative_usage: undefined },
      responses: [response()],
      errors: [],
      evaluation: [],
      summary,
      fileContents: new Map(),
    });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name.includes("cumulative_usage"))?.passed).toBe(false);
  });
  it("fails when responses + errors does not match total_questions", () => {
    const r = checkReproducibility({
      metadata: { ...meta(), total_questions: 5 },
      responses: [response()],
      errors: [],
      evaluation: [],
      summary,
      fileContents: new Map(),
    });
    expect(r.passed).toBe(false);
  });
  it("fails when a file contains a secret", () => {
    const r = checkReproducibility({
      metadata: meta(),
      responses: [response()],
      errors: [],
      evaluation: [],
      summary,
      fileContents: new Map([["leak.txt", "GROQ_API_KEY=gsk_realkey1234567890"]]),
    });
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name.includes("secret"))?.passed).toBe(false);
  });
});
