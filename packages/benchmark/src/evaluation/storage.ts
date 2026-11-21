import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EvaluationRecordSchema,
  type EvaluationRecord,
  type HumanScore,
  type Reconciliation,
} from "./schema";

function evalPath(runsDir: string, runId: string): string {
  return join(runsDir, runId, "evaluation.jsonl");
}

export async function writeEvaluation(
  runsDir: string,
  runId: string,
  records: EvaluationRecord[],
): Promise<void> {
  const path = evalPath(runsDir, runId);
  await mkdir(join(runsDir, runId), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, path);
}

export async function readEvaluation(runsDir: string, runId: string): Promise<EvaluationRecord[]> {
  try {
    const text = await readFile(evalPath(runsDir, runId), "utf8");
    const out: EvaluationRecord[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      out.push(EvaluationRecordSchema.parse(JSON.parse(line)));
    }
    return out;
  } catch {
    return [];
  }
}

export async function mergeHumanScore(
  runsDir: string,
  runId: string,
  questionId: string,
  human: HumanScore,
  reconciliation: Reconciliation,
): Promise<void> {
  const records = await readEvaluation(runsDir, runId);
  const updated = records.map((r) =>
    r.question_id === questionId ? { ...r, human, reconciliation } : r,
  );
  await writeEvaluation(runsDir, runId, updated);
}
