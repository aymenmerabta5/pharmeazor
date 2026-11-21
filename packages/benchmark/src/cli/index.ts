#!/usr/bin/env bun
import { join } from "node:path";
import { loadQuestionsFromFile } from "../dataset/loader";
import { validateDatasetFromFiles } from "../dataset/validate";
import { hashQuestions } from "../dataset/hash";
import { getGroqApiKey } from "../config/env";
import { RAW_GENERATION_V1 } from "../config/generation";
import { RAW_PROMPT_VERSION, RAW_SYSTEM_PROMPT_V1 } from "../prompts/raw/v1";
import { createGroqClient } from "../providers/groq/client";
import { runRawBenchmark } from "../runner/raw";
import { logger } from "../shared/logger";
import { CATEGORY_VALUES, type Category } from "../dataset/schema";
import { loadGoldAnnotationsFromFile } from "../dataset/gold-loader";
import { computeDeterministicSignals } from "../evaluation/rubric";
import { computeSummary } from "../evaluation/metrics";
import { writeEvaluation, readEvaluation, mergeHumanScore } from "../evaluation/storage";
import {
  buildReviewTemplate,
  writeReviewTemplate,
  readSubmittedReview,
  reconcileReviews,
} from "../evaluation/review";
import { readErrors, readResponses, readRunMetadata } from "../storage/fs";
import { sha256 } from "../shared/hash";
import { generateMarkdownReport } from "../reporting/markdown";
import { compareRuns, formatComparison, type ComparableRun } from "../reporting/compare";
import { checkReproducibility } from "../reporting/checks";
import { readdir, readFile } from "node:fs/promises";

interface ParsedArgs {
  command?: string;
  subcommand?: string;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positionals.push(arg);
    }
  }
  const [command, subcommand] = positionals;
  return { command, subcommand, flags };
}

function packageRoot(): string {
  return join(import.meta.dir, "..", "..");
}

function runsDir(): string {
  return join(packageRoot(), "runs");
}

function cacheDir(): string {
  return join(packageRoot(), ".cache");
}

function dataV1Path(name: string): string {
  return join(packageRoot(), "data", "v1", name);
}

function printUsage(): void {
  console.log(`Usage:
  benchmark dataset validate [--questions <path>] [--annotations <path>]
  benchmark dataset stats    [--questions <path>]
  benchmark raw run          [--category <CAT>] [--limit <N>] [--allow-draft]
  benchmark raw resume       --run-id <ID>
  benchmark raw status       [--run-id <ID>]
  benchmark evaluate run     --run-id <ID>
  benchmark review prepare   --run-id <ID>
  benchmark review submit    --run-id <ID> --reviewer <ID> --file <path>
  benchmark summary          --run-id <ID>
  benchmark report           --run-id <ID>
  benchmark compare          --run-a <ID> --run-b <ID>
  benchmark reproduce        --run-id <ID>
`);
}

function readGitSha(): string | null {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "HEAD"]);
    if (result.exitCode === 0) {
      return new TextDecoder().decode(result.stdout).trim();
    }
  } catch {
    // not in a git repo
  }
  return null;
}

function generateRunId(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hms = now.toISOString().slice(11, 19).replace(/:/g, "");
  const hex = Math.random().toString(36).slice(2, 8);
  return `raw-${ymd}-${hms}-${hex}`;
}

// ---------- dataset subcommands ----------

async function runDatasetValidate(flags: Record<string, string>): Promise<number> {
  const questionsPath = flags.questions ?? dataV1Path("questions.jsonl");
  const annotationsPath = flags.annotations ?? dataV1Path("gold_annotations.jsonl");

  const report = await validateDatasetFromFiles({
    questionsPath,
    goldAnnotationsPath: annotationsPath,
  });

  logger.info("dataset validation", {
    ok: report.ok,
    total: report.stats.total,
    approved: report.stats.approved_count,
    draft: report.stats.draft_count,
    annotated: report.stats.annotated_count,
    verified: report.stats.verified_count,
    questions_hash: report.questions_hash,
  });

  if (report.warnings.length > 0) {
    logger.warn(`${report.warnings.length} warning(s)`);
    for (const w of report.warnings) {
      logger.warn(`${w.code} ${w.question_id ?? ""} ${w.message}`);
    }
  }
  if (report.errors.length > 0) {
    logger.error(`${report.errors.length} error(s)`);
    for (const e of report.errors) {
      logger.error(`${e.code} ${e.question_id ?? ""} ${e.message}`);
    }
    return 1;
  }
  logger.info("dataset is valid");
  return 0;
}

async function runDatasetStats(flags: Record<string, string>): Promise<number> {
  const questionsPath = flags.questions ?? dataV1Path("questions.jsonl");
  const questions = await loadQuestionsFromFile(questionsPath);
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  for (const q of questions) {
    byStatus[q.review_status] = (byStatus[q.review_status] ?? 0) + 1;
    byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
    byLanguage[q.language] = (byLanguage[q.language] ?? 0) + 1;
  }
  logger.info("dataset stats", {
    total: questions.length,
    byStatus,
    byCategory,
    byLanguage,
  });
  return 0;
}

// ---------- raw subcommands ----------

function parseCategoryFlag(value: string | undefined): Category | undefined {
  if (!value) return undefined;
  if ((CATEGORY_VALUES as readonly string[]).includes(value)) {
    return value as Category;
  }
  const lower = value.toUpperCase();
  if ((CATEGORY_VALUES as readonly string[]).includes(lower)) {
    return lower as Category;
  }
  throw new Error(`unknown category "${value}". Valid values: ${CATEGORY_VALUES.join(", ")}`);
}

async function runRawRun(flags: Record<string, string>): Promise<number> {
  const questionsPath = dataV1Path("questions.jsonl");
  const allQuestions = await loadQuestionsFromFile(questionsPath);

  const category = parseCategoryFlag(flags.category);
  const filtered = category ? allQuestions.filter((q) => q.category === category) : allQuestions;

  const limit = flags.limit ? Number.parseInt(flags.limit, 10) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive integer, got ${flags.limit}`);
  }
  const selected = limit !== undefined ? filtered.slice(0, limit) : filtered;

  if (selected.length === 0) {
    logger.error("no questions selected after filtering; nothing to run");
    return 1;
  }
  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));
  const annotationsHash = sha256(JSON.stringify(annotations));
  const apiKey = getGroqApiKey();
  const client = createGroqClient(apiKey);
  const runId = generateRunId();

  logger.info("starting raw run", {
    run_id: runId,
    total_questions: selected.length,
    category: category ?? "<all>",
    model_id: RAW_GENERATION_V1.model_id,
    prompt_version: RAW_PROMPT_VERSION,
    reasoning_effort: RAW_GENERATION_V1.reasoning_effort,
    allow_draft: flags["allow-draft"] === "true",
  });

  const result = await runRawBenchmark({
    runId,
    questions: selected,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: RAW_PROMPT_VERSION,
    systemPrompt: RAW_SYSTEM_PROMPT_V1,
    datasetVersion: "v1",
    datasetHash: hashQuestions(allQuestions),
    gitSha: readGitSha(),
    generation: RAW_GENERATION_V1,
    allowDraft: flags["allow-draft"] === "true",
    annotationsHash,
    onProgress: (e) => {
      if (e.phase === "api_call" || e.phase === "cache_hit" || e.phase === "error") {
        logger.info(`[${e.answered + e.failed}/${e.total}] ${e.phase} ${e.current_question_id}`);
      }
    },
  });

  logger.info("raw run finished", {
    run_id: result.run_id,
    answered: result.answered,
    failed: result.failed,
    total: result.total,
    cache_hits: result.cache_hits,
    api_calls: result.api_calls,
    total_tokens: result.total_tokens,
  });
  return result.failed === 0 ? 0 : 2;
}

async function runRawResume(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }
  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found under ${runsDir()}`);
    return 1;
  }
  const annotationsHash = meta.annotations_hash ?? null;

  // Resume MUST use the generation config and prompt version stored in the
  // run, not the current defaults. Otherwise cache reuse is meaningless and
  // the resumed run is not the same experiment.
  const allQuestions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const datasetHash = hashQuestions(allQuestions);
  if (datasetHash !== meta.dataset_hash) {
    logger.error(
      `dataset changed since run ${runId} started; refusing to resume. Previous hash ${meta.dataset_hash}, current hash ${datasetHash}.`,
    );
    return 1;
  }

  const apiKey = getGroqApiKey();
  const client = createGroqClient(apiKey);
  // Storage persists generation as Record<string, unknown> on purpose
  // (storage must not depend on config types). The resumed run *must* use
  // exactly the generation config recorded at start, so a cast here is the
  // right place to bridge the two.
  const generation = meta.generation as unknown as typeof RAW_GENERATION_V1;
  const result = await runRawBenchmark({
    runId,
    questions: allQuestions,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: meta.prompt_version,
    systemPrompt: RAW_SYSTEM_PROMPT_V1, // prompt version is fixed; if it changes, datasetHash changes too
    datasetVersion: meta.dataset_version,
    datasetHash: meta.dataset_hash,
    gitSha: readGitSha(),
    generation,
    allowDraft: meta.allow_draft,
    annotationsHash,
    onProgress: (e) => {
      if (e.phase === "api_call" || e.phase === "cache_hit" || e.phase === "error") {
        logger.info(`[${e.answered + e.failed}/${e.total}] ${e.phase} ${e.current_question_id}`);
      }
    },
  });

  logger.info("resume finished", {
    run_id: result.run_id,
    answered: result.answered,
    failed: result.failed,
    total: result.total,
    cache_hits: result.cache_hits,
    api_calls: result.api_calls,
  });
  return result.failed === 0 ? 0 : 2;
}

async function runRawStatus(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    // list all runs
    const { readdir } = await import("node:fs/promises");
    let entries: string[] = [];
    try {
      entries = await readdir(runsDir());
    } catch {
      logger.info("no runs found");
      return 0;
    }
    for (const entry of entries.sort()) {
      const meta = await readRunMetadata(runsDir(), entry);
      if (!meta) continue;
      const responses = await readResponses(runsDir(), entry);
      const errors = await readErrors(runsDir(), entry);
      logger.info(
        `${entry} ${meta.status} ${responses.length}/${meta.total_questions} ok, ${errors.length} err`,
      );
    }

    return 0;
  }

  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found`);
    return 1;
  }
  const responses = await readResponses(runsDir(), runId);
  const errors = await readErrors(runsDir(), runId);
  const totalLatency = responses.reduce((sum, r) => sum + r.latency_ms, 0);
  const avgLatency = responses.length > 0 ? totalLatency / responses.length : 0;

  logger.info("run status", {
    run_id: runId,
    status: meta.status,
    total_questions: meta.total_questions,
    answered: responses.length,
    failed: errors.length,
    remaining: meta.total_questions - responses.length - errors.length,
    cache_hits: responses.filter((r) => r.source === "cache").length,
    api_calls: responses.filter((r) => r.source === "api").length,
    average_latency_ms: Math.round(avgLatency),
    started_at: meta.started_at,
    updated_at: meta.updated_at,
  });
  return 0;
}

// ---------- dispatch ----------

async function main(argv: string[]): Promise<number> {
  const { command, subcommand, flags } = parseArgs(argv);
  if (command === "dataset" && subcommand === "validate") return runDatasetValidate(flags);
  if (command === "dataset" && subcommand === "stats") return runDatasetStats(flags);
  if (command === "raw" && subcommand === "run") return runRawRun(flags);
  if (command === "raw" && subcommand === "resume") return runRawResume(flags);
  if (command === "raw" && subcommand === "status") return runRawStatus(flags);
  if (command === "evaluate" && subcommand === "run") return runEvaluateRun(flags);
  if (command === "review" && subcommand === "prepare") return runReviewPrepare(flags);
  if (command === "review" && subcommand === "submit") return runReviewSubmit(flags);
  if (command === "summary") return runSummary(flags);
  if (command === "report") return runReport(flags);
  if (command === "compare") return runCompare(flags);
  if (command === "reproduce") return runReproduce(flags);
  printUsage();
  return 1;
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}

async function runEvaluateRun(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }

  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));
  const responses = await readResponses(runsDir(), runId);

  if (responses.length === 0) {
    logger.error(`run ${runId} has no responses`);
    return 1;
  }

  const qById = new Map(questions.map((q) => [q.question_id, q] as const));
  const aById = new Map(annotations.map((a) => [a.question_id, a] as const));
  const records = [];

  for (const r of responses) {
    const q = qById.get(r.question_id);
    const a = aById.get(r.question_id);
    if (!q || !a) {
      logger.warn(`missing question or annotation for ${r.question_id}; skipping`);
      continue;
    }
    const deterministic = computeDeterministicSignals({
      question: q,
      annotation: a,
      modelResponse: r.content,
    });
    records.push({
      question_id: r.question_id,
      run_id: runId,
      evaluated_at: new Date().toISOString(),
      response_content_hash: sha256(r.content),
      annotation_hash: sha256(JSON.stringify(a)),
      deterministic,
      human: null,
      reconciliation: null,
    });
  }

  await writeEvaluation(runsDir(), runId, records);
  logger.info("evaluation written", {
    run_id: runId,
    records: records.length,
    path: `runs/${runId}/evaluation.jsonl`,
  });
  return 0;
}

async function runReviewPrepare(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }

  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));
  const responses = await readResponses(runsDir(), runId);
  const evaluation = await readEvaluation(runsDir(), runId);

  const template = buildReviewTemplate(questions, annotations, responses, evaluation);
  const path = await writeReviewTemplate(runsDir(), runId, template);
  logger.info("review template written", { path, count: template.length });
  logger.info(
    "edit the file, fill in each `score` object, save as review_primary.jsonl (or review_secondary.jsonl), then run `benchmark review submit`",
  );
  return 0;
}

async function runReviewSubmit(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  const file = flags.file;
  const reviewer = flags.reviewer;
  if (!runId || !file || !reviewer) {
    logger.error("--run-id, --file and --reviewer are required");
    return 1;
  }
  const submission = await readSubmittedReview(file);
  const secondaryPath = join(runsDir(), runId, "review", "review_secondary.jsonl");

  // If a secondary file already exists on disk, reconcile against it.
  let secondary: Awaited<ReturnType<typeof readSubmittedReview>> | null = null;
  try {
    secondary = await readSubmittedReview(secondaryPath);
  } catch {
    /* no secondary */
  }

  const { merged, reconciliation } = reconcileReviews(submission, secondary);
  for (const m of merged) {
    await mergeHumanScore(
      runsDir(),
      runId,
      m.question_id,
      m.score,
      reconciliation.get(m.question_id) ?? {
        status: "AGREED",
        disagreements: [],
      },
    );
  }
  logger.info("review merged", {
    run_id: runId,
    reviewer,
    questions: merged.length,
  });
  for (const [qid, rec] of reconciliation) {
    if (rec.status === "NEEDS_HUMAN_REVIEW") {
      logger.warn(`disagreement on ${qid}: ${rec.disagreements.join(", ")}`);
    }
  }
  return 0;
}

async function runSummary(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }

  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const evaluation = await readEvaluation(runsDir(), runId);
  if (evaluation.length === 0) {
    logger.error(
      `run ${runId} has no evaluation.jsonl; run 'benchmark evaluate run --run-id ${runId}' first`,
    );
    return 1;
  }
  const catById = new Map(questions.map((q) => [q.question_id, q.category] as const));
  const classById = new Map(questions.map((q) => [q.question_id, q.therapeutic_class] as const));

  const summary = computeSummary({
    run_id: runId,
    evaluation,
    categoriesByQuestion: catById,
    therapeuticClassByQuestion: classById,
  });
  const path = join(runsDir(), runId, "summary.json");
  await Bun.write(path, JSON.stringify(summary, null, 2));

  const questionsById = new Map(
    questions.map(
      (q) =>
        [
          q.question_id,
          {
            category: q.category,
            therapeutic_class: q.therapeutic_class,
            question: q.question,
          },
        ] as const,
    ),
  );
  const responses = await readResponses(runsDir(), runId);
  const errors = await readErrors(runsDir(), runId);
  const meta = await readRunMetadata(runsDir(), runId);
  let reportPath: string | null = null;
  if (meta) {
    const report = generateMarkdownReport({
      metadata: meta,
      responses,
      errors,
      evaluation,
      summary,
      questionsById,
    });
    reportPath = join(runsDir(), runId, "report.md");
    await Bun.write(reportPath, report.markdown);
  }

  logger.info("summary", {
    run_id: runId,
    path,
    total: summary.overall.total,
    human_reviewed: summary.overall.human_reviewed,
    correct_rate: summary.overall.correctness.correct_rate,
    incorrect_rate: summary.overall.correctness.incorrect_rate,
    unreviewed: summary.by_review_status.unreviewed,
    needs_human_review: summary.by_review_status.needs_review,
    report_path: reportPath,
  });
  return 0;
}

async function runReport(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }
  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found`);
    return 1;
  }
  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const responses = await readResponses(runsDir(), runId);
  const errors = await readErrors(runsDir(), runId);
  const evaluation = await readEvaluation(runsDir(), runId);
  const catById = new Map(questions.map((q) => [q.question_id, q.category] as const));
  const classById = new Map(questions.map((q) => [q.question_id, q.therapeutic_class] as const));
  const summary = computeSummary({
    run_id: runId,
    evaluation,
    categoriesByQuestion: catById,
    therapeuticClassByQuestion: classById,
  });
  const questionsById = new Map(
    questions.map(
      (q) =>
        [
          q.question_id,
          {
            category: q.category,
            therapeutic_class: q.therapeutic_class,
            question: q.question,
          },
        ] as const,
    ),
  );
  const report = generateMarkdownReport({
    metadata: meta,
    responses,
    errors,
    evaluation,
    summary,
    questionsById,
  });
  const path = join(runsDir(), runId, "report.md");
  await Bun.write(path, report.markdown);
  await Bun.write(join(runsDir(), runId, "summary.json"), JSON.stringify(summary, null, 2));
  logger.info("report written", {
    run_id: runId,
    path,
    failure_samples: report.failure_samples,
  });
  return 0;
}

async function loadComparableRun(runId: string): Promise<ComparableRun | null> {
  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) return null;
  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const evaluation = await readEvaluation(runsDir(), runId);
  const catById = new Map(questions.map((q) => [q.question_id, q.category] as const));
  const classById = new Map(questions.map((q) => [q.question_id, q.therapeutic_class] as const));
  const summary = computeSummary({
    run_id: runId,
    evaluation,
    categoriesByQuestion: catById,
    therapeuticClassByQuestion: classById,
  });
  return { metadata: meta, evaluation, summary };
}

async function runCompare(flags: Record<string, string>): Promise<number> {
  const a = flags["run-a"];
  const b = flags["run-b"];
  if (!a || !b) {
    logger.error("--run-a and --run-b are required");
    return 1;
  }
  const aRun = await loadComparableRun(a);
  if (!aRun) {
    logger.error(`run ${a} not found`);
    return 1;
  }
  const bRun = await loadComparableRun(b);
  if (!bRun) {
    logger.error(`run ${b} not found`);
    return 1;
  }
  const result = compareRuns(aRun, bRun);
  const text = formatComparison(result, a, b);
  const path = join(runsDir(), `compare-${a}-vs-${b}.md`);
  await Bun.write(path, text);
  console.log(text);
  logger.info("comparison written", { path, compatible: result.compatible });
  return result.compatible ? 0 : 2;
}

async function runReproduce(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }
  const meta = await readRunMetadata(runsDir(), runId);
  const responses = await readResponses(runsDir(), runId);
  const errors = await readErrors(runsDir(), runId);
  const evaluation = await readEvaluation(runsDir(), runId);
  let summary: ReturnType<typeof computeSummary> | null = null;
  try {
    const raw = await readFile(join(runsDir(), runId, "summary.json"), "utf8");
    summary = JSON.parse(raw);
  } catch {
    /* no summary */
  }
  const fileContents = new Map<string, string>();
  try {
    const entries = await readdir(join(runsDir(), runId), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        fileContents.set(entry.name, await readFile(join(runsDir(), runId, entry.name), "utf8"));
      } catch {
        /* binary */
      }
    }
  } catch {
    /* dir missing */
  }
  const report = checkReproducibility({
    metadata: meta,
    responses,
    errors,
    evaluation,
    summary,
    fileContents,
  });
  for (const c of report.checks) {
    console.log(`${c.passed ? "[OK]" : "[FAIL]"} ${c.name}: ${c.details}`);
  }
  logger.info(report.passed ? "reproducibility: PASS" : "reproducibility: FAIL", { run_id: runId });
  return report.passed ? 0 : 1;
}
