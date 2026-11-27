#!/usr/bin/env bun
import { logger } from "../shared/logger";
import { parseArgs, printUsage } from "./common";
import { runDatasetStats, runDatasetValidate } from "./dataset";
import { runRawResume, runRawRun, runRawStatus } from "./raw";
import { runOracleResume, runOracleRun } from "./oracle";
import {
  runRagGraphResume,
  runRagGraphRun,
  runRagRerankResume,
  runRagRerankRun,
  runRagResume,
  runRagRun,
} from "./rag";
import { runArmsReport } from "./arms";
import {
  runEvaluateRun,
  runReport,
  runReviewPrepare,
  runReviewSubmit,
  runSummary,
} from "./evaluate";
import { runCompare } from "./compare";
import { runReproduce } from "./reproduce";
import { runRetrievalEvaluate } from "./retrieval";

async function main(argv: string[]): Promise<number> {
  const { command, subcommand, flags } = parseArgs(argv);

  if (command === undefined || command === "help" || flags.help === "true") {
    printUsage();
    return command === undefined ? 1 : 0;
  }

  if (command === "dataset" && subcommand === "validate") return runDatasetValidate(flags);
  if (command === "dataset" && subcommand === "stats") return runDatasetStats(flags);

  if (command === "raw" && subcommand === "run") return runRawRun(flags);
  if (command === "raw" && subcommand === "resume") return runRawResume(flags);
  if (command === "raw" && subcommand === "status") return runRawStatus(flags);

  if (command === "oracle" && subcommand === "run") return runOracleRun(flags);
  if (command === "oracle" && subcommand === "resume") return runOracleResume(flags);
  if (command === "oracle" && subcommand === "status") return runRawStatus(flags);

  if (command === "rag" && subcommand === "run") return runRagRun(flags);
  if (command === "rag" && subcommand === "resume") return runRagResume(flags);

  if (command === "rag-rerank" && subcommand === "run") return runRagRerankRun(flags);
  if (command === "rag-rerank" && subcommand === "resume") return runRagRerankResume(flags);

  if (command === "rag-graph" && subcommand === "run") return runRagGraphRun(flags);
  if (command === "rag-graph" && subcommand === "resume") return runRagGraphResume(flags);

  if (command === "arms" && subcommand === "report") return runArmsReport(flags);

  if (command === "evaluate" && subcommand === "run") return runEvaluateRun(flags);
  if (command === "review" && subcommand === "prepare") return runReviewPrepare(flags);
  if (command === "review" && subcommand === "submit") return runReviewSubmit(flags);

  if (command === "retrieval" && subcommand === "evaluate") return runRetrievalEvaluate(flags);

  if (command === "summary") return runSummary(flags);
  if (command === "report") return runReport(flags);
  if (command === "compare") return runCompare(flags);
  if (command === "reproduce") return runReproduce(flags);

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
