#!/usr/bin/env bun
/**
 * Verifies that the database is provisioned for retrieval.
 *
 * The retrieval pipeline stores embeddings in `pgvector` columns and lexical
 * terms in `tsvector` columns. Both depend on the `vector` extension being
 * registered in the target database, on the server being new enough for the
 * iterative scan and HNSW behaviour the retrieval adapter relies on, and on
 * the extension actually being able to compute a distance.
 *
 * This runs against any PostgreSQL instance that the application can reach, so
 * CI can use a throwaway container and a developer can point it at a staging
 * database. It is read-only apart from registering the extension when it is
 * missing, which is the same idempotent operation as
 * `bun run db:ensure-extensions`.
 */
import pg from "pg";

const MINIMUM_SERVER_VERSION = 18;
const EXPECTED_EXTENSION = "vector";

interface Environment {
  readonly DATABASE_URL: string | undefined;
  readonly POSTGRES_USER: string | undefined;
  readonly POSTGRES_PASSWORD: string | undefined;
  readonly POSTGRES_HOST: string | undefined;
  readonly POSTGRES_PORT: string | undefined;
  readonly POSTGRES_DB: string | undefined;
  readonly DATABASE_SSL: string | undefined;
  readonly DATABASE_SSL_CA: string | undefined;
}

const env = process.env as unknown as Environment;

function connectionString(): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const user = env.POSTGRES_USER ?? "postgres";
  const password = env.POSTGRES_PASSWORD ?? "";
  const host = env.POSTGRES_HOST ?? "localhost";
  const port = env.POSTGRES_PORT ?? "5432";
  const database = env.POSTGRES_DB ?? "pharmeazor";
  return (
    "postgresql://" +
    encodeURIComponent(user) +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    encodeURIComponent(database)
  );
}

function poolConfig(): pg.PoolConfig {
  const config: pg.PoolConfig = { connectionString: connectionString(), max: 1 };
  if (env.DATABASE_SSL === "true") {
    config.ssl = env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true } : true;
  }
  return config;
}

const failures: string[] = [];

function check(condition: boolean, message: string): void {
  if (condition) {
    console.info(`  ok   ${message}`);
    return;
  }
  failures.push(message);
  console.error(`  FAIL ${message}`);
}

async function main(): Promise<void> {
  const pool = new pg.Pool(poolConfig());
  try {
    const version = await pool.query<{ server_version: string }>("SHOW server_version");
    const serverVersion = version.rows[0]?.server_version ?? "";
    const major = Number.parseInt(serverVersion.split(".")[0] ?? "", 10);
    console.info(`PostgreSQL server version: ${serverVersion}`);
    check(
      Number.isFinite(major) && major >= MINIMUM_SERVER_VERSION,
      `server major version is at least ${MINIMUM_SERVER_VERSION}`,
    );

    // Registering the extension is idempotent and matches the shipped
    // `db:ensure-extensions` worker, so this doubles as a repair for a
    // database that predates the retrieval work. A server without the
    // extension files cannot register it, which is a configuration failure
    // rather than a crash, so it is reported as a failed check.
    let extensionAvailable = true;
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS "${EXPECTED_EXTENSION}"`);
      console.info(`Registered the ${EXPECTED_EXTENSION} extension if it was missing.`);
    } catch (error) {
      extensionAvailable = false;
      const message = error instanceof Error ? error.message : String(error);
      check(
        false,
        `the ${EXPECTED_EXTENSION} extension could not be registered (${message}). ` +
          "The server image must ship pgvector; use docker/postgres/Dockerfile.",
      );
    }

    if (extensionAvailable) {
      const extension = await pool.query<{ extversion: string }>(
        "SELECT extversion FROM pg_extension WHERE extname = $1",
        [EXPECTED_EXTENSION],
      );
      const extensionVersion = extension.rows[0]?.extversion ?? "";
      console.info(`${EXPECTED_EXTENSION} extension version: ${extensionVersion || "(missing)"}`);
      check(extensionVersion.length > 0, `the ${EXPECTED_EXTENSION} extension is registered`);

      // The retrieval adapter relies on half-precision vectors, halfvec, and the
      // operator classes that came with pgvector 0.7 and later.
      const halfvec = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'halfvec')",
      );
      check(halfvec.rows[0]?.exists === true, "the halfvec type is available");

      // A real distance computation, not just an extension listing.
      const distance = await pool.query<{ distance: number }>(
        "SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector AS distance",
      );
      const value = distance.rows[0]?.distance;
      check(
        typeof value === "number" && Number.isFinite(value) && value >= 0,
        "vector distance operators compute a finite distance",
      );
    }
  } finally {
    await pool.end();
  }

  if (failures.length > 0) {
    console.error(`Database verification failed: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.info("Database verification passed.");
}

await main();
