import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { BENCHMARK_ARMS, isRetrievalArm, type BenchmarkArm } from "../arms";
import { loadQuestionsFromFile } from "../dataset/loader";
import { loadGoldAnnotationsFromFile } from "../dataset/gold-loader";
import { computeSummary } from "../evaluation/metrics";
import { computeGroundingSummary } from "../evaluation/grounding";
import { readEvaluation } from "../evaluation/storage";
import { loadArmTrace } from "../retrieval/arm-trace";
import {
  armRowsInOrder,
  computeArmDeltas,
  formatArmsReport,
  type ArmReportRow,
} from "../reporting/arms";
import { summarizeRetrieval } from "../reporting/retrieval";
import { readRunMetadata } from "../storage/fs";
import { logger } from "../shared/logger";
import { armTracePaths, dataV1Path, runsDir } from "./common";

/**
 * Most recent run for an arm, matched on recorded mode rather than directory
 * prefix, because `rag-` is a prefix of `rag-rerank-` and `rag-graph-`.
 */
async function latestRunForArm(arm: BenchmarkArm): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(runsDir());
  } catch {
    return null;
  }

  let best: { id: string; started: string } | null = null;
  for (const entry of entries) {
    const meta = await readRunMetadata(runsDir(), entry);
    if (!meta) continue;
    if ((meta.run_mode ?? "raw") !== arm) continue;
    const started = meta.started_at ?? "";
    if (!best || started > best.started) best = { id: entry, started };
  }
  return best?.id ?? null;
}

async function loadArmRow(
  arm: BenchmarkArm,
  runId: string,
  questions: Awaited<ReturnType<typeof loadQuestionsFromFile>>,
  annotations: Awaited<ReturnType<typeof loadGoldAnnotationsFromFile>>,
): Promise<ArmReportRow | null> {
  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found under ${runsDir()}`);
    return null;
  }
  if ((meta.run_mode ?? "raw") !== arm) {
    logger.error(
      `run ${runId} is a ${meta.run_mode ?? "raw"} run, not a ${arm} run; refusing to label it as ${arm}`,
    );
    return null;
  }

  const evaluation = await readEvaluation(runsDir(), runId);
  if (evaluation.length === 0) {
    logger.warn(
      `run ${runId} has no evaluation.jsonl; its rates will read N/A. Run 'benchmark evaluate run --run-id ${runId}' first.`,
    );
  }

  const summary = computeSummary({
    run_id: runId,
    evaluation,
    categoriesByQuestion: new Map(questions.map((q) => [q.question_id, q.category] as const)),
    therapeuticClassByQuestion: new Map(
      questions.map((q) => [q.question_id, q.therapeutic_class] as const),
    ),
  });

  let retrieval: ArmReportRow["retrieval"] = null;
  if (isRetrievalArm(arm)) {
    try {
      const trace = await loadArmTrace(arm, armTracePaths());
      retrieval = summarizeRetrieval({
        arm,
        trace,
        questionIds: evaluation.map((record) => record.question_id),
        annotations,
      });
    } catch (error) {
      logger.warn(`${arm}: ${(error as Error).message}`);
      return null;
    }
  }

  return {
    arm,
    run_id: runId,
    status: meta.status,
    reviewed: summary.overall.human_reviewed,
    total: summary.overall.total,
    summary,
    grounding: arm === "raw" ? null : computeGroundingSummary(evaluation),
    retrieval,
  };
}

export async function runArmsReport(flags: Record<string, string>): Promise<number> {
  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));

  const rows: ArmReportRow[] = [];
  const missing: BenchmarkArm[] = [];

  for (const arm of BENCHMARK_ARMS) {
    const requested = flags[arm];
    if (requested === "true") {
      logger.error(`--${arm} expects a run id, e.g. --${arm} ${arm}-20260101-120000-abcdef`);
      return 1;
    }

    const runId = requested ?? (await latestRunForArm(arm));
    if (!runId) {
      missing.push(arm);
      continue;
    }

    const row = await loadArmRow(arm, runId, questions, annotations);
    if (!row) {
      // An explicitly requested run must not silently disappear from the report.
      if (requested) return 1;
      missing.push(arm);
      continue;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    logger.error(
      "no benchmark runs found under runs/; run at least one arm before requesting a report",
    );
    return 1;
  }

  const ordered = armRowsInOrder(rows);
  const report = formatArmsReport({
    rows: ordered,
    missing,
    deltas: computeArmDeltas(ordered),
  });
  const path = join(runsDir(), "arms-report.md");
  await Bun.write(path, report);
  console.log(report);
  logger.info("arms report written", { path, arms: ordered.length, missing: missing.length });
  return 0;
}
