/**
 * Cross-arm report.
 *
 * `benchmark compare` deliberately refuses to compare different arms, because
 * they are not the same experiment. This report is the opposite view: it shows
 * the five arms side by side and prints the deltas that the benchmark exists to
 * measure, with explicit denominators and N/A handling.
 */
import { ARM_LABELS, ARM_SHORT_LABELS, BENCHMARK_ARMS, type BenchmarkArm } from "../arms";
import type { GroundingSummary } from "../evaluation/grounding";
import type { SummaryMetrics } from "../evaluation/metrics";
import type { RetrievalReportInput } from "./retrieval";

export interface ArmReportRow {
  arm: BenchmarkArm;
  run_id: string;
  status: string;
  reviewed: number;
  total: number;
  summary: SummaryMetrics;
  /** Null for the raw arm, which never sees evidence. */
  grounding: GroundingSummary | null;
  /** Null for raw and oracle. */
  retrieval: RetrievalReportInput | null;
}

export interface ArmDelta {
  name: string;
  from: BenchmarkArm;
  to: BenchmarkArm;
  from_rate: number | null;
  to_rate: number | null;
  delta: number | null;
  detail: string;
}

export interface ArmsReportInput {
  rows: readonly ArmReportRow[];
  missing: readonly BenchmarkArm[];
  deltas: readonly ArmDelta[];
}

const DELTA_PAIRS: readonly (readonly [string, BenchmarkArm, BenchmarkArm])[] = [
  ["evidenceGain", "raw", "oracle"],
  ["systemGain", "raw", "rag"],
  ["retrievalGap", "oracle", "rag"],
  ["rerankGain", "rag", "rag-rerank"],
  ["graphGain", "rag-rerank", "rag-graph"],
];

/**
 * Correctness-rate deltas between arms.
 *
 * A rate is null when the arm has no human-reviewed response, and the detail
 * says why. Reporting `0%` for "nobody reviewed this" is how an unmeasured arm
 * gets mistaken for a bad one.
 */
export function computeArmDeltas(rows: readonly ArmReportRow[]): ArmDelta[] {
  const byArm = new Map(rows.map((row) => [row.arm, row] as const));
  return DELTA_PAIRS.map(([name, from, to]) => {
    const a = byArm.get(from);
    const b = byArm.get(to);
    if (!a || !b) {
      return {
        name,
        from,
        to,
        from_rate: a?.summary.overall.correctness.correct_rate ?? null,
        to_rate: b?.summary.overall.correctness.correct_rate ?? null,
        delta: null,
        detail: `missing ${!a ? ARM_SHORT_LABELS[from] : ARM_SHORT_LABELS[to]} run`,
      };
    }
    const aRate = a.summary.overall.correctness.correct_rate;
    const bRate = b.summary.overall.correctness.correct_rate;
    if (aRate === null || bRate === null) {
      return {
        name,
        from,
        to,
        from_rate: aRate,
        to_rate: bRate,
        delta: null,
        detail: "no human review on at least one arm",
      };
    }
    return {
      name,
      from,
      to,
      from_rate: aRate,
      to_rate: bRate,
      delta: bRate - aRate,
      detail: `${ARM_SHORT_LABELS[from]} -> ${ARM_SHORT_LABELS[to]}, human-reviewed correct rate`,
    };
  });
}

export function formatArmsReport(input: ArmsReportInput): string {
  const L: string[] = [];
  L.push("# Benchmark arms report");
  L.push("");
  L.push(`_Generated ${new Date().toISOString()}_`);
  L.push("");
  L.push(
    "The same model and prompt settings answer the same reviewed questions under five evidence conditions. " +
      "Only the evidence condition changes, which is what makes these deltas interpretable.",
  );
  L.push("");

  L.push("## Arms");
  L.push("");
  L.push("| Arm | Run | Status | Reviewed | Correct | Incorrect | Safe | Unsupported claims |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const row of input.rows) {
    const c = row.summary.overall.correctness;
    L.push(
      `| ${ARM_LABELS[row.arm]} | \`${row.run_id}\` | ${row.status} | ${row.reviewed}/${row.total} | ` +
        `${countRate(c.correct, c.denominator)} | ${countRate(c.incorrect, c.denominator)} | ` +
        `${countRate(row.summary.overall.safety.safe, row.summary.overall.safety.denominator)} | ` +
        `${countRate(
          row.summary.overall.unsupported.responses_with_any_unsupported_claim,
          row.summary.overall.unsupported.denominator,
        )} |`,
    );
  }
  L.push("");
  if (input.missing.length > 0) {
    L.push(
      `> Missing arms: ${input.missing.map((arm) => ARM_SHORT_LABELS[arm]).join(", ")}. ` +
        "Their rows are absent rather than zero-filled.",
    );
    L.push("");
  }

  L.push("## Retrieval quality");
  L.push("");
  const retrievalRows = input.rows.filter((row) => row.retrieval !== null);
  if (retrievalRows.length === 0) {
    L.push("_No retrieval arm has run._");
  } else {
    L.push(
      "| Arm | Ordering | Recall@5 | Recall@10 | MRR | nDCG@10 | Candidate@50 | Gold questions |",
    );
    L.push("|---|---|---|---|---|---|---|---|");
    for (const row of retrievalRows) {
      const r = row.retrieval!;
      L.push(
        `| ${ARM_SHORT_LABELS[row.arm]} | ${r.ordering} | ${pct(r.recall_at_5)} | ${pct(r.recall_at_10)} | ` +
          `${r.mrr === null ? "N/A" : r.mrr.toFixed(4)} | ${r.ndcg_at_10 === null ? "N/A" : r.ndcg_at_10.toFixed(4)} | ` +
          `${pct(r.candidate_recall_at_50)} | ${r.questions_with_annotations} |`,
      );
    }
  }
  L.push("");
  L.push(
    "Retrieval is measured against the gold chunk ids with each arm's ordering: `rag` uses the " +
      "reciprocal-rank-fusion order, `rag-rerank` uses the cross-encoder order, `rag-graph` uses the " +
      "graph trace's recorded order.",
  );
  L.push("");

  L.push("## Deltas");
  L.push("");
  L.push("| Delta | From | To | From rate | To rate | Delta | Note |");
  L.push("|---|---|---|---|---|---|---|");
  for (const d of input.deltas) {
    L.push(
      `| ${d.name} | ${ARM_SHORT_LABELS[d.from]} | ${ARM_SHORT_LABELS[d.to]} | ${pct(d.from_rate)} | ` +
        `${pct(d.to_rate)} | ${signed(d.delta)} | ${d.detail} |`,
    );
  }
  L.push("");
  L.push(
    "`retrievalGap` and `graphGain` are signed the other way on purpose: a positive gap means the " +
      "retrieval arm is still behind its ceiling, not that retrieval helped.",
  );
  L.push("");

  const missingGraph = input.missing.includes("rag-graph");
  L.push("## Notes");
  L.push("");
  L.push(
    "- Correctness rates come from human review. An arm with no review shows `N/A (0)`, never `0%`.",
  );
  L.push(
    "- Grounding signals are deterministic and advisory; they do not replace the human citation verdict.",
  );
  if (missingGraph) {
    L.push(
      "- `rag-graph` is scaffolded but not ready: it needs `data/v1/retrieval-trace-graph.jsonl`. " +
        "It never falls back to the base trace, so `graphGain` stays N/A until a graph trace exists.",
    );
  }
  L.push("");

  return L.join("\n").replace(/gsk_[A-Za-z0-9_-]+/g, "[REDACTED]");
}

/** Arms in report order, including the ones that are missing from the run set. */
export function armRowsInOrder(rows: readonly ArmReportRow[]): ArmReportRow[] {
  const byArm = new Map(rows.map((row) => [row.arm, row] as const));
  return BENCHMARK_ARMS.map((arm) => byArm.get(arm)).filter(
    (row): row is ArmReportRow => row !== undefined,
  );
}

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function signed(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

function countRate(n: number, d: number): string {
  if (d === 0) return "N/A (0)";
  return `${n}/${d} (${((n / d) * 100).toFixed(1)}%)`;
}
