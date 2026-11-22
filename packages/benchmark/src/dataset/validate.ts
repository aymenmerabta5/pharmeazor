import type { Category, GoldAnnotation, Language, Question, ReviewStatus } from "./schema";
import { CATEGORY_VALUES, LANGUAGE_VALUES } from "./schema";
import { loadQuestionsFromFile } from "./loader";
import { loadGoldAnnotationsFromFile } from "./gold-loader";
import { hashQuestions } from "./hash";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  question_id?: string;
}

export interface ValidationStats {
  total: number;
  by_category: Record<Category, number>;
  by_language: Record<Language, number>;
  by_review_status: Record<ReviewStatus, number>;
  approved_count: number;
  draft_count: number;
  rejected_count: number;
  annotated_count: number;
  verified_count: number;
  /** Annotations carrying at least one relevant chunk id: the retrieval gate input. */
  retrieval_ready_count: number;
  /** Annotations carrying at least one curated oracle passage. */
  oracle_ready_count: number;
}

export interface ValidationReport {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: ValidationStats;
  questions_hash: string;
}

export interface ValidateOptions {
  questionsPath: string;
  goldAnnotationsPath: string;
}

export async function validateDatasetFromFiles(opts: ValidateOptions): Promise<ValidationReport> {
  const questions = await loadQuestionsFromFile(opts.questionsPath);
  const annotations = await loadGoldAnnotationsFromFile(opts.goldAnnotationsPath);
  return validateDataset(questions, annotations);
}

export function validateDataset(
  questions: readonly Question[],
  annotations: readonly GoldAnnotation[],
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- question-level checks -------------------------------------------
  const seen = new Map<string, number>();
  for (const q of questions) {
    seen.set(q.question_id, (seen.get(q.question_id) ?? 0) + 1);
    if (q.question.trim().length === 0) {
      errors.push({
        severity: "error",
        code: "EMPTY_QUESTION",
        message: "question is empty",
        question_id: q.question_id,
      });
    }
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      errors.push({
        severity: "error",
        code: "DUPLICATE_QUESTION_ID",
        message: `question_id appears ${count} times`,
        question_id: id,
      });
    }
  }

  // --- cross-file checks -----------------------------------------------
  const byId = new Map(questions.map((q) => [q.question_id, q] as const));
  const annById = new Map(annotations.map((a) => [a.question_id, a] as const));

  for (const a of annotations) {
    const q = byId.get(a.question_id);
    if (!q) {
      warnings.push({
        severity: "warning",
        code: "ORPHAN_ANNOTATION",
        message: "gold annotation has no matching question",
        question_id: a.question_id,
      });
      continue;
    }
    if (q.expected_raw_behavior !== a.expected_behavior) {
      errors.push({
        severity: "error",
        code: "BEHAVIOR_MISMATCH",
        message: `expected_raw_behavior="${q.expected_raw_behavior}" but annotation expected_behavior="${a.expected_behavior}"`,
        question_id: q.question_id,
      });
    }
  }

  for (const q of questions) {
    const a = annById.get(q.question_id);
    if (!a) {
      warnings.push({
        severity: "warning",
        code: "MISSING_ANNOTATION",
        message: "question has no gold annotation",
        question_id: q.question_id,
      });
      continue;
    }
    if (q.review_status === "APPROVED" && a.verification_status !== "VERIFIED") {
      errors.push({
        severity: "error",
        code: "APPROVED_BUT_NOT_VERIFIED",
        message: "question is APPROVED but gold annotation is not VERIFIED",
        question_id: q.question_id,
      });
    }
    if (
      q.review_status === "APPROVED" &&
      (!a.reference_answer || a.reference_answer.trim() === "")
    ) {
      errors.push({
        severity: "error",
        code: "APPROVED_WITHOUT_REFERENCE_ANSWER",
        message: "question is APPROVED but reference_answer is empty",
        question_id: q.question_id,
      });
    }
    if (q.review_status === "APPROVED" && a.expected_facts.length === 0) {
      errors.push({
        severity: "error",
        code: "APPROVED_WITHOUT_EXPECTED_FACTS",
        message: "question is APPROVED but expected_facts is empty",
        question_id: q.question_id,
      });
    }
    if (q.review_status === "APPROVED" && a.answerable_without_corpus === null) {
      errors.push({
        severity: "error",
        code: "APPROVED_WITHOUT_ANSWERABILITY",
        message:
          "question is APPROVED but answerable_without_corpus is unset; the abstention analysis cannot classify it",
        question_id: q.question_id,
      });
    }
    if (
      q.review_status === "APPROVED" &&
      a.answerable_without_corpus === false &&
      a.relevant_chunk_ids.length === 0
    ) {
      errors.push({
        severity: "error",
        code: "CORPUS_QUESTION_WITHOUT_RELEVANT_CHUNKS",
        message:
          "question is APPROVED and not answerable without the corpus, but relevant_chunk_ids is empty; recall@k cannot be computed",
        question_id: q.question_id,
      });
    }
    if (a.answerable_without_corpus === true && a.relevant_chunk_ids.length > 0) {
      warnings.push({
        severity: "warning",
        code: "ANSWERABLE_WITHOUT_CORPUS_HAS_CHUNKS",
        message:
          "answerable_without_corpus is true but relevant_chunk_ids is not empty; confirm the intent before verification",
        question_id: q.question_id,
      });
    }
    if (q.category === "TRAP_AND_OUT_OF_SCOPE" && a.expected_behavior === "ANSWER") {
      warnings.push({
        severity: "warning",
        code: "TRAP_EXPECTS_ANSWER",
        message:
          "TRAP_AND_OUT_OF_SCOPE item expects ANSWER; a trap item normally expects ABSTAIN, ASK_CLARIFICATION or REFUSE_OUT_OF_SCOPE",
        question_id: q.question_id,
      });
    }
    const chunkIds = new Set(a.relevant_chunk_ids);
    if (chunkIds.size !== a.relevant_chunk_ids.length) {
      errors.push({
        severity: "error",
        code: "DUPLICATE_RELEVANT_CHUNK_ID",
        message: "relevant_chunk_ids contains a duplicate",
        question_id: q.question_id,
      });
    }
    const evidenceIds = new Set<string>();
    for (const passage of a.evidence_bundle) {
      if (evidenceIds.has(passage.evidence_id)) {
        errors.push({
          severity: "error",
          code: "DUPLICATE_EVIDENCE_ID",
          message: `evidence_id "${passage.evidence_id}" appears more than once`,
          question_id: q.question_id,
        });
      }
      evidenceIds.add(passage.evidence_id);
      if (passage.chunk_id !== null && !chunkIds.has(passage.chunk_id)) {
        warnings.push({
          severity: "warning",
          code: "EVIDENCE_CHUNK_NOT_LABELLED_RELEVANT",
          message: `evidence "${passage.evidence_id}" cites chunk "${passage.chunk_id}" which is missing from relevant_chunk_ids`,
          question_id: q.question_id,
        });
      }
    }
    if (
      a.verification_status === "VERIFIED" &&
      a.answerable_without_corpus === false &&
      a.evidence_bundle.length === 0
    ) {
      warnings.push({
        severity: "warning",
        code: "VERIFIED_WITHOUT_ORACLE_EVIDENCE",
        message:
          "annotation is VERIFIED but evidence_bundle is empty; the oracle arm will skip this question",
        question_id: q.question_id,
      });
    }
    if (q.review_status !== "APPROVED") {
      warnings.push({
        severity: "warning",
        code: "NOT_APPROVED_EXCLUDED_FROM_SCORING",
        message: `review_status="${q.review_status}" - this question will be excluded from scored runs`,
        question_id: q.question_id,
      });
    }
  }

  // --- stats -----------------------------------------------------------
  const stats: ValidationStats = {
    total: questions.length,
    by_category: emptyCategoryCounts(),
    by_language: emptyLanguageCounts(),
    by_review_status: { DRAFT: 0, APPROVED: 0, REJECTED: 0 },
    approved_count: 0,
    draft_count: 0,
    rejected_count: 0,
    annotated_count: annotations.length,
    verified_count: annotations.filter((a) => a.verification_status === "VERIFIED").length,
    retrieval_ready_count: annotations.filter((a) => a.relevant_chunk_ids.length > 0).length,
    oracle_ready_count: annotations.filter((a) => a.evidence_bundle.length > 0).length,
  };
  for (const q of questions) {
    stats.by_category[q.category] += 1;
    stats.by_language[q.language] += 1;
    stats.by_review_status[q.review_status] += 1;
  }
  stats.approved_count = stats.by_review_status.APPROVED;
  stats.draft_count = stats.by_review_status.DRAFT;
  stats.rejected_count = stats.by_review_status.REJECTED;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats,
    questions_hash: hashQuestions(questions),
  };
}

function emptyCategoryCounts(): Record<Category, number> {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORY_VALUES) out[c] = 0;
  return out;
}

function emptyLanguageCounts(): Record<Language, number> {
  const out = {} as Record<Language, number>;
  for (const l of LANGUAGE_VALUES) out[l] = 0;
  return out;
}
