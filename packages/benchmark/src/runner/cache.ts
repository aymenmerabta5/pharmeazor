import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256, FIELD_SEP } from "../shared/hash";
import type { GenerationConfig } from "../config/generation";
import type { ChatResult } from "../providers/groq/client";

export interface CacheKeyInput {
  model_id: string;
  prompt_version: string;
  system_prompt: string;
  question: string;
  generation: GenerationConfig;
}

/**
 * Deterministic request hash. Any change in model, prompt version, system
 * prompt, question, or generation settings produces a different key.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const canonical = [
    input.model_id,
    input.prompt_version,
    input.system_prompt,
    input.question,
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
  try {
    const text = await readFile(cachePath(cacheDir, key), "utf8");
    const entry = JSON.parse(text) as CacheEntry;
    if (entry.cache_key !== key) return null;
    return entry.result;
  } catch {
    return null;
  }
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
