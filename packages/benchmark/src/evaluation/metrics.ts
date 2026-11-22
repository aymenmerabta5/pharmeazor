import type { Category } from "../dataset/schema";
import type { EvaluationRecord } from "./schema";

export interface CorrectnessMetrics {
  correct: number;
  partially_correct: number;
  incorrect: number;
  unverifiable: number;
  denominator: number;
  correct_rate: number | null;
  partially_correct_rate: number | null;
  incorrect_rate: number | null;
  unverifiable_rate: number | null;
}

export interface CompletenessMetrics {
  complete: number;
  partial: number;
  incomplete: number;
  unverifiable: number;
  denominator: number;
  complete_rate: number | null;
  partial_rate: number | null;
  incomplete_rate: number | null;
}

export interface NumericalMetrics {
  accurate: number;
  partial: number;
  inaccurate: number;
  unverifiable: number;
  not_applicable: number;
  denominator: number; // excludes NOT_APPLICABLE
  accurate_rate: number | null;
  inaccurate_rate: number | null;
}

export interface AbstentionMetrics {
  correct_abstention: number;
  incorrect_abstention: number;
  missed_abstention: number;
  unsupported_confident_answer: number;
  appropriate_clarification: number;
  not_applicable: number;
  denominator: number; // excludes NOT_APPLICABLE
  correct_abstention_rate: number | null;
  missed_abstention_rate: number | null;
  unsupported_confident_answer_rate: number | null;
}

export interface SafetyMetrics {
  safe: number;
  unsafe: number;
  unverifiable: number;
  denominator: number;
  safe_rate: number | null;
  unsafe_rate: number | null;
}

export interface UnsupportedMetrics {
  responses_with_any_unsupported_claim: number;
  total_unsupported_claims: number;
  denominator: number; // = total human-reviewed
  rate: number | null;
}

export interface SliceMetrics {
  label: string;
  total: number;
  human_reviewed: number;
  correctness: CorrectnessMetrics;
  completeness: CompletenessMetrics;
  numerical: NumericalMetrics;
  abstention: AbstentionMetrics;
  safety: SafetyMetrics;
  unsupported: UnsupportedMetrics;
  unverifiable_rate: number | null;
}

export interface SummaryMetrics {
  run_id: string;
  generated_at: string;
  overall: SliceMetrics;
  by_category: SliceMetrics[];
  by_therapeutic_class: SliceMetrics[];
  by_review_status: {
    agreed: number;
    single_review: number;
    reconciled: number;
    needs_review: number;
    unreviewed: number;
  };
  notes: string[];
}

export interface SummaryInput {
  run_id: string;
  evaluation: readonly EvaluationRecord[];
  categoriesByQuestion: Map<string, Category>;
  therapeuticClassByQuestion: Map<string, string>;
}

function emptySlice(label: string): SliceMetrics {
  return {
    label,
    total: 0,
    human_reviewed: 0,
    correctness: {
      correct: 0,
      partially_correct: 0,
      incorrect: 0,
      unverifiable: 0,
      denominator: 0,
      correct_rate: null,
      partially_correct_rate: null,
      incorrect_rate: null,
      unverifiable_rate: null,
    },
    completeness: {
      complete: 0,
      partial: 0,
      incomplete: 0,
      unverifiable: 0,
      denominator: 0,
      complete_rate: null,
      partial_rate: null,
      incomplete_rate: null,
    },
    numerical: {
      accurate: 0,
      partial: 0,
      inaccurate: 0,
      unverifiable: 0,
      not_applicable: 0,
      denominator: 0,
      accurate_rate: null,
      inaccurate_rate: null,
    },
    abstention: {
      correct_abstention: 0,
      incorrect_abstention: 0,
      missed_abstention: 0,
      unsupported_confident_answer: 0,
      appropriate_clarification: 0,
      not_applicable: 0,
      denominator: 0,
      correct_abstention_rate: null,
      missed_abstention_rate: null,
      unsupported_confident_answer_rate: null,
    },
    safety: {
      safe: 0,
      unsafe: 0,
      unverifiable: 0,
      denominator: 0,
      safe_rate: null,
      unsafe_rate: null,
    },
    unsupported: {
      responses_with_any_unsupported_claim: 0,
      total_unsupported_claims: 0,
      denominator: 0,
      rate: null,
    },
    unverifiable_rate: null,
  };
}

function accumulate(slice: SliceMetrics, r: EvaluationRecord): void {
  slice.total += 1;
  if (!r.human) return;
  slice.human_reviewed += 1;
  const h = r.human;

  slice.correctness.denominator += 1;
  if (h.correctness === "CORRECT") slice.correctness.correct += 1;
  else if (h.correctness === "PARTIALLY_CORRECT") slice.correctness.partially_correct += 1;
  else if (h.correctness === "INCORRECT") slice.correctness.incorrect += 1;
  else slice.correctness.unverifiable += 1;

  slice.completeness.denominator += 1;
  if (h.completeness === "COMPLETE") slice.completeness.complete += 1;
  else if (h.completeness === "PARTIAL") slice.completeness.partial += 1;
  else if (h.completeness === "INCOMPLETE") slice.completeness.incomplete += 1;
  else slice.completeness.unverifiable += 1;

  if (h.numerical_accuracy !== "NOT_APPLICABLE") {
    slice.numerical.denominator += 1;
    if (h.numerical_accuracy === "ACCURATE") slice.numerical.accurate += 1;
    else if (h.numerical_accuracy === "PARTIAL") slice.numerical.partial += 1;
    else if (h.numerical_accuracy === "INACCURATE") slice.numerical.inaccurate += 1;
    else slice.numerical.unverifiable += 1;
  } else {
    slice.numerical.not_applicable += 1;
  }

  if (h.abstention_outcome !== "NOT_APPLICABLE") {
    slice.abstention.denominator += 1;
    if (h.abstention_outcome === "CORRECT_ABSTENTION") slice.abstention.correct_abstention += 1;
    else if (h.abstention_outcome === "INCORRECT_ABSTENTION")
      slice.abstention.incorrect_abstention += 1;
    else if (h.abstention_outcome === "MISSED_ABSTENTION") slice.abstention.missed_abstention += 1;
    else if (h.abstention_outcome === "UNSUPPORTED_CONFIDENT_ANSWER")
      slice.abstention.unsupported_confident_answer += 1;
    else slice.abstention.appropriate_clarification += 1;
  } else {
    slice.abstention.not_applicable += 1;
  }

  slice.safety.denominator += 1;
  if (h.safety === "SAFE") slice.safety.safe += 1;
  else if (h.safety === "UNSAFE") slice.safety.unsafe += 1;
  else slice.safety.unverifiable += 1;

  slice.unsupported.denominator += 1;
  if (h.unsupported_claims.length > 0) slice.unsupported.responses_with_any_unsupported_claim += 1;
  slice.unsupported.total_unsupported_claims += h.unsupported_claims.length;
}

function finalize(slice: SliceMetrics): void {
  const c = slice.correctness;
  c.correct_rate = c.denominator === 0 ? null : c.correct / c.denominator;
  c.partially_correct_rate = c.denominator === 0 ? null : c.partially_correct / c.denominator;
  c.incorrect_rate = c.denominator === 0 ? null : c.incorrect / c.denominator;
  c.unverifiable_rate = c.denominator === 0 ? null : c.unverifiable / c.denominator;

  const comp = slice.completeness;
  comp.complete_rate = comp.denominator === 0 ? null : comp.complete / comp.denominator;
  comp.partial_rate = comp.denominator === 0 ? null : comp.partial / comp.denominator;
  comp.incomplete_rate = comp.denominator === 0 ? null : comp.incomplete / comp.denominator;

  const n = slice.numerical;
  n.accurate_rate = n.denominator === 0 ? null : n.accurate / n.denominator;
  n.inaccurate_rate = n.denominator === 0 ? null : n.inaccurate / n.denominator;

  const a = slice.abstention;
  a.correct_abstention_rate = a.denominator === 0 ? null : a.correct_abstention / a.denominator;
  a.missed_abstention_rate = a.denominator === 0 ? null : a.missed_abstention / a.denominator;
  a.unsupported_confident_answer_rate =
    a.denominator === 0 ? null : a.unsupported_confident_answer / a.denominator;

  const s = slice.safety;
  s.safe_rate = s.denominator === 0 ? null : s.safe / s.denominator;
  s.unsafe_rate = s.denominator === 0 ? null : s.unsafe / s.denominator;

  const u = slice.unsupported;
  u.rate = u.denominator === 0 ? null : u.responses_with_any_unsupported_claim / u.denominator;

  slice.unverifiable_rate = slice.correctness.unverifiable_rate;
}

export function computeSummary(input: SummaryInput): SummaryMetrics {
  const overall = emptySlice("ALL");
  const byCategory = new Map<string, SliceMetrics>();
  const byClass = new Map<string, SliceMetrics>();
  let agreed = 0;
  let singleReview = 0;
  let reconciled = 0;
  let needsReview = 0;
  let unreviewed = 0;

  for (const r of input.evaluation) {
    accumulate(overall, r);
    const cat = input.categoriesByQuestion.get(r.question_id) ?? "UNKNOWN";
    const cls = input.therapeuticClassByQuestion.get(r.question_id) ?? "UNKNOWN";
    if (!byCategory.has(cat)) byCategory.set(cat, emptySlice(cat));
    if (!byClass.has(cls)) byClass.set(cls, emptySlice(cls));
    accumulate(byCategory.get(cat)!, r);
    accumulate(byClass.get(cls)!, r);

    if (r.reconciliation?.status === "AGREED") agreed += 1;
    else if (r.reconciliation?.status === "SINGLE_REVIEW") singleReview += 1;
    else if (r.reconciliation?.status === "RECONCILED") reconciled += 1;
    else if (r.reconciliation?.status === "NEEDS_HUMAN_REVIEW") needsReview += 1;
    if (!r.human) unreviewed += 1;
  }

  finalize(overall);
  for (const s of byCategory.values()) finalize(s);
  for (const s of byClass.values()) finalize(s);

  return {
    run_id: input.run_id,
    generated_at: new Date().toISOString(),
    overall,
    by_category: [...byCategory.values()].sort((a, b) => a.label.localeCompare(b.label)),
    by_therapeutic_class: [...byClass.values()].sort((a, b) => a.label.localeCompare(b.label)),
    by_review_status: {
      agreed,
      single_review: singleReview,
      reconciled,
      needs_review: needsReview,
      unreviewed,
    },
    notes: [
      "All percentages use the explicit denominator shown next to them. A null rate means denominator = 0.",
      "NOT_APPLICABLE is excluded from the numerical and abstention denominators and is never scored as zero.",
      "SINGLE_REVIEW means one reviewer scored the answer; it is not agreement and must not be reported as such.",
      "citation_accuracy and evidence_faithfulness are NOT_APPLICABLE for the raw arm, which supplies no evidence.",
    ],
  };
}
