export interface GenerationConfig {
  model_id: string;
  provider: "groq";
  reasoning_effort: "low" | "medium" | "high";
  concurrency: number;
  max_output_tokens: number;
}

/**
 * Frozen generation settings for the raw-model experiment.
 *
 * - model: professor-approved `openai/gpt-oss-120b` served by Groq
 * - reasoning_effort: `medium` (as approved)
 * - concurrency: 1 (as approved)
 * - temperature: NOT set until compatibility with the current GPT-OSS
 *   endpoint is verified; see STATUS.md
 * - max_output_tokens: bounded to keep a single answer from blowing the
 *   token budget on verbose responses
 *
 * Changing any value here changes the request hash and therefore the cache
 * key, so previous cached responses are not silently reused.
 */
export const RAW_GENERATION_V1: GenerationConfig = Object.freeze({
  model_id: "openai/gpt-oss-120b",
  provider: "groq",
  reasoning_effort: "medium",
  concurrency: 1,
  max_output_tokens: 2048,
});

/**
 * Groq free-tier constraints, per account, recorded as hard policy.
 * See STATUS.md §"Groq free-tier constraints" and the professor's
 * usage rules. Any change here changes what a run is allowed to consume.
 */
export interface RateLimitConfig {
  max_requests_per_minute: number;
  max_requests_per_day: number;
  max_tokens_per_minute: number;
  max_tokens_per_day: number;
  /** Upper bound for a single call, per the professor's instruction. */
  target_max_tokens_per_call: number;
  /** Hard floor between calls, regardless of token budget. */
  min_interval_between_calls_ms: number;
}

export const RATE_LIMITS_FREE_TIER: RateLimitConfig = Object.freeze({
  max_requests_per_minute: 30,
  max_requests_per_day: 1000,
  max_tokens_per_minute: 8000,
  max_tokens_per_day: 200000,
  target_max_tokens_per_call: 4000,
  min_interval_between_calls_ms: 2000,
});
