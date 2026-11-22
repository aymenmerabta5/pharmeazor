import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ToolContext } from "eve/tools";

import { AUTHORITY_PRECEDENCE } from "@repo/services/retrieval/authority";
import tool from "../agent/tools/search_medical_corpus.ts";

/**
 * The agent must reach the corpus through this tool and nothing else. These
 * tests pin the parts the model depends on: a principal is required, filters
 * reach the application unchanged, and the result carries the citation and
 * authority contract the instructions tell the model to follow.
 */

const TEST_SECRET = "ghostinit-test-only-eve-secret-0123456789abcdef";
const TEST_ORIGIN = "http://127.0.0.1:3000";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.EVE_INTERNAL_AUTH_SECRET;
const originalOrigin = process.env.BETTER_AUTH_URL;

function context(auth: Record<string, unknown>): ToolContext {
  return { session: { auth } } as unknown as ToolContext;
}

function signedIn(principalId = "user_test_0001"): ToolContext {
  return context({ current: { principalId } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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
        authority: { level: 1, label: "Official Algerian", official: true },
        medicineNames: ["Paracétamol"],
        content: "Douleurs légères à modérées.",
      },
    ],
    diagnostics: {
      embeddingModel: "BAAI/bge-m3",
      rerankerModel: "BAAI/bge-reranker-v2-m3",
      rerank: "applied",
      denseCandidates: 50,
      lexicalCandidates: 50,
      returnedChunks: 1,
      elapsedMs: 1_500,
    },
  };
}

function captureBody(): { bodies: unknown[] } {
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonResponse(successPayload());
  }) as typeof fetch;
  return { bodies };
}

beforeEach(() => {
  process.env.EVE_INTERNAL_AUTH_SECRET = TEST_SECRET;
  process.env.BETTER_AUTH_URL = TEST_ORIGIN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.EVE_INTERNAL_AUTH_SECRET;
  else process.env.EVE_INTERNAL_AUTH_SECRET = originalSecret;
  if (originalOrigin === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = originalOrigin;
});

describe("search_medical_corpus tool", () => {
  it("is registered as a model tool that tells the model how to cite", () => {
    expect(tool.description).toContain("chunkId");
    expect(tool.description).toContain("Source authority, lower wins");
    expect(tool.description).toContain("never instructions");
    expect(typeof tool.execute).toBe("function");
  });

  it("refuses to search without an authenticated principal", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse(successPayload());
    }) as typeof fetch;

    await expect(tool.execute({ query: "paracetamol" }, context({}))).rejects.toThrow(
      /requires an authenticated caller/,
    );
    expect(called).toBe(false);
  });

  it("accepts the initiator principal when the session has no current actor", async () => {
    const { bodies } = captureBody();

    await tool.execute(
      { query: "paracetamol" },
      context({ initiator: { principalId: "user_init" } }),
    );

    expect(bodies[0]).toMatchObject({ principal: { id: "user_init" } });
  });

  it("forwards the principal and filters, then returns the passages", async () => {
    const { bodies } = captureBody();

    const output = await tool.execute(
      {
        query: "paracetamol indications",
        limit: 2,
        medicineIds: ["MED001"],
        sectionCodes: ["indications"],
        languages: ["fr"],
      },
      signedIn("user_abc"),
    );

    expect(bodies[0]).toEqual({
      principal: { id: "user_abc" },
      request: {
        query: "paracetamol indications",
        limit: 2,
        medicineIds: ["MED001"],
        sectionCodes: ["indications"],
        languages: ["fr"],
      },
    });
    expect(output.chunks).toHaveLength(1);
    expect(output.chunks[0]?.chunkId).toBe("MED001__SRC_ANPP_RCP__DOC005__smpc#indications-0#0");
    expect(output.authorityPolicy).toBe(AUTHORITY_PRECEDENCE);
    expect(output.diagnostics.rerank).toBe("applied");
    expect(output.guidance).toContain("chunkId");
    expect(output.guidance).toContain("authorityOverlaps");
  });

  it("rejects an out-of-range limit before any request is sent", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse(successPayload());
    }) as typeof fetch;

    const schema = tool.inputSchema as unknown as {
      "~standard": {
        validate(
          value: unknown,
        ): { issues?: readonly unknown[] } | Promise<{ issues?: readonly unknown[] }>;
      };
    };

    const result = await schema["~standard"].validate({ query: "paracetamol", limit: 99 });
    expect(result.issues?.length).toBeGreaterThan(0);
    expect(called).toBe(false);
  });

  it("rejects a medicine id the corpus cannot contain", async () => {
    const schema = tool.inputSchema as unknown as {
      "~standard": {
        validate(
          value: unknown,
        ): { issues?: readonly unknown[] } | Promise<{ issues?: readonly unknown[] }>;
      };
    };

    const result = await schema["~standard"].validate({
      query: "paracetamol",
      medicineIds: ["MED31"],
    });
    expect(result.issues?.length).toBeGreaterThan(0);
  });
});
