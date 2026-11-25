import type { EvidencePassage, Question } from "../dataset/schema";
import type { RetrievalGateway } from "../retrieval/types";
import type { GroqClient } from "../providers/groq/client";
import type { RateLimiter } from "./rate-limit";
import type { GenerationConfig } from "../config/generation";
import { runChatBenchmark, type ChatRunProgress } from "./chat";
import { buildRagUserMessage } from "../prompts/rag/v1";

export interface RagRunInput {
  runId: string;
  questions: readonly Question[];
  client: GroqClient;
  cacheDir: string;
  runsDir: string;
  promptVersion: string;
  systemPrompt: string;
  datasetVersion: string;
  datasetHash: string;
  gitSha: string | null;
  generation: GenerationConfig;
  allowDraft: boolean;
  gateway: RetrievalGateway;
  /** Hash of the full retrieval trace; folded into the cache key. */
  evidenceHash: string;
  onProgress?: (event: RagRunProgress) => void;
  rateLimiter?: RateLimiter;
  annotationsHash?: string | null;
  temperature?: number | null;
  seed?: number | null;
}

export type RagRunProgress = ChatRunProgress;

export interface RagRunResult {
  run_id: string;
  answered: number;
  failed: number;
  skipped: number;
  total: number;
  cache_hits: number;
  api_calls: number;
  total_tokens: number;
  live_total_tokens: number;
  replay_total_tokens: number;
  stopped: null | "requests_per_day" | "tokens_per_day";
}

export function passagesToEvidence(
  passages: readonly import("../retrieval/types").RetrievedPassage[],
): readonly EvidencePassage[] {
  return passages.map((passage) => ({
    evidence_id: passage.evidence_id,
    text: passage.text,
    source_id: sourceIdFor(passage.chunk_id),
    source_name: passage.citation_label,
    section_code: sectionCodeFor(passage.chunk_id.split("#")[1]?.split("-")[0] ?? ""),
    chunk_id: passage.chunk_id,
  }));
}

function sourceIdFor(artifactId: string): string {
  const segment = artifactId.split("__")[1] ?? "RETRIEVAL";
  return /^[A-Z][A-Z0-9_]{1,47}$/.test(segment) ? segment : "RETRIEVAL";
}

function sectionCodeFor(value: string): string {
  return /^[a-z][a-z0-9_]{1,47}$/.test(value) ? value : "other";
}

/**
 * RAG arm: the model receives passages from the recorded retrieval trace and
 * must cite them. Using a trace keeps the arm replayable and lets the retrieval
 * gate run without a live TEI or Postgres.
 */
export async function runRagBenchmark(input: RagRunInput): Promise<RagRunResult> {
  const evidenceByQuestionId = new Map<string, readonly EvidencePassage[]>();
  for (const question of input.questions) {
    const passages = input.gateway.search(question.question_id);
    if (passages.length === 0) continue;
    evidenceByQuestionId.set(question.question_id, passagesToEvidence(passages));
  }

  const result = await runChatBenchmark({
    ...input,
    mode: "rag",
    evidenceByQuestionId,
    retrievalConfigHash: input.gateway.configHash(),
    buildUserMessage: (question) =>
      buildRagUserMessage({
        question: question.question,
        passages: input.gateway.search(question.question_id),
      }),
  });

  return {
    run_id: result.run_id,
    answered: result.answered,
    failed: result.failed,
    skipped: result.skipped,
    total: result.total,
    cache_hits: result.cache_hits,
    api_calls: result.api_calls,
    total_tokens: result.total_tokens,
    live_total_tokens: result.live_total_tokens,
    replay_total_tokens: result.replay_total_tokens,
    stopped: result.stopped,
  };
}
