/**
 * Export candidate-only relationships from graph-evidence-v1 and entity artifacts.
 *
 *   bun run retrieval:relationships:export -- --dry-run
 *   bun run retrieval:relationships:export
 *   bun run retrieval:relationships:export -- --out tooling/cleaning-lab/output/relationships
 */
import { runRelationshipExtraction, type RelationshipExportOptions } from "./relationship-export";

const DEFAULT_GRAPH = "tooling/cleaning-lab/output/graph-evidence";
const DEFAULT_ENTITIES = "tooling/cleaning-lab/output/entity-mentions";
const DEFAULT_OUTPUT = "tooling/cleaning-lab/output/relationships";

interface CliOptions {
  readonly graphDir: string;
  readonly entityDir: string;
  readonly out: string;
  readonly dryRun: boolean;
  readonly help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const exportOptions: RelationshipExportOptions = {
    graphDir: options.graphDir,
    entityDir: options.entityDir,
    outputDir: options.out,
    dryRun: options.dryRun,
  };
  const report = await runRelationshipExtraction(exportOptions);
  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = {
    graphDir: DEFAULT_GRAPH,
    entityDir: DEFAULT_ENTITIES,
    out: DEFAULT_OUTPUT,
    dryRun: false,
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
      case "--out":
        values.out = next();
        break;
      case "--dry-run":
        values.dryRun = true;
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
    graphDir: values.graphDir || DEFAULT_GRAPH,
    entityDir: values.entityDir || DEFAULT_ENTITIES,
    out: values.out || DEFAULT_OUTPUT,
  };
}

function helpText(): string {
  return [
    "Export candidate-only relationships from graph-evidence-v1 and entity artifacts.",
    "",
    "Options:",
    `  --graph <dir>       Graph evidence directory (default: ${DEFAULT_GRAPH})`,
    `  --entities <dir>    Entity artifact directory (default: ${DEFAULT_ENTITIES})`,
    `  --out <dir>         Output directory (default: ${DEFAULT_OUTPUT})`,
    "  --dry-run           Validate and report without writing files",
    "  --help, -h          Show this help",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
