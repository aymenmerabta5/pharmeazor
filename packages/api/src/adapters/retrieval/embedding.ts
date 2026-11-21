import { RetrievalError, type EmbeddingPort } from "@repo/services/retrieval";
import type { EmbeddingRuntimeConfig } from "./config";

interface OpenAIEmbeddingResponse {
  readonly data?: ReadonlyArray<{ readonly embedding?: unknown; readonly index?: number }>;
}

function timeoutSignal(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return external ? AbortSignal.any([external, timeout]) : timeout;
}

function describeFailure(cause: unknown): string {
  if (cause instanceof Error) {
    if (cause.name === "TimeoutError") return "the embedding server timed out";
    if (cause.name === "AbortError") return "the embedding request was aborted";
    return cause.message;
  }
  return "unknown network failure";
}

function normalizeVector(value: unknown, dimensions: number, position: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions) {
    throw new RetrievalError(
      "RETRIEVAL_EMBEDDING_FAILED",
      `The embedding server returned an invalid vector at position ${position}`,
    );
  }
  const vector: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new RetrievalError(
        "RETRIEVAL_EMBEDDING_FAILED",
        `The embedding server returned a non-finite value at position ${position}`,
      );
    }
    vector.push(entry);
  }
  return vector;
}

/**
 * BGE-M3 over HTTP.
 *
 * `tei` mode targets Text Embeddings Inference's `/embed`; `openai` mode
 * targets the OpenAI-compatible `/v1/embeddings` surface that vLLM and
 * Infinity expose. BGE-M3 does not need query/document instruction prefixes,
 * so both paths send the raw text.
 */
export function createHttpEmbeddingAdapter(config: EmbeddingRuntimeConfig): EmbeddingPort {
  async function request(texts: readonly string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return [];
    const endpoint = config.mode === "tei" ? `${config.url}/embed` : `${config.url}/v1/embeddings`;
    const body =
      config.mode === "tei"
        ? { inputs: texts, truncate: true }
        : { model: config.model, input: texts, encoding_format: "float" };
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: timeoutSignal(config.timeoutMs, signal),
      });
    } catch (cause) {
      throw new RetrievalError(
        "RETRIEVAL_EMBEDDING_FAILED",
        `Embedding request failed: ${describeFailure(cause)}`,
        { cause },
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new RetrievalError(
        "RETRIEVAL_EMBEDDING_FAILED",
        `Embedding server returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new RetrievalError(
        "RETRIEVAL_EMBEDDING_FAILED",
        "The embedding server returned unreadable JSON",
        { cause },
      );
    }

    const vectors =
      config.mode === "tei"
        ? Array.isArray(payload)
          ? payload
          : (payload as { embeddings?: unknown }).embeddings
        : (payload as OpenAIEmbeddingResponse).data
            ?.slice()
            .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
            .map((entry) => entry.embedding);

    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new RetrievalError(
        "RETRIEVAL_EMBEDDING_FAILED",
        `The embedding server returned ${Array.isArray(vectors) ? vectors.length : "no"} vectors for ${texts.length} inputs`,
      );
    }
    return vectors.map((vector, position) => normalizeVector(vector, config.dimensions, position));
  }

  return {
    model: config.model,
    dimensions: config.dimensions,
    async embedQuery(text, signal) {
      const [vector] = await request([text], signal);
      if (!vector) {
        throw new RetrievalError(
          "RETRIEVAL_EMBEDDING_FAILED",
          "The embedding server returned no query vector",
        );
      }
      return vector;
    },
    async embedDocuments(texts, signal) {
      const vectors: number[][] = [];
      for (let index = 0; index < texts.length; index += config.batchSize) {
        const batch = texts.slice(index, index + config.batchSize);
        vectors.push(...(await request(batch, signal)));
      }
      return vectors;
    },
  };
}
