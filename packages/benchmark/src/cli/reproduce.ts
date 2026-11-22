import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { checkReproducibility } from "../reporting/checks";
import { readErrors, readResponses, readRunMetadata } from "../storage/fs";
import { readEvaluation } from "../evaluation/storage";
import { computeSummary } from "../evaluation/metrics";
import { logger } from "../shared/logger";
import { runsDir } from "./common";

export async function runReproduce(flags: Record<string, string>): Promise<number> {
  const runId = flags["run-id"];
  if (!runId) {
    logger.error("--run-id is required");
    return 1;
  }
  const meta = await readRunMetadata(runsDir(), runId);
  const responses = await readResponses(runsDir(), runId);
  const errors = await readErrors(runsDir(), runId);
  const evaluation = await readEvaluation(runsDir(), runId);

  let summary: ReturnType<typeof computeSummary> | null = null;
  try {
    const raw = await readFile(join(runsDir(), runId, "summary.json"), "utf8");
    summary = JSON.parse(raw);
  } catch {
    /* no summary */
  }

  const fileContents = new Map<string, string>();
  try {
    const entries = await readdir(join(runsDir(), runId), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        fileContents.set(entry.name, await readFile(join(runsDir(), runId, entry.name), "utf8"));
      } catch {
        /* binary */
      }
    }
  } catch {
    /* dir missing */
  }

  const report = checkReproducibility({
    metadata: meta,
    responses,
    errors,
    evaluation,
    summary,
    fileContents,
  });
  for (const c of report.checks) {
    console.log(`${c.passed ? "[OK]" : "[FAIL]"} ${c.name}: ${c.details}`);
  }
  logger.info(report.passed ? "reproducibility: PASS" : "reproducibility: FAIL", { run_id: runId });
  return report.passed ? 0 : 1;
}
