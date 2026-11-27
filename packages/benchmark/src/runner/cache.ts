import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256, FIELD_SEP } from "../shared/hash";
import type { GenerationConfig } from "../config/generation";
import type { ChatResult } from "../providers/groq/client";
import type { BenchmarkArm } from "../arms";

/**
 * A cache file exists but cannot be trusted.
 *
 * Returning `null` here would silently re-call the provider and pay twice for
 * a known-bad artifact. The runner records this as a permanent error instead.
 */
export class CacheCorruptionError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${message} (${path})`);
    this.name = "CacheCorruptionError";
  }
}

export interface CacheKeyInput {
  mode: BenchmarkArm;
  model_id: string;
  prompt_version: string;
  system_prompt: string;
  user_message: string;
  generation: GenerationConfig;
  /**
   * Identity of any additional payload folded into the user message, such as
   * the oracle evidence bundle. `null` for the raw arm.
   */
  payload_hash?: string | null;
}

/**
 * Deterministic request hash. Any change in arm, model, prompt version, system
 * prompt, user message, evidence payload, or generation settings produces a
 * different key.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const canonical = [
    input.mode,
    input.model_id,
    input.prompt_version,
    input.system_prompt,
    input.user_message,
    input.payload_hash ?? "",
    canonicalizeGeneration(input.generation),
  ].join(FIELD_SEP);
  return sha256(canonical);
}

function canonicalizeGeneration(g: GenerationConfig): string {
  return [
    `model_id=${g.model_id}`,
    `provider=${g.provider}`,
    `reasoning_effort=${g.reasoning_effort}`,
    `concurrency=${g.concurrency}`,
    `max_output_tokens=${g.max_output_tokens}`,
  ].join(";");
}

interface CacheEntry {
  cache_key: string;
  created_at: string;
  result: ChatResult;
}

function cachePath(cacheDir: string, key: string): string {
  return join(cacheDir, key.slice(0, 2), `${key}.json`);
}

export async function readCache(cacheDir: string, key: string): Promise<ChatResult | null> {
  const path = cachePath(cacheDir, key);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }

  let entry: CacheEntry;
  try {
    entry = JSON.parse(text) as CacheEntry;
  } catch {
    throw new CacheCorruptionError("cache entry is not valid JSON", path);
  }
  if (entry.cache_key !== key) {
    throw new CacheCorruptionError("cache entry key does not match its filename", path);
  }
  if (!entry.result || typeof entry.result.content !== "string") {
    throw new CacheCorruptionError("cache entry has no usable result", path);
  }
  return entry.result;
}

export async function writeCache(cacheDir: string, key: string, result: ChatResult): Promise<void> {
  const path = cachePath(cacheDir, key);
  await mkdir(dirname(path), { recursive: true });
  const entry: CacheEntry = {
    cache_key: key,
    created_at: new Date().toISOString(),
    result,
  };
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(entry), "utf8");
  await rename(tmp, path);
}
