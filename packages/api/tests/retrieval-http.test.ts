import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { createHmac } from "node:crypto";

import { handleRetrievalSearch } from "../src/retrieval/http";

/**
 * Server side of the harness retrieval transport.
 *
 * `apps/harness/tests/retrieval-client.test.ts` pins the client to the same
 * fixed vector, so the two files fail together if either side of the envelope
 * drifts. With no retrieval endpoint configured the handler stops at
 * `RETRIEVAL_NOT_CONFIGURED`; reaching that status is the proof that the
 * signature verified and the envelope parsed.
 */

const TEST_SECRET = "ghostinit-test-only-eve-secret-0123456789abcdef";
const TEST_ORIGIN = "http://127.0.0.1:3000";
const FIXED_TIME = 1_700_000_000_000;
const FIXED_BODY =
  '{"principal":{"id":"user_test_0001"},"request":{"query":"paracetamol indications"}}';
const FIXED_SIGNATURE = "nqSdaN4QuYjFdqUnCIIkM1onJIVwPvjGbDq2B1bzBoc";

const originalSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
const originalEmbeddingUrl = process.env.RETRIEVAL_EMBEDDING_URL;

function sign(body: string, timestamp: string, secret = TEST_SECRET): string {
  return createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");
}

function request(options: {
  body?: string;
  signature?: string;
  timestamp?: string;
  secret?: string;
  contentType?: string | null;
  method?: string;
}): Request {
  const body = options.body ?? FIXED_BODY;
  const timestamp = options.timestamp ?? String(FIXED_TIME);
  const headers: Record<string, string> = {
    "x-ghostinit-eve-timestamp": timestamp,
    "x-ghostinit-eve-signature":
      options.signature ?? sign(body, timestamp, options.secret ?? TEST_SECRET),
  };
  if (options.contentType !== null)
    headers["content-type"] = options.contentType ?? "application/json";
  return new Request(`${TEST_ORIGIN}/api/retrieval/search`, {
    method: options.method ?? "POST",
    headers,
    ...(options.method === "GET" ? {} : { body }),
  });
}

async function envelope(response: Response): Promise<{ ok: boolean; code?: string }> {
  return (await response.json()) as { ok: boolean; code?: string };
}

beforeEach(() => {
  process.env.EVE_INTERNAL_AUTH_SECRET = TEST_SECRET;
  // The handler must stop at configuration, not reach Postgres or TEI.
  delete process.env.RETRIEVAL_EMBEDDING_URL;
  setSystemTime(FIXED_TIME);
});

afterEach(() => {
  setSystemTime();
  if (originalSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
  else process.env.EVE_INTERNAL_AUTH_SECRET = originalSecret;
  if (originalEmbeddingUrl === undefined) delete process.env.RETRIEVAL_EMBEDDING_URL;
  else process.env.RETRIEVAL_EMBEDDING_URL = originalEmbeddingUrl;
});

describe("POST /api/retrieval/search", () => {
  it("accepts the exact envelope the harness client produces", async () => {
    const response = await handleRetrievalSearch(
      request({ signature: FIXED_SIGNATURE, timestamp: String(FIXED_TIME) }),
    );

    expect(response.status).toBe(503);
    expect((await envelope(response)).code).toBe("RETRIEVAL_NOT_CONFIGURED");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects a body that changed after signing", async () => {
    const tampered = '{"principal":{"id":"user_test_0001"},"request":{"query":"overdose"}}';
    const response = await handleRetrievalSearch(
      request({ body: tampered, signature: FIXED_SIGNATURE, timestamp: String(FIXED_TIME) }),
    );

    expect(response.status).toBe(401);
    expect((await envelope(response)).code).toBe("invalid_retrieval_signature");
  });

  it("rejects a signature made with a different secret", async () => {
    const response = await handleRetrievalSearch(
      request({ secret: "a-different-secret-that-is-long-enough-000000" }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a timestamp outside the five-minute window", async () => {
    setSystemTime(FIXED_TIME + 6 * 60_000);

    const response = await handleRetrievalSearch(
      request({ signature: FIXED_SIGNATURE, timestamp: String(FIXED_TIME) }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a non-numeric timestamp", async () => {
    const response = await handleRetrievalSearch(
      request({ timestamp: "not-a-timestamp", signature: FIXED_SIGNATURE }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a request that is not JSON", async () => {
    const response = await handleRetrievalSearch(request({ contentType: "text/plain" }));

    expect(response.status).toBe(415);
  });

  it("rejects a method other than POST", async () => {
    const response = await handleRetrievalSearch(request({ method: "GET" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("refuses to verify anything when the shared secret is not configured", async () => {
    delete process.env.EVE_INTERNAL_AUTH_SECRET;

    const response = await handleRetrievalSearch(request({ signature: FIXED_SIGNATURE }));

    expect(response.status).toBe(503);
    expect((await envelope(response)).code).toBe("retrieval_auth_not_configured");
  });

  it("rejects a body above the transport limit before verifying it", async () => {
    const oversized = "x".repeat(9_000);
    const response = await handleRetrievalSearch(request({ body: oversized }));

    expect(response.status).toBe(413);
  });

  it("rejects an envelope without a principal", async () => {
    const body = '{"request":{"query":"paracetamol"}}';
    const response = await handleRetrievalSearch(request({ body }));

    expect(response.status).toBe(400);
    expect((await envelope(response)).code).toBe("invalid_retrieval_request");
  });

  it("rejects malformed JSON after a valid signature", async () => {
    const body = "{";
    const response = await handleRetrievalSearch(request({ body }));

    expect(response.status).toBe(400);
    expect((await envelope(response)).code).toBe("invalid_retrieval_request");
  });
});
