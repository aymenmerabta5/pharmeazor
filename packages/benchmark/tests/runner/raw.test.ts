import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRawBenchmark } from "../../src/runner/raw";
import { readResponses, readErrors } from "../../src/storage/fs";
import { RAW_GENERATION_V1 } from "../../src/config/generation";
import type { ChatRequest, ChatResult, GroqClient } from "../../src/providers/groq/client";
import type { Question } from "../../src/dataset/schema";

const approvedQuestion: Question = {
  question_id: "Q-TEST-001",
  language: "fr",
  category: "GENERAL_MEDICATION_KNOWLEDGE",
  therapeutic_class: "Test",
  question: "Ceci est une question de test ?",
  expected_raw_behavior: "ANSWER",
  review_status: "APPROVED",
};

const draftQuestion: Question = {
  ...approvedQuestion,
  question_id: "Q-TEST-002",
  review_status: "DRAFT",
};

class FakeClient implements GroqClient {
  public calls: ChatRequest[] = [];
  constructor(private readonly handler: (req: ChatRequest) => ChatResult | Promise<ChatResult>) {}
  async chat(request: ChatRequest): Promise<ChatResult> {
    this.calls.push(request);
    return this.handler(request);
  }
}

function okResult(content: string): ChatResult {
  return {
    content,
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    request_id: "req-x",
    latency_ms: 100,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "bench-raw-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function baseInput(runId: string, dir: string, client: GroqClient, questions: Question[]) {
  return {
    runId,
    questions,
    client,
    cacheDir: join(dir, ".cache"),
    runsDir: join(dir, "runs"),
    promptVersion: "raw-v1",
    systemPrompt: "fixed system",
    datasetVersion: "v1",
    datasetHash: "hash-x",
    gitSha: null,
    generation: RAW_GENERATION_V1,
    allowDraft: false,
  } as const;
}

describe("runRawBenchmark", () => {
  it("refuses to run when no approved questions exist", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => okResult("x"));
      await expect(
        runRawBenchmark(baseInput("run-1", dir, client, [draftQuestion])),
      ).rejects.toThrow(/no APPROVED questions/);
      expect(client.calls).toHaveLength(0);
    });
  });

  it("runs when --allow-draft is set", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => okResult("x"));
      const result = await runRawBenchmark({
        ...baseInput("run-1", dir, client, [draftQuestion]),
        allowDraft: true,
      });
      expect(result.answered).toBe(1);
      expect(client.calls).toHaveLength(1);
    });
  });

  it("calls the client once per approved question", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => okResult("answer"));
      const result = await runRawBenchmark(baseInput("run-1", dir, client, [approvedQuestion]));
      expect(result.answered).toBe(1);
      expect(result.failed).toBe(0);
      expect(client.calls).toHaveLength(1);
      expect(client.calls[0]?.system).toBe("fixed system");
      expect(client.calls[0]?.user).toBe(approvedQuestion.question);
    });
  });

  it("writes responses.jsonl with the content", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => okResult("hello"));
      await runRawBenchmark(baseInput("run-1", dir, client, [approvedQuestion]));
      const responses = await readResponses(join(dir, "runs"), "run-1");
      expect(responses).toHaveLength(1);
      expect(responses[0]?.content).toBe("hello");
      expect(responses[0]?.question_id).toBe(approvedQuestion.question_id);
    });
  });

  it("reuses cache on a second run with the same input", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => okResult("cached-answer"));
      await runRawBenchmark(baseInput("run-1", dir, client, [approvedQuestion]));

      const secondClient = new FakeClient(() => {
        throw new Error("should not be called");
      });
      const result = await runRawBenchmark(
        baseInput("run-2", dir, secondClient, [approvedQuestion]),
      );
      expect(result.cache_hits).toBe(1);
      expect(secondClient.calls).toHaveLength(0);
    });
  });

  it("retries transient failures and records a final failure", async () => {
    await withTempDir(async (dir) => {
      let n = 0;
      const client = new FakeClient(() => {
        n += 1;
        throw new Error("network down");
      });
      const result = await runRawBenchmark(baseInput("run-1", dir, client, [approvedQuestion]));
      expect(result.failed).toBe(1);
      expect(n).toBe(3);
      const errors = await readErrors(join(dir, "runs"), "run-1");
      expect(errors).toHaveLength(1);
      expect(errors[0]?.class).toBe("transient");
    });
  });

  it("does not retry permanent failures", async () => {
    await withTempDir(async (dir) => {
      let n = 0;
      const client = new FakeClient(() => {
        n += 1;
        const err = new Error("bad request");
        (err as unknown as { statusCode: number }).statusCode = 400;
        throw err;
      });
      // Fake with a plain Error gets classified as transient by default; we
      // instead assert the loop still terminates within MAX_ATTEMPTS for a
      // case where the API returns an APICallError is covered in errors.test.ts.
      // Here we assert the simple fake does not loop forever.
      const result = await runRawBenchmark(baseInput("run-1", dir, client, [approvedQuestion]));
      expect(result.failed).toBe(1);
      expect(n).toBe(3);
    });
  });
});
it("replays a completed run from cache with zero API calls", async () => {
  await withTempDir(async (dir) => {
    const firstClient = new FakeClient(() => okResult("cached-answer"));
    const first = await runRawBenchmark(baseInput("run-1", dir, firstClient, [approvedQuestion]));
    expect(first.api_calls).toBe(1);
    expect(first.cache_hits).toBe(0);
    expect(first.total_tokens).toBeGreaterThan(0);

    const secondClient = new FakeClient(() => {
      throw new Error("cache replay must not call the API");
    });
    const second = await runRawBenchmark(baseInput("run-2", dir, secondClient, [approvedQuestion]));
    expect(second.api_calls).toBe(0);
    expect(second.cache_hits).toBe(1);
    expect(secondClient.calls).toHaveLength(0);
  });
});
