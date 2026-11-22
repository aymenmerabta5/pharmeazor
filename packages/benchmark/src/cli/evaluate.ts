import { join } from "node:path";
import { loadQuestionsFromFile } from "../dataset/loader";
import { loadGoldAnnotationsFromFile } from "../dataset/gold-loader";
import { hashQuestions } from "../dataset/hash";
import { logger } from "../shared/logger";
import { sha256 } from "../shared/hash";
import { computeDeterministicSignals } from "../evaluation/rubric";
import { computeSummary } from "../evaluation/metrics";
import { writeEvaluation, readEvaluation, mergeHumanScore } from "../evaluation/storage";
import {
  buildReviewTemplate,
  writeReviewTemplate,
  readSubmittedReview,
  reconcileReviews,
} from "../evaluation/review";
import { generateMarkdownReport } from "../reporting/markdown";
import { readErrors, readResponses, readRunMetadata, writeRunMetadata } from "../storage/fs";
import type { RunMetadata } from "../storage/fs";
import { dataV1Path, runsDir } from "./common";

/**
 * Refuses to score or report a run against data that no longer matches what
 * the model saw. Without this, editing `questions.jsonl` after a run silently
 * produces a score for a different experiment.
 */
async function assertRunMatchesDataset(
  runId: string,
  meta: RunMetadata,
  opts: { annotationsHash?: string | null; force?: boolean } = {},
): Promise<{ questions: Awaited<ReturnType<typeof loadQuestionsFromFile>> } | null> {
  const questions = await loadQuestionsFromFile(dataV1Path("questions.jsonl"));
  const datasetHash = hashQuestions(questions);
  if (datasetHash !== meta.dataset_hash) {
    logger.error(
      `dataset changed since run ${runId}. Run dataset hash ${meta.dataset_hash}, current ${datasetHash}. Refusing to continue; use --force only if you accept that the run and the data no longer match.`,
    );
    if (!opts.force) return null;
    logger.warn("--force supplied: continuing despite dataset drift");
  }

  const storedAnnotations = meta.annotations_hash ?? null;
  const currentAnnotations = opts.annotationsHash ?? null;
  if (storedAnnotations && currentAnnotations && storedAnnotations !== currentAnnotations) {
    logger.error(
      `annotations changed since run ${runId}. Run annotations hash ${storedAnnotations}, current ${currentAnnotations}.`,
    );
    if (!opts.force) return null;
    logger.warn("--force supplied: continuing despite annotation drift");
  }

  return { questions };
}

export async function runEvaluateRun(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }

  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found`);
    return 1;
  }

  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));
  const annotationsHash = sha256(JSON.stringify(annotations));

  const checked = await assertRunMatchesDataset(runId, meta, {
    annotationsHash,
    force: flags.force === "true",
  });
  if (!checked) return 1;
  const { questions } = checked;

  let responses = await readResponses(runsDir(), runId);
  if (responses.length === 0) {
    logger.error(`run ${runId} has no responses`);
    return 1;
  }

  if (meta.selected_question_ids) {
    const selection = new Set(meta.selected_question_ids);
    const outside = responses.filter((r) => !selection.has(r.question_id));
    if (outside.length > 0) {
      logger.warn(
        `${outside.length} response(s) fall outside the recorded selection and will not be evaluated: ${outside
          .map((r) => r.question_id)
          .join(", ")}`,
      );
      responses = responses.filter((r) => selection.has(r.question_id));
    }
  }

  const qById = new Map(questions.map((q) => [q.question_id, q] as const));
  const aById = new Map(annotations.map((a) => [a.question_id, a] as const));
  const records = [];

  for (const r of responses) {
    const q = qById.get(r.question_id);
    const a = aById.get(r.question_id);
    if (!q || !a) {
      logger.warn(`missing question or annotation for ${r.question_id}; skipping`);
      continue;
    }
    const deterministic = computeDeterministicSignals({
      question: q,
      annotation: a,
      modelResponse: r.content,
    });
    records.push({
      question_id: r.question_id,
      run_id: runId,
      evaluated_at: new Date().toISOString(),
      response_content_hash: sha256(r.content),
      annotation_hash: sha256(JSON.stringify(a)),
      deterministic,
      human: null,
      reconciliation: null,
    });
  }

  await writeEvaluation(runsDir(), runId, records);
  await writeRunMetadata(runsDir(), runId, {
    ...meta,
    annotations_hash: annotationsHash,
  });

  logger.info("evaluation written", {
    run_id: runId,
    records: records.length,
    annotations_hash: annotationsHash,
    path: `runs/${runId}/evaluation.jsonl`,
  });
  return 0;
}

export async function runReviewPrepare(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }

  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found`);
    return 1;
  }
  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));
  const annotationsHash = sha256(JSON.stringify(annotations));
  const checked = await assertRunMatchesDataset(runId, meta, {
    annotationsHash,
    force: flags.force === "true",
  });
  if (!checked) return 1;

  const responses = await readResponses(runsDir(), runId);
  const evaluation = await readEvaluation(runsDir(), runId);
  const template = buildReviewTemplate(checked.questions, annotations, responses, evaluation);
  const path = await writeReviewTemplate(runsDir(), runId, template);
  logger.info("review template written", { path, count: template.length });
  logger.info(
    "edit the file, fill in each `score` object, save as review_primary.jsonl (or review_secondary.jsonl), then run `benchmark review submit`",
  );
  return 0;
}

export async function runReviewSubmit(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  const file = flags.file;
  const reviewer = flags.reviewer;
  if (!runId || !file || !reviewer) {
    logger.error("--run-id, --file and --reviewer are required");
    return 1;
  }
  const submission = await readSubmittedReview(file);
  const secondaryPath = join(runsDir(), runId, "review", "review_secondary.jsonl");

  let secondary: Awaited<ReturnType<typeof readSubmittedReview>> | null = null;
  try {
    secondary = await readSubmittedReview(secondaryPath);
  } catch {
    /* no secondary */
  }

  const { merged, reconciliation } = reconcileReviews(submission, secondary);
  for (const m of merged) {
    await mergeHumanScore(
      runsDir(),
      runId,
      m.question_id,
      m.score,
      reconciliation.get(m.question_id) ?? { status: "SINGLE_REVIEW", disagreements: [] },
    );
  }
  logger.info("review merged", { run_id: runId, reviewer, questions: merged.length });
  for (const [qid, rec] of reconciliation) {
    if (rec.status === "NEEDS_HUMAN_REVIEW") {
      logger.warn(`disagreement on ${qid}: ${rec.disagreements.join(", ")}`);
    }
  }
  return 0;
}

async function loadSummaryContext(runId: string, flags: Record<string, string>) {
  const meta = await readRunMetadata(runsDir(), runId);
  if (!meta) {
    logger.error(`run ${runId} not found`);
    return null;
  }
  const checked = await assertRunMatchesDataset(runId, meta, { force: flags.force === "true" });
  if (!checked) return null;

  const evaluation = await readEvaluation(runsDir(), runId);
  if (evaluation.length === 0) {
    logger.error(
      `run ${runId} has no evaluation.jsonl; run 'benchmark evaluate run --run-id ${runId}' first`,
    );
    return null;
  }

  const questions = checked.questions;
  const summary = computeSummary({
    run_id: runId,
    evaluation,
    categoriesByQuestion: new Map(questions.map((q) => [q.question_id, q.category] as const)),
    therapeuticClassByQuestion: new Map(
      questions.map((q) => [q.question_id, q.therapeutic_class] as const),
    ),
  });
  const questionsById = new Map(
    questions.map(
      (q) =>
        [
          q.question_id,
          {
            category: q.category,
            therapeutic_class: q.therapeutic_class,
            question: q.question,
          },
        ] as const,
    ),
  );
  return { meta, evaluation, summary, questionsById };
}

export async function runSummary(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }
  const context = await loadSummaryContext(runId, flags);
  if (!context) return 1;

  const path = join(runsDir(), runId, "summary.json");
  await Bun.write(path, JSON.stringify(context.summary, null, 2));

  const report = generateMarkdownReport({
    metadata: context.meta,
    responses: await readResponses(runsDir(), runId),
    errors: await readErrors(runsDir(), runId),
    evaluation: context.evaluation,
    summary: context.summary,
    questionsById: context.questionsById,
  });
  const reportPath = join(runsDir(), runId, "report.md");
  await Bun.write(reportPath, report.markdown);

  logger.info("summary", {
    run_id: runId,
    path,
    total: context.summary.overall.total,
    human_reviewed: context.summary.overall.human_reviewed,
    correct_rate: context.summary.overall.correctness.correct_rate,
    incorrect_rate: context.summary.overall.correctness.incorrect_rate,
    unreviewed: context.summary.by_review_status.unreviewed,
    single_review: context.summary.by_review_status.single_review,
    needs_human_review: context.summary.by_review_status.needs_review,
    report_path: reportPath,
  });
  return 0;
}

export async function runReport(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }
  const context = await loadSummaryContext(runId, flags);
  if (!context) return 1;

  const report = generateMarkdownReport({
    metadata: context.meta,
    responses: await readResponses(runsDir(), runId),
    errors: await readErrors(runsDir(), runId),
    evaluation: context.evaluation,
    summary: context.summary,
    questionsById: context.questionsById,
  });
  const path = join(runsDir(), runId, "report.md");
  await Bun.write(path, report.markdown);
  await Bun.write(join(runsDir(), runId, "summary.json"), JSON.stringify(context.summary, null, 2));
  logger.info("report written", { run_id: runId, path, failure_samples: report.failure_samples });
  return 0;
}
