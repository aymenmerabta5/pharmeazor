import { describe, expect, it } from "bun:test";
import { computeArmDeltas, formatArmsReport, type ArmReportRow } from "../../src/reporting/arms";
import { computeSummary } from "../../src/evaluation/metrics";
import type { BenchmarkArm } from "../../src/arms";

function summary(runId: string) {
  return computeSummary({
    run_id: runId,
    evaluation: [],
    categoriesByQuestion: new Map(),
    therapeuticClassByQuestion: new Map(),
  });
}

function row(arm: BenchmarkArm): ArmReportRow {
  return {
    arm,
    run_id: `${arm}-run`,
    status: "COMPLETED",
    reviewed: 0,
    total: 0,
    summary: summary(`${arm}-run`),
    grounding: null,
    retrieval: null,
  };
}

describe("arm deltas", () => {
  it("emits one delta per documented comparison, in order", () => {
    const deltas = computeArmDeltas([row("raw"), row("oracle")]);
    expect(deltas.map((d) => d.name)).toEqual([
      "evidenceGain",
      "systemGain",
      "retrievalGap",
      "rerankGain",
      "graphGain",
    ]);
  });

  it("keeps a missing arm's delta as N/A instead of zero", () => {
    const deltas = computeArmDeltas([row("raw"), row("oracle")]);
    const systemGain = deltas.find((d) => d.name === "systemGain")!;
    expect(systemGain.delta).toBeNull();
    expect(systemGain.detail).toContain("missing RAG");
  });

  it("keeps an unreviewed pair as N/A", () => {
    const deltas = computeArmDeltas([row("raw"), row("oracle")]);
    const evidenceGain = deltas.find((d) => d.name === "evidenceGain")!;
    expect(evidenceGain.delta).toBeNull();
    expect(evidenceGain.detail).toContain("no human review");
  });
});

describe("arms report", () => {
  it("labels the scaffolded graph arm as not ready", () => {
    const report = formatArmsReport({
      rows: [row("raw"), row("oracle")],
      missing: ["rag", "rag-rerank", "rag-graph"],
      deltas: computeArmDeltas([row("raw"), row("oracle")]),
    });
    expect(report).toContain("Missing arms: RAG, RAG+rerank, RAG+graph");
    expect(report).toContain("rag-graph` is scaffolded but not ready");
    expect(report).toContain("retrieval-trace-graph.jsonl");
  });

  it("never renders an unreviewed arm as 0%", () => {
    const report = formatArmsReport({
      rows: [row("raw")],
      missing: ["oracle", "rag", "rag-rerank", "rag-graph"],
      deltas: computeArmDeltas([row("raw")]),
    });
    expect(report).toContain("N/A (0)");
    expect(report).not.toContain("0/0 (0.0%)");
  });

  it("redacts anything shaped like a Groq key", () => {
    const report = formatArmsReport({
      rows: [{ ...row("raw"), run_id: "gsk_live_abcdef123456" }],
      missing: [],
      deltas: [],
    });
    expect(report).not.toContain("gsk_live_abcdef123456");
    expect(report).toContain("[REDACTED]");
  });
});
