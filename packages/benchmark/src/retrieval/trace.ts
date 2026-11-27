import { readFile } from "node:fs/promises";
import { sha256 } from "../shared/hash";
import type {
  RetrievalGateway,
  RetrievalOrdering,
  RetrievalTraceRow,
  RetrievedPassage,
  TraceChunk,
} from "./types";

export interface LoadedRetrievalTrace {
  readonly rows: ReadonlyMap<string, RetrievalTraceRow>;
  readonly configHash: string;
  readonly traceHash: string;
}

/** Trace file the graph arm reads. It does not exist yet; the arm refuses to run. */
export const GRAPH_TRACE_NAME = "retrieval-trace-graph.jsonl";

/**
 * The graph arm is scaffolded but its trace producer does not exist.
 *
 * This is a hard stop, not a warning: falling back to the base trace would
 * label fusion-order passages as a graph result.
 */
export class GraphArmNotReadyError extends Error {
  constructor(public readonly path: string) {
    super(
      `RAG + graph is not ready: ${path} does not exist. ` +
        "The graph arm needs a trace produced by the graph retrieval pipeline; " +
        "it never falls back to the base retrieval trace.",
    );
    this.name = "GraphArmNotReadyError";
  }
}

export async function loadRetrievalTrace(path: string): Promise<LoadedRetrievalTrace> {
  const raw = await readFile(path, "utf8");
  const rows = new Map<string, RetrievalTraceRow>();
  let configHash: string | null = null;

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new Error(`retrieval trace line ${index + 1} is not valid JSON`, { cause });
    }
    const row = parsed as RetrievalTraceRow;
    if (!row.question_id || !Array.isArray(row.chunks)) {
      throw new Error(`retrieval trace line ${index + 1} is missing required fields`);
    }
    if (rows.has(row.question_id)) {
      throw new Error(`retrieval trace has a duplicate question: ${row.question_id}`);
    }
    if (configHash === null) configHash = row.retrieval_config_hash;
    else if (configHash !== row.retrieval_config_hash)
      throw new Error("retrieval trace mixes multiple retrieval configurations");
    rows.set(row.question_id, row);
  }

  if (rows.size === 0) throw new Error("retrieval trace is empty");
  if (!configHash) throw new Error("retrieval trace has no configuration hash");
  return { rows, configHash, traceHash: sha256(raw) };
}

/**
 * Loads the graph trace, or throws when the graph pipeline has not produced it.
 *
 * Any other read failure (malformed JSON, unreadable file) is a real error and
 * is rethrown rather than reported as "not ready".
 */
export async function loadGraphTrace(path: string): Promise<LoadedRetrievalTrace> {
  try {
    return await loadRetrievalTrace(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new GraphArmNotReadyError(path);
    }
    throw error;
  }
}

function numericScore(chunk: TraceChunk, key: string): number | null {
  const value = chunk.scores?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Applies an arm's ordering to a trace row without mutating it.
 *
 * `fusion` sorts by the recorded RRF score and breaks ties on the recorded
 * rank, so the result is deterministic. Rows that predate fusion scores keep
 * their recorded order instead of being silently reshuffled.
 */
export function orderTraceChunks(
  row: RetrievalTraceRow,
  ordering: RetrievalOrdering,
): readonly TraceChunk[] {
  const recorded = [...row.chunks].sort((a, b) => a.rank - b.rank);
  if (ordering !== "fusion") return recorded;

  return recorded.sort((a, b) => {
    const aScore = numericScore(a, "rrf");
    const bScore = numericScore(b, "rrf");
    if (aScore === null && bScore === null) return a.rank - b.rank;
    if (aScore === null) return 1;
    if (bScore === null) return -1;
    return bScore - aScore || a.rank - b.rank;
  });
}

/** True when the trace recorded a cross-encoder score for every returned chunk. */
export function hasRerankScores(trace: LoadedRetrievalTrace): boolean {
  for (const row of trace.rows.values()) {
    for (const chunk of row.chunks) {
      if (numericScore(chunk, "rerank") === null) return false;
    }
  }
  return true;
}

/** Freeze the recorded passages into a deterministic gateway for a retrieval arm. */
export function createTraceGateway(
  trace: LoadedRetrievalTrace,
  options: {
    readonly maxPassages?: number;
    readonly maxChars?: number;
    /** Defaults to the recorded order so callers that predate arms keep working. */
    readonly ordering?: RetrievalOrdering;
  } = {},
): RetrievalGateway {
  // Retrieval Architecture: 3-5 chunks, 2,000-4,000 composed tokens.
  const maxPassages = options.maxPassages ?? 3;
  const maxChars = options.maxChars ?? 2000;
  const ordering = options.ordering ?? "recorded";
  const passages = new Map<string, readonly RetrievedPassage[]>();

  for (const [questionId, row] of trace.rows) {
    const safe = orderTraceChunks(row, ordering)
      .filter((chunk) => !chunk.injection_risk && chunk.text.length > 0)
      .slice(0, maxPassages)
      .map((chunk, index) => ({
        evidence_id: `E${index + 1}`,
        chunk_id: chunk.chunk_id,
        citation_label: chunk.citation_label,
        text: chunk.text.slice(0, maxChars),
      }));
    passages.set(questionId, safe);
  }

  return {
    search(questionId: string): readonly RetrievedPassage[] {
      return passages.get(questionId) ?? [];
    },
    configHash(): string {
      return trace.configHash;
    },
    ordering(): RetrievalOrdering {
      return ordering;
    },
  };
}
