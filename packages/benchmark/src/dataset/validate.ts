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
