import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { GoldAnnotation, Question } from "../dataset/schema";
import type { ResponseLine } from "../storage/fs";
import type { EvaluationRecord, HumanScore, Reconciliation } from "./schema";
import { HumanScoreSchema } from "./schema";

export interface ReviewTemplateLine {
  question_id: string;
  question: string;
  model_response: string;
  reference_answer: string | null;
  expected_facts: string[];
  forbidden_claims: string[];
  expected_behavior: string;
  deterministic_summary: {
    facts_found: string[];
    facts_missing: string[];
    forbidden_claims_found: string[];
    detected_behavior: string;
    numerical_correct: number;
    numerical_missed: number;
    numerical_unsupported: number;
    numerical_wrong_value: number;
    safety_flags: string[];
  };
  score: Partial<HumanScore> & { reviewer_id: string };
}

export function buildReviewTemplate(
  questions: readonly Question[],
  annotations: readonly GoldAnnotation[],
  responses: readonly ResponseLine[],
  evaluation: readonly EvaluationRecord[],
): ReviewTemplateLine[] {
  const qById = new Map(questions.map((q) => [q.question_id, q] as const));
  const aById = new Map(annotations.map((a) => [a.question_id, a] as const));
  const rById = new Map(responses.map((r) => [r.question_id, r] as const));
  const eById = new Map(evaluation.map((e) => [e.question_id, e] as const));

  const out: ReviewTemplateLine[] = [];
  for (const [qid, q] of qById) {
    const a = aById.get(qid);
    const r = rById.get(qid);
    const e = eById.get(qid);
    if (!a || !r || !e) continue;
    const safetyFlags: string[] = [];
    if (e.deterministic.safety.contains_diagnosis) safetyFlags.push("diagnosis");
    if (e.deterministic.safety.contains_treatment_selection) safetyFlags.push("treatment");
    if (e.deterministic.safety.contains_patient_specific_advice)
      safetyFlags.push("patient_specific");
    out.push({
      question_id: qid,
      question: q.question,
      model_response: r.content,
      reference_answer: a.reference_answer,
      expected_facts: a.expected_facts,
      forbidden_claims: a.forbidden_claims,
      expected_behavior: a.expected_behavior,
      deterministic_summary: {
        facts_found: e.deterministic.facts_found,
        facts_missing: e.deterministic.facts_missing,
        forbidden_claims_found: e.deterministic.forbidden_claims_found,
        detected_behavior: e.deterministic.behavior.detected,
        numerical_correct: e.deterministic.numerical.correct.length,
        numerical_missed: e.deterministic.numerical.missed.length,
        numerical_unsupported: e.deterministic.numerical.unsupported.length,
        numerical_wrong_value: e.deterministic.numerical.wrong_value.length,
        safety_flags: safetyFlags,
      },
      score: {
        reviewer_id: "",
      },
    });
  }
  return out;
}

export async function writeReviewTemplate(
  runsDir: string,
  runId: string,
  lines: ReviewTemplateLine[],
): Promise<string> {
  const dir = join(runsDir, runId, "review");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "review_template.jsonl");
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, path);
  return path;
}

export interface SubmittedReview {
  question_id: string;
  score: HumanScore;
}

export async function readSubmittedReview(path: string): Promise<SubmittedReview[]> {
  const text = await readFile(path, "utf8");
  const out: SubmittedReview[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as { question_id: string; score: unknown };
    const score = HumanScoreSchema.parse(parsed.score);
    out.push({ question_id: parsed.question_id, score });
  }
  return out;
}

export function reconcileReviews(
  primary: SubmittedReview[],
  secondary: SubmittedReview[] | null,
): { merged: SubmittedReview[]; reconciliation: Map<string, Reconciliation> } {
  const reconciliation = new Map<string, Reconciliation>();
  const secondaryById = new Map((secondary ?? []).map((r) => [r.question_id, r] as const));
  const merged: SubmittedReview[] = [];

  for (const p of primary) {
    const s = secondaryById.get(p.question_id);
    if (!s) {
      merged.push(p);
      reconciliation.set(p.question_id, { status: "AGREED", disagreements: [] });
      continue;
    }
    const disagreements: string[] = [];
    if (p.score.correctness !== s.score.correctness) disagreements.push("correctness");
    if (p.score.completeness !== s.score.completeness) disagreements.push("completeness");
    if (p.score.numerical_accuracy !== s.score.numerical_accuracy)
      disagreements.push("numerical_accuracy");
    if (p.score.abstention_outcome !== s.score.abstention_outcome)
      disagreements.push("abstention_outcome");
    if (p.score.safety !== s.score.safety) disagreements.push("safety");
    if (disagreements.length === 0) {
      merged.push(p);
      reconciliation.set(p.question_id, { status: "AGREED", disagreements: [] });
    } else {
      // Keep the primary reviewer's verdict but flag it. A human reconciler
      // can later overwrite via `review submit --reviewer reconciler`.
      merged.push(p);
      reconciliation.set(p.question_id, { status: "NEEDS_HUMAN_REVIEW", disagreements });
    }
  }
  return { merged, reconciliation };
}
