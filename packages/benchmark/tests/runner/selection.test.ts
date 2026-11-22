import { describe, expect, it } from "bun:test";
import { APICallError } from "ai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRawBenchmark } from "../../src/runner/raw";
import { SelectionMismatchError } from "../../src/runner/chat";
import { readRunMetadata } from "../../src/storage/fs";
import { RAW_GENERATION_V1 } from "../../src/config/generation";
import type { ChatRequest, ChatResult, GroqClient } from "../../src/providers/groq/client";
import type { Question } from "../../src/dataset/schema";
import type { RateLimiter } from "../../src/runner/rate-limit";

function question(id: string): Question {
  return {
    question_id: id,
    language: "fr",
    category: "GENERAL_MEDICATION_KNOWLEDGE",
    therapeutic_class: "Test",
    question: `Question ${id} ?`,
    expected_raw_behavior: "ANSWER",
    review_status: "APPROVED",
  };
}

const fastLimiter: RateLimiter = {
  async waitForSlot() {},
  recordUsage() {},
  tokensInWindow() {
    return 0;
  },
  totalTokens() {
    return 0;
  },
  requestsToday() {
    return 0;
  },
  tokensToday() {
    return 0;
  },
  assertDailyCapacity() {},
};

class FakeClient implements GroqClient {
  public calls: ChatRequest[] = [];
  constructor(private readonly handler: (req: ChatRequest) => ChatResult) {}
  async chat(request: ChatRequest): Promise<ChatResult> {
    this.calls.push(request);
    return this.handler(request);
  }
}

function ok(content = "answer"): ChatResult {
  return {
    content,
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: "stop",
    request_id: "req",
    latency_ms: 1,
  };
}

function input(runId: string, dir: string, client: GroqClient, questions: Question[]) {
  return {
    runId,
    questions,
    client,
    cacheDir: join(dir, ".cache"),
    runsDir: join(dir, "runs"),
    promptVersion: "raw-v1",
    systemPrompt: "fixed",
    datasetVersion: "v1",
    datasetHash: "dataset-hash",
    gitSha: null,
    generation: RAW_GENERATION_V1,
    allowDraft: false,
    rateLimiter: fastLimiter,
  } as const;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "bench-selection-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("run selection identity", () => {
  it("records the exact selected ids and a selection hash", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => ok());
      await runRawBenchmark(input("run-1", dir, client, [question("Q-A"), question("Q-B")]));
      const meta = await readRunMetadata(join(dir, "runs"), "run-1");
      expect(meta?.selected_question_ids).toEqual(["Q-A", "Q-B"]);
      expect(meta?.selection_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(meta?.provenance?.selection_hash).toBe(meta?.selection_hash);
    });
  });

  it("refuses to reuse a run id with a different selection of the same size", async () => {
    await withTempDir(async (dir) => {
      const client = new FakeClient(() => ok());
      await runRawBenchmark(input("run-1", dir, client, [question("Q-A")]));
      await expect(
        runRawBenchmark(input("run-1", dir, client, [question("Q-B")])),
      ).rejects.toBeInstanceOf(SelectionMismatchError);
    });
  });

  it("resumes only the unanswered questions of the stored selection", async () => {
    await withTempDir(async (dir) => {
      const firstClient = new FakeClient((request) => {
        if (request.user.includes("Q-B")) {
          throw new APICallError({
            message: "bad request",
            url: "https://example.test/chat",
            requestBodyValues: {},
            statusCode: 400,
            isRetryable: false,
          });
        }
        return ok("first");
      });

      const first = await runRawBenchmark(
        input("run-1", dir, firstClient, [question("Q-A"), question("Q-B")]),
      );
      expect(first.answered).toBe(1);
      expect(first.failed).toBe(1);
      expect(firstClient.calls).toHaveLength(2);

      const resumedClient = new FakeClient(() => ok("second"));
      const second = await runRawBenchmark(
        input("run-1", dir, resumedClient, [question("Q-A"), question("Q-B")]),
      );
      expect(resumedClient.calls).toHaveLength(1);
      expect(resumedClient.calls[0]?.user).toContain("Q-B");
      expect(second.answered).toBe(2);
      expect(second.failed).toBe(0);
    });
  });
});
