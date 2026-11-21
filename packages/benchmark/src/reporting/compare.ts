import type { RunMetadata } from "../storage/fs";
import type { EvaluationRecord } from "../evaluation/schema";
import type { SummaryMetrics } from "../evaluation/metrics";

export interface ComparableRun {
  metadata: RunMetadata;
  evaluation: readonly EvaluationRecord[];
  summary: SummaryMetrics;
}

export interface CompatibilityCheck {
  field: string;
  a: unknown;
  b: unknown;
  compatible: boolean;
}

export interface PerQuestionDelta {
  question_id: string;
  a_correctness: string | null;
  b_correctness: string | null;
  a_behavior: string;
  b_behavior: string;
  changed: boolean;
  note: string | null;
}

export interface ComparisonResult {
  compatible: boolean;
  checks: CompatibilityCheck[];
  warnings: string[];
  deltas: {
    per_question: PerQuestionDelta[];
    summary: {
      a_correctness_rate: number | null;
      b_correctness_rate: number | null;
      delta_correctness_rate: number | null;
      a_incorrect_rate: number | null;
      b_incorrect_rate: number | null;
      delta_incorrect_rate: number | null;
    };
  };
}

function checkField(field: string, a: unknown, b: unknown): CompatibilityCheck {
  return { field, a, b, compatible: JSON.stringify(a) === JSON.stringify(b) };
}

export function compareRuns(a: ComparableRun, b: ComparableRun): ComparisonResult {
  const checks: CompatibilityCheck[] = [
    checkField("model_id", a.metadata.model_id, b.metadata.model_id),
    checkField("provider", a.metadata.provider, b.metadata.provider),
    checkField("prompt_version", a.metadata.prompt_version, b.metadata.prompt_version),
    checkField("reasoning_effort", a.metadata.reasoning_effort, b.metadata.reasoning_effort),
    checkField("dataset_version", a.metadata.dataset_version, b.metadata.dataset_version),
    checkField("dataset_hash", a.metadata.dataset_hash, b.metadata.dataset_hash),
    checkField("total_questions", a.metadata.total_questions, b.metadata.total_questions),
    checkField("run_mode", a.metadata.run_mode ?? "raw", b.metadata.run_mode ?? "raw"),
    checkField("generation", a.metadata.generation, b.metadata.generation),
  ];

  const warnings: string[] = [];
  const aAnn = a.metadata.annotations_hash ?? null;
  const bAnn = b.metadata.annotations_hash ?? null;
  if (aAnn === null || bAnn === null) {
    warnings.push(
      "At least one run is missing annotations_hash; annotation compatibility cannot be verified. Comparison is still attempted.",
    );
  } else if (aAnn !== bAnn) {
    checks.push(checkField("annotations_hash", aAnn, bAnn));
  }

  const compatible = checks.every((c) => c.compatible);

  const aEval = new Map(a.evaluation.map((e) => [e.question_id, e] as const));
  const bEval = new Map(b.evaluation.map((e) => [e.question_id, e] as const));
  const allIds = [...new Set([...aEval.keys(), ...bEval.keys()])].sort();
  const per_question: PerQuestionDelta[] = [];
  for (const qid of allIds) {
    const ae = aEval.get(qid);
    const be = bEval.get(qid);
    if (!ae || !be) {
      per_question.push({
        question_id: qid,
        a_correctness: ae?.human?.correctness ?? null,
        b_correctness: be?.human?.correctness ?? null,
        a_behavior: ae?.deterministic.behavior.detected ?? "MISSING",
        b_behavior: be?.deterministic.behavior.detected ?? "MISSING",
        changed: true,
        note: ae ? "missing in run B" : "missing in run A",
      });
      continue;
    }
    const aCorr = ae.human?.correctness ?? null;
    const bCorr = be.human?.correctness ?? null;
    const aBeh = ae.deterministic.behavior.detected;
    const bBeh = be.deterministic.behavior.detected;
    const changed = aCorr !== bCorr || aBeh !== bBeh;
    const note =
      aCorr === null || bCorr === null
        ? "at least one run has no human review for this question"
        : null;
    per_question.push({
      question_id: qid,
      a_correctness: aCorr,
      b_correctness: bCorr,
      a_behavior: aBeh,
      b_behavior: bBeh,
      changed,
      note,
    });
  }

  const aRate = a.summary.overall.correctness.correct_rate;
  const bRate = b.summary.overall.correctness.correct_rate;
  const aInc = a.summary.overall.correctness.incorrect_rate;
  const bInc = b.summary.overall.correctness.incorrect_rate;

  return {
    compatible,
    checks,
    warnings,
    deltas: {
      per_question,
      summary: {
        a_correctness_rate: aRate,
        b_correctness_rate: bRate,
        delta_correctness_rate: aRate !== null && bRate !== null ? bRate - aRate : null,
        a_incorrect_rate: aInc,
        b_incorrect_rate: bInc,
        delta_incorrect_rate: aInc !== null && bInc !== null ? bInc - aInc : null,
      },
    },
  };
}

export function formatComparison(result: ComparisonResult, aId: string, bId: string): string {
  const L: string[] = [];
  L.push(`# Run comparison — \`${aId}\` vs \`${bId}\``);
  L.push("");
  L.push(
    result.compatible
      ? "**Compatible.** Configuration checks all passed."
      : "**INCOMPATIBLE — comparison refused.** These runs cannot be treated as directly comparable.",
  );
  L.push("");
  L.push("## Compatibility checks");
  L.push("");
  L.push("| Field | Run A | Run B | Compatible |");
  L.push("|---|---|---|---|");
  for (const c of result.checks) {
    L.push(
      `| ${c.field} | ${truncate(JSON.stringify(c.a))} | ${truncate(JSON.stringify(c.b))} | ${c.compatible ? "yes" : "no"} |`,
    );
  }
  L.push("");
  if (result.warnings.length > 0) {
    L.push("## Warnings");
    L.push("");
    for (const w of result.warnings) L.push(`- ${w}`);
    L.push("");
  }
  if (!result.compatible) return L.join("\n");

  L.push("## Summary deltas");
  L.push("");
  const s = result.deltas.summary;
  L.push("| Metric | Run A | Run B | Delta (B - A) |");
  L.push("|---|---|---|---|");
  L.push(
    `| Correctness rate | ${fmtRate(s.a_correctness_rate)} | ${fmtRate(s.b_correctness_rate)} | ${fmtDelta(s.delta_correctness_rate)} |`,
  );
  L.push(
    `| Incorrect rate | ${fmtRate(s.a_incorrect_rate)} | ${fmtRate(s.b_incorrect_rate)} | ${fmtDelta(s.delta_incorrect_rate)} |`,
  );
  L.push("");

  const changed = result.deltas.per_question.filter((p) => p.changed);
  L.push(
    `## Per-question deltas (${changed.length} changed of ${result.deltas.per_question.length})`,
  );
  L.push("");
  if (changed.length === 0) {
    L.push("_No per-question differences._");
  } else {
    L.push("| Question | A correctness | B correctness | A behavior | B behavior | Note |");
    L.push("|---|---|---|---|---|---|");
    for (const p of changed) {
      L.push(
        `| ${p.question_id} | ${p.a_correctness ?? "-"} | ${p.b_correctness ?? "-"} | ${p.a_behavior} | ${p.b_behavior} | ${p.note ?? ""} |`,
      );
    }
  }
  return L.join("\n");
}

function fmtRate(r: number | null): string {
  return r === null ? "N/A" : `${(r * 100).toFixed(1)}%`;
}
function fmtDelta(r: number | null): string {
  if (r === null) return "N/A";
  return `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}pp`;
}
function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
