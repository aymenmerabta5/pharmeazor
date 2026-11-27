/**
 * Approval-gated Neo4j graph population.
 *
 *   bun run retrieval:graph:import -- --validate-only
 *   bun run retrieval:graph:import -- --plan --approval docs/graph-approval.json
 *   bun run retrieval:graph:import -- --apply --approval docs/graph-approval.json
 *
 * The default is validation only. No candidate is written to Neo4j without a
 * valid approval artifact and explicit --apply.
 */
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildGraphPopulationPlan,
  validateGraphPopulation,
  type GraphPopulationOptions,
} from "./graph-population";
import { importGraphPlan } from "./graph-import";
import { HttpNeo4jClient, neo4jConfigFromEnv } from "./neo4j-http";

const DEFAULT_LINK_DIR = "tooling/cleaning-lab/output/entity-links";
const DEFAULT_RELATIONSHIP_DIR = "tooling/cleaning-lab/output/relationships";
const DEFAULT_OUTPUT_DIR = "tooling/cleaning-lab/output/graph-population";
const DEFAULT_BATCH_SIZE = 500;

type Mode = "validate" | "plan" | "apply";

interface CliOptions {
  readonly mode: Mode;
  readonly linkDir: string;
  readonly relationshipDir: string;
  readonly approvalPath: string | undefined;
  readonly out: string;
  readonly batchSize: number;
  readonly help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const common: GraphPopulationOptions = {
    linkDir: options.linkDir,
    relationshipDir: options.relationshipDir,
    approvalPath: options.approvalPath,
    outputDir: options.out,
    batchSize: options.batchSize,
  };
  if (options.mode === "validate") {
    const report = await validateGraphPopulation({ ...common, write: true });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const plan = await buildGraphPopulationPlan(common);
  if (options.mode === "plan") {
    console.log(JSON.stringify(plan.report, null, 2));
    return;
  }

  const config = neo4jConfigFromEnv();
  if (!config) {
    throw new Error(
      "NEO4J_HTTP_URL, NEO4J_USER, and NEO4J_PASSWORD are required for --apply; no import was performed",
    );
  }
  if (!plan.report.planId) throw new Error("The graph plan has no plan id");
  const client = new HttpNeo4jClient(config);
  const runId = `gimp_${plan.report.planId.replace(/^plan_/u, "")}`;
  const importReport = await importGraphPlan({
    entitiesPath: plan.entitiesPath,
    relationshipsPath: plan.relationshipsPath,
    approval: plan.approval,
    client,
    runId,
    planId: plan.report.planId,
    batchSize: plan.batchSize,
    expectedEntityCount: plan.report.counts.eligibleEntities,
    expectedRelationshipCount: plan.report.counts.eligibleRelationships,
  });
  const reportPath = join(resolve(options.out), "import-report.json");
  await writeFile(
    reportPath,
    `${JSON.stringify({ plan: plan.report, import: importReport }, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({ plan: plan.report, import: importReport }, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = {
    mode: "validate" as Mode,
    linkDir: DEFAULT_LINK_DIR,
    relationshipDir: DEFAULT_RELATIONSHIP_DIR,
    approvalPath: undefined as string | undefined,
    out: DEFAULT_OUTPUT_DIR,
    batchSize: DEFAULT_BATCH_SIZE,
    help: false,
  };
  let modeFlag: Mode | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    const next = () => {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${flag} requires a value`);
      }
      index += 1;
      return value;
    };
    switch (flag) {
      case "--validate-only":
        setMode("validate");
        break;
      case "--plan":
        setMode("plan");
        break;
      case "--apply":
        setMode("apply");
        break;
      case "--links":
        values.linkDir = next();
        break;
      case "--relationships":
        values.relationshipDir = next();
        break;
      case "--approval":
        values.approvalPath = next();
        break;
      case "--out":
        values.out = next();
        break;
      case "--batch-size":
        values.batchSize = positiveInteger(next(), flag);
        break;
      case "--help":
      case "-h":
        values.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return {
    ...values,
    mode: modeFlag ?? "validate",
    linkDir: values.linkDir || DEFAULT_LINK_DIR,
    relationshipDir: values.relationshipDir || DEFAULT_RELATIONSHIP_DIR,
    out: values.out || DEFAULT_OUTPUT_DIR,
  };

  function setMode(mode: Mode): void {
    if (modeFlag && modeFlag !== mode) {
      throw new Error("Choose only one of --validate-only, --plan, or --apply");
    }
    modeFlag = mode;
  }
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function helpText(): string {
  return [
    "Approval-gated Neo4j graph population.",
    "",
    "Modes:",
    "  --validate-only      Validate artifacts and approval; never connect to Neo4j (default)",
    "  --plan               Write an approved import plan; never connect to Neo4j",
    "  --apply              Build the plan and import it into Neo4j",
    "",
    "Options:",
    `  --links <dir>          Entity-link artifact (default: ${DEFAULT_LINK_DIR})`,
    `  --relationships <dir>  Relationship artifact (default: ${DEFAULT_RELATIONSHIP_DIR})`,
    "  --approval <file>      Signed/recorded graph-population approval JSON",
    `  --out <dir>            Output directory (default: ${DEFAULT_OUTPUT_DIR})`,
    `  --batch-size <n>       Import batch size (default: ${DEFAULT_BATCH_SIZE})`,
    "  --help, -h             Show this help",
    "",
    "Neo4j --apply environment:",
    "  NEO4J_HTTP_URL, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE (optional)",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
