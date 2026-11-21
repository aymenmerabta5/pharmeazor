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
import { readErrors, readResponses, readRunMetadata } from "../storage/fs";
import { logger } from "../shared/logger";
import { CATEGORY_VALUES, type Category } from "../dataset/schema";

interface ParsedArgs {
  command?: string;
  subcommand?: string;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, subcommand, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = "true";
    }
  }
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
