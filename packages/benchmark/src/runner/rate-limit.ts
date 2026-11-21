import type { RateLimitConfig } from "../config/generation";

export interface RateLimiter {
  /** Block until the next call is safe under both request and token limits. */
  waitForSlot(estimatedTokens: number): Promise<void>;
  /** Record actual tokens used by a call, after it returns. */
  recordUsage(tokens: number): void;
  /** Tokens used in the current 60 s sliding window. */
  tokensInWindow(): number;
  /** Total tokens used since this limiter was created. */
  totalTokens(): number;
}

/**
 * Sliding-window rate limiter for Groq's free tier.
 *
 * Enforces both:
 *   - min_interval_between_calls_ms (request-rate floor)
 *   - max_tokens_per_minute over a 60 s sliding window (token-rate ceiling)
 *
 * The token window is the binding constraint for this benchmark: at
 * ~2000 tokens per call, 30 calls/min would use ~60 K tokens/min, which
 * is 7.5x the free-tier ceiling. The min interval alone is not enough.
 */
export function createRateLimiter(
  config: RateLimitConfig,
  now: () => number = Date.now,
): RateLimiter {
  const windowEvents: { ts: number; tokens: number }[] = [];
  let lastCallTs = 0;
  let total = 0;

  function prune(current: number): void {
    const cutoff = current - 60_000;
    while (windowEvents.length > 0 && windowEvents[0]!.ts < cutoff) {
      windowEvents.shift();
    }
  }

  return {
    async waitForSlot(estimatedTokens: number): Promise<void> {
      while (true) {
        const current = now();
        const sinceLast = current - lastCallTs;
        const waitMinInterval = Math.max(0, config.min_interval_between_calls_ms - sinceLast);

        prune(current);
        const windowUsed = windowEvents.reduce((sum, e) => sum + e.tokens, 0);
        const waitTokenBudget =
          windowUsed + estimatedTokens > config.max_tokens_per_minute
            ? windowEvents[0]
              ? windowEvents[0].ts + 60_000 - current + 50
              : 0
            : 0;

        const waitMs = Math.max(waitMinInterval, waitTokenBudget);
        if (waitMs <= 0) {
          lastCallTs = now();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    },

    recordUsage(tokens: number): void {
      if (tokens <= 0) return;
      windowEvents.push({ ts: now(), tokens });
      total += tokens;
    },

    tokensInWindow(): number {
      prune(now());
      return windowEvents.reduce((sum, e) => sum + e.tokens, 0);
    },

    totalTokens(): number {
      return total;
    },
  };
}
