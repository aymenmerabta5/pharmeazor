import {
  RetrievalError,
  type RerankInput,
  type RerankPort,
  type RerankResult,
} from "@repo/services/retrieval";
import type { RerankerRuntimeConfig } from "./config";

function timeoutSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

/**
 * BGE reranker over Text Embeddings Inference's `/rerank` endpoint.
 *
 * A cross-encoder reads the query and each candidate together, which is the
 * largest single quality lift in the pipeline. The adapter returns zero-based
 * candidate indices; the service maps them back and never trusts the response
 * beyond the candidate set.
 *
 * Requests are split into `batchSize` documents because TEI rejects a `texts`
 * array larger than its `max_client_batch_size`. Scores are comparable across
 * batches — each pair is scored independently — so the merged list is sorted
 * by score and re-indexed against the caller's original document order.
 */
export function createHttpRerankerAdapter(config: RerankerRuntimeConfig): RerankPort {
  const batchSize = Math.max(1, config.batchSize);
  const endpoint = `${config.url}/rerank`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

  async function scoreBatch(
    query: string,
    documents: readonly string[],
    offset: number,
    signal?: AbortSignal,
  ): Promise<RerankResult[]> {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          texts: documents,
          truncate: true,
          raw_scores: false,
        }),
        signal: timeoutSignal(config.timeoutMs, signal),
      });
    } catch (cause) {
      throw new RetrievalError("RETRIEVAL_RERANK_FAILED", "Reranker request failed", { cause });
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new RetrievalError(
        "RETRIEVAL_RERANK_FAILED",
        `Reranker returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new RetrievalError("RETRIEVAL_RERANK_FAILED", "Reranker returned unreadable JSON", {
        cause,
      });
    }

    if (!Array.isArray(payload)) {
      throw new RetrievalError(
        "RETRIEVAL_RERANK_FAILED",
        "Reranker returned an unexpected payload",
      );
    }

    const results: RerankResult[] = [];
    for (const entry of payload) {
      if (!entry || typeof entry !== "object") continue;
      const index = Reflect.get(entry, "index");
      const score = Reflect.get(entry, "score");
      if (typeof index !== "number" || !Number.isInteger(index)) continue;
      if (index < 0 || index >= documents.length) continue;
      if (typeof score !== "number" || !Number.isFinite(score)) continue;
      results.push({ index: offset + index, score });
    }
    return results;
  }

  return {
    model: config.model,
    async rerank(input: RerankInput): Promise<RerankResult[]> {
      if (input.documents.length === 0) return [];

      const results: RerankResult[] = [];
      for (let offset = 0; offset < input.documents.length; offset += batchSize) {
        const batch = input.documents.slice(offset, offset + batchSize);
        results.push(...(await scoreBatch(input.query, batch, offset, input.signal)));
      }

      results.sort((left, right) => right.score - left.score || left.index - right.index);
      return results;
    },
  };
}
