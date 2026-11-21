#!/usr/bin/env bun
import { join } from "node:path";
import { loadQuestionsFromFile } from "../dataset/loader";
import { validateDatasetFromFiles } from "../dataset/validate";
import { logger } from "../shared/logger";

interface ParsedArgs {
  command?: string;
  subcommand?: string;
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, subcommand, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = "true";
    }
  }
  return { command, subcommand, flags };
}

function packageRoot(): string {
  // src/cli -> package root
  return join(import.meta.dir, "..", "..");
}

function printUsage(): void {
  console.log(`Usage:
  benchmark dataset validate [--questions <path>] [--annotations <path>]
  benchmark dataset stats    [--questions <path>]
`);
}

async function runDatasetValidate(flags: Record<string, string>): Promise<number> {
  const root = packageRoot();
  const questionsPath = flags.questions ?? join(root, "data/v1/questions.jsonl");
  const annotationsPath = flags.annotations ?? join(root, "data/v1/gold_annotations.jsonl");

  const report = await validateDatasetFromFiles({
    questionsPath,
    goldAnnotationsPath: annotationsPath,
  });

  logger.info("dataset validation", {
    ok: report.ok,
    total: report.stats.total,
    approved: report.stats.approved_count,
    draft: report.stats.draft_count,
    annotated: report.stats.annotated_count,
    verified: report.stats.verified_count,
    questions_hash: report.questions_hash,
  });

  if (report.warnings.length > 0) {
    logger.warn(`${report.warnings.length} warning(s)`);
    for (const w of report.warnings) {
      logger.warn(`${w.code} ${w.question_id ?? ""} ${w.message}`);
    }
  }
  if (report.errors.length > 0) {
    logger.error(`${report.errors.length} error(s)`);
    for (const e of report.errors) {
      logger.error(`${e.code} ${e.question_id ?? ""} ${e.message}`);
    }
    return 1;
  }
  logger.info("dataset is valid");
  return 0;
}

async function runDatasetStats(flags: Record<string, string>): Promise<number> {
  const root = packageRoot();
  const questionsPath = flags.questions ?? join(root, "data/v1/questions.jsonl");
  const questions = await loadQuestionsFromFile(questionsPath);

  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  for (const q of questions) {
    byStatus[q.review_status] = (byStatus[q.review_status] ?? 0) + 1;
    byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
    byLanguage[q.language] = (byLanguage[q.language] ?? 0) + 1;
  }
  logger.info("dataset stats", {
    total: questions.length,
    byStatus,
    byCategory,
    byLanguage,
  });
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const { command, subcommand, flags } = parseArgs(argv);
  if (command === "dataset" && subcommand === "validate") return runDatasetValidate(flags);
  if (command === "dataset" && subcommand === "stats") return runDatasetStats(flags);
  printUsage();
  return 1;
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (err) {
    logger.error((err as Error).message);
    process.exit(1);
  }
}
