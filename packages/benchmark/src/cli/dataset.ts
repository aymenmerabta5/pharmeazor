import { loadQuestionsFromFile } from "../dataset/loader";
import { loadGoldAnnotationsFromFile } from "../dataset/gold-loader";
import { validateDatasetFromFiles } from "../dataset/validate";
import { logger } from "../shared/logger";
import { dataV1Path } from "./common";

export async function runDatasetValidate(flags: Record<string, string>): Promise<number> {
  const questionsPath = flags.questions ?? dataV1Path("questions.jsonl");
  const annotationsPath = flags.annotations ?? dataV1Path("gold_annotations.jsonl");

  const report = await validateDatasetFromFiles({
    questionsPath,
    goldAnnotationsPath: annotationsPath,
  });

  logger.info("dataset validation", {
    ok: report.ok,
    total: report.stats.total,
    approved: report.stats.approved_count,
    draft: report.stats.draft_count,
    annotated: report.stats.annotated_count,
    verified: report.stats.verified_count,
    retrieval_ready: report.stats.retrieval_ready_count,
    oracle_ready: report.stats.oracle_ready_count,
    questions_hash: report.questions_hash,
  });

  if (report.warnings.length > 0) {
    logger.warn(`${report.warnings.length} warning(s)`);
    for (const w of report.warnings) {
      logger.warn(`${w.code} ${w.question_id ?? ""} ${w.message}`);
    }
  }
  if (report.errors.length > 0) {
    logger.error(`${report.errors.length} error(s)`);
    for (const e of report.errors) {
      logger.error(`${e.code} ${e.question_id ?? ""} ${e.message}`);
    }
    return 1;
  }
  logger.info("dataset is valid");
  return 0;
}

export async function runDatasetStats(flags: Record<string, string>): Promise<number> {
  const questionsPath = flags.questions ?? dataV1Path("questions.jsonl");
  const annotationsPath = flags.annotations ?? dataV1Path("gold_annotations.jsonl");
  const questions = await loadQuestionsFromFile(questionsPath);
  const annotations = await loadGoldAnnotationsFromFile(annotationsPath);

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  for (const q of questions) {
    byStatus[q.review_status] = (byStatus[q.review_status] ?? 0) + 1;
    byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
    byLanguage[q.language] = (byLanguage[q.language] ?? 0) + 1;
  }

  const annotationById = new Map(annotations.map((a) => [a.question_id, a] as const));
  const readiness = {
    verified: annotations.filter((a) => a.verification_status === "VERIFIED").length,
    with_reference_answer: annotations.filter(
      (a) => a.reference_answer !== null && a.reference_answer.trim() !== "",
    ).length,
    with_expected_facts: annotations.filter((a) => a.expected_facts.length > 0).length,
    retrieval_ready: annotations.filter((a) => a.relevant_chunk_ids.length > 0).length,
    oracle_ready: annotations.filter((a) => a.evidence_bundle.length > 0).length,
    answerability_decided: annotations.filter((a) => a.answerable_without_corpus !== null).length,
  };
  const scorable = questions.filter((q) => {
    const a = annotationById.get(q.question_id);
    return (
      q.review_status === "APPROVED" &&
      a?.verification_status === "VERIFIED" &&
      (a?.reference_answer ?? "").trim() !== "" &&
      (a?.expected_facts.length ?? 0) > 0
    );
  }).length;

  logger.info("dataset stats", {
    total: questions.length,
    byStatus,
    byCategory,
    byLanguage,
    annotations: readiness,
    scorable_questions: scorable,
  });
  return 0;
}
