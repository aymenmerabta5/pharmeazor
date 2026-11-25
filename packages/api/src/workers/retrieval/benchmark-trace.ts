/**
 * Record live retrieval results for the 50 benchmark questions.
 *
 * The output is a deterministic retrieval trace. It lets the benchmark's RAG
 * arm replay the exact passages the retriever returned, and lets the retrieval
 * gate compute recall/precision/MRR/nDCG without a running TEI or Postgres.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRetrievalServiceFromEnv } from "../../composition/retrieval";

const LIMIT = 12;
const OUTPUT = resolve("packages/benchmark/data/v1/retrieval-trace.jsonl");

interface QuestionRow {
  readonly question_id: string;
  readonly question: string;
}

async function readQuestions(path: string): Promise<QuestionRow[]> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as QuestionRow);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main(): Promise<void> {
  const service = createRetrievalServiceFromEnv();
  const questions = await readQuestions("packages/benchmark/data/v1/questions.jsonl");
  const artifact = JSON.parse(
    await readFile("tooling/embedding-lab/output/embeddings/manifest.json", "utf8"),
  ) as { model?: { repo_id?: string; revision?: string } };
  const descriptor = [
    artifact.model?.repo_id ?? "BAAI/bge-m3",
    artifact.model?.revision ?? "unknown",
    process.env.RETRIEVAL_RERANKER_URL?.trim() ? "rerank=on" : "rerank=off",
    process.env.RETRIEVAL_REQUIRE_RERANK === "true" ? "require-rerank" : "optional-rerank",
    `limit=${LIMIT}`,
    "fusion=k60",
  ].join("|");
  const configHash = sha256(descriptor);
  const lines: string[] = [];

  for (const question of questions) {
    const result = await service.search(
      { actorId: "benchmark-maintainer" },
      { query: question.question, limit: LIMIT },
    );
    lines.push(
      JSON.stringify({
        question_id: question.question_id,
        query: question.question,
        retrieval_config_hash: configHash,
        config: descriptor,
        authority_policy: result.authorityPolicy,
        diagnostics: result.diagnostics,
        chunks: result.chunks.map((chunk, index) => ({
          rank: index + 1,
          chunk_id: chunk.chunkId,
          artifact_id: chunk.artifactId,
          section_code: chunk.sectionCode,
          citation_label: chunk.citation.label,
          text: chunk.contextualizedContent,
          injection_risk: chunk.injectionRisk,
          scores: chunk.scores,
        })),
      }),
    );
    process.stdout.write(
      `${question.question_id}: ${result.chunks.length} chunks (${result.diagnostics.elapsedMs}ms)\n`,
    );
  }

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, lines.join("\n") + "\n", "utf8");
  console.log(`trace_written=${OUTPUT} questions=${lines.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
