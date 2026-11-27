import type { RunMetadata, ResponseLine, ErrorLine } from "../storage/fs";
import type { EvaluationRecord } from "../evaluation/schema";
import type { SummaryMetrics, SliceMetrics } from "../evaluation/metrics";
import { computeGroundingSummary } from "../evaluation/grounding";
import { ARM_RETRIEVAL_ORDERING, armLabel, isRetrievalArm } from "../arms";
import type { RetrievalReportInput } from "./retrieval";

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
  /** Present for the three retrieval arms; absent for raw and oracle. */
  retrieval?: RetrievalReportInput;
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
    ["Arm", armLabel(metadata.run_mode)],
    ["Run mode", metadata.run_mode ?? "raw"],
    ["Model", metadata.model_id],
    ["Model revision", metadata.provenance?.model_revision ?? "(not reported)"],
    ["Provider", metadata.provider],
    [
      "Provider SDK",
      metadata.provenance
        ? `ai ${metadata.provenance.sdk.ai} / groq ${metadata.provenance.sdk.groq}`
        : "(not recorded)",
    ],
    ["Prompt version", metadata.prompt_version],
    ["System prompt hash", metadata.provenance?.system_prompt_hash ?? "(not recorded)"],
    ["Dataset version", metadata.dataset_version],
    ["Dataset hash", metadata.dataset_hash],
    ["Selection hash", metadata.selection_hash ?? "(not recorded)"],
    [
      "Selected questions",
      String(metadata.selected_question_ids?.length ?? metadata.total_questions),
    ],
    ["Skipped questions", String(metadata.skipped_question_ids?.length ?? 0)],
    ["Annotations hash", metadata.annotations_hash ?? "(not recorded)"],
    ...(metadata.run_mode === "oracle"
      ? ([["Evidence hash", metadata.evidence_hash ?? "(not recorded)"]] as [string, string][])
      : []),
    ...(isRetrievalArm(metadata.run_mode)
      ? ([
          ["Retrieval ordering", ARM_RETRIEVAL_ORDERING[metadata.run_mode]],
          ["Retrieval config hash", metadata.retrieval_config_hash ?? "(not recorded)"],
          ["Retrieval trace hash", metadata.evidence_hash ?? "(not recorded)"],
        ] as [string, string][])
      : []),
    ["Reasoning effort", metadata.reasoning_effort],
    ["Temperature", String(metadata.provenance?.temperature ?? "unset")],
    ["Seed", String(metadata.provenance?.seed ?? "unset")],
    ["Git SHA", metadata.git_sha ?? "(not available)"],
    ["Total questions", String(metadata.total_questions)],
    ["Successful requests", String(responses.length)],
    ["Failed requests", String(errors.length)],
    ["API calls", usage ? String(usage.api_calls) : "(not recorded)"],
    ["Failed attempts", usage ? String(usage.failed_attempts ?? 0) : "(not recorded)"],
    ["Cache hits", usage ? String(usage.cache_hits) : "(not recorded)"],
    ["Live tokens", usage ? String(usage.live_total_tokens ?? 0) : "(not recorded)"],
    ["Replayed tokens", usage ? String(usage.replay_total_tokens ?? 0) : "(not recorded)"],
    ["Prompt tokens (all)", usage ? String(usage.prompt_tokens) : "(not recorded)"],
    ["Completion tokens (all)", usage ? String(usage.completion_tokens) : "(not recorded)"],
    ["Total tokens (all)", usage ? String(usage.total_tokens) : "(not recorded)"],
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

  // --- Retrieval (retrieval arms only) ---
  if (input.retrieval) {
    const r = input.retrieval;
    L.push("## Retrieval");
    L.push("");
    L.push(
      `Ordering: **${orderingLabel(r.ordering)}**. Retrieval quality is measured against the gold chunk ids, ` +
        "separately from answer quality, so a regression names the layer that moved.",
    );
    L.push("");
    L.push("| Signal | Value |");
    L.push("|---|---|");
    L.push(`| Retrieval arm | ${armLabel(r.arm)} |`);
    L.push(`| Ordering | ${orderingLabel(r.ordering)} |`);
    L.push(`| Retrieval config hash | ${r.config_hash} |`);
    L.push(`| Trace hash | ${r.trace_hash} |`);
    L.push(`| Questions in run | ${r.questions_in_run} |`);
    L.push(`| Questions with at least one passage | ${r.questions_with_passages} |`);
    L.push(`| Average returned chunks | ${r.average_returned_chunks.toFixed(1)} |`);
    L.push(`| Gold-annotated questions | ${r.questions_with_annotations} |`);
    L.push(`| Recall@5 | ${pct(r.recall_at_5)} |`);
    L.push(`| Recall@10 | ${pct(r.recall_at_10)} |`);
    L.push(`| MRR | ${r.mrr === null ? "N/A" : r.mrr.toFixed(4)} |`);
    L.push(`| nDCG@10 | ${r.ndcg_at_10 === null ? "N/A" : r.ndcg_at_10.toFixed(4)} |`);
    L.push(`| Candidate recall@50 | ${pct(r.candidate_recall_at_50)} |`);
    L.push("");
    if (r.questions_with_annotations === 0) {
      L.push(
        "> No gold annotation covers this run's question selection, so retrieval metrics are N/A.",
      );
      L.push("");
    }
  }

  // --- Grounding (evidence arms only) ---
  if ((metadata.run_mode ?? "raw") !== "raw") {
    const g = computeGroundingSummary(evaluation);
    L.push("## Grounding");
    L.push("");
    L.push(
      "Deterministic signals only. A human reviewer still owns the authoritative citation and faithfulness verdict.",
    );
    L.push("");
    L.push("| Signal | Value |");
    L.push("|---|---|");
    L.push(`| Responses with an evidence bundle | ${g.responses_with_bundle} |`);
    L.push(
      `| Responses citing at least one passage | ${g.responses_citing_at_least_once} / ${g.responses_with_bundle} |`,
    );
    L.push(`| Uncited answers | ${g.responses_uncited} |`);
    L.push(`| Citations parsed | ${g.total_citations} |`);
    L.push(`| Citations not in the supplied bundle | ${g.invalid_citations} |`);
    L.push(
      `| Citation validity rate | ${g.citation_validity_rate === null ? "N/A" : `${(g.citation_validity_rate * 100).toFixed(1)}%`} |`,
    );
    L.push(
      `| Responses with an unsupported number | ${g.responses_with_unsupported_number} / ${g.responses_with_bundle} |`,
    );
    L.push(`| Unsupported numbers (total) | ${g.unsupported_numbers_total} |`);
    L.push("");
  }

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
        const quoted = s.response
          .slice(0, MAX_RESPONSE_PREVIEW)
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .map((line) => (line.length === 0 ? ">" : `> ${line}`))
          .join("\n");
        L.push(quoted);
        L.push("");
      }
    }
  }

  // --- Notes ---
  L.push("## Notes");
  L.push("");
  for (const note of summary.notes) L.push(`- ${note}`);
  if ((metadata.run_mode ?? "raw") === "raw") {
    L.push(
      "- This is the closed-book raw arm. Citation accuracy and evidence faithfulness are NOT_APPLICABLE because no evidence was supplied.",
    );
  } else if (metadata.run_mode === "oracle") {
    L.push(
      "- This is the oracle arm: curated evidence, not retrieval. It is the ceiling, not a product claim.",
    );
    L.push(
      "- The grounding table is deterministic and advisory; the human review is authoritative.",
    );
  } else if (metadata.run_mode === "rag-rerank") {
    L.push(
      "- This is the RAG + reranker arm. It differs from `rag` only in passage ordering: the cross-encoder order instead of the fusion order.",
    );
    L.push(
      "- The grounding table is deterministic and advisory; the human review is authoritative.",
    );
  } else if (metadata.run_mode === "rag-graph") {
    L.push(
      "- This is the RAG + graph arm. It reads a graph trace and never falls back to the base retrieval trace.",
    );
    L.push(
      "- The grounding table is deterministic and advisory; the human review is authoritative.",
    );
  } else {
    L.push("- This is the RAG arm: hybrid retrieval in fusion order, with no reranker.");
    L.push(
      "- The grounding table is deterministic and advisory; the human review is authoritative.",
    );
  }
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

function pct(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function orderingLabel(ordering: "fusion" | "rerank" | "recorded"): string {
  if (ordering === "fusion") return "reciprocal-rank fusion (no reranker)";
  if (ordering === "rerank") return "cross-encoder rerank";
  return "recorded trace order";
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
