import type { Question } from "../dataset/schema";
import type { GroqClient } from "../providers/groq/client";
import type { RateLimiter } from "./rate-limit";
import type { GenerationConfig } from "../config/generation";
import { runChatBenchmark, type ChatRunProgress } from "./chat";

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
  temperature?: number | null;
  seed?: number | null;
}

export type RawRunProgress = ChatRunProgress;

export interface RawRunResult {
  run_id: string;
  answered: number;
  failed: number;
  skipped: number;
  total: number;
  cache_hits: number;
  api_calls: number;
  total_tokens: number;
  live_total_tokens: number;
  replay_total_tokens: number;
  stopped: null | "requests_per_day" | "tokens_per_day";
}

/**
 * Closed-book arm: the model sees only the question, with no corpus, no
 * retrieval and no evidence. This is the baseline every other arm is measured
 * against.
 */
export async function runRawBenchmark(input: RawRunInput): Promise<RawRunResult> {
  const result = await runChatBenchmark({
    ...input,
    mode: "raw",
    buildUserMessage: (question) => question.question,
  });

  return {
    run_id: result.run_id,
    answered: result.answered,
    failed: result.failed,
    skipped: result.skipped,
    total: result.total,
    cache_hits: result.cache_hits,
    api_calls: result.api_calls,
    total_tokens: result.total_tokens,
    live_total_tokens: result.live_total_tokens,
    replay_total_tokens: result.replay_total_tokens,
    stopped: result.stopped,
  };
}
