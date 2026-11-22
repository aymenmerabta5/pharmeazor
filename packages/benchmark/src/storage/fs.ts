import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunProvenance } from "../config/provenance";

export interface CumulativeUsage {
  api_calls: number;
  cache_hits: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Tokens actually spent against the provider during this run. */
  live_prompt_tokens?: number;
  live_completion_tokens?: number;
  live_total_tokens?: number;
  /** Historic usage replayed from the cache. Never billed again. */
  replay_prompt_tokens?: number;
  replay_completion_tokens?: number;
  replay_total_tokens?: number;
  /** HTTP attempts that failed, including retried ones. */
  failed_attempts?: number;
}

export interface RunMetadata {
  run_id: string;
  started_at: string;
  updated_at: string;
  status: "RUNNING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED" | "RATE_LIMITED";
  model_id: string;
  provider: string;
  reasoning_effort: string;
  prompt_version: string;
  dataset_version: string;
  dataset_hash: string;
  git_sha: string | null;
  generation: Record<string, unknown>;
  total_questions: number;
  allow_draft: boolean;
  run_mode?: "raw" | "oracle" | "rag";
  annotations_hash?: string | null;
  /** Exact question selection of the run; guards `--category`/`--limit` drift. */
  selection_hash?: string;
  selected_question_ids?: string[];
  /** Questions excluded because the arm had no input for them (oracle). */
  skipped_question_ids?: string[];
  provenance?: RunProvenance;
  /** Hash of the oracle evidence bundle supplied to the run. */
  evidence_hash?: string | null;
  /** Hash of the retrieval configuration used by a RAG run. */
  retrieval_config_hash?: string | null;
  cumulative_usage?: CumulativeUsage;
}

export interface ResponseLine {
  question_id: string;
  cache_key: string;
  source: "cache" | "api";
  content: string;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  finish_reason: string;
  request_id: string;
  latency_ms: number;
  answered_at: string;
}

export interface ErrorLine {
  question_id: string;
  cache_key: string;
  class: "transient" | "permanent";
  /** Machine-readable cause, e.g. CACHE_CORRUPT. */
  code?: string;
  status_code?: number;
  message: string;
  /** HTTP attempts actually made; 0 when the call never left the process. */
  attempts: number;
  recorded_at: string;
}

function runPath(runsDir: string, runId: string): string {
  return join(runsDir, runId);
}

export async function ensureRunDir(runsDir: string, runId: string): Promise<void> {
  await mkdir(runPath(runsDir, runId), { recursive: true });
}

export async function writeRunMetadata(
  runsDir: string,
  runId: string,
  metadata: RunMetadata,
): Promise<void> {
  const path = join(runPath(runsDir, runId), "run_metadata.json");
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(metadata, null, 2), "utf8");
  await rename(tmp, path);
}

export async function readRunMetadata(runsDir: string, runId: string): Promise<RunMetadata | null> {
  try {
    const text = await readFile(join(runPath(runsDir, runId), "run_metadata.json"), "utf8");
    return JSON.parse(text) as RunMetadata;
  } catch {
    return null;
  }
}

export async function appendResponseLine(
  runsDir: string,
  runId: string,
  line: ResponseLine,
): Promise<void> {
  const path = join(runPath(runsDir, runId), "responses.jsonl");
  await appendLine(path, line);
}

export async function appendErrorLine(
  runsDir: string,
  runId: string,
  line: ErrorLine,
): Promise<void> {
  const path = join(runPath(runsDir, runId), "errors.jsonl");
  await appendLine(path, line);
}

async function appendLine(path: string, line: unknown): Promise<void> {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, `${JSON.stringify(line)}\n`, "utf8");
}

export async function readAnsweredQuestionIds(
  runsDir: string,
  runId: string,
): Promise<Set<string>> {
  const path = join(runPath(runsDir, runId), "responses.jsonl");
  const out = new Set<string>();
  try {
    const text = await readFile(path, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      try {
        const parsed = JSON.parse(raw) as { question_id?: string };
        if (typeof parsed.question_id === "string") out.add(parsed.question_id);
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // file does not exist yet
  }
  return out;
}

export async function readResponses(runsDir: string, runId: string): Promise<ResponseLine[]> {
  const path = join(runPath(runsDir, runId), "responses.jsonl");
  try {
    const text = await readFile(path, "utf8");
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ResponseLine);
  } catch {
    return [];
  }
}

export async function readErrors(runsDir: string, runId: string): Promise<ErrorLine[]> {
  const path = join(runPath(runsDir, runId), "errors.jsonl");
  try {
    const text = await readFile(path, "utf8");
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ErrorLine);
  } catch {
    return [];
  }
}
