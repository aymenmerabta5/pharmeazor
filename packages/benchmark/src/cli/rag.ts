import { getGroqApiKey } from "../config/env";
import { RAW_GENERATION_V1 } from "../config/generation";
import { RAG_PROMPT_VERSION, RAG_SYSTEM_PROMPT_V1 } from "../prompts/rag/v1";
import { createGroqClient } from "../providers/groq/client";
import { runRagBenchmark } from "../runner/rag";
import { createTraceGateway, loadRetrievalTrace } from "../retrieval/trace";
import { sha256 } from "../shared/hash";
import { readRunMetadata } from "../storage/fs";
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

async function loadGateway() {
  const trace = await loadRetrievalTrace(dataV1Path("retrieval-trace.jsonl"));
  return { gateway: createTraceGateway(trace), trace };
}

export async function runRagRun(flags: Record<string, string>): Promise<number> {
  const { selected, datasetHash } = await loadDatasetSelection(flags);
  if (selected.length === 0) {
    logger.error("no questions selected after filtering; nothing to run");
    return 1;
  }

  const { gateway, trace } = await loadGateway();
  const withPassages = selected.filter(
    (question) => gateway.search(question.question_id).length > 0,
  );
  if (withPassages.length === 0) {
    logger.error(
      "no question has retrieved passages; regenerate the retrieval trace before a RAG run",
    );
    return 1;
  }

  const client = createGroqClient(getGroqApiKey());
  const runId = generateRunId("rag");
  logger.info("starting rag run", {
    run_id: runId,
    total_questions: withPassages.length,
    model_id: RAW_GENERATION_V1.model_id,
    prompt_version: RAG_PROMPT_VERSION,
    config_hash: trace.configHash.slice(0, 12),
    allow_draft: flags["allow-draft"] === "true",
  });

  const result = await runRagBenchmark({
    runId,
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

  logger.info("rag run finished", {
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

export async function runRagResume(flags: Record<string, string>): Promise<number> {
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
  if (meta.run_mode !== "rag") {
    logger.error(`run ${runId} is not a rag run (mode: ${meta.run_mode ?? "raw"})`);
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
    logger.error("rag prompt changed since the run started; refusing to resume");
    return 1;
  }

  const { gateway, trace } = await loadGateway();
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
    gateway,
    evidenceHash: sha256(`${trace.configHash}|${trace.traceHash}`),
    annotationsHash: meta.annotations_hash ?? null,
    onProgress: logProgress,
  });

  logger.info("rag resume finished", {
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
