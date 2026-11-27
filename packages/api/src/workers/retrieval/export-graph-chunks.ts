/**
 * Export graph-evidence text units from clean Markdown.
 *
 *   bun run retrieval:graph:export -- --dry-run
 *   bun run retrieval:graph:export -- --source ANPP_RCP --out tooling/cleaning-lab/output/graph
 *   bun run retrieval:graph:export -- --artifact MED001__SRC_ANPP_RCP__DOC002__smpc
 */
import { join } from "node:path";
import { runGraphChunkExport, type GraphExportOptions } from "./graph-export";

const DEFAULT_ROOT = "tooling/cleaning-lab/output";

interface CliOptions {
  readonly root: string;
  readonly manifest: string;
  readonly out: string;
  readonly maxChars?: number;
  readonly overlapChars?: number;
  readonly limit: number | null;
  readonly sourceIds: readonly string[];
  readonly medicineIds: readonly string[];
  readonly artifactIds: readonly string[];
  readonly dryRun: boolean;
  readonly help: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }
  const exportOptions: GraphExportOptions = {
    root: options.root,
    manifestPath: options.manifest,
    outputDir: options.out,
    maxChars: options.maxChars,
    overlapChars: options.overlapChars,
    limit: options.limit,
    sourceIds: options.sourceIds,
    medicineIds: options.medicineIds,
    artifactIds: options.artifactIds,
    dryRun: options.dryRun,
  };
  const report = await runGraphChunkExport(exportOptions);
  console.log(JSON.stringify(report, null, 2));
}

function parseArgs(args: readonly string[]): CliOptions {
  const values = {
    root: DEFAULT_ROOT,
    manifest: "",
    out: "",
    maxChars: undefined as number | undefined,
    overlapChars: undefined as number | undefined,
    limit: null as number | null,
    sourceIds: [] as string[],
    medicineIds: [] as string[],
    artifactIds: [] as string[],
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
      case "--root":
        values.root = next();
        break;
      case "--manifest":
        values.manifest = next();
        break;
      case "--out":
        values.out = next();
        break;
      case "--max-chars":
        values.maxChars = positiveInteger(next(), flag);
        break;
      case "--overlap-chars":
        values.overlapChars = nonNegativeInteger(next(), flag);
        break;
      case "--limit":
        values.limit = positiveInteger(next(), flag);
        break;
      case "--source":
        values.sourceIds.push(next());
        break;
      case "--medicine":
        values.medicineIds.push(next());
        break;
      case "--artifact":
        values.artifactIds.push(next());
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
    manifest: values.manifest || join(values.root, "manifest.jsonl"),
    out: values.out || join(values.root, "graph-evidence"),
  };
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function helpText(): string {
  return [
    "Export graph-evidence-v1 text units from clean Markdown.",
    "",
    "Options:",
    "  --root <dir>          Cleaning output root (default: tooling/cleaning-lab/output)",
    "  --manifest <file>     Manifest JSONL (default: <root>/manifest.jsonl)",
    "  --out <dir>           Output directory (default: <root>/graph-evidence)",
    "  --max-chars <n>       Soft raw unit ceiling",
    "  --overlap-chars <n>   Requested semantic overlap",
    "  --limit <n>           Maximum selected documents",
    "  --source <id>         Filter by source id; repeatable",
    "  --medicine <id>       Filter by medicine id; repeatable",
    "  --artifact <id>       Filter by artifact id; repeatable",
    "  --dry-run             Validate and report without writing files",
    "  --help, -h            Show this help",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
