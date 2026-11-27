import type { Question, EvidencePassage } from "../dataset/schema";
import { filterApprovedForScoredRun } from "../dataset/loader";
import { buildCacheKey, readCache, writeCache, CacheCorruptionError } from "./cache";
import { createRateLimiter, RateLimitExceededError, type RateLimiter } from "./rate-limit";
import type { ChatRequest, GroqClient, ChatResult } from "../providers/groq/client";
import { classifyGroqError } from "../providers/groq/errors";
import {
  appendErrorLine,
  appendResponseLine,
  ensureRunDir,
  readAnsweredQuestionIds,
  readRunMetadata,
  writeRunMetadata,
  type CumulativeUsage,
  type RunMetadata,
} from "../storage/fs";
import { RATE_LIMITS_FREE_TIER, type GenerationConfig } from "../config/generation";
import { buildProvenance } from "../config/provenance";
import { ARM_LABELS, isRetrievalArm, type BenchmarkArm } from "../arms";

export type { BenchmarkArm };

export interface ChatBenchmarkInput {
  runId: string;
  mode: BenchmarkArm;
  questions: readonly Question[];
  client: GroqClient;
  cacheDir: string;
  runsDir: string;
  promptVersion: string;
  systemPrompt: string;
  datasetVersion: string;
  datasetHash: string;
  gitSha: string | null;
  generation: GenerationConfig;
  allowDraft: boolean;
  onProgress?: (event: ChatRunProgress) => void;
  /**
   * Optional rate limiter override. Tests inject a fast/no-op limiter so
   * retry tests do not pay the production 2 s minimum interval. Production
   * always falls back to `createRateLimiter(RATE_LIMITS_FREE_TIER)`.
   */
  rateLimiter?: RateLimiter;
  annotationsHash?: string | null;
  /** Evidence arm: passages keyed by question id (oracle or a retrieval arm). */
  evidenceByQuestionId?: ReadonlyMap<string, readonly EvidencePassage[]>;
  evidenceHash?: string | null;
  /** Retrieval arms only: hash of the recorded retrieval configuration. */
  retrievalConfigHash?: string | null;
  /** Builds the single user message for a question. */
  buildUserMessage: (question: Question) => string;
  temperature?: number | null;
  seed?: number | null;
}

export interface ChatRunProgress {
  answered: number;
  failed: number;
  skipped: number;
  total: number;
  current_question_id: string;
  phase: "started" | "cache_hit" | "api_call" | "success" | "error" | "skipped";
}

export interface ChatRunResult {
  run_id: string;
  mode: BenchmarkArm;
  answered: number;
  failed: number;
  skipped: number;
  total: number;
  cache_hits: number;
  api_calls: number;
  total_tokens: number;
  live_total_tokens: number;
  replay_total_tokens: number;
  /** `null` when the run finished its selection; otherwise the quota that stopped it. */
  stopped: null | "requests_per_day" | "tokens_per_day";
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const ESTIMATE_CEILING_TOKENS = 4000;

/** The stored selection and the requested selection describe different runs. */
export class SelectionMismatchError extends Error {
  constructor(
    public readonly runId: string,
    public readonly requested: readonly string[],
    public readonly stored: readonly string[],
  ) {
    super(
      `run ${runId} was started with a different question selection; ` +
        `requested ${requested.length} questions, stored ${stored.length}. ` +
        `Resume with the stored selection or start a new run.`,
    );
    this.name = "SelectionMismatchError";
  }
}

function emptyUsage(): CumulativeUsage {
  return {
    api_calls: 0,
    cache_hits: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    live_prompt_tokens: 0,
    live_completion_tokens: 0,
    live_total_tokens: 0,
    replay_prompt_tokens: 0,
    replay_completion_tokens: 0,
    replay_total_tokens: 0,
    failed_attempts: 0,
  };
}

/** A cheap upper bound used for quota admission, never for billing. */
export function estimatePromptTokens(
  systemPrompt: string,
  userMessage: string,
  maxOutputTokens: number,
): number {
  const inputTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4);
  return Math.min(inputTokens + maxOutputTokens, ESTIMATE_CEILING_TOKENS);
}

function sameSelection(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function selectQuestions(input: ChatBenchmarkInput): {
  scope: Question[];
  selected: Question[];
  skipped: string[];
} {
  const eligible = input.allowDraft
    ? [...input.questions]
    : filterApprovedForScoredRun(input.questions);

  if (input.mode === "raw") return { scope: eligible, selected: eligible, skipped: [] };

  const selected: Question[] = [];
  const skipped: string[] = [];
  for (const question of eligible) {
    const evidence = input.evidenceByQuestionId?.get(question.question_id);
    if (evidence && evidence.length > 0) selected.push(question);
    else skipped.push(question.question_id);
  }
  return { scope: eligible, selected, skipped };
}

export async function runChatBenchmark(input: ChatBenchmarkInput): Promise<ChatRunResult> {
  const { scope, selected, skipped } = selectQuestions(input);

  if (selected.length === 0) {
    throw new Error(
      input.mode === "oracle"
        ? "no question has oracle evidence; curate evidence_bundle entries before an oracle run"
        : isRetrievalArm(input.mode)
          ? `no question has retrieved passages for the ${ARM_LABELS[input.mode]} arm; regenerate its retrieval trace before running it`
          : input.allowDraft
            ? "no questions available in the dataset"
            : "no APPROVED questions are available; a pharmacist must approve at least one question before a scored run. Use --allow-draft to run on draft questions for pipeline testing only.",
    );
  }

  await ensureRunDir(input.runsDir, input.runId);

  const existingMeta = await readRunMetadata(input.runsDir, input.runId);
  const selectedIds = scope.map((q) => q.question_id);

  if (
    existingMeta?.selected_question_ids &&
    !sameSelection(existingMeta.selected_question_ids, selectedIds)
  ) {
    throw new SelectionMismatchError(input.runId, selectedIds, existingMeta.selected_question_ids);
  }

  const cumulative: CumulativeUsage = existingMeta?.cumulative_usage
    ? { ...emptyUsage(), ...existingMeta.cumulative_usage }
    : emptyUsage();

  const alreadyAnswered = await readAnsweredQuestionIds(input.runsDir, input.runId);
  const pending = selected.filter((q) => !alreadyAnswered.has(q.question_id));

  const nowIso = new Date().toISOString();
  const provenance = buildProvenance({
    systemPrompt: input.systemPrompt,
    selectedQuestionIds: selectedIds,
    temperature: input.temperature ?? null,
    seed: input.seed ?? null,
  });

  const initialMeta: RunMetadata = {
    ...existingMeta,
    run_id: input.runId,
    started_at: existingMeta?.started_at ?? nowIso,
    updated_at: nowIso,
    status: "RUNNING",
    model_id: input.generation.model_id,
    provider: input.generation.provider,
    reasoning_effort: input.generation.reasoning_effort,
    prompt_version: input.promptVersion,
    dataset_version: input.datasetVersion,
    dataset_hash: input.datasetHash,
    git_sha: input.gitSha,
    generation: { ...input.generation },
    total_questions: scope.length,
    allow_draft: input.allowDraft,
    run_mode: input.mode,
    annotations_hash: input.annotationsHash ?? existingMeta?.annotations_hash ?? null,
    selection_hash: provenance.selection_hash,
    selected_question_ids: [...selectedIds],
    skipped_question_ids: skipped,
    provenance,
    evidence_hash: input.evidenceHash ?? null,
    retrieval_config_hash: isRetrievalArm(input.mode) ? (input.retrievalConfigHash ?? null) : null,
    cumulative_usage: cumulative,
  };

  await writeRunMetadata(input.runsDir, input.runId, initialMeta);

  const limiter = input.rateLimiter ?? createRateLimiter(RATE_LIMITS_FREE_TIER);

  let answered = selected.filter((q) => alreadyAnswered.has(q.question_id)).length;
  let failed = 0;
  let stopped: ChatRunResult["stopped"] = null;
  let modelRevision: string | null = null;

  input.onProgress?.({
    answered,
    failed,
    skipped: skipped.length,
    total: scope.length,
    current_question_id: "",
    phase: "started",
  });

  for (const question of pending) {
    input.onProgress?.({
      answered,
      failed,
      skipped: skipped.length,
      total: scope.length,
      current_question_id: question.question_id,
      phase: "started",
    });

    const userMessage = input.buildUserMessage(question);
    const cacheKey = buildCacheKey({
      mode: input.mode,
      model_id: input.generation.model_id,
      prompt_version: input.promptVersion,
      system_prompt: input.systemPrompt,
      user_message: userMessage,
      generation: input.generation,
      payload_hash: input.evidenceHash ?? null,
    });

    let cached: ChatResult | null = null;
    try {
      cached = await readCache(input.cacheDir, cacheKey);
    } catch (err) {
      if (!(err instanceof CacheCorruptionError)) throw err;
      await appendErrorLine(input.runsDir, input.runId, {
        question_id: question.question_id,
        cache_key: cacheKey,
        class: "permanent",
        code: "CACHE_CORRUPT",
        message: err.message,
        attempts: 0,
        recorded_at: new Date().toISOString(),
      });
      failed += 1;
      input.onProgress?.({
        answered,
        failed,
        skipped: skipped.length,
        total: scope.length,
        current_question_id: question.question_id,
        phase: "error",
      });
      continue;
    }

    if (cached) {
      await appendResponseLine(input.runsDir, input.runId, {
        question_id: question.question_id,
        cache_key: cacheKey,
        source: "cache",
        content: cached.content,
        usage: cached.usage,
        finish_reason: cached.finish_reason,
        request_id: cached.request_id,
        latency_ms: cached.latency_ms,
        answered_at: new Date().toISOString(),
      });
      answered += 1;
      cumulative.cache_hits += 1;
      // Replayed usage is recorded separately. It was already billed when the
      // cache entry was created; adding it to the live total would misstate
      // what this run actually spent.
      cumulative.replay_prompt_tokens =
        (cumulative.replay_prompt_tokens ?? 0) + (cached.usage.prompt_tokens ?? 0);
      cumulative.replay_completion_tokens =
        (cumulative.replay_completion_tokens ?? 0) + (cached.usage.completion_tokens ?? 0);
      cumulative.replay_total_tokens =
        (cumulative.replay_total_tokens ?? 0) + (cached.usage.total_tokens ?? 0);
      cumulative.prompt_tokens += cached.usage.prompt_tokens ?? 0;
      cumulative.completion_tokens += cached.usage.completion_tokens ?? 0;
      cumulative.total_tokens += cached.usage.total_tokens ?? 0;
      input.onProgress?.({
        answered,
        failed,
        skipped: skipped.length,
        total: scope.length,
        current_question_id: question.question_id,
        phase: "cache_hit",
      });
      continue;
    }

    const request: ChatRequest = {
      system: input.systemPrompt,
      user: userMessage,
      generation: input.generation,
    };

    let result: ChatResult | null = null;
    let lastError: unknown = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      input.onProgress?.({
        answered,
        failed,
        skipped: skipped.length,
        total: scope.length,
        current_question_id: question.question_id,
        phase: "api_call",
      });
      try {
        const estimated = estimatePromptTokens(
          input.systemPrompt,
          userMessage,
          input.generation.max_output_tokens,
        );
        // Stop before queuing when today's quota cannot fit the call. The
        // pending questions stay unanswered so a later resume continues them.
        limiter.assertDailyCapacity(estimated);
        // Proactive throttle: hold the request until the free-tier window
        // has room for this call.
        await limiter.waitForSlot(estimated);
        // From here on an HTTP request will be made. Count the attempt even
        // if it throws a 429 or 5xx, because the attempt consumed a request
        // slot on Groq's side and belongs in the audit total.
        attempts += 1;
        cumulative.api_calls += 1;
        result = await input.client.chat(request);
        modelRevision = modelRevision ?? result.response_model ?? null;
        cumulative.live_prompt_tokens =
          (cumulative.live_prompt_tokens ?? 0) + (result.usage.prompt_tokens ?? 0);
        cumulative.live_completion_tokens =
          (cumulative.live_completion_tokens ?? 0) + (result.usage.completion_tokens ?? 0);
        cumulative.live_total_tokens =
          (cumulative.live_total_tokens ?? 0) + (result.usage.total_tokens ?? 0);
        cumulative.prompt_tokens += result.usage.prompt_tokens ?? 0;
        cumulative.completion_tokens += result.usage.completion_tokens ?? 0;
        cumulative.total_tokens += result.usage.total_tokens ?? 0;
        limiter.recordUsage(result.usage.total_tokens ?? 0);
        break;
      } catch (err) {
        if (err instanceof RateLimitExceededError) {
          stopped = err.kind === "tokens_per_day" ? "tokens_per_day" : "requests_per_day";
          break;
        }
        lastError = err;
        cumulative.failed_attempts = (cumulative.failed_attempts ?? 0) + 1;
        const classified = classifyGroqError(err);
        if (classified.class === "permanent" || attempt === MAX_ATTEMPTS) break;
        const backoff = BASE_BACKOFF_MS * Math.pow(3, attempt - 1);
        await sleep(backoff);
      }
    }

    if (stopped) break;

    if (!result) {
      const classified = classifyGroqError(lastError);
      await appendErrorLine(input.runsDir, input.runId, {
        question_id: question.question_id,
        cache_key: cacheKey,
        class: classified.class,
        status_code: classified.status_code,
        message: classified.message,
        attempts,
        recorded_at: new Date().toISOString(),
      });
      failed += 1;
      input.onProgress?.({
        answered,
        failed,
        skipped: skipped.length,
        total: scope.length,
        current_question_id: question.question_id,
        phase: "error",
      });
      continue;
    }

    await writeCache(input.cacheDir, cacheKey, result);
    await appendResponseLine(input.runsDir, input.runId, {
      question_id: question.question_id,
      cache_key: cacheKey,
      source: "api",
      content: result.content,
      usage: result.usage,
      finish_reason: result.finish_reason,
      request_id: result.request_id,
      latency_ms: result.latency_ms,
      answered_at: new Date().toISOString(),
    });
    answered += 1;
    input.onProgress?.({
      answered,
      failed,
      skipped: skipped.length,
      total: scope.length,
      current_question_id: question.question_id,
      phase: "success",
    });
  }

  const finalMeta = await readRunMetadata(input.runsDir, input.runId);
  if (finalMeta) {
    await writeRunMetadata(input.runsDir, input.runId, {
      ...finalMeta,
      updated_at: new Date().toISOString(),
      status: stopped ? "RATE_LIMITED" : failed === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS",
      provenance: buildProvenance({
        systemPrompt: input.systemPrompt,
        selectedQuestionIds: selectedIds,
        temperature: input.temperature ?? null,
        seed: input.seed ?? null,
        modelRevision,
      }),
      cumulative_usage: cumulative,
    });
  }

  return {
    run_id: input.runId,
    mode: input.mode,
    answered,
    failed,
    skipped: skipped.length,
    total: scope.length,
    cache_hits: cumulative.cache_hits,
    api_calls: cumulative.api_calls,
    total_tokens: cumulative.total_tokens,
    live_total_tokens: cumulative.live_total_tokens ?? 0,
    replay_total_tokens: cumulative.replay_total_tokens ?? 0,
    stopped,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
