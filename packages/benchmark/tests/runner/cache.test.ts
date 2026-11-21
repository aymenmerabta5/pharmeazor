import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCacheKey, readCache, writeCache } from "../../src/runner/cache";
import { RAW_GENERATION_V1 } from "../../src/config/generation";
import type { ChatResult } from "../../src/providers/groq/client";

const baseInput = {
  model_id: "openai/gpt-oss-120b",
  prompt_version: "raw-v1",
  system_prompt: "fixed",
  question: "Question ?",
  generation: RAW_GENERATION_V1,
};

describe("buildCacheKey", () => {
  it("is deterministic", () => {
    expect(buildCacheKey(baseInput)).toBe(buildCacheKey(baseInput));
  });

  it("changes when model changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({ ...baseInput, model_id: "other/model" });
    expect(a).not.toBe(b);
  });

  it("changes when prompt version changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({ ...baseInput, prompt_version: "raw-v2" });
    expect(a).not.toBe(b);
  });

  it("changes when system prompt changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({ ...baseInput, system_prompt: "different" });
    expect(a).not.toBe(b);
  });

  it("changes when question changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({ ...baseInput, question: "Different ?" });
    expect(a).not.toBe(b);
  });

  it("changes when generation config changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({
      ...baseInput,
      generation: { ...RAW_GENERATION_V1, reasoning_effort: "high" },
    });
    expect(a).not.toBe(b);
  });
});

describe("readCache / writeCache", () => {
  it("round-trips a result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-cache-"));
    try {
      const key = buildCacheKey(baseInput);
      const result: ChatResult = {
        content: "answer",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        finish_reason: "stop",
        request_id: "req-1",
        latency_ms: 123,
      };
      await writeCache(dir, key, result);
      const cached = await readCache(dir, key);
      expect(cached?.content).toBe("answer");
      expect(cached?.usage.total_tokens).toBe(30);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null for a missing key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-cache-"));
    try {
      const result = await readCache(dir, "deadbeef");
      expect(result).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
