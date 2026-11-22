import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { buildCacheKey, readCache, writeCache, CacheCorruptionError } from "../../src/runner/cache";
import { RAW_GENERATION_V1 } from "../../src/config/generation";
import type { ChatResult } from "../../src/providers/groq/client";

const baseInput = {
  mode: "raw" as const,
  model_id: "openai/gpt-oss-120b",
  prompt_version: "raw-v1",
  system_prompt: "fixed",
  user_message: "Question ?",
  generation: RAW_GENERATION_V1,
};

describe("buildCacheKey", () => {
  it("is deterministic", () => {
    expect(buildCacheKey(baseInput)).toBe(buildCacheKey(baseInput));
  });

  it("changes when the arm changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({ ...baseInput, mode: "oracle" });
    expect(a).not.toBe(b);
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

  it("changes when the user message changes", () => {
    const a = buildCacheKey(baseInput);
    const b = buildCacheKey({ ...baseInput, user_message: "Different ?" });
    expect(a).not.toBe(b);
  });

  it("changes when the evidence payload changes", () => {
    const a = buildCacheKey({ ...baseInput, payload_hash: "aaa" });
    const b = buildCacheKey({ ...baseInput, payload_hash: "bbb" });
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

  it("throws on invalid JSON instead of silently re-calling the provider", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-cache-"));
    try {
      const key = "ab".padEnd(64, "0");
      const path = join(dir, key.slice(0, 2), `${key}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "{ not json", "utf8");
      expect(readCache(dir, key)).rejects.toBeInstanceOf(CacheCorruptionError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("throws when the filename does not match the stored key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bench-cache-"));
    try {
      const key = "cd".padEnd(64, "0");
      const path = join(dir, key.slice(0, 2), `${key}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        JSON.stringify({ cache_key: "other", result: { content: "x" } }),
        "utf8",
      );
      expect(readCache(dir, key)).rejects.toBeInstanceOf(CacheCorruptionError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
