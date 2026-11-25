import type { GoldAnnotation } from "../dataset/schema";
import type { RetrievalTraceRow } from "./types";

export interface RetrievalMetrics {
  readonly questions: number;
  readonly configHash: string;
  readonly traceHash: string;
  readonly averages: {
    readonly "recall@1": number;
    readonly "recall@5": number;
    readonly "recall@10": number;
    readonly "recall@20": number;
    readonly "precision@5": number;
    readonly "precision@10": number;
    readonly mrr: number;
    readonly "ndcg@10": number;
  };
  readonly per_question: readonly {
    readonly question_id: string;
    readonly relevant_chunk_ids: readonly string[];
    readonly retrieved_chunk_ids: readonly string[];
    readonly relevant_in_top10: readonly string[];
  }[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function hitsAt(retrieved: readonly string[], relevant: ReadonlySet<string>, k: number): string[] {
  return retrieved.slice(0, k).filter((id) => relevant.has(id));
}

function recall(retrieved: readonly string[], relevant: ReadonlySet<string>, k: number): number {
  if (relevant.size === 0) return 0;
  return hitsAt(retrieved, relevant, k).length / relevant.size;
}

function precision(retrieved: readonly string[], relevant: ReadonlySet<string>, k: number): number {
  return hitsAt(retrieved, relevant, k).length / k;
}

function reciprocalRank(retrieved: readonly string[], relevant: ReadonlySet<string>): number {
  const index = retrieved.findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

function ndcgAt10(retrieved: readonly string[], relevant: ReadonlySet<string>): number {
  const idealCount = Math.min(relevant.size, 10);
  let ideal = 0;
  for (let rank = 1; rank <= idealCount; rank += 1) ideal += 1 / Math.log2(rank + 1);
  if (ideal === 0) return 0;
  let score = 0;
  hitsAt(retrieved, relevant, 10).forEach((_id, index) => {
    score += 1 / Math.log2(index + 2);
  });
  return score / ideal;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function computeRetrievalMetrics(
  rows: readonly RetrievalTraceRow[],
  annotations: readonly GoldAnnotation[],
  configHash: string,
  traceHash: string,
): RetrievalMetrics {
  const goldById = new Map(annotations.map((annotation) => [annotation.question_id, annotation]));
  const perQuestion: Array<RetrievalMetrics["per_question"][number]> = [];
  const recall1: number[] = [];
  const recall5: number[] = [];
  const recall10: number[] = [];
  const recall20: number[] = [];
  const precision5: number[] = [];
  const precision10: number[] = [];
  const reciprocalRanks: number[] = [];
  const ndcg10: number[] = [];

  for (const row of rows) {
    const annotation = goldById.get(row.question_id);
    if (!annotation) continue;
    const relevant = new Set(annotation.relevant_chunk_ids);
    const retrieved = unique(row.chunks.map((chunk) => chunk.chunk_id));
    recall1.push(recall(retrieved, relevant, 1));
    recall5.push(recall(retrieved, relevant, 5));
    recall10.push(recall(retrieved, relevant, 10));
    recall20.push(recall(retrieved, relevant, 20));
    precision5.push(precision(retrieved, relevant, 5));
    precision10.push(precision(retrieved, relevant, 10));
    reciprocalRanks.push(reciprocalRank(retrieved, relevant));
    ndcg10.push(ndcgAt10(retrieved, relevant));
    perQuestion.push({
      question_id: row.question_id,
      relevant_chunk_ids: [...relevant],
      retrieved_chunk_ids: retrieved,
      relevant_in_top10: hitsAt(retrieved, relevant, 10),
    });
  }

  return {
    questions: perQuestion.length,
    configHash,
    traceHash,
    averages: {
      "recall@1": average(recall1),
      "recall@5": average(recall5),
      "recall@10": average(recall10),
      "recall@20": average(recall20),
      "precision@5": average(precision5),
      "precision@10": average(precision10),
      mrr: average(reciprocalRanks),
      "ndcg@10": average(ndcg10),
    },
    per_question: perQuestion,
  };
}
