import "server-only";

import { pool } from "@repo/database";

/**
 * Registers the PostgreSQL extensions the application schema depends on.
 *
 * The Compose entrypoint registers `vector` when it initializes an empty
 * database, but a database that already exists needs it registered too. This
 * worker covers that case and is safe to run against any database.
 *
 * Every statement uses IF NOT EXISTS, so the worker is idempotent and changes
 * nothing on an already-provisioned database. Run it before `db:push` or
 * `db:migrate` on a database that predates the retrieval work.
 */

/**
 * The extensions the schema depends on.
 *
 * These are constants declared in this file, never values taken from the
 * environment or from a request, so the identifier interpolation below cannot
 * be influenced by anything outside this file.
 */
const REQUIRED_EXTENSIONS = ["vector"] as const;

export async function runDatabaseExtensionBootstrap(): Promise<void> {
  for (const extension of REQUIRED_EXTENSIONS) {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
    console.info(JSON.stringify({ scope: "database-extensions", event: "ensured", extension }));
  }
}

const DATABASE_EXTENSION_BOOTSTRAP_ENTRY = "--ghostinit-database-extension-bootstrap";

function isDirectExecution(): boolean {
  return process.argv.includes(DATABASE_EXTENSION_BOOTSTRAP_ENTRY);
}

if (isDirectExecution()) {
  await runDatabaseExtensionBootstrap();
  await pool.end();
}
