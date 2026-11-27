import { getGroqApiKey } from "../config/env";
import { RAW_GENERATION_V1 } from "../config/generation";
import { RAG_PROMPT_VERSION, RAG_SYSTEM_PROMPT_V1 } from "../prompts/rag/v1";
import { createGroqClient } from "../providers/groq/client";
import { runRagBenchmark } from "../runner/rag";
import { ARM_LABELS, ARM_RETRIEVAL_ORDERING, isRetrievalArm, type RetrievalArm } from "../arms";
import { createTraceGateway, type LoadedRetrievalTrace } from "../retrieval/trace";
import { loadArmTrace } from "../retrieval/arm-trace";
import { sha256 } from "../shared/hash";
import { readRunMetadata } from "../storage/fs";
import { logger } from "../shared/logger";
import {
  armTracePaths,
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

async function runRetrievalArm(arm: RetrievalArm, flags: Record<string, string>): Promise<number> {
  let trace: LoadedRetrievalTrace;
  try {
    trace = await loadArmTrace(arm, armTracePaths());
  } catch (error) {
    logger.error((error as Error).message);
    return 1;
  }

  const { selected, datasetHash } = await loadDatasetSelection(flags);
  if (selected.length === 0) {
    logger.error("no questions selected after filtering; nothing to run");
    return 1;
  }

  const gateway = createTraceGateway(trace, { ordering: ARM_RETRIEVAL_ORDERING[arm] });
  const withPassages = selected.filter(
    (question) => gateway.search(question.question_id).length > 0,
  );
  if (withPassages.length === 0) {
    logger.error(
      `no question has retrieved passages; regenerate the trace for the ${ARM_LABELS[arm]} arm`,
    );
    return 1;
  }

  const client = createGroqClient(getGroqApiKey());
  const runId = generateRunId(arm);
  logger.info(`starting ${arm} run`, {
    run_id: runId,
    arm,
    ordering: ARM_RETRIEVAL_ORDERING[arm],
    total_questions: withPassages.length,
    model_id: RAW_GENERATION_V1.model_id,
    prompt_version: RAG_PROMPT_VERSION,
    config_hash: trace.configHash.slice(0, 12),
    allow_draft: flags["allow-draft"] === "true",
  });

  const result = await runRagBenchmark({
    runId,
    arm,
    questions: withPassages,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: RAG_PROMPT_VERSION,
    systemPrompt: RAG_SYSTEM_PROMPT_V1,
    datasetVersion: "v1",
    datasetHash,
    gitSha: readGitSha(),
    generation: RAW_GENERATION_V1,
    allowDraft: flags["allow-draft"] === "true",
    gateway,
    evidenceHash: sha256(`${trace.configHash}|${trace.traceHash}`),
    onProgress: logProgress,
  });

  logger.info(`${arm} run finished`, {
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
  return exitCodeForRun(result);
}

async function resumeRetrievalArm(
  arm: RetrievalArm,
  flags: Record<string, string>,
): Promise<number> {
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
  if (!isRetrievalArm(meta.run_mode) || meta.run_mode !== arm) {
    logger.error(`run ${runId} is not a ${arm} run (mode: ${meta.run_mode ?? "raw"})`);
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
  if (storedPromptHash && storedPromptHash !== sha256(RAG_SYSTEM_PROMPT_V1)) {
    logger.error(`${arm} prompt changed since the run started; refusing to resume`);
    return 1;
  }

  let trace: LoadedRetrievalTrace;
  try {
    trace = await loadArmTrace(arm, armTracePaths());
  } catch (error) {
    logger.error((error as Error).message);
    return 1;
  }
  if (meta.retrieval_config_hash && meta.retrieval_config_hash !== trace.configHash) {
    logger.error(
      `retrieval configuration changed since run ${runId} started; refusing to resume. Previous hash ${meta.retrieval_config_hash}, current ${trace.configHash}.`,
    );
    return 1;
  }

  const questions = meta.selected_question_ids
    ? selectStoredQuestions(allQuestions, meta.selected_question_ids)
    : allQuestions;

  const client = createGroqClient(getGroqApiKey());
  const result = await runRagBenchmark({
    runId,
    arm,
    questions,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: meta.prompt_version,
    systemPrompt: RAG_SYSTEM_PROMPT_V1,
    datasetVersion: meta.dataset_version,
    datasetHash: meta.dataset_hash,
    gitSha: readGitSha(),
    generation: meta.generation as unknown as typeof RAW_GENERATION_V1,
    allowDraft: meta.allow_draft,
    gateway: createTraceGateway(trace, { ordering: ARM_RETRIEVAL_ORDERING[arm] }),
    evidenceHash: sha256(`${trace.configHash}|${trace.traceHash}`),
    annotationsHash: meta.annotations_hash ?? null,
    onProgress: logProgress,
  });

  logger.info(`${arm} resume finished`, {
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

export async function runRagRun(flags: Record<string, string>): Promise<number> {
  return await runRetrievalArm("rag", flags);
}

export async function runRagResume(flags: Record<string, string>): Promise<number> {
  return await resumeRetrievalArm("rag", flags);
}

export async function runRagRerankRun(flags: Record<string, string>): Promise<number> {
  return await runRetrievalArm("rag-rerank", flags);
}

export async function runRagRerankResume(flags: Record<string, string>): Promise<number> {
  return await resumeRetrievalArm("rag-rerank", flags);
}

export async function runRagGraphRun(flags: Record<string, string>): Promise<number> {
  return await runRetrievalArm("rag-graph", flags);
}

export async function runRagGraphResume(flags: Record<string, string>): Promise<number> {
  return await resumeRetrievalArm("rag-graph", flags);
}
