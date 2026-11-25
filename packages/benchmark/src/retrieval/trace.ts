import { readFile } from "node:fs/promises";
import { sha256 } from "../shared/hash";
import type { RetrievalGateway, RetrievalTraceRow, RetrievedPassage } from "./types";

export interface LoadedRetrievalTrace {
  readonly rows: ReadonlyMap<string, RetrievalTraceRow>;
  readonly configHash: string;
  readonly traceHash: string;
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

/** Freeze the recorded passages into a deterministic gateway for the RAG arm. */
export function createTraceGateway(
  trace: LoadedRetrievalTrace,
  options: { readonly maxPassages?: number; readonly maxChars?: number } = {},
): RetrievalGateway {
  // Retrieval Architecture: 3-5 chunks, 2,000-4,000 composed tokens.
  const maxPassages = options.maxPassages ?? 3;
  const maxChars = options.maxChars ?? 2000;
  const passages = new Map<string, readonly RetrievedPassage[]>();

  for (const [questionId, row] of trace.rows) {
    const safe = row.chunks
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
  };
}
