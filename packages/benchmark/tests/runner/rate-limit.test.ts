import { describe, expect, it } from "bun:test";
import { createRateLimiter, RateLimitExceededError } from "../../src/runner/rate-limit";
import type { RateLimitConfig } from "../../src/config/generation";

const config: RateLimitConfig = {
  max_requests_per_minute: 30,
  max_requests_per_day: 2,
  max_tokens_per_minute: 8000,
  max_tokens_per_day: 1000,
  window_ms: 60_000,
  target_max_tokens_per_call: 4000,
  min_interval_between_calls_ms: 0,
};

describe("createRateLimiter daily caps", () => {
  it("counts requests and tokens against the day", async () => {
    const limiter = createRateLimiter(config, () => 1_000);
    await limiter.waitForSlot(100);
    limiter.recordUsage(200);
    expect(limiter.requestsToday()).toBe(1);
    expect(limiter.tokensToday()).toBe(200);
  });

  it("throws before exceeding the daily request cap", async () => {
    const limiter = createRateLimiter(config, () => 1_000);
    await limiter.waitForSlot(100);
    await limiter.waitForSlot(100);
    expect(() => limiter.assertDailyCapacity(100)).toThrow(RateLimitExceededError);
  });

  it("throws before exceeding the daily token cap", () => {
    const limiter = createRateLimiter(config, () => 1_000);
    limiter.recordUsage(950);
    expect(() => limiter.assertDailyCapacity(100)).toThrow(RateLimitExceededError);
  });

  it("resets at the UTC day boundary", async () => {
    let now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const limiter = createRateLimiter(config, () => now);
    await limiter.waitForSlot(100);
    await limiter.waitForSlot(100);
    expect(() => limiter.assertDailyCapacity(100)).toThrow(RateLimitExceededError);

    now = Date.UTC(2026, 0, 2, 0, 0, 1);
    expect(limiter.requestsToday()).toBe(0);
    expect(() => limiter.assertDailyCapacity(100)).not.toThrow();
  });
});
