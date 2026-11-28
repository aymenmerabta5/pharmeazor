/**
 * Write a reproducible knowledge-graph evaluation report.
 *
 * The report body is deterministic for identical inputs; only the manifest
 * carries a timestamp. Neo4j, PostgreSQL, and the Hybrid RAG index are never
 * touched.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  evaluateKnowledgeGraph,
  type KnowledgeGraphEvaluationResult,
} from "@repo/modules/retrieval";
import {
  loadGraphEvaluationInput,
  type GraphEvaluationFiltering,
  type GraphEvaluationIdentities,
  type GraphEvaluationOptions,
} from "./graph-evaluation-input";

const DEFAULT_OUTPUT_DIR = "tooling/cleaning-lab/output/graph-evaluation";

export interface GraphEvaluationRunOptions extends GraphEvaluationOptions {
  readonly outputDir?: string;
  readonly dryRun?: boolean;
}

export interface GraphEvaluationReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly dryRun: boolean;
  readonly filesWritten: boolean;
  readonly outputDir: string;
  readonly files: {
    readonly report: string;
    readonly diagnostics: string;
    readonly manifest: string;
  };
  readonly checksums: {
    readonly report: string;
    readonly diagnostics: string;
  };
  readonly inputs: GraphEvaluationIdentities;
  readonly filtering: GraphEvaluationFiltering;
  readonly evaluation: KnowledgeGraphEvaluationResult;
}

export async function runGraphEvaluation(
  options: GraphEvaluationRunOptions = {},
): Promise<GraphEvaluationReport> {
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const dryRun = options.dryRun === true;
  const input = await loadGraphEvaluationInput(options);
  const evaluation = evaluateKnowledgeGraph(input);
  const reportText = `${JSON.stringify(evaluation, null, 2)}\n`;
  const diagnosticsText = evaluation.validation.diagnostics
    .map((diagnostic) => `${JSON.stringify(diagnostic)}\n`)
    .join("");
  const files = {
    report: "report.json",
    diagnostics: "diagnostics.jsonl",
    manifest: "manifest.json",
  };
  const checksums = {
    report: sha256(reportText),
    diagnostics: sha256(diagnosticsText),
  };
  const report: GraphEvaluationReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun,
    filesWritten: false,
    outputDir: relative(process.cwd(), outputDir).replaceAll("\\", "/"),
    files,
    checksums,
    inputs: input.identities,
    filtering: input.filtering,
    evaluation,
  };
  if (dryRun) return report;

  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, files.report), reportText, "utf8");
  await writeFile(join(outputDir, files.diagnostics), diagnosticsText, "utf8");
  const manifest = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    dryRun: false,
    filesWritten: true,
    evaluationVersion: evaluation.evaluationVersion,
    status: evaluation.status,
    validation: {
      ok: evaluation.validation.ok,
      errors: evaluation.validation.errors,
      warnings: evaluation.validation.warnings,
    },
    scope: evaluation.scope,
    counts: evaluation.counts,
    inputs: input.identities,
    filtering: input.filtering,
    files,
    checksums,
  };
  await writeFile(
    join(outputDir, files.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return { ...report, filesWritten: true };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
