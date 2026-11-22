import { afterEach, describe, expect, it } from "bun:test";
import { createHttpRerankerAdapter } from "../src/adapters/retrieval/reranker";

/**
 * TEI rejects a `texts` array larger than its `max_client_batch_size` (32 by
 * default) with HTTP 422. The adapter must therefore split a wide rerank
 * window, then merge the batches back into one ranking against the caller's
 * original document order.
 */

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function adapter(batchSize = 32) {
  return createHttpRerankerAdapter({
    url: "http://tei.test",
    model: "BAAI/bge-reranker-v2-m3",
    timeoutMs: 1_000,
    batchSize,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TEI reranker adapter", () => {
  it("splits requests at the batch size and merges the ranking across batches", async () => {
    const calls: number[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { texts: string[] };
      const offset = calls.length === 0 ? 0 : 32;
      calls.push(body.texts.length);
      // Later documents score higher, so the top result must come from the
      // second batch even though it arrives in a separate request.
      const scored = body.texts.map((_, index) => ({
        index,
        score: (offset + index) / 100,
      }));
      return jsonResponse(scored.reverse());
    }) as typeof fetch;

    const documents = Array.from({ length: 40 }, (_, index) => `document ${index}`);
    const results = await adapter().rerank({ query: "query", documents, topN: 5 });

    expect(calls).toEqual([32, 8]);
    expect(results).toHaveLength(40);
    expect(results[0]?.index).toBe(39);
    expect(results.at(-1)?.index).toBe(0);
    expect(results.map((result) => result.index).sort((a, b) => a - b)).toEqual(
      documents.map((_, index) => index),
    );
  });

  it("sends one request when the window fits in a single batch", async () => {
    const calls: number[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { texts: string[] };
      calls.push(body.texts.length);
      return jsonResponse(body.texts.map((_, index) => ({ index, score: index / 10 })));
    }) as typeof fetch;

    const results = await adapter().rerank({
      query: "query",
      documents: ["a", "b", "c"],
      topN: 3,
    });

    expect(calls).toEqual([3]);
    expect(results.map((result) => result.index)).toEqual([2, 1, 0]);
  });

  it("surfaces a rejected batch as a retrieval error", async () => {
    globalThis.fetch = (async () =>
      new Response('{"error":"batch size 50 > maximum allowed batch size 32"}', {
        status: 422,
      })) as typeof fetch;

    await expect(adapter().rerank({ query: "query", documents: ["a"], topN: 1 })).rejects.toThrow(
      /HTTP 422/,
    );
  });

  it("does not call the server when there is nothing to rerank", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse([]);
    }) as typeof fetch;

    expect(await adapter().rerank({ query: "query", documents: [], topN: 1 })).toEqual([]);
    expect(called).toBe(false);
  });

  it("ignores indices outside the batch instead of corrupting the ranking", async () => {
    globalThis.fetch = (async () =>
      jsonResponse([
        { index: 0, score: 0.4 },
        { index: 99, score: 0.9 },
        { index: -1, score: 0.8 },
      ])) as typeof fetch;

    const results = await adapter().rerank({ query: "query", documents: ["a"], topN: 1 });

    expect(results).toEqual([{ index: 0, score: 0.4 }]);
  });
});
