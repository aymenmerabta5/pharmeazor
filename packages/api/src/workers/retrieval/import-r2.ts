/**
 * End-to-end precomputed-vector import: R2 → validation → schema → database.
 *
 * The embedding lab owns the artifact format and the production chunker owns
 * the chunk identity. This worker only orchestrates the hand-off:
 *
 *   1. pull `embedding-output` from R2 and validate it with the lab's own
 *      `pipeline/validate.py` (checksums, row alignment, text hashes, model);
 *   2. run the production chunker against the corpus with `--dry-run` and
 *      require every artifact row to join a chunk before touching PostgreSQL;
 *   3. apply the idempotent retrieval DDL;
 *   4. delegate the write to `retrieval/ingest.ts --vectors`, so there is
 *      exactly one import implementation;
 *   5. read the counts back and fail on a missing vector or an orphan chunk.
 *
 *   bun run retrieval:import:r2
 *   bun run retrieval:import:r2 --dry-run
 *   bun run retrieval:import:r2 --artifact ./tooling/embedding-lab/output/embeddings
 *   bun run retrieval:import:r2 --no-pull --force --prune
 *
 * The default artifact is `tooling/embedding-lab/output/embeddings`. Use
 * `--artifact` for an offline directory and `--no-pull` for the default one;
 * both skip the R2 transfer but still validate.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db, pool } from "@repo/database";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../../..");
const FETCH_SCRIPT = resolve(REPO_ROOT, "tooling/embedding-lab/fetch_artifact.py");
const INGEST_SCRIPT = resolve(REPO_ROOT, "packages/api/src/workers/retrieval/ingest.ts");
const ENSURE_SCRIPT = resolve(
  REPO_ROOT,
  "packages/database/src/workers/database/ensure-retrieval.ts",
);
const DEFAULT_ARTIFACT = resolve(REPO_ROOT, "tooling/embedding-lab/output/embeddings");
const ENV_FILE = resolve(REPO_ROOT, ".env.local");

interface Options {
  readonly artifact: string | null;
  readonly noPull: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly prune: boolean;
  readonly workers: number | null;
  readonly python: string | null;
  readonly json: boolean;
}

interface FetchSummary {
  readonly ok: boolean;
  readonly mode: string;
  readonly artifact: string;
  readonly transfer: { downloaded: number; skipped: number; failed: number };
  readonly validation: {
    readonly rows: number;
    readonly unique_chunk_ids: number;
    readonly dim: number;
    readonly dtype: string;
    readonly model: string | null;
    readonly revision: string | null;
    readonly vectors_sha256: string | null;
    readonly chunks_sha256: string | null;
    readonly warnings: readonly string[];
  };
}

interface ChunkSummary {
  readonly ok: boolean;
  readonly dryRun?: boolean;
  readonly documents: number;
  readonly chunks: number;
  readonly contextualizedChunks: number;
  readonly fallbackChunks: number;
  readonly embeddedChunks?: number;
  readonly retokenizedChunks?: number;
  readonly reusedChunks?: number;
  readonly injectionChunks: number;
  readonly vectorSource: {
    readonly model: string;
    readonly revision: string;
    readonly rows: number;
  };
  readonly vectors?: {
    readonly chunks: number;
    readonly artifactChunks: number;
    readonly extra: number;
  } | null;
}

interface DatabaseSummary {
  readonly documents: number;
  readonly chunks: number;
  readonly terms: number;
  readonly missingVectors: number;
  readonly orphanChunks: number;
  readonly models: number;
  readonly revisions: number;
  readonly index: readonly {
    embedding_model: string;
    embedding_revision: string | null;
    chunk_count: number;
    tokenizer_version: string;
  }[];
}

function usage(): string {
  return [
    "Usage: bun run retrieval:import:r2 [options]",
    "",
    "  --artifact <dir>   import a local artifact instead of pulling R2",
    "  --no-pull          import the default local artifact instead of pulling R2",
    "  --dry-run          validate and chunk, but skip DDL and the database write",
    "  --force            re-embed and retokenize every selected chunk",
    "  --prune            delete documents absent from the cleaning manifest",
    "  --workers <n>      parallel R2 downloads (default: 4)",
    "  --python <exe>     Python interpreter that runs the artifact validator",
    "  --json             print one JSON summary on stdout",
  ].join("\n");
}

function parseOptions(argv: readonly string[]): Options {
  let artifact: string | null = null;
  let noPull = false;
  let dryRun = false;
  let force = false;
  let prune = false;
  let workers: number | null = null;
  let python: string | null = null;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    switch (argument) {
      case "--artifact":
        artifact = resolve(requireValue(argv, ++index, "--artifact"));
        break;
      case "--no-pull":
        noPull = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--force":
        force = true;
        break;
      case "--prune":
        prune = true;
        break;
      case "--workers": {
        const value = Number.parseInt(requireValue(argv, ++index, "--workers"), 10);
        if (!Number.isInteger(value) || value < 1) {
          throw new Error("--workers must be a positive integer");
        }
        workers = value;
        break;
      }
      case "--python":
        python = requireValue(argv, ++index, "--python");
        break;
      case "--json":
        json = true;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`unknown option: ${argument}\n\n${usage()}`);
    }
  }

  if (artifact && noPull) {
    throw new Error("--artifact and --no-pull are mutually exclusive");
  }
  if (prune && dryRun) {
    throw new Error("--prune cannot be combined with --dry-run");
  }
  return { artifact, noPull, dryRun, force, prune, workers, python, json };
}

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

/**
 * Prefer a project virtualenv: `pipeline.validate` imports PyYAML through the
 * settings module, which the system interpreter does not always provide.
 */
function resolvePython(explicit: string | null): string {
  if (explicit) return explicit;
  const candidates = [
    resolve(REPO_ROOT, "tooling/embedding-lab/.venv/Scripts/python.exe"),
    resolve(REPO_ROOT, "tooling/embedding-lab/.venv/bin/python"),
    resolve(REPO_ROOT, "tooling/cleaning-lab/.venv/Scripts/python.exe"),
    resolve(REPO_ROOT, "tooling/cleaning-lab/.venv/bin/python"),
  ];
  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    (process.platform === "win32" ? "python" : "python3")
  );
}

function run(
  command: string,
  args: readonly string[],
  label: string,
): { readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    throw new Error(`${label} exited with code ${result.status}${detail ? `\n${detail}` : ""}`);
  }
  return { stdout, stderr };
}

function parseJson<T>(stdout: string, label: string): T {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error(`${label} produced no JSON output`);
  try {
    return JSON.parse(trimmed) as T;
  } catch (cause) {
    throw new Error(`${label} did not produce valid JSON`, { cause });
  }
}

/** The importer prints one line per document, then a pretty-printed summary. */
function parseImporterSummary(stdout: string): ChunkSummary {
  const marker = '{\n  "ok": true,';
  const index = stdout.lastIndexOf(marker);
  const candidate = index >= 0 ? stdout.slice(index) : stdout.trim();
  return parseJson<ChunkSummary>(candidate, "retrieval ingest");
}

async function readDatabaseSummary(): Promise<DatabaseSummary> {
  const counts = await db.execute<{
    documents: number;
    chunks: number;
    terms: number;
    missing_vectors: number;
    orphan_chunks: number;
    models: number;
    revisions: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM retrieval_documents) AS documents,
      (SELECT count(*)::int FROM retrieval_chunks) AS chunks,
      (SELECT count(*)::int FROM retrieval_chunk_terms) AS terms,
      (SELECT count(*)::int FROM retrieval_chunks WHERE embedding IS NULL) AS missing_vectors,
      (SELECT count(*)::int
         FROM retrieval_chunks c
         LEFT JOIN retrieval_documents d ON d.artifact_id = c.artifact_id
        WHERE d.artifact_id IS NULL) AS orphan_chunks,
      (SELECT count(DISTINCT embedding_model)::int FROM retrieval_chunks) AS models,
      (SELECT count(DISTINCT embedding_revision)::int FROM retrieval_chunks) AS revisions
  `);
  const row = counts.rows[0]!;
  const index = await db.execute<{
    embedding_model: string;
    embedding_revision: string | null;
    chunk_count: number;
    tokenizer_version: string;
  }>(sql`
    SELECT embedding_model, embedding_revision, chunk_count, tokenizer_version
      FROM retrieval_index_meta
     ORDER BY embedding_model
  `);
  return {
    documents: Number(row.documents),
    chunks: Number(row.chunks),
    terms: Number(row.terms),
    missingVectors: Number(row.missing_vectors),
    orphanChunks: Number(row.orphan_chunks),
    models: Number(row.models),
    revisions: Number(row.revisions),
    index: index.rows.map((entry) => ({
      embedding_model: entry.embedding_model,
      embedding_revision: entry.embedding_revision,
      chunk_count: Number(entry.chunk_count),
      tokenizer_version: entry.tokenizer_version,
    })),
  };
}

function assertImportComplete(summary: ChunkSummary, database: DatabaseSummary): void {
  if (database.missingVectors > 0) {
    throw new Error(`${database.missingVectors} chunk(s) have no stored vector`);
  }
  if (database.orphanChunks > 0) {
    throw new Error(`${database.orphanChunks} chunk(s) reference a missing document`);
  }
  if (database.models !== 1 || database.revisions !== 1) {
    throw new Error(
      `the index mixes ${database.models} model(s) and ${database.revisions} revision(s); ` +
        "an unfiltered import must leave one embedding space",
    );
  }
  if (database.chunks !== summary.chunks) {
    throw new Error(
      `database holds ${database.chunks} chunk(s) but the run selected ${summary.chunks}; ` +
        "pass --prune to delete documents that left the manifest",
    );
  }
}

/** Progress goes to stderr so `--json` keeps stdout machine-readable. */
function step(message: string): void {
  console.error(`[retrieval] ${message}`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const python = resolvePython(options.python);
  const fetchArgs = [FETCH_SCRIPT, "--json"];
  if (options.artifact) {
    fetchArgs.push("--validate-only", "--artifact", options.artifact);
  } else if (options.noPull) {
    fetchArgs.push("--validate-only", "--artifact", DEFAULT_ARTIFACT);
  } else {
    if (options.workers) fetchArgs.push("--workers", String(options.workers));
    if (options.force) fetchArgs.push("--force");
  }

  step(
    options.artifact || options.noPull
      ? "validating the local artifact"
      : "pulling embedding-output from R2 and validating it",
  );
  const fetched = run(python, fetchArgs, "artifact fetch/validation");
  const fetchSummary = parseJson<FetchSummary>(fetched.stdout, "artifact fetch/validation");
  if (!fetchSummary.ok) throw new Error("artifact validation reported a failure");
  const artifact = fetchSummary.artifact;
  step(
    `artifact ok: ${fetchSummary.validation.rows} rows, ` +
      `${fetchSummary.validation.dtype}, ${fetchSummary.validation.dim} dimensions`,
  );

  const dryRunArgs = [
    "--conditions=react-server",
    "--env-file=" + ENV_FILE,
    INGEST_SCRIPT,
    "--vectors",
    artifact,
    "--dry-run",
  ];
  step("chunking the corpus and joining precomputed vectors");
  const dryRun = parseImporterSummary(run("bun", dryRunArgs, "chunk/vector dry run").stdout);
  if (!dryRun.ok) throw new Error("chunk/vector dry run reported a failure");
  if (dryRun.vectors && dryRun.vectors.extra > 0) {
    throw new Error(
      `${dryRun.vectors.extra} precomputed chunk(s) are not produced by the corpus chunker; ` +
        "regenerate the artifact with the current corpus",
    );
  }
  step(`${dryRun.documents} documents, ${dryRun.chunks} chunks joined`);

  if (options.dryRun) {
    report({ options, fetchSummary, dryRun, database: null });
    return;
  }

  step("applying the retrieval schema");
  run(
    "bun",
    ["--conditions=react-server", "--env-file=" + ENV_FILE, ENSURE_SCRIPT, "--retrieval-schema"],
    "retrieval schema",
  );

  const importArgs = [
    "--conditions=react-server",
    "--env-file=" + ENV_FILE,
    INGEST_SCRIPT,
    "--vectors",
    artifact,
  ];
  if (options.force) importArgs.push("--force");
  if (options.prune) importArgs.push("--prune");
  step("writing vectors and postings");
  const imported = run("bun", importArgs, "retrieval import");
  const importSummary = parseImporterSummary(imported.stdout);

  step("reading the database back");
  const database = await readDatabaseSummary();
  assertImportComplete(importSummary, database);
  report({ options, fetchSummary, dryRun, importSummary, database });
}

function report(input: {
  readonly options: Options;
  readonly fetchSummary: FetchSummary;
  readonly dryRun: ChunkSummary;
  readonly importSummary?: ChunkSummary;
  readonly database: DatabaseSummary | null;
}): void {
  const payload = {
    ok: true,
    dryRun: input.options.dryRun,
    mode: input.fetchSummary.mode,
    artifact: input.fetchSummary.artifact,
    fetch: input.fetchSummary,
    chunking: {
      documents: input.dryRun.documents,
      chunks: input.dryRun.chunks,
      contextualizedChunks: input.dryRun.contextualizedChunks,
      fallbackChunks: input.dryRun.fallbackChunks,
      injectionChunks: input.dryRun.injectionChunks,
      vectorRows: input.dryRun.vectorSource.rows,
      model: input.dryRun.vectorSource.model,
      revision: input.dryRun.vectorSource.revision,
    },
    import: input.importSummary
      ? {
          embeddedChunks: input.importSummary.embeddedChunks ?? 0,
          retokenizedChunks: input.importSummary.retokenizedChunks ?? 0,
          reusedChunks: input.importSummary.reusedChunks ?? 0,
        }
      : null,
    database: input.database,
  };

  if (input.options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`artifact  ${payload.chunking.model}@${payload.chunking.revision}`);
  console.log(
    `chunks    ${payload.chunking.documents} documents, ${payload.chunking.chunks} chunks, ` +
      `${payload.chunking.contextualizedChunks} contextualized`,
  );
  if (payload.import) {
    console.log(
      `import    embedded=${payload.import.embeddedChunks} ` +
        `retokenized=${payload.import.retokenizedChunks} reused=${payload.import.reusedChunks}`,
    );
  }
  if (payload.database) {
    console.log(
      `database  documents=${payload.database.documents} chunks=${payload.database.chunks} ` +
        `terms=${payload.database.terms}`,
    );
    for (const entry of payload.database.index) {
      console.log(
        `index     ${entry.embedding_model}@${entry.embedding_revision ?? "unknown"} ` +
          `chunks=${entry.chunk_count} tokenizer=${entry.tokenizer_version}`,
      );
    }
  }
  if (payload.dryRun) console.log("dry run   no database write performed");
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
