import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@repo/config/server";
import * as schema from "./schema/index";

function buildConnectionString(): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }
  const user = env.POSTGRES_USER ?? "postgres";
  const password = env.POSTGRES_PASSWORD ?? "";
  const host = env.POSTGRES_HOST ?? "localhost";
  const port = env.POSTGRES_PORT ?? "5432";
  const db = env.POSTGRES_DB ?? env.APP_NAME ?? "ghostinit";
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
    encodeURIComponent(db)
  );
}

function rejectConnectionStringTlsOverrides(connectionString: string): void {
  if (env.DATABASE_SSL !== "true") return;
  const parsed = new URL(connectionString);
  for (const key of parsed.searchParams.keys()) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("ssl") || normalized === "uselibpqcompat") {
      throw new Error("DATABASE_URL must not override TLS parameters when DATABASE_SSL=true");
    }
  }
}

const connectionString = buildConnectionString();
rejectConnectionStringTlsOverrides(connectionString);

const poolConfig: pg.PoolConfig = {
  connectionString,
  max: env.DATABASE_POOL_SIZE ?? 20,
  idleTimeoutMillis: 30000,
};

if (env.DATABASE_SSL === "true") {
  // Production: verify the server certificate. Provide a CA via DATABASE_SSL_CA
  // if you are connecting through a self-signed intermediary.
  poolConfig.ssl = env.DATABASE_SSL_CA
    ? { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true }
    : true;
}

export const pool = new pg.Pool(poolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema/index";
