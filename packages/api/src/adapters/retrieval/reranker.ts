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
 */
export function createHttpRerankerAdapter(config: RerankerRuntimeConfig): RerankPort {
  return {
    model: config.model,
    async rerank(input: RerankInput): Promise<RerankResult[]> {
      if (input.documents.length === 0) return [];
      const endpoint = `${config.url}/rerank`;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: input.query,
            texts: input.documents,
            truncate: true,
            raw_scores: false,
          }),
          signal: timeoutSignal(config.timeoutMs, input.signal),
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
        if (index < 0 || index >= input.documents.length) continue;
        if (typeof score !== "number" || !Number.isFinite(score)) continue;
        results.push({ index, score });
      }
      return results;
    },
  };
}
