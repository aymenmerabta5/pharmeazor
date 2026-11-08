import { describe, expect, test } from "bun:test";
import { createEveClient, type EveTransport } from "../src/lib/eve-protocol";

describe("Eve platform client", () => {
  test("invokes only the authenticated application facade and consumes a bounded event batch", async () => {
    const requests: Array<{ path: string; body?: string; method: string }> = [];
    const transport: EveTransport = {
      async request(path, input) {
        requests.push({ path, body: input.body, method: input.method });
        if (input.method === "POST") {
          return Response.json(
            { ok: true, sessionId: "wrun_platform" },
            { status: 202, headers: { "x-eve-session-id": "wrun_platform" } },
          );
        }
        const body =
          [
            { type: "message.received", data: { message: "Hello" } },
            { type: "message.appended", data: { messageDelta: "Hi", message: "Hi" } },
            { type: "message.completed", data: { message: "Hi there" } },
            { type: "session.waiting", data: {} },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n";
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/x-ndjson", "x-eve-stream-tail-index": "3" },
        });
      },
    };

    const result = await createEveClient(transport).invoke("Hello", null, { timeoutMs: 1_000 });
    expect(result).toEqual({
      message: "Hi there",
      session: { sessionId: "wrun_platform", nextIndex: 4 },
      status: "waiting",
    });
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
});
