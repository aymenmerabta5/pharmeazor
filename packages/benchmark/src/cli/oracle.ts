import { getGroqApiKey } from "../config/env";
import { RAW_GENERATION_V1 } from "../config/generation";
import { ORACLE_PROMPT_VERSION, ORACLE_SYSTEM_PROMPT_V1 } from "../prompts/oracle/v1";
import { createGroqClient } from "../providers/groq/client";
import { runOracleBenchmark } from "../runner/oracle";
import { hashEvidenceBundle, loadEvidenceBundle } from "../oracle/evidence";
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

export async function runOracleRun(flags: Record<string, string>): Promise<number> {
  const { selected, datasetHash } = await loadDatasetSelection(flags);
  if (selected.length === 0) {
    logger.error("no questions selected after filtering; nothing to run");
    return 1;
  }

  const evidence = await loadEvidenceBundle(dataV1Path("gold_annotations.jsonl"));
  if (evidence.size === 0) {
    logger.error(
      "no question has oracle evidence; fill evidence_bundle in data/v1/gold_annotations.jsonl before an oracle run",
    );
    return 1;
  }

  const client = createGroqClient(getGroqApiKey());
  const runId = generateRunId("oracle");

  logger.info("starting oracle run", {
    run_id: runId,
    total_questions: selected.length,
    questions_with_evidence: evidence.size,
    model_id: RAW_GENERATION_V1.model_id,
    prompt_version: ORACLE_PROMPT_VERSION,
    allow_draft: flags["allow-draft"] === "true",
  });

  const result = await runOracleBenchmark({
    runId,
    questions: selected,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: ORACLE_PROMPT_VERSION,
    systemPrompt: ORACLE_SYSTEM_PROMPT_V1,
    datasetVersion: "v1",
    datasetHash,
    gitSha: readGitSha(),
    generation: RAW_GENERATION_V1,
    allowDraft: flags["allow-draft"] === "true",
    evidenceByQuestionId: evidence,
    evidenceHash: hashEvidenceBundle(evidence),
    onProgress: logProgress,
  });

  logger.info("oracle run finished", {
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
  if (result.skipped > 0) {
    logger.warn(
      `${result.skipped} selected question(s) have no evidence bundle and were skipped; they are not part of the oracle denominator`,
    );
  }
  return exitCodeForRun(result);
}

export async function runOracleResume(flags: Record<string, string>): Promise<number> {
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
  if (meta.run_mode !== "oracle") {
    logger.error(`run ${runId} is not an oracle run (mode: ${meta.run_mode ?? "raw"})`);
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
  if (storedPromptHash && storedPromptHash !== sha256(ORACLE_SYSTEM_PROMPT_V1)) {
    logger.error(
      `oracle prompt changed since run ${runId} started; refusing to resume because the experiment changed.`,
    );
    return 1;
  }

  const evidence = await loadEvidenceBundle(dataV1Path("gold_annotations.jsonl"));
  const evidenceHash = hashEvidenceBundle(evidence);
  if (meta.evidence_hash && meta.evidence_hash !== evidenceHash) {
    logger.error(
      `evidence bundle changed since run ${runId} started; refusing to resume. Previous hash ${meta.evidence_hash}, current ${evidenceHash}.`,
    );
    return 1;
  }

  const questions = meta.selected_question_ids
    ? selectStoredQuestions(allQuestions, meta.selected_question_ids)
    : allQuestions;

  const client = createGroqClient(getGroqApiKey());
  const result = await runOracleBenchmark({
    runId,
    questions,
    client,
    cacheDir: cacheDir(),
    runsDir: runsDir(),
    promptVersion: meta.prompt_version,
    systemPrompt: ORACLE_SYSTEM_PROMPT_V1,
    datasetVersion: meta.dataset_version,
    datasetHash: meta.dataset_hash,
    gitSha: readGitSha(),
    generation: meta.generation as unknown as typeof RAW_GENERATION_V1,
    allowDraft: meta.allow_draft,
    evidenceByQuestionId: evidence,
    evidenceHash,
    annotationsHash: meta.annotations_hash ?? null,
    onProgress: logProgress,
  });

  logger.info("oracle resume finished", {
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
