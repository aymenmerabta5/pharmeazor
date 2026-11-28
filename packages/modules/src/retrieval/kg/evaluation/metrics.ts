import type { LinkConfusion, MacroMetrics, PrfCounts } from "./types";

const RATE_DIGITS = 6;

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round(numerator / denominator);
}

export function f1From(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return 0;
  return round((2 * precision * recall) / (precision + recall));
}

export function prf(
  truePositives: number,
  falsePositives: number,
  falseNegatives: number,
): PrfCounts {
  const precision = rate(truePositives, truePositives + falsePositives);
  const recall = rate(truePositives, truePositives + falseNegatives);
  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: f1From(precision, recall),
  };
}

export function linkConfusion(
  truePositives: number,
  falsePositives: number,
  falseNegatives: number,
  trueNegatives: number,
): LinkConfusion {
  return {
    ...prf(truePositives, falsePositives, falseNegatives),
    trueNegatives,
  };
}

/**
 * Macro averages are computed only over slices where the measure is defined.
 * A missing precision (no exhaustive labels) does not become a fabricated zero.
 */
export function macroMetrics(values: Iterable<PrfCounts>): MacroMetrics {
  const entries = [...values];
  const precisions = entries
    .map((entry) => entry.precision)
    .filter((value): value is number => value !== null);
  const recalls = entries
    .map((entry) => entry.recall)
    .filter((value): value is number => value !== null);
  const f1s = entries.map((entry) => entry.f1).filter((value): value is number => value !== null);
  return {
    kinds: entries.length,
    precision: mean(precisions),
    recall: mean(recalls),
    f1: mean(f1s),
  };
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((total, value) => total + value, 0) / values.length);
}

export function round(value: number): number {
  return Number(value.toFixed(RATE_DIGITS));
}

/** Deterministic, code-sorted record for JSON reports. */
export function sortedRecord(
  entries: Iterable<readonly [string, number]>,
): Readonly<Record<string, number>> {
  return Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
}
