import type { Question } from "../dataset/schema";
import { filterApprovedForScoredRun } from "../dataset/loader";
import { buildCacheKey, readCache, writeCache } from "./cache";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import type { ChatRequest, GroqClient, ChatResult } from "../providers/groq/client";
import { classifyGroqError } from "../providers/groq/errors";
import {
  appendErrorLine,
  appendResponseLine,
  ensureRunDir,
  readAnsweredQuestionIds,
  readRunMetadata,
  writeRunMetadata,
  type RunMetadata,
} from "../storage/fs";
import { RATE_LIMITS_FREE_TIER, type GenerationConfig } from "../config/generation";

export interface RawRunInput {
  runId: string;
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
  onProgress?: (event: RawRunProgress) => void;
  /**
   * Optional rate limiter override. Tests inject a fast/no-op limiter so
   * retry tests do not pay the production 2 s minimum interval. Production
   * always falls back to `createRateLimiter(RATE_LIMITS_FREE_TIER)`.
   */
  rateLimiter?: RateLimiter;
  annotationsHash?: string | null;
}

export interface RawRunProgress {
  answered: number;
  failed: number;
  total: number;
  current_question_id: string;
  phase: "started" | "cache_hit" | "api_call" | "success" | "error" | "skipped";
}

export interface RawRunResult {
  run_id: string;
  answered: number;
  failed: number;
  total: number;
  cache_hits: number;
  api_calls: number;
  total_tokens: number;
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const ESTIMATED_TOKENS_PER_CALL = 2000;

interface CumulativeUsage {
  api_calls: number;
  cache_hits: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

function emptyUsage(): CumulativeUsage {
  return {
    api_calls: 0,
    cache_hits: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
}

export async function runRawBenchmark(input: RawRunInput): Promise<RawRunResult> {
  const selected = input.allowDraft
    ? [...input.questions]
    : filterApprovedForScoredRun(input.questions);

  if (selected.length === 0) {
    throw new Error(
      input.allowDraft
        ? "no questions available in the dataset"
        : "no APPROVED questions are available; a pharmacist must approve at least one question before a scored run. Use --allow-draft to run on draft questions for pipeline testing only.",
    );
  }

  await ensureRunDir(input.runsDir, input.runId);

  // Read any existing metadata first so a resume accumulates onto the
  // previous session's cumulative usage instead of overwriting it.
  const existingMeta = await readRunMetadata(input.runsDir, input.runId);
  const cumulative: CumulativeUsage = existingMeta?.cumulative_usage
    ? { ...existingMeta.cumulative_usage }
    : emptyUsage();

  const alreadyAnswered = await readAnsweredQuestionIds(input.runsDir, input.runId);
  const pending = selected.filter((q) => !alreadyAnswered.has(q.question_id));

  const nowIso = new Date().toISOString();
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
    total_questions: selected.length,
    allow_draft: input.allowDraft,
    cumulative_usage: cumulative,
    annotations_hash: input.annotationsHash ?? null,
  };

  await writeRunMetadata(input.runsDir, input.runId, initialMeta);

  const limiter = input.rateLimiter ?? createRateLimiter(RATE_LIMITS_FREE_TIER);

  let answered = alreadyAnswered.size;
  let failed = 0;

  input.onProgress?.({
    answered,
    failed,
    total: selected.length,
    current_question_id: "",
    phase: "started",
  });

  for (const question of pending) {
    input.onProgress?.({
      answered,
      failed,
      total: selected.length,
      current_question_id: question.question_id,
      phase: "started",
    });

    const cacheKey = buildCacheKey({
      model_id: input.generation.model_id,
      prompt_version: input.promptVersion,
      system_prompt: input.systemPrompt,
      question: question.question,
      generation: input.generation,
    });

    const cached = await readCache(input.cacheDir, cacheKey);
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
      // A cache hit consumes no live tokens, but the historic usage of the
      // original response is still recorded so the run's true footprint
      // stays auditable across replays.
      cumulative.prompt_tokens += cached.usage.prompt_tokens ?? 0;
      cumulative.completion_tokens += cached.usage.completion_tokens ?? 0;
      cumulative.total_tokens += cached.usage.total_tokens ?? 0;
      input.onProgress?.({
        answered,
        failed,
        total: selected.length,
        current_question_id: question.question_id,
        phase: "cache_hit",
      });
      continue;
    }

    const request: ChatRequest = {
      system: input.systemPrompt,
      user: question.question,
      generation: input.generation,
    };

    let result: ChatResult | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      input.onProgress?.({
        answered,
        failed,
        total: selected.length,
        current_question_id: question.question_id,
        phase: "api_call",
      });
      try {
        // Proactive throttle: hold the request until the free-tier window
        // has room for this call. This is what keeps a 30-question run from
        // exceeding 8000 tokens/minute.
        await limiter.waitForSlot(ESTIMATED_TOKENS_PER_CALL);
        // From here on an HTTP request will be made. Count the attempt even
        // if it throws a 429 or 5xx, because the attempt consumed a request
        // slot on Groq's side and belongs in the audit total.
        cumulative.api_calls += 1;
        result = await input.client.chat(request);
        cumulative.prompt_tokens += result.usage.prompt_tokens ?? 0;
        cumulative.completion_tokens += result.usage.completion_tokens ?? 0;
        cumulative.total_tokens += result.usage.total_tokens ?? 0;
        limiter.recordUsage(result.usage.total_tokens ?? 0);
        break;
      } catch (err) {
        lastError = err;
        const classified = classifyGroqError(err);
        if (classified.class === "permanent" || attempt === MAX_ATTEMPTS) break;
        const backoff = BASE_BACKOFF_MS * Math.pow(3, attempt - 1);
        await sleep(backoff);
      }
    }

    if (!result) {
      const classified = classifyGroqError(lastError);
      await appendErrorLine(input.runsDir, input.runId, {
        question_id: question.question_id,
        cache_key: cacheKey,
        class: classified.class,
        status_code: classified.status_code,
        message: classified.message,
        attempts: MAX_ATTEMPTS,
        recorded_at: new Date().toISOString(),
      });
      failed += 1;
      input.onProgress?.({
        answered,
        failed,
        total: selected.length,
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
      total: selected.length,
      current_question_id: question.question_id,
      phase: "success",
    });
  }

  const finalMeta = await readRunMetadata(input.runsDir, input.runId);
  if (finalMeta) {
    await writeRunMetadata(input.runsDir, input.runId, {
      ...finalMeta,
      updated_at: new Date().toISOString(),
      status: failed === 0 ? "COMPLETED" : "COMPLETED_WITH_ERRORS",
      cumulative_usage: cumulative,
    });
  }

  return {
    run_id: input.runId,
    answered,
    failed,
    total: selected.length,
    cache_hits: cumulative.cache_hits,
    api_calls: cumulative.api_calls,
    total_tokens: cumulative.total_tokens,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
