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
    let fakeNow = 0;
    const limiter = createRateLimiter(
      {
        ...RATE_LIMITS_FREE_TIER,
        min_interval_between_calls_ms: 0,
        max_tokens_per_minute: 500,
      },
      () => fakeNow,
    );
    limiter.recordUsage(400);
    const waitPromise = limiter.waitForSlot(200);
    // Advance the clock so the oldest event expires
    setTimeout(() => {
      fakeNow = 60_500;
    }, 20);
    await waitPromise;
    expect(true).toBe(true);
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
