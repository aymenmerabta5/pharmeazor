import { join } from "node:path";
import { loadQuestionsFromFile } from "../dataset/loader";
import { hashQuestions } from "../dataset/hash";
import { computeSummary } from "../evaluation/metrics";
import { readEvaluation } from "../evaluation/storage";
import { compareRuns, formatComparison, type ComparableRun } from "../reporting/compare";
import { readRunMetadata } from "../storage/fs";
import { logger } from "../shared/logger";
import { dataV1Path, runsDir } from "./common";

async function loadComparableRun(runId: string): Promise<ComparableRun | null> {
  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) return null;
  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const currentHash = hashQuestions(questions);
  if (currentHash !== meta.dataset_hash) {
    logger.warn(
      `run ${runId} was produced against a different dataset hash; category slices use the current dataset.`,
    );
  }
  const evaluation = await readEvaluation(runsDir(), runId);
  const summary = computeSummary({
    run_id: runId,
    evaluation,
    categoriesByQuestion: new Map(questions.map((q) => [q.question_id, q.category] as const)),
    therapeuticClassByQuestion: new Map(
      questions.map((q) => [q.question_id, q.therapeutic_class] as const),
    ),
  });
  return { metadata: meta, evaluation, summary };
}

export async function runCompare(flags: Record<string, string>): Promise<number> {
  const a = flags["run-a"];
  const b = flags["run-b"];
  if (!a || !b) {
    logger.error("--run-a and --run-b are required");
    return 1;
  }
  const aRun = await loadComparableRun(a);
  if (!aRun) {
    logger.error(`run ${a} not found`);
    return 1;
  }
  const bRun = await loadComparableRun(b);
  if (!bRun) {
    logger.error(`run ${b} not found`);
    return 1;
  }
  const result = compareRuns(aRun, bRun);
  const text = formatComparison(result, a, b);
  const path = join(runsDir(), `compare-${a}-vs-${b}.md`);
  await Bun.write(path, text);
  console.log(text);
  logger.info("comparison written", { path, compatible: result.compatible });
  return result.compatible ? 0 : 2;
}
