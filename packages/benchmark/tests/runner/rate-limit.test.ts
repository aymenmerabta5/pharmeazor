import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "../../src/runner/rate-limit";
import { RATE_LIMITS_FREE_TIER } from "../../src/config/generation";

describe("createRateLimiter", () => {
  it("enforces the minimum interval between calls", async () => {
    const limiter = createRateLimiter({
      ...RATE_LIMITS_FREE_TIER,
      min_interval_between_calls_ms: 100,
    });
    const start = Date.now();
    await limiter.waitForSlot(100);
    await limiter.waitForSlot(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("waits when the token window is full", async () => {
    const limiter = createRateLimiter({
      ...RATE_LIMITS_FREE_TIER,
      min_interval_between_calls_ms: 0,
      max_tokens_per_minute: 500,
      window_ms: 200,
    });
    limiter.recordUsage(400);
    const start = Date.now();
    await limiter.waitForSlot(200); // 400 + 200 > 500 → must wait
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(180);
    expect(elapsed).toBeLessThan(1000);
  });

  it("does not wait when the token window has room", async () => {
    const limiter = createRateLimiter({
      ...RATE_LIMITS_FREE_TIER,
      min_interval_between_calls_ms: 0,
      max_tokens_per_minute: 500,
      window_ms: 200,
    });
    limiter.recordUsage(100);
    const start = Date.now();
    await limiter.waitForSlot(200); // 100 + 200 = 300 < 500 → immediate
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("accumulates tokens since creation", () => {
    const limiter = createRateLimiter(RATE_LIMITS_FREE_TIER);
    limiter.recordUsage(100);
    limiter.recordUsage(200);
    expect(limiter.totalTokens()).toBe(300);
  });

  it("ignores non-positive tokens", () => {
    const limiter = createRateLimiter(RATE_LIMITS_FREE_TIER);
    limiter.recordUsage(0);
    limiter.recordUsage(-5);
    expect(limiter.totalTokens()).toBe(0);
  });
});
