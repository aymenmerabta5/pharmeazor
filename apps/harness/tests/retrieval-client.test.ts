import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";

import { searchMedicalCorpus } from "../agent/lib/retrieval-client.ts";

/**
 * Contract tests for the harness -> application retrieval transport.
 *
 * The harness signs `timestamp.body` with `EVE_INTERNAL_AUTH_SECRET`; the
 * application verifies the same envelope in `packages/api/src/retrieval/http.ts`.
 * The fixed vector below is asserted on both sides, so changing the header
 * names, the signing order, or the base64url encoding fails here and in
 * `packages/api/tests/retrieval-http.test.ts` instead of only at runtime.
 */

const TEST_SECRET = "ghostinit-test-only-eve-secret-0123456789abcdef";
const TEST_ORIGIN = "http://127.0.0.1:3000";
const FIXED_TIME = 1_700_000_000_000;
const FIXED_BODY =
  '{"principal":{"id":"user_test_0001"},"request":{"query":"paracetamol indications"}}';
const FIXED_SIGNATURE = "nqSdaN4QuYjFdqUnCIIkM1onJIVwPvjGbDq2B1bzBoc";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
const originalOrigin = process.env.BETTER_AUTH_URL;

interface CapturedCall {
  readonly url: string;
  readonly init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function capture(respond: () => Response): CapturedCall[] {
  const calls: CapturedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return calls;
}

function successPayload() {
  return {
    ok: true,
    chunks: [
      {
        chunkId: "MED001__SRC_ANPP_RCP__DOC005__smpc#indications-0#0",
        citation: { label: "ANPP SmPC MED001 — indications" },
        title: "PARACETAMOL 500 mg comprimé",
        sectionHeading: "Indications thérapeutiques",
        sectionPath: "smpc > indications",
        sectionCodes: ["indications"],
        sourceName: "ANPP SmPC",
        documentType: "smpc",
        language: "fr",
        authorityLevel: 1,
        authorityTier: "official",
        authority: {
          level: 1,
          tier: "official",
          label: "Official Algerian",
          official: true,
          description: "ANPP summary of product characteristics",
        },
        medicineNames: ["Paracétamol"],
        content: "Traitement symptomatique des douleurs d'intensité légère à modérée.",
      },
    ],
    authorityPolicy: "Source authority, lower wins.",
    authorityOverlaps: [
      {
        medicineIds: ["MED001"],
        sectionCodes: ["dosage"],
        claimScope: "clinical",
        entries: [
          {
            chunkId: "MED001__SRC_BDPM_FR__DOC001__rcp#dosage-0#0",
            sourceId: "BDPM_FR",
            sourceName: "BDPM",
            authorityLevel: 3,
            authorityLabel: "Foreign institutional",
            claimScope: "clinical",
          },
        ],
        preferredChunkId: "MED001__SRC_ANPP_RCP__DOC005__smpc#dosage-0#0",
        preferredAuthorityLevel: 1,
        authorityGap: 2,
        numericDivergence: ["500 mg"],
        numbersCompared: true,
      },
    ],
    diagnostics: {
      embeddingModel: "BAAI/bge-m3",
      rerankerModel: "BAAI/bge-reranker-v2-m3",
      rerank: "applied",
      denseCandidates: 50,
      lexicalCandidates: 50,
      returnedChunks: 1,
      elapsedMs: 1_700,
    },
  };
}

beforeEach(() => {
  process.env.EVE_INTERNAL_AUTH_SECRET = TEST_SECRET;
  process.env.BETTER_AUTH_URL = TEST_ORIGIN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setSystemTime();
  if (originalSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
  else process.env.EVE_INTERNAL_AUTH_SECRET = originalSecret;
  if (originalOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = originalOrigin;
});

describe("harness retrieval client", () => {
  it("signs the timestamp and body with the shared secret", async () => {
    setSystemTime(FIXED_TIME);
    const calls = capture(() => jsonResponse(successPayload()));

    await searchMedicalCorpus("user_test_0001", { query: "paracetamol indications" });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(`${TEST_ORIGIN}/api/retrieval/search`);
    expect(call?.init.method).toBe("POST");
    expect(call?.init.body).toBe(FIXED_BODY);

    const headers = new Headers(call?.init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-ghostinit-eve-timestamp")).toBe(String(FIXED_TIME));
    expect(headers.get("x-ghostinit-eve-signature")).toBe(FIXED_SIGNATURE);
  });

  it("sends only the filters the caller provided", async () => {
    const calls = capture(() => jsonResponse(successPayload()));

    await searchMedicalCorpus("user_1", {
      query: "q",
      limit: 3,
      medicineIds: ["MED001"],
      sectionCodes: ["indications"],
      languages: ["fr"],
      sourceIds: ["ANPP_RCP"],
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      principal: { id: "user_1" },
      request: {
        query: "q",
        limit: 3,
        medicineIds: ["MED001"],
        sectionCodes: ["indications"],
        languages: ["fr"],
        sourceIds: ["ANPP_RCP"],
      },
    });

    await searchMedicalCorpus("user_1", { query: "q", medicineIds: [], languages: [] });
    expect(JSON.parse(String(calls[1]?.init.body)).request).toEqual({ query: "q" });
  });

  it("maps a successful envelope into passages the model can cite", async () => {
    capture(() => jsonResponse(successPayload()));

    const result = await searchMedicalCorpus("user_1", { query: "q" });

    expect(result.chunks).toHaveLength(1);
    const chunk = result.chunks[0]!;
    expect(chunk.chunkId).toBe("MED001__SRC_ANPP_RCP__DOC005__smpc#indications-0#0");
    expect(chunk.citation).toBe("ANPP SmPC MED001 — indications");
    expect(chunk.authority.level).toBe(1);
    expect(chunk.authority.label).toBe("Official Algerian");
    expect(chunk.authority.official).toBe(true);
    expect(chunk.medicineNames).toEqual(["Paracétamol"]);
    expect(chunk.contentTruncated).toBe(false);
    expect(result.diagnostics.rerank).toBe("applied");
    expect(result.diagnostics.rerankerModel).toBe("BAAI/bge-reranker-v2-m3");
    expect(result.authorityOverlaps[0]?.preferredAuthorityLevel).toBe(1);
    expect(result.authorityOverlaps[0]?.numericDivergence).toEqual(["500 mg"]);
  });

  it("truncates a passage that would blow the model's context budget", async () => {
    const payload = successPayload();
    payload.chunks[0]!.content = "x".repeat(5_000);
    capture(() => jsonResponse(payload));

    const result = await searchMedicalCorpus("user_1", { query: "q" });

    expect(result.chunks[0]?.contentTruncated).toBe(true);
    expect(result.chunks[0]?.content).toHaveLength(4_001);
    expect(result.chunks[0]?.content.endsWith("…")).toBe(true);
  });

  it("surfaces the application's error code instead of a generic failure", async () => {
    capture(() =>
      jsonResponse(
        { ok: false, code: "RETRIEVAL_INDEX_EMPTY", error: "The retrieval index is empty." },
        404,
      ),
    );

    await expect(searchMedicalCorpus("user_1", { query: "q" })).rejects.toThrow(
      /RETRIEVAL_INDEX_EMPTY: The retrieval index is empty\./,
    );
  });

  it("reports a network failure with the transport in the message", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:3000");
    }) as typeof fetch;

    await expect(searchMedicalCorpus("user_1", { query: "q" })).rejects.toThrow(
      /Medical corpus retrieval request failed: connect ECONNREFUSED/,
    );
  });

  it("refuses to sign when the shared secret is missing or a placeholder", async () => {
    process.env.EVE_INTERNAL_AUTH_SECRET = "";
    await expect(searchMedicalCorpus("user_1", { query: "q" })).rejects.toThrow(
      /EVE_INTERNAL_AUTH_SECRET is not configured/,
    );

    process.env.EVE_INTERNAL_AUTH_SECRET = "REPLACE_WITH_EVE_INTERNAL_AUTH_SECRET";
    await expect(searchMedicalCorpus("user_1", { query: "q" })).rejects.toThrow(
      /EVE_INTERNAL_AUTH_SECRET is not configured/,
    );
  });

  it("refuses a plaintext origin that is not loopback", async () => {
    process.env.BETTER_AUTH_URL = "http://pharmeazor.example.com";
    await expect(searchMedicalCorpus("user_1", { query: "q" })).rejects.toThrow(
      /BETTER_AUTH_URL must be an absolute http\(s\) URL/,
    );
  });

  it("rejects a success envelope that carries no chunk list", async () => {
    capture(() => jsonResponse({ ok: true }));

    await expect(searchMedicalCorpus("user_1", { query: "q" })).rejects.toThrow(
      /returned no chunk list/,
    );
  });
});
