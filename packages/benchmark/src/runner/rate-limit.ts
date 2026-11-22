import type { RateLimitConfig } from "../config/generation";

export type RateLimitKind = "requests_per_minute" | "requests_per_day" | "tokens_per_day";

/**
 * The next call would exceed a hard quota. The runner stops the run and leaves
 * the remaining questions pending so a later resume can continue them.
 */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly kind: RateLimitKind,
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`rate limit ${kind} reached: used ${used} of ${limit}`);
    this.name = "RateLimitExceededError";
  }
}

export interface RateLimiter {
  /** Block until the next call is safe under the per-minute limits. */
  waitForSlot(estimatedTokens: number): Promise<void>;
  /** Record actual tokens used by a call, after it returns. */
  recordUsage(tokens: number): void;
  /** Tokens used in the current 60 s sliding window. */
  tokensInWindow(): number;
  /** Total tokens used since this limiter was created. */
  totalTokens(): number;
  /** Requests counted against today's quota. */
  requestsToday(): number;
  /** Tokens counted against today's quota. */
  tokensToday(): number;
  /**
   * Throws `RateLimitExceededError` when one more call cannot fit inside the
   * daily request or token ceiling. Call before `waitForSlot`, so a run stops
   * instead of queuing forever.
   */
  assertDailyCapacity(estimatedTokens: number): void;
}

function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Sliding-window rate limiter for Groq's free tier.
 *
 * Enforces:
 *   - min_interval_between_calls_ms (request pacing)
 *   - max_requests_per_minute (request-rate ceiling)
 *   - max_tokens_per_minute over a 60 s sliding window (token-rate ceiling)
 *   - max_requests_per_day / max_tokens_per_day (daily ceiling)
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
  const requestTimes: number[] = [];
  let lastCallTs = 0;
  let total = 0;

  let dayKey = utcDayKey(now());
  let dailyRequests = 0;
  let dailyTokens = 0;

  function rollDay(current: number): void {
    const key = utcDayKey(current);
    if (key !== dayKey) {
      dayKey = key;
      dailyRequests = 0;
      dailyTokens = 0;
    }
  }

  function prune(current: number): void {
    const cutoff = current - config.window_ms;
    while (windowEvents.length > 0 && windowEvents[0]!.ts < cutoff) {
      windowEvents.shift();
    }
    while (requestTimes.length > 0 && requestTimes[0]! < cutoff) {
      requestTimes.shift();
    }
  }

  return {
    async waitForSlot(estimatedTokens: number): Promise<void> {
      while (true) {
        const current = now();
        rollDay(current);
        const sinceLast = current - lastCallTs;
        const waitMinInterval = Math.max(0, config.min_interval_between_calls_ms - sinceLast);

        prune(current);
        const windowUsed = windowEvents.reduce((sum, e) => sum + e.tokens, 0);
        const waitTokenBudget =
          windowUsed + estimatedTokens > config.max_tokens_per_minute
            ? windowEvents[0]
              ? windowEvents[0].ts + config.window_ms - current + 50
              : 0
            : 0;

        const waitRequestBudget =
          requestTimes.length >= config.max_requests_per_minute
            ? (requestTimes[0] ?? current) + config.window_ms - current + 50
            : 0;

        const waitMs = Math.max(waitMinInterval, waitTokenBudget, waitRequestBudget);
        if (waitMs <= 0) {
          lastCallTs = now();
          requestTimes.push(lastCallTs);
          dailyRequests += 1;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    },

    recordUsage(tokens: number): void {
      if (tokens <= 0) return;
      const current = now();
      rollDay(current);
      windowEvents.push({ ts: current, tokens });
      total += tokens;
      dailyTokens += tokens;
    },

    tokensInWindow(): number {
      prune(now());
      return windowEvents.reduce((sum, e) => sum + e.tokens, 0);
    },

    totalTokens(): number {
      return total;
    },

    requestsToday(): number {
      rollDay(now());
      return dailyRequests;
    },

    tokensToday(): number {
      rollDay(now());
      return dailyTokens;
    },

    assertDailyCapacity(estimatedTokens: number): void {
      rollDay(now());
      if (dailyRequests + 1 > config.max_requests_per_day) {
        throw new RateLimitExceededError(
          "requests_per_day",
          config.max_requests_per_day,
          dailyRequests,
        );
      }
      if (dailyTokens + estimatedTokens > config.max_tokens_per_day) {
        throw new RateLimitExceededError("tokens_per_day", config.max_tokens_per_day, dailyTokens);
      }
    },
  };
}
