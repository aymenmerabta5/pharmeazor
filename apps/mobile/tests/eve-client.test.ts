import { describe, expect, test } from "bun:test";
import { createEveClient, type EveTransport } from "../src/lib/eve-protocol";

const SESSION_FACTS = {
  at: "2026-11-08T10:00:00.000Z",
  facts: [
    { type: "session.started", data: {} },
    { type: "delivery.admitted", data: { deliveryId: "d_1" } },
    {
      type: "delivery.consumed",
      data: {
        deliveryId: "d_1",
        turnId: "turn_0",
        parts: [{ kind: "text", text: "Hello" }],
      },
    },
    {
      type: "turn.started",
      scope: { turnId: "turn_0" },
      data: { turnId: "turn_0", cause: { deliveryId: "d_1" }, follows: null },
    },
  ],
};

const ANSWER_FACTS = {
  at: "2026-11-08T10:00:01.000Z",
  facts: [
    {
      type: "content.completed",
      scope: { turnId: "turn_0", runId: "run_0" },
      data: {
        partId: "part_0",
        runId: "run_0",
        kind: "text",
        phase: "reply",
        value: "Hi there",
      },
    },
    {
      type: "turn.settled",
      scope: { turnId: "turn_0" },
      data: { turnId: "turn_0", outcome: "completed", reply: ["part_0"] },
    },
    {
      type: "delivery.settled",
      data: { deliveryId: "d_1", outcome: "handled", turnId: "turn_0" },
    },
  ],
};

describe("Eve platform client", () => {
  test("invokes only the authenticated application facade and consumes a bounded v27 batch", async () => {
    const requests: Array<{ path: string; body?: string; method: string }> = [];
    const transport: EveTransport = {
      async request(path, input) {
        requests.push({ path, body: input.body, method: input.method });
        if (input.method === "POST") {
          return Response.json(
            { ok: true, sessionId: "wrun_platform", deliveryId: "d_1" },
            { status: 202, headers: { "x-eve-session-id": "wrun_platform" } },
          );
        }
        const body =
          [
            SESSION_FACTS,
            {
              progress: {
                type: "content.delta",
                scope: { turnId: "turn_0", runId: "run_0" },
                data: { partId: "part_0", kind: "text", delta: "Hi" },
              },
            },
            {
              progress: {
                type: "content.delta",
                scope: { turnId: "turn_0", runId: "run_0" },
                data: { partId: "part_0", delta: " there" },
              },
            },
            ANSWER_FACTS,
          ]
            .map((record) => JSON.stringify(record))
            .join("\n") + "\n";
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/x-ndjson", "x-eve-stream-tail-index": "3" },
        });
      },
    };

    const updates: string[] = [];
    const result = await createEveClient(transport).invoke("Hello", null, {
      timeoutMs: 1_000,
      onText: (text) => updates.push(text),
    });
    expect(result).toEqual({
      message: "Hi there",
      session: { sessionId: "wrun_platform", nextIndex: 4 },
      status: "waiting",
    });
    expect(updates[0]).toBe("Hi");
    expect(updates.at(-1)).toBe("Hi there");
    expect(requests[0]).toEqual({
      path: "/api/agent/eve/v1/session",
      body: JSON.stringify({ message: "Hello" }),
      method: "POST",
    });
    expect(requests[1]?.path).toBe(
      "/api/agent/eve/v1/session/wrun_platform/stream?startIndex=0&includeTailIndex=1",
    );
    expect(requests.every(({ path }) => path.startsWith("/api/agent/eve/v1/"))).toBe(true);
  });

  test("restarts a retired session instead of failing every later turn", async () => {
    const requests: Array<{ path: string; body?: string; method: string }> = [];
    const transport: EveTransport = {
      async request(path, input) {
        requests.push({ path, body: input.body, method: input.method });
        if (input.method === "POST") {
          if (path.endsWith("/wrun_stale")) {
            return Response.json(
              { ok: false, code: "session_not_active", error: "The session is no longer active." },
              { status: 409 },
            );
          }
          return Response.json(
            { ok: true, sessionId: "wrun_fresh", deliveryId: "d_1" },
            { status: 202, headers: { "x-eve-session-id": "wrun_fresh" } },
          );
        }
        const body =
          [SESSION_FACTS, ANSWER_FACTS].map((record) => JSON.stringify(record)).join("\n") + "\n";
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/x-ndjson", "x-eve-stream-tail-index": "5" },
        });
      },
    };

    const result = await createEveClient(transport).invoke(
      "Hello",
      { sessionId: "wrun_stale", nextIndex: 42 },
      { timeoutMs: 1_000 },
    );
    expect(requests[0]?.path).toBe("/api/agent/eve/v1/session/wrun_stale");
    expect(requests[1]?.path).toBe("/api/agent/eve/v1/session");
    expect(requests[2]?.path).toBe(
      "/api/agent/eve/v1/session/wrun_fresh/stream?startIndex=0&includeTailIndex=1",
    );
    expect(result).toEqual({
      message: "Hi there",
      session: { sessionId: "wrun_fresh", nextIndex: 6 },
      status: "waiting",
    });
  });

  test("surfaces the v27 settlement error instead of hanging", async () => {
    const transport: EveTransport = {
      async request(_path, input) {
        if (input.method === "POST") {
          return Response.json({ ok: true, sessionId: "wrun_fail" }, { status: 202 });
        }
        const body =
          JSON.stringify({
            at: "2026-11-08T10:00:00.000Z",
            facts: [
              {
                type: "turn.settled",
                scope: { turnId: "turn_0" },
                data: {
                  turnId: "turn_0",
                  outcome: "failed",
                  error: { code: "MODEL_CALL_FAILED", message: "The model is unavailable." },
                },
              },
            ],
          }) + "\n";
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/x-ndjson", "x-eve-stream-tail-index": "0" },
        });
      },
    };

    await expect(
      createEveClient(transport).invoke("Hello", null, { timeoutMs: 1_000 }),
    ).rejects.toThrow("The model is unavailable.");
  });
});
