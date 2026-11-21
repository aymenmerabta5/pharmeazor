import type { RunMetadata, ResponseLine, ErrorLine } from "../storage/fs";
import type { EvaluationRecord } from "../evaluation/schema";
import type { SummaryMetrics, SliceMetrics } from "../evaluation/metrics";

const MAX_FAILURE_SAMPLES = 5;
const MAX_RESPONSE_PREVIEW = 800;

export interface QuestionLookup {
  category: string;
  therapeutic_class: string;
  question: string;
}

export interface ReportInput {
  metadata: RunMetadata;
  responses: readonly ResponseLine[];
  errors: readonly ErrorLine[];
  evaluation: readonly EvaluationRecord[];
  summary: SummaryMetrics;
  questionsById: Map<string, QuestionLookup>;
}

export interface GeneratedReport {
  markdown: string;
  failure_samples: number;
}

export function generateMarkdownReport(input: ReportInput): GeneratedReport {
  const { metadata, responses, errors, evaluation, summary, questionsById } = input;
  const L: string[] = [];

  L.push(`# Benchmark Report — \`${metadata.run_id}\``);
  L.push("");
  L.push(`_Generated ${new Date().toISOString()}_`);
  L.push("");

  // --- Experiment info ---
  L.push("## Experiment");
  L.push("");
  const avgLatency =
    responses.length > 0 ? responses.reduce((s, r) => s + r.latency_ms, 0) / responses.length : 0;
  const usage = metadata.cumulative_usage;
  const rows: [string, string][] = [
    ["Run ID", metadata.run_id],
    ["Started", metadata.started_at],
    ["Updated", metadata.updated_at],
    ["Status", metadata.status],
    ["Run mode", metadata.run_mode ?? "raw"],
    ["Model", metadata.model_id],
    ["Provider", metadata.provider],
    ["Prompt version", metadata.prompt_version],
    ["Dataset version", metadata.dataset_version],
    ["Dataset hash", metadata.dataset_hash],
    ["Annotations hash", metadata.annotations_hash ?? "(not recorded)"],
    ["Reasoning effort", metadata.reasoning_effort],
    ["Git SHA", metadata.git_sha ?? "(not available)"],
    ["Total questions", String(metadata.total_questions)],
    ["Successful requests", String(responses.length)],
    ["Failed requests", String(errors.length)],
    ["API calls", usage ? String(usage.api_calls) : "(not recorded)"],
    ["Cache hits", usage ? String(usage.cache_hits) : "(not recorded)"],
    ["Prompt tokens", usage ? String(usage.prompt_tokens) : "(not recorded)"],
    ["Completion tokens", usage ? String(usage.completion_tokens) : "(not recorded)"],
    ["Total tokens", usage ? String(usage.total_tokens) : "(not recorded)"],
    ["Average response latency", `${Math.round(avgLatency)} ms`],
  ];
  L.push("| Field | Value |");
  L.push("|---|---|");
  for (const [k, v] of rows) L.push(`| ${k} | ${v} |`);
  L.push("");
  L.push("### Generation settings");
  L.push("");
  L.push("```json");
  L.push(JSON.stringify(metadata.generation, null, 2));
  L.push("```");
  L.push("");

  // --- Performance ---
  L.push("## Performance");
  L.push("");
  if (summary.overall.human_reviewed === 0) {
    L.push(
      `> **No human review submitted yet.** All rates are pending. Run \`benchmark review prepare --run-id ${metadata.run_id}\` to build the review template, then \`benchmark review submit --run-id ${metadata.run_id} --reviewer <name> --file <path>\`.`,
    );
    L.push("");
  }
  L.push("### Overall");
  L.push("");
  L.push(formatMetricsTable(summary.overall));
  L.push("");
  L.push("### By category");
  L.push("");
  L.push(
    summary.by_category.length === 0
      ? "_No category data._"
      : formatSliceTable(summary.by_category),
  );
  L.push("");
  L.push("### By therapeutic class");
  L.push("");
  L.push(
    summary.by_therapeutic_class.length === 0
      ? "_No therapeutic class data._"
      : formatSliceTable(summary.by_therapeutic_class),
  );
  L.push("");

  // --- Error analysis ---
  L.push("## Error analysis");
  L.push("");
  const { samples, totalFailures } = extractFailureSamples(evaluation, responses, questionsById);
  if (errors.length === 0 && totalFailures === 0) {
    L.push("_No failed requests and no identified answer-quality failures._");
    L.push("");
  } else {
    if (errors.length > 0) {
      L.push(`### Failed requests (${errors.length})`);
      L.push("");
      for (const e of errors.slice(0, MAX_FAILURE_SAMPLES)) {
        L.push(
          `- **${e.question_id}** — ${e.class}${e.status_code ? ` (HTTP ${e.status_code})` : ""}: ${e.message}`,
        );
      }
      L.push("");
    }
    if (samples.length > 0) {
      L.push(
        `### Representative answer failures (${totalFailures} identified, showing ${samples.length})`,
      );
      L.push("");
      for (const s of samples) {
        L.push(`#### \`${s.question_id}\` — ${s.categories.join(", ")}`);
        L.push("");
        L.push(`**Question:** ${s.question}`);
        L.push("");
        L.push(
          `**Expected behavior:** ${s.behavior_expected} · **Detected:** ${s.behavior_detected}`,
        );
        L.push("");
        if (s.human_correctness) {
          L.push(`**Human correctness:** ${s.human_correctness}`);
          L.push("");
        }
        L.push("**Model response:**");
        L.push("");
        L.push("> " + s.response.slice(0, MAX_RESPONSE_PREVIEW).replace(/\n/g, "\n> "));
        L.push("");
      }
    }
  }

  // --- Notes ---
  L.push("## Notes");
  L.push("");
  for (const note of summary.notes) L.push(`- ${note}`);
  L.push(
    "- This is the raw-model benchmark. Citation accuracy and evidence faithfulness are NOT_APPLICABLE for this stage.",
  );
  L.push("");

  const markdown = L.join("\n").replace(/gsk_[A-Za-z0-9_-]+/g, "[REDACTED]");
  return { markdown, failure_samples: samples.length };
}

function formatMetricsTable(s: SliceMetrics): string {
  const out: string[] = [];
  const c = s.correctness;
  out.push("| Metric | Count | Rate |");
  out.push("|---|---|---|");
  out.push(`| Correct | ${c.correct} | ${rateStr(c.correct, c.denominator)} |`);
  out.push(
    `| Partially correct | ${c.partially_correct} | ${rateStr(c.partially_correct, c.denominator)} |`,
  );
  out.push(`| Incorrect | ${c.incorrect} | ${rateStr(c.incorrect, c.denominator)} |`);
  out.push(`| Unverifiable | ${c.unverifiable} | ${rateStr(c.unverifiable, c.denominator)} |`);
  out.push("");
  out.push(
    `| Completeness (complete) | ${s.completeness.complete} | ${rateStr(s.completeness.complete, s.completeness.denominator)} |`,
  );
  out.push(
    `| Numerical accuracy (accurate) | ${s.numerical.accurate} | ${rateStr(s.numerical.accurate, s.numerical.denominator)} · N/A=${s.numerical.not_applicable} |`,
  );
  out.push(
    `| Correct abstentions | ${s.abstention.correct_abstention} | ${rateStr(s.abstention.correct_abstention, s.abstention.denominator)} |`,
  );
  out.push(
    `| Missed abstentions | ${s.abstention.missed_abstention} | ${rateStr(s.abstention.missed_abstention, s.abstention.denominator)} |`,
  );
  out.push(
    `| Unsupported confident answers | ${s.abstention.unsupported_confident_answer} | ${rateStr(s.abstention.unsupported_confident_answer, s.abstention.denominator)} |`,
  );
  out.push(
    `| Safety (safe) | ${s.safety.safe} | ${rateStr(s.safety.safe, s.safety.denominator)} |`,
  );
  out.push(
    `| Responses with any unsupported claim | ${s.unsupported.responses_with_any_unsupported_claim} | ${rateStr(s.unsupported.responses_with_any_unsupported_claim, s.unsupported.denominator)} |`,
  );
  return out.join("\n");
}

function formatSliceTable(slices: SliceMetrics[]): string {
  const out: string[] = [];
  out.push("| Slice | Total | Reviewed | Correctness | Incorrect | Correct abstention | Safety |");
  out.push("|---|---|---|---|---|---|---|");
  for (const s of slices) {
    out.push(
      `| ${s.label} | ${s.total} | ${s.human_reviewed} | ` +
        `${rateStr(s.correctness.correct, s.correctness.denominator)} | ` +
        `${rateStr(s.correctness.incorrect, s.correctness.denominator)} | ` +
        `${rateStr(s.abstention.correct_abstention, s.abstention.denominator)} | ` +
        `${rateStr(s.safety.safe, s.safety.denominator)} |`,
    );
  }
  return out.join("\n");
}

function rateStr(n: number, d: number): string {
  if (d === 0) return "N/A (0)";
  return `${n}/${d} (${((n / d) * 100).toFixed(1)}%)`;
}

interface FailureSample {
  question_id: string;
  question: string;
  response: string;
  categories: string[];
  behavior_expected: string;
  behavior_detected: string;
  human_correctness: string | null;
}

function extractFailureSamples(
  evaluation: readonly EvaluationRecord[],
  responses: readonly ResponseLine[],
  questionsById: Map<string, QuestionLookup>,
): { samples: FailureSample[]; totalFailures: number } {
  const rById = new Map(responses.map((r) => [r.question_id, r] as const));
  const samples: FailureSample[] = [];
  let totalFailures = 0;

  for (const e of evaluation) {
    const cats: string[] = [];
    const h = e.human;
    if (h) {
      if (h.correctness === "INCORRECT") cats.push("incorrect_answer");
      else if (h.correctness === "PARTIALLY_CORRECT") cats.push("partially_correct");
      if (h.unsupported_claims.length > 0) cats.push("unsupported_claim");
      if (h.numerical_accuracy === "INACCURATE") cats.push("numerical_error");
      if (h.abstention_outcome === "MISSED_ABSTENTION") cats.push("missed_abstention");
      if (h.abstention_outcome === "UNSUPPORTED_CONFIDENT_ANSWER")
        cats.push("unsupported_confident_answer");
      if (h.safety === "UNSAFE") cats.push("unsafe_content");
    }
    if (!e.deterministic.behavior.agrees) cats.push("behavior_mismatch");
    if (cats.length === 0) continue;
    totalFailures += 1;
    const q = questionsById.get(e.question_id);
    const r = rById.get(e.question_id);
    if (!q || !r) continue;
    samples.push({
      question_id: e.question_id,
      question: q.question,
      response: r.content,
      categories: cats,
      behavior_expected: e.deterministic.behavior.expected,
      behavior_detected: e.deterministic.behavior.detected,
      human_correctness: h?.correctness ?? null,
    });
  }
  return { samples: samples.slice(0, MAX_FAILURE_SAMPLES), totalFailures };
}
