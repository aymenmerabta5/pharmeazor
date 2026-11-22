import { getGroqApiKey } from "../config/env";
import { RAW_GENERATION_V1 } from "../config/generation";
import { RAW_PROMPT_VERSION, RAW_SYSTEM_PROMPT_V1 } from "../prompts/raw/v1";
import { createGroqClient } from "../providers/groq/client";
import { runRawBenchmark } from "../runner/raw";
import { sha256 } from "../shared/hash";
import { readErrors, readResponses, readRunMetadata } from "../storage/fs";
import { logger } from "../shared/logger";
import {
  cacheDir,
  dataV1Path,
  exitCodeForRun,
  generateRunId,
  loadDatasetSelection,
  logProgress,
  readGitSha,
  runsDir,
  selectStoredQuestions,
} from "./common";
import { loadQuestionsFromFile } from "../dataset/loader";
import { hashQuestions } from "../dataset/hash";

export async function runRawRun(flags: Record<string, string>): Promise<number> {
  const { selected, datasetHash } = await loadDatasetSelection(flags);
  if (selected.length === 0) {
    logger.error("no questions selected after filtering; nothing to run");
    return 1;
  }

  const client = createGroqClient(getGroqApiKey());
  const runId = generateRunId("raw");

  logger.info("starting raw run", {
    run_id: runId,
    total_questions: selected.length,
    category: flags.category ?? "<all>",
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
    datasetHash,
    gitSha: readGitSha(),
    generation: RAW_GENERATION_V1,
    allowDraft: flags["allow-draft"] === "true",
    // The raw path never loads gold annotations. `evaluate run` records the
    // annotation hash once the run is scored.
    annotationsHash: null,
    onProgress: logProgress,
  });

  logger.info("raw run finished", {
    run_id: result.run_id,
    answered: result.answered,
    failed: result.failed,
    skipped: result.skipped,
    total: result.total,
    cache_hits: result.cache_hits,
    api_calls: result.api_calls,
    live_tokens: result.live_total_tokens,
    replayed_tokens: result.replay_total_tokens,
    stopped: result.stopped,
  });
  if (result.stopped) {
    logger.warn(`run stopped early by ${result.stopped}; resume it later to finish the selection`);
  }
  return exitCodeForRun(result);
}

export async function runRawResume(flags: Record<string, string>): Promise<number> {
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

  const allQuestions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const datasetHash = hashQuestions(allQuestions);
  if (datasetHash !== meta.dataset_hash) {
    logger.error(
      `dataset changed since run ${runId} started; refusing to resume. Previous hash ${meta.dataset_hash}, current hash ${datasetHash}.`,
    );
    return 1;
  }

  const storedPromptHash = meta.provenance?.system_prompt_hash;
  if (storedPromptHash && storedPromptHash !== sha256(RAW_SYSTEM_PROMPT_V1)) {
    logger.error(
      `system prompt changed since run ${runId} started; refusing to resume. Stored hash ${storedPromptHash}, current ${sha256(RAW_SYSTEM_PROMPT_V1)}.`,
    );
    return 1;
  }

  const questions = meta.selected_question_ids
    ? selectStoredQuestions(allQuestions, meta.selected_question_ids)
    : allQuestions;
  if (!meta.selected_question_ids) {
    logger.warn(
      `run ${runId} predates selection tracking; resuming with the whole dataset. Start a new run to get a comparable selection.`,
    );
  }

  const client = createGroqClient(getGroqApiKey());
  const result = await runRawBenchmark({
    runId,
    questions,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: meta.prompt_version,
    systemPrompt: RAW_SYSTEM_PROMPT_V1,
    datasetVersion: meta.dataset_version,
    datasetHash: meta.dataset_hash,
    gitSha: readGitSha(),
    generation: meta.generation as unknown as typeof RAW_GENERATION_V1,
    allowDraft: meta.allow_draft,
    annotationsHash: meta.annotations_hash ?? null,
    onProgress: logProgress,
  });

  logger.info("resume finished", {
    run_id: result.run_id,
    answered: result.answered,
    failed: result.failed,
    skipped: result.skipped,
    total: result.total,
    cache_hits: result.cache_hits,
    api_calls: result.api_calls,
    stopped: result.stopped,
  });
  return exitCodeForRun(result);
}

export async function runRawStatus(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
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
      const skipped = meta.skipped_question_ids?.length ?? 0;
      logger.info(
        `${entry} ${meta.status} ${responses.length}/${meta.total_questions} ok, ${errors.length} err, ${skipped} skipped`,
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
  const skipped = meta.skipped_question_ids?.length ?? 0;
  const totalLatency = responses.reduce((sum, r) => sum + r.latency_ms, 0);
  const avgLatency = responses.length > 0 ? totalLatency / responses.length : 0;

  logger.info("run status", {
    run_id: runId,
    mode: meta.run_mode ?? "raw",
    status: meta.status,
    total_questions: meta.total_questions,
    answered: responses.length,
    failed: errors.length,
    skipped,
    remaining: meta.total_questions - responses.length - errors.length - skipped,
    cache_hits: responses.filter((r) => r.source === "cache").length,
    api_calls: responses.filter((r) => r.source === "api").length,
    live_tokens: meta.cumulative_usage?.live_total_tokens ?? 0,
    replayed_tokens: meta.cumulative_usage?.replay_total_tokens ?? 0,
    average_latency_ms: Math.round(avgLatency),
    started_at: meta.started_at,
    updated_at: meta.updated_at,
  });
  return 0;
}
