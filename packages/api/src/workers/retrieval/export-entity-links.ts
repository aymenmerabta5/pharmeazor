/**
 * Export candidate-only entity links from the entity artifact.
 *
 *   bun run retrieval:links:export -- --dry-run
 *   bun run retrieval:links:export
 */
import { runEntityLinkExtraction, type EntityLinkExportOptions } from "./entity-link-export";

const DEFAULT_ENTITIES = "tooling/cleaning-lab/output/entity-mentions";
const DEFAULT_OUTPUT = "tooling/cleaning-lab/output/entity-links";
const DEFAULT_MAX_MEMBERS = 5000;

interface CliOptions {
  readonly entityDir: string;
  readonly out: string;
  readonly maxMembers: number;
  readonly dryRun: boolean;
  readonly help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const exportOptions: EntityLinkExportOptions = {
    entityDir: options.entityDir,
    outputDir: options.out,
    maxMembers: options.maxMembers,
    dryRun: options.dryRun,
  };
  const report = await runEntityLinkExtraction(exportOptions);
  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = {
    entityDir: DEFAULT_ENTITIES,
    out: DEFAULT_OUTPUT,
    maxMembers: DEFAULT_MAX_MEMBERS,
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
      case "--entities":
        values.entityDir = next();
        break;
      case "--out":
        values.out = next();
        break;
      case "--max-members":
        values.maxMembers = positiveInteger(next(), flag);
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
    entityDir: values.entityDir || DEFAULT_ENTITIES,
    out: values.out || DEFAULT_OUTPUT,
  };
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
    "Export candidate-only entity links from the entity artifact.",
    "",
    "Options:",
    `  --entities <dir>      Entity artifact directory (default: ${DEFAULT_ENTITIES})`,
    `  --out <dir>           Output directory (default: ${DEFAULT_OUTPUT})`,
    `  --max-members <n>     Maximum evidence members per cluster (default: ${DEFAULT_MAX_MEMBERS})`,
    "  --dry-run             Validate and report without writing files",
    "  --help, -h            Show this help",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
