import { join } from "node:path";
import { loadQuestionsFromFile } from "../dataset/loader";
import { hashQuestions } from "../dataset/hash";
import { CATEGORY_VALUES, type Category, type Question } from "../dataset/schema";
import { logger } from "../shared/logger";
import type { ChatRunProgress } from "../runner/chat";
import type { BenchmarkArm } from "../arms";
import { GRAPH_TRACE_NAME } from "../retrieval/trace";
import type { ArmTracePaths } from "../retrieval/arm-trace";

export interface ParsedArgs {
  command?: string;
  subcommand?: string;
  flags: Record<string, string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      positionals.push(arg);
    }
  }
  const [command, subcommand] = positionals;
  return { command, subcommand, flags };
}

export function packageRoot(): string {
  return join(import.meta.dir, "..", "..");
}

export function runsDir(): string {
  return join(packageRoot(), "runs");
}

export function cacheDir(): string {
  return join(packageRoot(), ".cache");
}

export function dataV1Path(name: string): string {
  return join(packageRoot(), "data", "v1", name);
}

/** Trace files the retrieval arms read from the versioned dataset directory. */
export function armTracePaths(): ArmTracePaths {
  return {
    base: dataV1Path("retrieval-trace.jsonl"),
    graph: dataV1Path(GRAPH_TRACE_NAME),
  };
}

export function readGitSha(): string | null {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "HEAD"]);
    if (result.exitCode === 0) return new TextDecoder().decode(result.stdout).trim();
  } catch {
    // not in a git repo
  }
  return null;
}

export function generateRunId(prefix: BenchmarkArm): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const hms = now.toISOString().slice(11, 19).replace(/:/g, "");
  const hex = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ymd}-${hms}-${hex}`;
}

export function printUsage(): void {
  console.log(`Usage:
  benchmark dataset validate [--questions <path>] [--annotations <path>]
  benchmark dataset stats    [--questions <path>]
  benchmark raw run          [--category <CAT>] [--limit <N>] [--allow-draft]
  benchmark raw resume       --run-id <ID>
  benchmark raw status       [--run-id <ID>]
  benchmark oracle run       [--category <CAT>] [--limit <N>] [--allow-draft]
  benchmark oracle resume    --run-id <ID>
  benchmark rag run          [--category <CAT>] [--limit <N>] [--allow-draft]
  benchmark rag resume       --run-id <ID>
  benchmark rag-rerank run   [--category <CAT>] [--limit <N>] [--allow-draft]
  benchmark rag-rerank resume --run-id <ID>
  benchmark rag-graph run    [--category <CAT>] [--limit <N>] [--allow-draft]
  benchmark rag-graph resume --run-id <ID>
  benchmark retrieval evaluate [--write-baseline]
  benchmark evaluate run     --run-id <ID> [--force]
  benchmark review prepare   --run-id <ID>
  benchmark review submit    --run-id <ID> --reviewer <ID> --file <path>
  benchmark summary          --run-id <ID>
  benchmark report           --run-id <ID>
  benchmark compare          --run-a <ID> --run-b <ID>
  benchmark arms report      [--raw <ID>] [--oracle <ID>] [--rag <ID>]
                             [--rag-rerank <ID>] [--rag-graph <ID>]
  benchmark reproduce        --run-id <ID>
`);
}

export function parseCategoryFlag(value: string | undefined): Category | undefined {
  if (!value) return undefined;
  if ((CATEGORY_VALUES as readonly string[]).includes(value)) return value as Category;
  const upper = value.toUpperCase();
  if ((CATEGORY_VALUES as readonly string[]).includes(upper)) return upper as Category;
  throw new Error(`unknown category "${value}". Valid values: ${CATEGORY_VALUES.join(", ")}`);
}

export interface DatasetSelection {
  all: Question[];
  selected: Question[];
  datasetHash: string;
}

/**
 * Loads the model-facing dataset and applies the CLI slice.
 *
 * `dataset_hash` always covers the whole file; `selection_hash` (computed by
 * the runner) covers the slice, so two different slices never compare as the
 * same experiment.
 */
export async function loadDatasetSelection(
  flags: Record<string, string>,
): Promise<DatasetSelection> {
  const all = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const category = parseCategoryFlag(flags.category);
  const filtered = category ? all.filter((q) => q.category === category) : all;

  let selected = filtered;
  if (flags.limit !== undefined) {
    const limit = Number.parseInt(flags.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`--limit must be a positive integer, got ${flags.limit}`);
    }
    selected = filtered.slice(0, limit);
  }

  return { all, selected, datasetHash: hashQuestions(all) };
}

/**
 * Restricts a dataset to the exact ids stored on a run, preserving run order.
 * Throws when a stored id no longer exists, because silently dropping it would
 * change the experiment.
 */
export function selectStoredQuestions(
  all: readonly Question[],
  storedIds: readonly string[],
): Question[] {
  const byId = new Map(all.map((q) => [q.question_id, q] as const));
  const missing = storedIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(
      `the stored selection references question ids that no longer exist: ${missing.join(", ")}`,
    );
  }
  return storedIds.map((id) => byId.get(id)!);
}

export function logProgress(event: ChatRunProgress): void {
  if (event.phase === "api_call" || event.phase === "cache_hit" || event.phase === "error") {
    logger.info(
      `[${event.answered + event.failed}/${event.total}] ${event.phase} ${event.current_question_id}`,
    );
  }
}

export function exitCodeForRun(result: { failed: number; stopped: string | null }): number {
  if (result.stopped) return 3;
  return result.failed === 0 ? 0 : 2;
}
