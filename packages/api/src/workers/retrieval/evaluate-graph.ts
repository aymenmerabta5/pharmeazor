/**
 * Evaluate candidate knowledge-graph artifacts against manually labelled gold
 * annotations.
 *
 *   bun run retrieval:graph:evaluate -- --dry-run
 *   bun run retrieval:graph:evaluate
 *   bun run retrieval:graph:evaluate -- --limit 500 --out tooling/cleaning-lab/output/graph-evaluation-sample
 */
import { runGraphEvaluation } from "./graph-evaluation";

const DEFAULT_GRAPH = "tooling/cleaning-lab/output/graph-evidence";
const DEFAULT_ENTITIES = "tooling/cleaning-lab/output/entity-mentions";
const DEFAULT_RELATIONSHIPS = "tooling/cleaning-lab/output/relationships";
const DEFAULT_LINKS = "tooling/cleaning-lab/output/entity-links";
const DEFAULT_GOLD = "tooling/retrieval-lab/eval/graph-gold";
const DEFAULT_OUT = "tooling/cleaning-lab/output/graph-evaluation";

interface CliOptions {
  readonly graphDir: string;
  readonly entityDir: string;
  readonly relationshipDir: string;
  readonly linkDir: string;
  readonly goldDir: string;
  readonly out: string;
  readonly limit: number | null;
  readonly dryRun: boolean;
  readonly failOnError: boolean;
  readonly help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const report = await runGraphEvaluation({
    graphDir: options.graphDir,
    entityDir: options.entityDir,
    relationshipDir: options.relationshipDir,
    linkDir: options.linkDir,
    goldDir: options.goldDir,
    outputDir: options.out,
    limit: options.limit,
    dryRun: options.dryRun,
  });
  console.log(JSON.stringify(report, null, 2));
  if (
    options.failOnError &&
    (!report.evaluation.validation.ok || report.evaluation.status === "invalid_artifacts")
  ) {
    process.exitCode = 1;
  }
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = {
    graphDir: DEFAULT_GRAPH,
    entityDir: DEFAULT_ENTITIES,
    relationshipDir: DEFAULT_RELATIONSHIPS,
    linkDir: DEFAULT_LINKS,
    goldDir: DEFAULT_GOLD,
    out: DEFAULT_OUT,
    limit: null as number | null,
    dryRun: false,
    failOnError: false,
    help: false,
  };
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
      case "--graph":
        values.graphDir = next();
        break;
      case "--entities":
        values.entityDir = next();
        break;
      case "--relationships":
        values.relationshipDir = next();
        break;
      case "--links":
        values.linkDir = next();
        break;
      case "--gold":
        values.goldDir = next();
        break;
      case "--out":
        values.out = next();
        break;
      case "--limit":
        values.limit = positiveInteger(next(), flag);
        break;
      case "--dry-run":
        values.dryRun = true;
        break;
      case "--fail-on-error":
        values.failOnError = true;
        break;
      case "--help":
      case "-h":
        values.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return values;
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
    "Evaluate candidate entity, relationship, and entity-link artifacts.",
    "The evaluator is offline and does not contact Neo4j or PostgreSQL.",
    "",
    "Options:",
    `  --graph <dir>          Graph evidence directory (default: ${DEFAULT_GRAPH})`,
    `  --entities <dir>       Entity artifact directory (default: ${DEFAULT_ENTITIES})`,
    `  --relationships <dir>  Relationship artifact directory (default: ${DEFAULT_RELATIONSHIPS})`,
    `  --links <dir>          Entity-link artifact directory (default: ${DEFAULT_LINKS})`,
    `  --gold <dir>           Manual gold dataset directory (default: ${DEFAULT_GOLD})`,
    `  --out <dir>            Output directory (default: ${DEFAULT_OUT})`,
    "  --limit <n>            Use only the first n graph text units for text scopes",
    "  --dry-run              Validate and report without writing files",
    "  --fail-on-error        Exit non-zero when validation fails",
    "  --help, -h             Show this help",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
