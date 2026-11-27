/**
 * Export candidate-only entity mentions from graph-evidence-v1 artifacts.
 *
 *   bun run retrieval:entities:export -- --dry-run
 *   bun run retrieval:entities:export -- --limit 5
 *   bun run retrieval:entities:export -- --out tooling/cleaning-lab/output/entity-mentions
 */
import { join } from "node:path";
import { runEntityExtraction, type EntityExportOptions } from "./entity-export";

const DEFAULT_ROOT = "tooling/cleaning-lab/output";
const DEFAULT_METADATA = "tooling/retrieval-lab/data/metadata";

interface CliOptions {
  readonly graphDir: string;
  readonly sourceRoot: string;
  readonly sourceManifest: string;
  readonly metadataDir: string;
  readonly structuredDir: string;
  readonly out: string;
  readonly dryRun: boolean;
  readonly limit: number | null;
  readonly help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const exportOptions: EntityExportOptions = {
    graphDir: options.graphDir,
    sourceRoot: options.sourceRoot,
    sourceManifestPath: options.sourceManifest,
    metadataDir: options.metadataDir,
    structuredDir: options.structuredDir,
    outputDir: options.out,
    dryRun: options.dryRun,
    limit: options.limit,
  };
  const report = await runEntityExtraction(exportOptions);
  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = {
    graphDir: join(DEFAULT_ROOT, "graph-evidence"),
    sourceRoot: DEFAULT_ROOT,
    sourceManifest: join(DEFAULT_ROOT, "manifest.jsonl"),
    metadataDir: DEFAULT_METADATA,
    structuredDir: join(DEFAULT_ROOT, "structured"),
    out: join(DEFAULT_ROOT, "entity-mentions"),
    dryRun: false,
    limit: null as number | null,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    const next = () => {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`${flag} requires a value`);
      index += 1;
      return value;
    };
    switch (flag) {
      case "--graph":
        values.graphDir = next();
        break;
      case "--root":
        values.sourceRoot = next();
        break;
      case "--manifest":
        values.sourceManifest = next();
        break;
      case "--metadata":
        values.metadataDir = next();
        break;
      case "--structured":
        values.structuredDir = next();
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
    graphDir: values.graphDir || join(values.sourceRoot, "graph-evidence"),
    sourceManifest: values.sourceManifest || join(values.sourceRoot, "manifest.jsonl"),
    structuredDir: values.structuredDir || join(values.sourceRoot, "structured"),
    out: values.out || join(values.sourceRoot, "entity-mentions"),
  };
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function helpText(): string {
  return [
    "Export candidate-only entity mentions from graph-evidence-v1.",
    "",
    "Options:",
    "  --graph <dir>       Graph evidence directory (default: output/graph-evidence)",
    "  --root <dir>        Cleaning output root",
    "  --manifest <file>   Cleaning manifest JSONL",
    "  --metadata <dir>    Retrieval metadata directory",
    "  --structured <dir>  Structured reference directory",
    "  --out <dir>         Output directory",
    "  --limit <n>         Maximum text units",
    "  --dry-run           Validate and report without writing files",
    "  --help, -h          Show this help",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
