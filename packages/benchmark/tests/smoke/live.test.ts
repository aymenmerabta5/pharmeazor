import { describe, expect, test } from "bun:test";
import { createGroqClient } from "../../src/providers/groq/client";
import { RAW_GENERATION_V1 } from "../../src/config/generation";
import { RAW_SYSTEM_PROMPT_V1 } from "../../src/prompts/raw/v1";
import { getGroqApiKey } from "../../src/config/env";

/**
 * Live smoke test. Only runs when BENCHMARK_LIVE=1 is set.
 *
 * Usage from the repo root:
 *   $env:BENCHMARK_LIVE="1"
 *   bun --env-file=.env.local run --cwd packages/benchmark test tests/smoke
 *
 * This test consumes real Groq quota. Do not run it in CI.
 */
const liveTest = process.env.BENCHMARK_LIVE === "1" ? test : test.skip;

describe("live Groq smoke", () => {
  liveTest(
    "returns a non-empty response for one trivial question",
    async () => {
      const apiKey = getGroqApiKey();
      const client = createGroqClient(apiKey);
      const result = await client.chat({
        system: RAW_SYSTEM_PROMPT_V1,
        user: "Quelle est la capitale de la France ?",
        generation: RAW_GENERATION_V1,
      });
      expect(result.content.trim().length).toBeGreaterThan(0);
      expect(result.latency_ms).toBeGreaterThan(0);
      expect(result.usage.total_tokens ?? 0).toBeGreaterThan(0);
    },
    30_000,
  );
});
