import type { EvidencePassage, Question } from "../dataset/schema";
import type { GroqClient } from "../providers/groq/client";
import type { RateLimiter } from "./rate-limit";
import type { GenerationConfig } from "../config/generation";
import { runChatBenchmark, type ChatRunProgress } from "./chat";
import { buildOracleUserMessage } from "../prompts/oracle/v1";

export interface OracleRunInput {
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
  evidenceByQuestionId: ReadonlyMap<string, readonly EvidencePassage[]>;
  evidenceHash: string;
  onProgress?: (event: OracleRunProgress) => void;
  rateLimiter?: RateLimiter;
  annotationsHash?: string | null;
  temperature?: number | null;
  seed?: number | null;
}

export type OracleRunProgress = ChatRunProgress;

export interface OracleRunResult {
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
 * Evidence arm: the model receives curated passages and must cite them.
 *
 * This is the upper bound for what the corpus can contribute. It deliberately
 * does not touch the retrieval system, so a low oracle score isolates the
 * prompt/composer, and `evidenceGain = oracle − raw` stays interpretable.
 */
export async function runOracleBenchmark(input: OracleRunInput): Promise<OracleRunResult> {
  const result = await runChatBenchmark({
    ...input,
    mode: "oracle",
    buildUserMessage: (question) =>
      buildOracleUserMessage({
        question: question.question,
        evidence: input.evidenceByQuestionId.get(question.question_id) ?? [],
      }),
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
