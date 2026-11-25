import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../shared/logger";
import { loadGoldAnnotationsFromFile } from "../dataset/gold-loader";
import { computeRetrievalMetrics } from "../retrieval/metrics";
import { loadRetrievalTrace } from "../retrieval/trace";
import { dataV1Path, runsDir } from "./common";

const BASELINE_NAME = "retrieval-baseline.json";
const METRICS_NAME = "retrieval-metrics.json";
const TOLERANCE = 0.01;

export async function runRetrievalEvaluate(flags: Record<string, string>): Promise<number> {
  const trace = await loadRetrievalTrace(dataV1Path("retrieval-trace.jsonl"));
  const annotations = await loadGoldAnnotationsFromFile(dataV1Path("gold_annotations.jsonl"));
  const metrics = computeRetrievalMetrics(
    [...trace.rows.values()],
    annotations,
    trace.configHash,
    trace.traceHash,
  );

  const outputDir = runsDir();
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, METRICS_NAME), JSON.stringify(metrics, null, 2) + "\n", "utf8");

  const baselinePath = join(outputDir, BASELINE_NAME);
  let baseline: (typeof metrics)["averages"] | null = null;
  try {
    const parsed = JSON.parse(await readFile(baselinePath, "utf8")) as {
      averages?: (typeof metrics)["averages"];
    };
    baseline = parsed.averages ?? null;
  } catch {
    baseline = null;
  }

  if (!baseline || flags["write-baseline"] === "true") {
    await writeFile(
      baselinePath,
      JSON.stringify({ generated_at: new Date().toISOString(), ...metrics }, null, 2) + "\n",
      "utf8",
    );
    logger.info(
      `retrieval baseline written {"path":"${BASELINE_NAME}","questions":${metrics.questions}}`,
    );
    return 0;
  }

  const regressions: string[] = [];
  for (const [name, value] of Object.entries(metrics.averages)) {
    const previous = baseline[name as keyof typeof baseline];
    if (typeof previous === "number" && value < previous - TOLERANCE) {
      regressions.push(`${name}: ${previous.toFixed(4)} -> ${value.toFixed(4)}`);
    }
  }
  if (regressions.length > 0) {
    logger.error(`retrieval regression: ${regressions.join("; ")}`);
    return 1;
  }

  logger.info(
    `retrieval gate passed {"questions":${metrics.questions},"configHash":"${trace.configHash.slice(0, 12)}…"}`,
  );
  return 0;
}
